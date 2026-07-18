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

export interface AgentDecision {
  positionId: number;
  action: "NOOP" | "UPDATE_VALUATION" | "LIQUIDATE";
  newCollateralValueUsdCents?: number;
  /** Valuation source name, recorded on-chain for oracle reputation scoring. */
  valuationSource?: string;
  reasoning: string;
}

export interface ActivityLogEntry {
  timestamp: string;
  agent: "ValuationAgent" | "ChainStateAgent" | "DecisionAgent" | "ExecutionAgent";
  message: string;
  meta?: Record<string, unknown>;
}
