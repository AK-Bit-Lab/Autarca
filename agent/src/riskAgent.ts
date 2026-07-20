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
    return reviewWithSwarmLlm(position, valuation, proposed, memory, oracleAccuracyBps);
  }
  return reviewWithRules(position, valuation, proposed, memory, oracleAccuracyBps);
}

async function runSwarmAgent(
  persona: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ confirm: boolean; reasoning: string }> {
  const completion = await withRetry(
    () =>
      client!.chat.completions.create({
        model: config.llm.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
      }),
    {
      retries: 2,
      baseDelayMs: 800,
      onRetry: (attempt, err, delay) =>
        activityLog.push({
          timestamp: new Date().toISOString(),
          agent: "RiskAgent",
          message: `Swarm ${persona} retry #${attempt} in ${delay}ms (${err.message}).`,
        }),
    }
  );

  const parsed = safeJsonParse<{ confirm?: unknown; reasoning?: unknown }>(
    completion.choices[0].message.content,
    { confirm: false, reasoning: `Swarm ${persona} returned no parseable JSON; vetoing by default.` }
  );

  return {
    confirm: parsed.confirm === true,
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "no reasoning",
  };
}

async function reviewWithSwarmLlm(
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
  const user = `On-chain position: ${JSON.stringify(position)}\nOff-chain valuation: ${JSON.stringify(valuation)}\nDecision Agent confidence: ${proposed.confidence}\nValuation source confidence: ${valuation.confidence}\nOracle accuracy: ${oracleAccuracyBps}\nMemory (volatility: ${memory.volatility}, trend: ${memory.trend}, recentLiqs: ${memory.recentLiquidations})`;

  const prompts = {
    Liquidity: `You are the Liquidity Risk Agent. Assess if the market has enough liquidity to absorb this liquidation without causing a cascade. Focus on recentLiquidations (if >= 3, veto). Respond ONLY with strict JSON: {"confirm": true|false, "reasoning": "..."}`,
    Volatility: `You are the Volatility Risk Agent. Assess if the price is violently swinging, meaning a liquidation might be a false flag. Focus on the volatility metric (if > 0.15, veto). Respond ONLY with strict JSON: {"confirm": true|false, "reasoning": "..."}`,
    Counterparty: `You are the Counterparty Risk Agent. Assess if the oracle can be trusted for this liquidation. Focus on oracle accuracy (if < 8000 bps, veto) and valuation confidence (if < 0.7, veto). Respond ONLY with strict JSON: {"confirm": true|false, "reasoning": "..."}`
  };

  const [liq, vol, cp] = await Promise.all([
    runSwarmAgent("Liquidity", prompts.Liquidity, user),
    runSwarmAgent("Volatility", prompts.Volatility, user),
    runSwarmAgent("Counterparty", prompts.Counterparty, user),
  ]);

  const confirmations = [liq.confirm, vol.confirm, cp.confirm].filter(c => c).length;
  const confirmed = confirmations >= 2;

  const swarmReason = `[Liq: ${liq.confirm ? 'Y' : 'N'}] ${liq.reasoning}. [Vol: ${vol.confirm ? 'Y' : 'N'}] ${vol.reasoning}. [CP: ${cp.confirm ? 'Y' : 'N'}] ${cp.reasoning}.`;

  const decision: AgentDecision = confirmed
    ? { ...proposed, reasoning: `Risk Swarm confirmed liquidation (${confirmations}/3 votes): ${swarmReason}`, riskReviewed: true, riskVetoed: false }
    : {
      positionId: position.id,
      action: "UPDATE_VALUATION",
      newCollateralValueUsdCents: valuation.fairValueUsdCents,
      reasoning: `Risk Swarm vetoed liquidation (${3 - confirmations}/3 veto votes): ${swarmReason}. Downgrading to UPDATE_VALUATION.`,
      confidence: proposed.confidence,
      alternativesConsidered: ["NOOP", "LIQUIDATE"],
      decidedBy: proposed.decidedBy,
      riskReviewed: true,
      riskVetoed: true,
    };

  activityLog.push({
    timestamp: new Date().toISOString(),
    agent: "RiskAgent",
    message: `Risk Swarm ${confirmed ? "confirmed" : "vetoed"} liquidation (${confirmations}/3 votes) for position #${position.id}.`,
    meta: { confirmations, swarmReason },
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
      riskReviewed: true,
      riskVetoed: true,
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
  return {
    ...proposed,
    riskReviewed: true,
    riskVetoed: false,
  };
}
