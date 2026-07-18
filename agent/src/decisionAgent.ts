import OpenAI from "openai";
import { config } from "./config.js";
import { activityLog } from "./activityLog.js";
import { reviewLiquidation } from "./riskAgent.js";
import type { AgentDecision, OffChainValuation, OnChainPosition } from "./types.js";

const client = config.llm.apiKey
  ? new OpenAI({ apiKey: config.llm.apiKey, baseURL: config.llm.baseUrl })
  : null;

/**
 * Decision Agent: reasons over on-chain position state + fresh off-chain
 * valuation to decide the next autonomous action. Uses OpenAI tool/function
 * calling where the available "tools" mirror the AutarcaVault contract entry
 * points the agent is authorized to call. Falls back to deterministic
 * rule-based logic when no LLM is configured so the demo always works.
 *
 * Any proposed LIQUIDATE is routed through the Risk Agent for a second
 * opinion before being returned.
 */
export async function decide(
  position: OnChainPosition,
  valuation: OffChainValuation
): Promise<AgentDecision> {
  const proposed = client
    ? await decideWithLlm(position, valuation)
    : decideWithRules(position, valuation);

  // Multi-agent guardrail: never liquidate without the Risk Agent's sign-off.
  return reviewLiquidation(position, valuation, proposed);
}

/**
 * Tool definitions exposed to the LLM. These mirror the agent_* entry points
 * of the AutarcaVault contract, so the model "calls" the contract the same way
 * the Execution Agent will.
 */
const AGENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "agent_update_valuation",
      description:
        "Update the on-chain collateral value of a position to a fresh fair-value estimate.",
      parameters: {
        type: "object",
        properties: {
          position_id: { type: "integer", description: "The position id" },
          new_collateral_value_usd_cents: {
            type: "integer",
            description: "New fair value in USD cents",
          },
        },
        required: ["position_id", "new_collateral_value_usd_cents"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_liquidate",
      description:
        "Liquidate a position whose collateral ratio has fallen below the liquidation threshold. Use only when clearly warranted.",
      parameters: {
        type: "object",
        properties: {
          position_id: { type: "integer", description: "The position id" },
        },
        required: ["position_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "noop",
      description: "Take no action this cycle.",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function decideWithLlm(
  position: OnChainPosition,
  valuation: OffChainValuation
): Promise<AgentDecision> {
  const system = `You are the Decision Agent for Autarca, an autonomous RWA collateral manager on Casper.
You reason over the on-chain position and a fresh off-chain valuation, then call exactly one tool to choose the next action.

Rules of thumb:
- If the valuation differs from the on-chain collateral value by more than 2%, call agent_update_valuation with the new fair value.
- If the projected collateral/debt ratio would fall below 120% after the update, call agent_liquidate instead.
- Otherwise call noop.`;

  const user = `On-chain position: ${JSON.stringify(position)}
Off-chain valuation: ${JSON.stringify(valuation)}`;

  const completion = await client!.chat.completions.create({
    model: config.llm.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    tools: AGENT_TOOLS,
    tool_choice: "required",
  });

  const choice = completion.choices[0];
  const toolCall = choice.message.tool_calls?.[0];

  let decision: AgentDecision;
  if (toolCall) {
    const args = JSON.parse(toolCall.function.arguments ?? "{}");
    decision = toolCallToDecision(position.id, toolCall.function.name, args);
  } else {
    decision = {
      positionId: position.id,
      action: "NOOP",
      reasoning: "LLM returned no tool call; defaulting to NOOP.",
    };
  }

  activityLog.push({
    timestamp: new Date().toISOString(),
    agent: "DecisionAgent",
    message: `LLM decided "${decision.action}" for position #${position.id}: ${decision.reasoning}`,
  });

  return decision;
}

function toolCallToDecision(
  positionId: number,
  toolName: string,
  args: Record<string, unknown>
): AgentDecision {
  switch (toolName) {
    case "agent_update_valuation":
      return {
        positionId,
        action: "UPDATE_VALUATION",
        newCollateralValueUsdCents: Number(args.new_collateral_value_usd_cents),
        reasoning: `LLM called agent_update_valuation with new value ${args.new_collateral_value_usd_cents} cents.`,
      };
    case "agent_liquidate":
      return {
        positionId,
        action: "LIQUIDATE",
        reasoning: "LLM called agent_liquidate — projected ratio below threshold.",
      };
    default:
      return {
        positionId,
        action: "NOOP",
        reasoning: "LLM called noop — within tolerance.",
      };
  }
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
