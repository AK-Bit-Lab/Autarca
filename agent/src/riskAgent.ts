import OpenAI from "openai";
import { config } from "./config.js";
import { activityLog } from "./activityLog.js";
import type { AgentDecision, OffChainValuation, OnChainPosition } from "./types.js";

const client = config.llm.apiKey
  ? new OpenAI({ apiKey: config.llm.apiKey, baseURL: config.llm.baseUrl })
  : null;

/**
 * Risk Agent: a second opinion before any LIQUIDATE decision is executed.
 *
 * The Decision Agent proposes an action; if that action is LIQUIDATE, the
 * Risk Agent independently re-evaluates the position using a separate
 * reasoning pass (volatility of the valuation source, projected ratio,
 * confidence) and can veto the liquidation, downgrading it to
 * UPDATE_VALUATION so the position is re-marked but not seized. This
 * mirrors the "swarm of specialized agents" pattern from hackathon example
 * direction #3 (Multi-Agent DAO Governance & Execution).
 */
export async function reviewLiquidation(
  position: OnChainPosition,
  valuation: OffChainValuation,
  proposed: AgentDecision
): Promise<AgentDecision> {
  if (proposed.action !== "LIQUIDATE") return proposed;

  if (client) {
    return reviewWithLlm(position, valuation, proposed);
  }
  return reviewWithRules(position, valuation, proposed);
}

async function reviewWithLlm(
  position: OnChainPosition,
  valuation: OffChainValuation,
  proposed: AgentDecision
): Promise<AgentDecision> {
  const prompt = `You are the Risk Agent for Autarca. The Decision Agent proposed LIQUIDATING the position below.
Independently assess whether liquidation is warranted, or whether the position should merely be re-valued (UPDATE_VALUATION) instead.

On-chain position: ${JSON.stringify(position)}
Off-chain valuation: ${JSON.stringify(valuation)}
Valuation source confidence: ${valuation.confidence}

Consider: if the valuation source confidence is below 0.7, a liquidation may be premature — prefer UPDATE_VALUATION and re-check next cycle.

Respond ONLY with strict JSON: {"confirm": true|false, "reasoning": "..."}`;

  const completion = await client!.chat.completions.create({
    model: config.llm.model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
  const confirmed = parsed.confirm === true;

  const decision: AgentDecision = confirmed
    ? proposed
    : {
        positionId: position.id,
        action: "UPDATE_VALUATION",
        newCollateralValueUsdCents: valuation.fairValueUsdCents,
        reasoning: `Risk Agent vetoed liquidation: ${parsed.reasoning ?? "low confidence valuation source"}. Downgrading to UPDATE_VALUATION.`,
      };

  activityLog.push({
    timestamp: new Date().toISOString(),
    agent: "DecisionAgent",
    message: `Risk Agent ${confirmed ? "confirmed" : "vetoed"} liquidation for position #${position.id}: ${parsed.reasoning ?? ""}`,
  });

  return decision;
}

function reviewWithRules(
  position: OnChainPosition,
  valuation: OffChainValuation,
  proposed: AgentDecision
): AgentDecision {
  // Veto liquidation when the valuation source is low-confidence — re-mark
  // instead and re-evaluate next cycle.
  if (valuation.confidence < 0.7) {
    const vetoed: AgentDecision = {
      positionId: position.id,
      action: "UPDATE_VALUATION",
      newCollateralValueUsdCents: valuation.fairValueUsdCents,
      reasoning: `Risk Agent vetoed liquidation: valuation source confidence ${(valuation.confidence * 100).toFixed(0)}% < 70%. Downgrading to UPDATE_VALUATION.`,
    };
    activityLog.push({
      timestamp: new Date().toISOString(),
      agent: "DecisionAgent",
      message: `Risk Agent vetoed liquidation for position #${position.id} (low confidence source).`,
    });
    return vetoed;
  }
  return proposed;
}
