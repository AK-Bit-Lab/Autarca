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
}

export interface ActivityLogEntry {
  timestamp: string;
  agent: "ValuationAgent" | "ChainStateAgent" | "DecisionAgent" | "ExecutionAgent";
  message: string;
  meta?: Record<string, unknown>;
}
