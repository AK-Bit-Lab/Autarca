import { randomUUID } from "node:crypto";
import type {
  AgentAction,
  AgentReputationRecord,
  DecisionRecord,
  OffChainValuation,
  OnChainPosition,
} from "./types.js";

/**
 * Agent Memory: a persistent, in-memory store of every agent cycle so the
 * agents no longer start from scratch each tick.
 *
 * It tracks three things:
 *   1. Decision history (per position) - for replay, outcome scoring, and
 *      agent reputation.
 *   2. Per-agent reputation - accuracy of each agent's past decisions,
 *      mirroring the on-chain oracle reputation.
 *   3. Valuation history (per RWA) - for volatility / trend features that the
 *      Decision and Risk agents can reason over.
 *
 * The store is intentionally process-local (no DB) so the demo runs without
 * extra infra, but the shape is designed to map cleanly onto a Casper
 * contract or CSPR.cloud-backed store later.
 */
class AgentMemory {
  private decisions: DecisionRecord[] = [];
  private readonly maxDecisions = 1000;

  private valuations = new Map<string, number[]>(); // rwaId -> fairValueUsdCents[]
  private readonly maxValuationsPerRwa = 50;

  private reputations = new Map<string, AgentReputationRecord>();

  /** Record a completed cycle and return the stored record (with id). */
  recordDecision(input: Omit<DecisionRecord, "id" | "outcome">): DecisionRecord {
    const record: DecisionRecord = {
      ...input,
      id: randomUUID(),
      outcome: "pending",
    };
    this.decisions.push(record);
    if (this.decisions.length > this.maxDecisions) this.decisions.shift();
    return record;
  }

  /** Attach execution outcome (deploy/block hash) to the most recent record. */
  attachOutcome(
    positionId: number,
    patch: Partial<Pick<DecisionRecord, "deployHash" | "blockHash" | "finalized">>
  ) {
    for (let i = this.decisions.length - 1; i >= 0; i--) {
      if (this.decisions[i].positionId === positionId) {
        this.decisions[i] = { ...this.decisions[i], ...patch };
        break;
      }
    }
  }

  /** Score the previous decision for a position against the new observed state. */
  scorePreviousDecision(position: OnChainPosition, valuation: OffChainValuation) {
    const prev = this.lastDecisionFor(position.id);
    if (!prev || prev.outcome !== "pending") return;

    // Outcome heuristic:
    //  - "accurate": the agent's valuation moved on-chain value toward the
    //    fresh fair value (drift shrank).
    //  - "stale": the agent NOOP'd but drift is now large.
    //  - "harmful": the agent liquidated but the position was actually healthy.
    const driftNow =
      Math.abs(valuation.fairValueUsdCents - position.collateralValueUsdCents) /
      Math.max(1, position.collateralValueUsdCents);

    let outcome: DecisionRecord["outcome"] = "accurate";
    if (prev.action === "NOOP" && driftNow > 0.05) {
      outcome = "stale";
    } else if (
      prev.action === "LIQUIDATE" &&
      position.status !== "Liquidated" &&
      valuation.fairValueUsdCents * 10_000 > position.debtValueUsdCents * 1.5
    ) {
      outcome = "harmful";
    }
    prev.outcome = outcome;

    // Update per-agent reputation for the Decision Agent.
    if (prev.decidedBy) {
      this.bumpReputation(prev.decidedBy, outcome === "accurate");
    }
    // Risk Agent reputation: a veto that prevented a harmful liquidation
    // counts as accurate; approving a harmful one counts as inaccurate.
    if (prev.riskReviewed) {
      const riskAccurate =
        outcome !== "harmful" && outcome !== "stale";
      this.bumpReputation("RiskAgent", riskAccurate);
    }
    // Valuation Agent reputation: accurate when the valuation it supplied was
    // close to the now-observed fair value.
    const valAccurate =
      Math.abs(prev.newCollateralValueUsdCents - valuation.fairValueUsdCents) /
      Math.max(1, valuation.fairValueUsdCents) <
      0.05;
    this.bumpReputation("ValuationAgent", valAccurate);
  }

  /** Push a valuation into the per-RWA history (for volatility/trend). */
  recordValuation(rwaId: string, fairValueUsdCents: number) {
    const arr = this.valuations.get(rwaId) ?? [];
    arr.push(fairValueUsdCents);
    if (arr.length > this.maxValuationsPerRwa) arr.shift();
    this.valuations.set(rwaId, arr);
  }

  /** Volatility (stddev / mean) of recent valuations for an RWA, or 0. */
  volatility(rwaId: string): number {
    const arr = this.valuations.get(rwaId);
    if (!arr || arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    if (mean === 0) return 0;
    const variance =
      arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance) / mean;
  }

  /** Simple trend: (last - first) / first over the stored window. */
  trend(rwaId: string): number {
    const arr = this.valuations.get(rwaId);
    if (!arr || arr.length < 2) return 0;
    const first = arr[0];
    if (first === 0) return 0;
    return (arr[arr.length - 1] - first) / first;
  }

  /** Recent liquidation count (for the Risk Agent's trend signal). */
  recentLiquidations(windowMs = 30 * 60 * 1000): number {
    const since = Date.now() - windowMs;
    return this.decisions.filter(
      (d) => d.action === "LIQUIDATE" && new Date(d.timestamp).getTime() >= since
    ).length;
  }

  lastDecisionFor(positionId: number): DecisionRecord | undefined {
    for (let i = this.decisions.length - 1; i >= 0; i--) {
      if (this.decisions[i].positionId === positionId) return this.decisions[i];
    }
    return undefined;
  }

  /** Context summary for the Decision/Risk agents' prompts. */
  contextFor(positionId: number, rwaId: string): {
    previousDecision?: DecisionRecord;
    volatility: number;
    trend: number;
    recentLiquidations: number;
  } {
    return {
      previousDecision: this.lastDecisionFor(positionId),
      volatility: this.volatility(rwaId),
      trend: this.trend(rwaId),
      recentLiquidations: this.recentLiquidations(),
    };
  }

  allDecisions(): DecisionRecord[] {
    return [...this.decisions];
  }

  reputationsList(): AgentReputationRecord[] {
    return [...this.reputations.values()];
  }

  private bumpReputation(agent: string, accurate: boolean) {
    const r =
      this.reputations.get(agent) ?? {
        agent,
        totalDecisions: 0,
        accurateDecisions: 0,
        accuracyBps: 0,
        lastUpdated: 0,
      };
    r.totalDecisions += 1;
    if (accurate) r.accurateDecisions += 1;
    r.accuracyBps = Math.round((r.accurateDecisions / r.totalDecisions) * 10_000);
    r.lastUpdated = Date.now();
    this.reputations.set(agent, r);
  }
}

export const agentMemory = new AgentMemory();

/** Convenience: the set of actions the Decision Agent should list as
 *  "alternatives considered" in its structured output. */
export const ALL_ACTIONS: AgentAction[] = ["NOOP", "UPDATE_VALUATION", "LIQUIDATE", "ALLOCATE_YIELD"];
