import OpenAI from "openai";
import { config } from "./config.js";
import { activityLog } from "./activityLog.js";
import type { AgentDecision, OffChainValuation, OnChainPosition } from "./types.js";

const client = config.llm.apiKey ? new OpenAI({ apiKey: config.llm.apiKey }) : null;

/**
 * Decision Agent: reasons over on-chain position state + fresh off-chain
 * valuation to decide the next autonomous action. Uses an LLM when
 * configured, otherwise falls back to deterministic rule-based logic so the
 * demo always works end-to-end.
 */
export async function decide(
  position: OnChainPosition,
  valuation: OffChainValuation
): Promise<AgentDecision> {
  if (client) {
    return decideWithLlm(position, valuation);
  }
  return decideWithRules(position, valuation);
}

async function decideWithLlm(
  position: OnChainPosition,
  valuation: OffChainValuation
): Promise<AgentDecision> {
  const prompt = `You are the Decision Agent for Autarca, an autonomous RWA collateral manager on Casper.
Given the on-chain position and fresh off-chain valuation below, decide one action:
"NOOP", "UPDATE_VALUATION", or "LIQUIDATE".

On-chain position: ${JSON.stringify(position)}
Off-chain valuation: ${JSON.stringify(valuation)}

Rules of thumb:
- If the valuation differs from on-chain value by more than 2%, UPDATE_VALUATION.
- If collateral/debt ratio would fall below 120% after the update, LIQUIDATE instead.
- Otherwise NOOP.

Respond ONLY with strict JSON: {"action": "...", "newCollateralValueUsdCents": number|null, "reasoning": "..."}`;

  const completion = await client!.chat.completions.create({
    model: config.llm.model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");

  const decision: AgentDecision = {
    positionId: position.id,
    action: parsed.action ?? "NOOP",
    newCollateralValueUsdCents: parsed.newCollateralValueUsdCents ?? undefined,
    reasoning: parsed.reasoning ?? "No reasoning provided by LLM.",
  };

  activityLog.push({
    timestamp: new Date().toISOString(),
    agent: "DecisionAgent",
    message: `LLM decided "${decision.action}" for position #${position.id}: ${decision.reasoning}`,
  });

  return decision;
}

function decideWithRules(
  position: OnChainPosition,
  valuation: OffChainValuation
): AgentDecision {
  const drift =
    Math.abs(valuation.fairValueUsdCents - position.collateralValueUsdCents) /
    Math.max(1, position.collateralValueUsdCents);

  let decision: AgentDecision;

  if (drift < 0.02) {
    decision = {
      positionId: position.id,
      action: "NOOP",
      reasoning: `Valuation drift ${(drift * 100).toFixed(2)}% is within tolerance.`,
    };
  } else {
    const ratioBps =
      position.debtValueUsdCents === 0
        ? Infinity
        : (valuation.fairValueUsdCents * 10_000) / position.debtValueUsdCents;

    decision =
      ratioBps < 12_000
        ? {
            positionId: position.id,
            action: "LIQUIDATE",
            reasoning: `Projected collateral ratio ${(ratioBps / 100).toFixed(
              1
            )}% falls below 120% liquidation threshold.`,
          }
        : {
            positionId: position.id,
            action: "UPDATE_VALUATION",
            newCollateralValueUsdCents: valuation.fairValueUsdCents,
            reasoning: `Valuation drift ${(drift * 100).toFixed(
              2
            )}% exceeds tolerance; updating on-chain collateral value.`,
          };
  }

  activityLog.push({
    timestamp: new Date().toISOString(),
    agent: "DecisionAgent",
    message: `Rule-based engine decided "${decision.action}" for position #${position.id}: ${decision.reasoning}`,
  });

  return decision;
}
