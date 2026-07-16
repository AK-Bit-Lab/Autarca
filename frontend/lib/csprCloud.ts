/**
 * Thin client for CSPR.cloud REST + Streaming APIs, used to populate the
 * dashboard with live Casper Testnet deploy/transaction data without
 * running a full node.
 */
const BASE_URL = process.env.NEXT_PUBLIC_CSPR_CLOUD_API_URL ?? "https://api.testnet.cspr.cloud";
const API_KEY = process.env.NEXT_PUBLIC_CSPR_CLOUD_API_KEY ?? "";

export async function getContractDeploys(contractHash: string) {
  const res = await fetch(`${BASE_URL}/contracts/${contractHash}/deploys`, {
    headers: API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {},
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.data ?? [];
}
