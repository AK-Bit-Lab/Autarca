import { config } from "./config.js";
import { x402Client } from "./x402Client.js";
import { activityLog } from "./activityLog.js";
import type { OffChainValuation } from "./types.js";

/**
 * Valuation Agent: fetches an up-to-date, off-chain fair-value estimate for
 * a given RWA. Real, premium data providers are paid per-request via x402.
 */
export async function fetchOffChainValuation(rwaId: string): Promise<OffChainValuation> {
  const url = `${config.rwa.dataProviderUrl}?rwaId=${encodeURIComponent(rwaId)}`;

  activityLog.push({
    timestamp: new Date().toISOString(),
    agent: "ValuationAgent",
    message: `Requesting fresh valuation for ${rwaId} (paid via x402 if required)`,
  });

  try {
    const data = await x402Client.payAndFetch<{
      fairValueUsdCents: number;
      confidence: number;
      source: string;
    }>(url);

    return {
      rwaId,
      fairValueUsdCents: data.fairValueUsdCents,
      confidence: data.confidence,
      source: data.source,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    // Fallback to a simulated valuation so the demo pipeline can run
    // end-to-end even without a live premium data provider configured.
    const simulated = simulateValuation(rwaId);
    activityLog.push({
      timestamp: new Date().toISOString(),
      agent: "ValuationAgent",
      message: `Live data provider unavailable, using simulated valuation for ${rwaId}`,
    });
    return simulated;
  }
}

function simulateValuation(rwaId: string): OffChainValuation {
  const base = 150_000; // $1,500.00 baseline, in cents
  const drift = Math.round((Math.random() - 0.5) * 40_000);
  return {
    rwaId,
    fairValueUsdCents: Math.max(0, base + drift),
    confidence: 0.85,
    source: "simulated-fallback",
    fetchedAt: new Date().toISOString(),
  };
}
