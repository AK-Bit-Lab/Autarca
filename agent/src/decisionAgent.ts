import OpenAI from "openai";
import { config } from "./config.js";
import { activityLog } from "./activityLog.js";
import { reviewLiquidation } from "./riskAgent.js";
import { agentMemory, ALL_ACTIONS } from "./agentMemory.js";
import { safeJsonParse, withRetry } from "./resilience.js";
import type {
  AgentAction,
  AgentDecision,
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
 * Decision Agent: reasons over on-chain position state + fresh off-chain
 * valuation, enriched with Agent Memory (previous decisions, volatility,
 * trend, recent liquidations), to decide the next autonomous action.
 *
 * Uses OpenAI tool/function calling where the available "tools" mirror the
 * AutarcaVault contract entry points the agent is authorized to call. Falls
 * back to deterministic rule-based logic when no LLM is configured so the demo
 * always works.
 *
 * Every decision carries:
 *   - `confidence` (0..1) - how sure the agent is,
 *   - `alternativesConsidered` - the other actions it weighed,
 *   - `decidedBy` - "DecisionAgent" (LLM) or "RuleEngine".
 *
 * Any proposed LIQUIDATE is routed through the Risk Agent for a second
 * opinion before being returned.
 */
export async function decide(
  position: OnChainPosition,
  valuation: OffChainValuation
): Promise<AgentDecision> {
  const memory = agentMemory.contextFor(position.id, position.rwaId);

  const proposed = client
    ? await decideWithLlm(position, valuation, memory).catch((err) => {
      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "DecisionAgent",
        message: `LLM decision failed (${(err as Error).message}); falling back to rule engine.`,
      });
      return decideWithRules(position, valuation, memory);
    })
    : decideWithRules(position, valuation, memory);

  // Multi-agent guardrail: never liquidate without the Risk Agent's sign-off.
  return reviewLiquidation(position, valuation, proposed, memory, undefined);
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
          confidence: {
            type: "number",
            description: "Your confidence in this update, 0..1",
          },
          reasoning: {
            type: "string",
            description: "Short rationale for this decision.",
          },
        },
        required: ["position_id", "new_collateral_value_usd_cents", "confidence", "reasoning"],
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
          confidence: {
            type: "number",
            description: "Your confidence in this liquidation, 0..1",
          },
          reasoning: {
            type: "string",
            description: "Short rationale for this liquidation.",
          },
        },
        required: ["position_id", "confidence", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_allocate_yield",
      description:
        "Allocate excess collateral to yield-bearing protocols when ratio is very high (e.g. > 200%).",
      parameters: {
        type: "object",
        properties: {
          position_id: { type: "integer", description: "The position id" },
          amount_usd_cents: { type: "integer", description: "Amount of collateral to allocate out" },
          confidence: { type: "number", description: "Your confidence, 0..1" },
          reasoning: { type: "string" },
        },
        required: ["position_id", "amount_usd_cents", "confidence", "reasoning"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "noop",
      description: "Take no action this cycle.",
      parameters: {
        type: "object",
        properties: {
          confidence: { type: "number", description: "Your confidence that NOOP is correct, 0..1" },
          reasoning: { type: "string" },
        },
        required: ["confidence", "reasoning"],
      },
    },
  },
];

interface MemoryContext {
  previousDecision?: import("./types.js").DecisionRecord;
  volatility: number;
  trend: number;
  recentLiquidations: number;
}

async function decideWithLlm(
  position: OnChainPosition,
  valuation: OffChainValuation,
  memory: MemoryContext
): Promise<AgentDecision> {
  const system = `You are the Decision Agent for Autarca, an autonomous RWA collateral manager on Casper.
You reason over the on-chain position, a fresh off-chain valuation, AND the agent's memory of previous cycles, then call exactly one tool to choose the next action.

Rules of thumb:
- If the valuation differs from the on-chain collateral value by more than 2%, call agent_update_valuation with the new fair value.
- If the projected collateral/debt ratio would fall below 120% after the update, call agent_liquidate instead.
- If the projected collateral/debt ratio is safely above 200% (20_000 bps), call agent_allocate_yield to deploy up to 10% of excess collateral into yield strategies.
- Otherwise call noop.
- Factor in volatility and trend from memory: high volatility + low confidence => prefer noop or update over liquidate.
- Avoid repeated liquidations in a short window (recentLiquidations).

Always set confidence (0..1) and a short reasoning string.`;

  const user = `On-chain position: ${JSON.stringify(position)}
Off-chain valuation: ${JSON.stringify(valuation)}
Agent memory context:
- previousDecision: ${memory.previousDecision ? JSON.stringify({
    action: memory.previousDecision.action,
    confidence: memory.previousDecision.decisionConfidence,
    timestamp: memory.previousDecision.timestamp,
    outcome: memory.previousDecision.outcome,
  }) : "none"}
- volatility (coefficient of variation of recent valuations): ${memory.volatility.toFixed(3)}
- trend (relative change over recent window): ${(memory.trend * 100).toFixed(2)}%
- recentLiquidations (last 30m): ${memory.recentLiquidations}`;

  const completion = await withRetry(
    () =>
      client!.chat.completions.create({
        model: config.llm.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: AGENT_TOOLS,
        tool_choice: "required",
      }),
    {
      retries: 2,
      baseDelayMs: 800,
      onRetry: (attempt, err, delay) =>
        activityLog.push({
          timestamp: new Date().toISOString(),
          agent: "DecisionAgent",
          message: `LLM call retry #${attempt} in ${delay}ms (${err.message}).`,
        }),
    }
  );

  const choice = completion.choices[0];
  const toolCall = choice.message.tool_calls?.[0];

  let decision: AgentDecision;
  if (toolCall) {
    const args = safeJsonParse<Record<string, unknown>>(
      toolCall.function.arguments,
      {}
    );
    decision = toolCallToDecision(position.id, toolCall.function.name, args);
  } else {
    decision = {
      positionId: position.id,
      action: "NOOP",
      reasoning: "LLM returned no tool call; defaulting to NOOP.",
      confidence: 0.3,
      alternativesConsidered: ALL_ACTIONS,
      decidedBy: "DecisionAgent",
    };
  }

  activityLog.push({
    timestamp: new Date().toISOString(),
    agent: "DecisionAgent",
    message: `LLM decided "${decision.action}" (confidence ${((decision.confidence ?? 0) * 100).toFixed(0)}%) for position #${position.id}: ${decision.reasoning}`,
    meta: {
      action: decision.action,
      confidence: decision.confidence,
      alternativesConsidered: decision.alternativesConsidered,
    },
  });

  return decision;
}

function toolCallToDecision(
  positionId: number,
  toolName: string,
  args: Record<string, unknown>
): AgentDecision {
  const confidence = typeof args.confidence === "number" ? clamp01(args.confidence) : 0.5;
  const reasoning =
    typeof args.reasoning === "string" && args.reasoning.trim()
      ? args.reasoning
      : "LLM did not provide reasoning.";

  // The alternatives considered = all actions except the chosen one.
  const chosen: AgentAction =
    toolName === "agent_update_valuation"
      ? "UPDATE_VALUATION"
      : toolName === "agent_liquidate"
        ? "LIQUIDATE"
        : toolName === "agent_allocate_yield"
          ? "ALLOCATE_YIELD"
          : "NOOP";
  const alternativesConsidered = ALL_ACTIONS.filter((a) => a !== chosen);

  switch (toolName) {
    case "agent_update_valuation":
      return {
        positionId,
        action: "UPDATE_VALUATION",
        newCollateralValueUsdCents: Number(args.new_collateral_value_usd_cents) || 0,
        reasoning,
        confidence,
        alternativesConsidered,
        decidedBy: "DecisionAgent",
      };
    case "agent_liquidate":
      return {
        positionId,
        action: "LIQUIDATE",
        reasoning,
        confidence,
        alternativesConsidered,
        decidedBy: "DecisionAgent",
      };
    case "agent_allocate_yield":
      return {
        positionId,
        action: "ALLOCATE_YIELD",
        yieldAmountUsdCents: Number(args.amount_usd_cents) || 0,
        reasoning,
        confidence,
        alternativesConsidered,
        decidedBy: "DecisionAgent",
      };
    default:
      return {
        positionId,
        action: "NOOP",
        reasoning,
        confidence,
        alternativesConsidered,
        decidedBy: "DecisionAgent",
      };
  }
}

function decideWithRules(
  position: OnChainPosition,
  valuation: OffChainValuation,
  memory: MemoryContext
): AgentDecision {
  const drift =
    Math.abs(valuation.fairValueUsdCents - position.collateralValueUsdCents) /
    Math.max(1, position.collateralValueUsdCents);

  const ratioBps =
    position.debtValueUsdCents === 0
      ? Infinity
      : (valuation.fairValueUsdCents * 10_000) / position.debtValueUsdCents;

  // Confidence heuristic: higher confidence when drift is clearly large or
  // clearly small, and lower when volatility is high (uncertain regime).
  const driftSignal = drift < 0.01 || drift > 0.1 ? 0.9 : 0.7;
  const confidence = clamp01(driftSignal * (1 - Math.min(0.4, memory.volatility)));

  let decision: AgentDecision;

  if (ratioBps > 20_000) {
    const amountToAllocate = Math.floor(position.collateralValueUsdCents * 0.05);
    decision = {
      positionId: position.id,
      action: "ALLOCATE_YIELD",
      yieldAmountUsdCents: amountToAllocate,
      reasoning: `Projected ratio ${(ratioBps / 100).toFixed(1)}% is highly overcollateralized. Allocating ${amountToAllocate} cents to yield strategies.`,
      confidence: clamp01(confidence),
      alternativesConsidered: ["NOOP", "UPDATE_VALUATION"],
      decidedBy: "RuleEngine",
    };
  } else if (drift < 0.02) {
    decision = {
      positionId: position.id,
      action: "NOOP",
      reasoning: `Valuation drift ${(drift * 100).toFixed(2)}% is within tolerance.`,
      confidence,
      alternativesConsidered: ["UPDATE_VALUATION", "LIQUIDATE"],
      decidedBy: "RuleEngine",
    };
  } else if (ratioBps < 12_000) {
    // Be more cautious when volatility is high or we've recently liquidated a lot.
    const cautious = memory.volatility > 0.15 || memory.recentLiquidations >= 3;
    if (cautious && valuation.confidence < 0.8) {
      decision = {
        positionId: position.id,
        action: "UPDATE_VALUATION",
        newCollateralValueUsdCents: valuation.fairValueUsdCents,
        reasoning: `Projected ratio ${(ratioBps / 100).toFixed(1)}% is low, but high volatility (${(memory.volatility * 100).toFixed(1)}%) / recent liquidations (${memory.recentLiquidations}) suggest re-marking before liquidating.`,
        confidence: clamp01(confidence * 0.8),
        alternativesConsidered: ["NOOP", "LIQUIDATE"],
        decidedBy: "RuleEngine",
      };
    } else {
      decision = {
        positionId: position.id,
        action: "LIQUIDATE",
        reasoning: `Projected collateral ratio ${(ratioBps / 100).toFixed(1)}% falls below 120% liquidation threshold.`,
        confidence,
        alternativesConsidered: ["NOOP", "UPDATE_VALUATION"],
        decidedBy: "RuleEngine",
      };
    }
  } else {
    decision = {
      positionId: position.id,
      action: "UPDATE_VALUATION",
      newCollateralValueUsdCents: valuation.fairValueUsdCents,
      reasoning: `Valuation drift ${(drift * 100).toFixed(2)}% exceeds tolerance; updating on-chain collateral value.`,
      confidence,
      alternativesConsidered: ["NOOP", "LIQUIDATE"],
      decidedBy: "RuleEngine",
    };
  }

  activityLog.push({
    timestamp: new Date().toISOString(),
    agent: "DecisionAgent",
    message: `Rule-based engine decided "${decision.action}" (confidence ${((decision.confidence ?? 0) * 100).toFixed(0)}%) for position #${position.id}: ${decision.reasoning}`,
    meta: {
      action: decision.action,
      confidence: decision.confidence,
      alternativesConsidered: decision.alternativesConsidered,
    },
  });

  return decision;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
