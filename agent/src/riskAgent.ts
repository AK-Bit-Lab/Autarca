import OpenAI from "openai";
import { config } from "./config.js";
import { activityLog } from "./activityLog.js";
import { safeJsonParse, withRetry } from "./resilience.js";
import type {
  AgentDecision,
  DecisionRecord,
  OffChainValuation,
  OnChainPosition,
} from "./types.js";

const client = config.llm.apiKey
  ? new OpenAI({
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseUrl,
      timeout: 20_000,
      maxRetries: 2,
    })
  : null;

/**
 * Risk Agent: an independent second opinion before any LIQUIDATE decision is
 * executed.
 *
 * The Decision Agent proposes an action; if that action is LIQUIDATE, the
 * Risk Agent independently re-evaluates the position using a separate
 * reasoning pass and can veto the liquidation, downgrading it to
 * UPDATE_VALUATION so the position is re-marked but not seized.
 *
 * The Risk Agent is NOT a thin validator. It reasons over:
 *   - valuation source confidence,
 *   - valuation volatility (from Agent Memory),
 *   - the valuation source's on-chain oracle reputation (passed in via
 *     `oracleAccuracyBps` when available),
 *   - the recent liquidation trend (too many liquidations in a short window
 *     is a stress signal),
 *   - the collateral trend (falling collateral + low confidence = caution),
 *   - the previous decision's outcome (did we already get this wrong?).
 *
 * This mirrors the "swarm of specialized agents" pattern from hackathon
 * example direction #3 (Multi-Agent DAO Governance & Execution).
 */
export async function reviewLiquidation(
  position: OnChainPosition,
  valuation: OffChainValuation,
  proposed: AgentDecision,
  memory: {
    previousDecision?: DecisionRecord;
    volatility: number;
    trend: number;
    recentLiquidations: number;
  },
  oracleAccuracyBps?: number
): Promise<AgentDecision> {
  if (proposed.action !== "LIQUIDATE") return proposed;

  if (client) {
    return reviewWithLlm(position, valuation, proposed, memory, oracleAccuracyBps);
  }
  return reviewWithRules(position, valuation, proposed, memory, oracleAccuracyBps);
}

async function reviewWithLlm(
  position: OnChainPosition,
  valuation: OffChainValuation,
  proposed: AgentDecision,
  memory: {
    previousDecision?: DecisionRecord;
    volatility: number;
    trend: number;
    recentLiquidations: number;
  },
  oracleAccuracyBps?: number
): Promise<AgentDecision> {
  const prompt = `You are the Risk Agent for Autarca. The Decision Agent proposed LIQUIDATING the position below.
Independently assess whether liquidation is warranted, or whether the position should merely be re-valued (UPDATE_VALUATION) instead.

On-chain position: ${JSON.stringify(position)}
Off-chain valuation: ${JSON.stringify(valuation)}
Decision Agent confidence: ${proposed.confidence ?? "unknown"}
Valuation source confidence: ${valuation.confidence}
Valuation source on-chain oracle accuracy: ${oracleAccuracyBps !== undefined ? `${(oracleAccuracyBps / 100).toFixed(1)}%` : "unknown"}

Agent memory:
- volatility (coefficient of variation of recent valuations): ${memory.volatility.toFixed(3)}
- trend (relative change over recent window): ${(memory.trend * 100).toFixed(2)}%
- recentLiquidations (last 30m): ${memory.recentLiquidations}
- previousDecision: ${memory.previousDecision ? JSON.stringify({
    action: memory.previousDecision.action,
    outcome: memory.previousDecision.outcome,
  }) : "none"}

Consider ALL of the following before deciding:
- If valuation source confidence is below 0.7, a liquidation may be premature — prefer UPDATE_VALUATION and re-check next cycle.
- If volatility is high (>0.15), the valuation is unstable — prefer UPDATE_VALUATION unless the ratio is critically low.
- If the oracle's on-chain accuracy is below 80%, treat its valuation with skepticism.
- If recentLiquidations is high (>=3 in 30m), the market may be stressed — require higher confidence to liquidate.
- If the previous decision for this position was "harmful", be extra cautious.

Respond ONLY with strict JSON: {"confirm": true|false, "reasoning": "..."}`;

  const completion = await withRetry(
    () =>
      client!.chat.completions.create({
        model: config.llm.model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    {
      retries: 2,
      baseDelayMs: 800,
      onRetry: (attempt, err, delay) =>
        activityLog.push({
          timestamp: new Date().toISOString(),
          agent: "RiskAgent",
          message: `LLM call retry #${attempt} in ${delay}ms (${err.message}).`,
        }),
    }
  );

  const parsed = safeJsonParse<{ confirm?: unknown; reasoning?: unknown }>(
    completion.choices[0].message.content,
    { confirm: false, reasoning: "Risk Agent LLM returned no parseable JSON; vetoing by default." }
  );
  const confirmed = parsed.confirm === true;
  const reasoning =
    typeof parsed.reasoning === "string" && parsed.reasoning.trim()
      ? parsed.reasoning
      : "no reasoning provided";

  const decision: AgentDecision = confirmed
    ? { ...proposed, reasoning: `Risk Agent confirmed liquidation: ${reasoning}` }
    : {
        positionId: position.id,
        action: "UPDATE_VALUATION",
        newCollateralValueUsdCents: valuation.fairValueUsdCents,
        reasoning: `Risk Agent vetoed liquidation: ${reasoning}. Downgrading to UPDATE_VALUATION.`,
        confidence: proposed.confidence,
        alternativesConsidered: ["NOOP", "LIQUIDATE"],
        decidedBy: proposed.decidedBy,
      };

  activityLog.push({
    timestamp: new Date().toISOString(),
    agent: "RiskAgent",
    message: `Risk Agent ${confirmed ? "confirmed" : "vetoed"} liquidation for position #${position.id}: ${reasoning}`,
    meta: { confirmed, reasoning },
  });

  return decision;
}

function reviewWithRules(
  position: OnChainPosition,
  valuation: OffChainValuation,
  proposed: AgentDecision,
  memory: {
    previousDecision?: DecisionRecord;
    volatility: number;
    trend: number;
    recentLiquidations: number;
  },
  oracleAccuracyBps?: number
): AgentDecision {
  const reasons: string[] = [];

  // 1. Valuation source confidence
  if (valuation.confidence < 0.7) {
    reasons.push(
      `valuation source confidence ${(valuation.confidence * 100).toFixed(0)}% < 70%`
    );
  }

  // 2. Volatility of the valuation series
  if (memory.volatility > 0.15) {
    reasons.push(
      `valuation volatility ${(memory.volatility * 100).toFixed(1)}% is high`
    );
  }

  // 3. On-chain oracle reputation
  if (oracleAccuracyBps !== undefined && oracleAccuracyBps < 8000) {
    reasons.push(
      `oracle on-chain accuracy ${(oracleAccuracyBps / 100).toFixed(1)}% < 80%`
    );
  }

  // 4. Recent liquidation trend (stress signal)
  if (memory.recentLiquidations >= 3) {
    reasons.push(
      `${memory.recentLiquidations} liquidations in the last 30m (market stress)`
    );
  }

  // 5. Collateral trend (falling collateral + low confidence = caution)
  if (memory.trend < -0.05 && valuation.confidence < 0.85) {
    reasons.push(
      `collateral trend ${(memory.trend * 100).toFixed(1)}% is falling with low confidence`
    );
  }

  // 6. Previous decision was harmful — be extra cautious
  if (memory.previousDecision?.outcome === "harmful") {
    reasons.push(`previous decision for this position was harmful`);
  }

  if (reasons.length > 0) {
    const vetoed: AgentDecision = {
      positionId: position.id,
      action: "UPDATE_VALUATION",
      newCollateralValueUsdCents: valuation.fairValueUsdCents,
      reasoning: `Risk Agent vetoed liquidation: ${reasons.join("; ")}. Downgrading to UPDATE_VALUATION.`,
      confidence: proposed.confidence,
      alternativesConsidered: ["NOOP", "LIQUIDATE"],
      decidedBy: proposed.decidedBy,
    };
    activityLog.push({
      timestamp: new Date().toISOString(),
      agent: "RiskAgent",
      message: `Risk Agent vetoed liquidation for position #${position.id} (${reasons.join("; ")}).`,
      meta: { reasons },
    });
    return vetoed;
  }

  activityLog.push({
    timestamp: new Date().toISOString(),
    agent: "RiskAgent",
    message: `Risk Agent confirmed liquidation for position #${position.id} (all risk signals clear).`,
  });
  return proposed;
}
