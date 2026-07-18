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

export interface ActivityLogEntry {
  timestamp: string;
  agent: "ValuationAgent" | "ChainStateAgent" | "DecisionAgent" | "ExecutionAgent";
  message: string;
  meta?: Record<string, unknown>;
}
