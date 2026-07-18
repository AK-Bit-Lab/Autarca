import { NextResponse } from "next/server";

export const runtime = "nodejs";

const CONTRACT_HASH = process.env.NEXT_PUBLIC_AUTARCA_CONTRACT_HASH ?? "";
const RPC_URL =
  process.env.CASPER_NODE_RPC_URL ??
  "https://node.testnet.casper.network/rpc";
const NETWORK_NAME = process.env.CASPER_NETWORK_NAME ?? "casper-test";
const AGENT_PUBLIC_KEY_HEX = process.env.AGENT_PUBLIC_KEY_HEX ?? "";

/**
 * GET /api/status
 *
 * Lightweight health/verification endpoint for judges. Reports whether the
 * AutarcaVault contract is configured, the RPC endpoint it targets, the
 * authorized agent public key, and (if a contract hash is set) the latest
 * block height from the configured Casper node.
 */
export async function GET() {
  const status: Record<string, unknown> = {
    ok: true,
    service: "autarca-frontend",
    timestamp: new Date().toISOString(),
    network: NETWORK_NAME,
    rpcUrl: RPC_URL,
    contractHash: CONTRACT_HASH || null,
    contractDeployed: Boolean(CONTRACT_HASH),
    agentPublicKey: AGENT_PUBLIC_KEY_HEX || null,
  };

  // If a contract hash is configured, probe the node for liveness + height.
  if (CONTRACT_HASH) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "chain_get_block",
          params: [],
        }),
        // Don't let a slow node hang the status endpoint.
        signal: AbortSignal.timeout(5000),
      });
      const json = await res.json();
      const block = json?.result?.block;
      if (block) {
        status.nodeReachable = true;
        status.latestBlockHash = block.hash ?? null;
        status.latestBlockHeight = block.header?.height ?? null;
        status.latestBlockEra = block.header?.era_id ?? null;
      } else {
        status.nodeReachable = false;
        status.nodeError = json?.error?.message ?? "no block returned";
      }
    } catch (err) {
      status.nodeReachable = false;
      status.nodeError = (err as Error).message;
    }
  } else {
    status.nodeReachable = null;
    status.nodeError = "contract hash not configured";
  }

  const httpStatus = CONTRACT_HASH ? 200 : 503;
  return NextResponse.json(status, { status: httpStatus });
}
