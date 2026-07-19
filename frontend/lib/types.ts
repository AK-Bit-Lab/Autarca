export type PositionStatus = "Healthy" | "Warning" | "Liquidatable" | "Liquidated";

export interface Position {
  id: number;
  owner: string;
  rwaId: string;
  collateralValueUsdCents: number;
  debtValueUsdCents: number;
  lastValuationTimestamp: number;
  status: PositionStatus;
  agentUpdates: number;
  lastValuationSource?: string;
}

export interface OracleReputation {
  source: string;
  totalReports: number;
  accurateReports: number;
  accuracyBps: number;
  lastUpdated: number;
}

export interface OnChainDeploy {
  deployHash: string;
  blockHash?: string;
  timestamp?: string;
  entryPoint?: string;
  status?: string;
}

export type AgentAction = "NOOP" | "UPDATE_VALUATION" | "LIQUIDATE";
export type DecisionOutcome = "accurate" | "stale" | "harmful" | "pending";

export interface DecisionRecord {
  id: string;
  positionId: number;
  rwaId: string;
  timestamp: string;
  previousCollateralValueUsdCents: number;
  newCollateralValueUsdCents: number;
  debtValueUsdCents: number;
  collateralRatioBps: number;
  valuationSource: string;
  valuationConfidence: number;
  action: AgentAction;
  decisionConfidence: number;
  reasoning: string;
  alternativesConsidered: AgentAction[];
  decidedBy: "DecisionAgent" | "RuleEngine";
  riskApproved: boolean;
  riskReasoning?: string;
  deployHash?: string;
  blockHash?: string;
  finalized: boolean;
  outcome?: DecisionOutcome;
}

export interface AgentReputation {
  agent: string;
  totalDecisions: number;
  accurateDecisions: number;
  accuracyBps: number;
  lastUpdated: number;
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
