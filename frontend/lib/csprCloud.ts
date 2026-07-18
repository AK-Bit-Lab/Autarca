import type { OnChainDeploy, OracleReputation, Position } from "./types";

/**
 * Thin client for CSPR.cloud REST + Streaming APIs, used to populate the
 * dashboard with live Casper Testnet contract state, deploys, and oracle
 * reputation without running a full node.
 */
const BASE_URL =
  process.env.NEXT_PUBLIC_CSPR_CLOUD_API_URL ?? "https://api.testnet.cspr.cloud";
const API_KEY = process.env.NEXT_PUBLIC_CSPR_CLOUD_API_KEY ?? "";
const CONTRACT_HASH =
  process.env.NEXT_PUBLIC_AUTARCA_CONTRACT_HASH ?? "";

function headers(): HeadersInit {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
}

/**
 * Fetches all AutarcaVault positions by reading the contract's named keys /
 * dictionary items via CSPR.cloud. Falls back to an empty array if the
 * contract isn't deployed yet (e.g. local dev without a contract hash).
 */
export async function getPositions(): Promise<Position[]> {
  if (!CONTRACT_HASH) return [];
  try {
    const res = await fetch(
      `${BASE_URL}/contracts/${CONTRACT_HASH}/state`,
      { headers: headers(), cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items: any[] = data?.data ?? [];
    return items.map(normalizePosition).filter(Boolean) as Position[];
  } catch {
    return [];
  }
}

/**
 * Fetches recent deploys against the AutarcaVault contract — these are the
 * on-chain transactions the autonomous agent submitted (valuation updates +
 * liquidations). Rendered in the "Recent On-Chain Actions" panel.
 */
export async function getContractDeploys(): Promise<OnChainDeploy[]> {
  if (!CONTRACT_HASH) return [];
  try {
    const res = await fetch(
      `${BASE_URL}/contracts/${CONTRACT_HASH}/deploys?limit=20`,
      { headers: headers(), cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items: any[] = data?.data ?? [];
    return items.map((d) => ({
      deployHash: d.deploy_hash ?? d.hash ?? "",
      blockHash: d.block_hash,
      timestamp: d.timestamp,
      entryPoint: d.entry_point,
      status: d.status,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetches the on-chain reputation record for a given valuation source
 * (RWA oracle) by querying the contract's `get_oracle_reputation` entry
 * point via CSPR.cloud query endpoint.
 */
export async function getOracleReputation(
  source: string
): Promise<OracleReputation | null> {
  if (!CONTRACT_HASH) return null;
  try {
    const res = await fetch(
      `${BASE_URL}/contracts/${CONTRACT_HASH}/query?entry_point=get_oracle_reputation&source=${encodeURIComponent(
        source
      )}`,
      { headers: headers(), cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.data;
    if (!r) return null;
    return {
      source,
      totalReports: Number(r.total_reports ?? 0),
      accurateReports: Number(r.accurate_reports ?? 0),
      accuracyBps: Number(r.accuracy_bps ?? 10000),
      lastUpdated: Number(r.last_updated ?? 0),
    };
  } catch {
    return null;
  }
}

function normalizePosition(raw: any): Position | null {
  if (!raw) return null;
  return {
    id: Number(raw.id ?? raw.position_id ?? 0),
    owner: raw.owner ?? "",
    rwaId: raw.rwa_id ?? raw.rwaId ?? "",
    collateralValueUsdCents: Number(raw.collateral_value_usd_cents ?? 0),
    debtValueUsdCents: Number(raw.debt_value_usd_cents ?? 0),
    lastValuationTimestamp: Number(raw.last_valuation_timestamp ?? 0),
    status: (raw.status ?? "Healthy") as Position["status"],
    agentUpdates: Number(raw.agent_updates ?? 0),
    lastValuationSource: raw.last_valuation_source,
  };
}
