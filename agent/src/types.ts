export type PositionStatus = "Healthy" | "Warning" | "Liquidatable" | "Liquidated";

export interface OnChainPosition {
  id: number;
  owner: string;
  rwaId: string;
  collateralValueUsdCents: number;
  debtValueUsdCents: number;
  lastValuationTimestamp: number;
  status: PositionStatus;
  agentUpdates: number;
}

export interface OffChainValuation {
  rwaId: string;
  fairValueUsdCents: number;
  confidence: number; // 0..1
  source: string;
  fetchedAt: string;
}

export type AgentAction = "NOOP" | "UPDATE_VALUATION" | "LIQUIDATE" | "ALLOCATE_YIELD";

export interface AgentDecision {
  positionId: number;
  action: AgentAction;
  newCollateralValueUsdCents?: number;
  yieldAmountUsdCents?: number;
  /** Valuation source name, recorded on-chain for oracle reputation scoring. */
  valuationSource?: string;
  reasoning: string;
  /** Confidence of the decision in [0,1]. Set by the Decision Agent. */
  confidence?: number;
  /** Alternative actions the agent considered before settling on `action`. */
  alternativesConsidered?: AgentAction[];
  /** Name of the agent that produced this decision (for reputation scoring). */
  decidedBy?: "DecisionAgent" | "RuleEngine";
}

export interface ActivityLogEntry {
  timestamp: string;
  agent:
    | "ValuationAgent"
    | "ChainStateAgent"
    | "DecisionAgent"
    | "RiskAgent"
    | "ExecutionAgent";
  message: string;
  meta?: Record<string, unknown>;
}

/**
 * A persisted record of a single agent cycle for a position. Stored in the
 * AgentMemory ring buffer and surfaced to the dashboard so judges can replay
 * the agent's reasoning over time.
 */
export interface DecisionRecord {
  id: string;
  positionId: number;
  rwaId: string;
  timestamp: string;
  // Inputs
  previousCollateralValueUsdCents: number;
  newCollateralValueUsdCents: number;
  debtValueUsdCents: number;
  collateralRatioBps: number;
  valuationSource: string;
  valuationConfidence: number;
  // Decision
  action: AgentAction;
  decisionConfidence: number;
  reasoning: string;
  alternativesConsidered: AgentAction[];
  decidedBy: "DecisionAgent" | "RuleEngine";
  // Risk Agent
  riskApproved: boolean;
  riskReasoning?: string;
  // Execution
  deployHash?: string;
  blockHash?: string;
  finalized: boolean;
  // Outcome (filled in on later cycles when we observe the new on-chain state)
  outcome?: "accurate" | "stale" | "harmful" | "pending";
}

/**
 * Per-agent reputation, tracked in memory alongside the on-chain oracle
 * reputation. Mirrors the OracleReputation shape so the dashboard can render
 * both with the same component.
 */
export interface AgentReputationRecord {
  agent: string;
  totalDecisions: number;
  accurateDecisions: number;
  accuracyBps: number;
  lastUpdated: number;
}
