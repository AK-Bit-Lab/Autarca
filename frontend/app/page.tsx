import ActivityFeed from "@/components/ActivityFeed";
import PositionsTable from "@/components/PositionsTable";
import type { Position } from "@/lib/types";

// Demo/seed data shown before the live agent + MCP pipeline populates the
// real positions from the Casper Testnet contract. Replace with a live
// fetch against your MCP server / CSPR.cloud once deployed.
const seedPositions: Position[] = [
  {
    id: 0,
    owner: "0102...abcd",
    rwaId: "rwa-real-estate-001",
    collateralValueUsdCents: 210_000,
    debtValueUsdCents: 100_000,
    lastValuationTimestamp: Date.now(),
    status: "Healthy",
    agentUpdates: 3,
  },
  {
    id: 1,
    owner: "0102...ef01",
    rwaId: "rwa-tbill-2026-q3",
    collateralValueUsdCents: 118_000,
    debtValueUsdCents: 100_000,
    lastValuationTimestamp: Date.now(),
    status: "Warning",
    agentUpdates: 5,
  },
];

export default function HomePage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          Autarca <span className="text-autarca-accent">/</span> Agentic RWA Manager
        </h1>
        <p className="text-gray-400 mt-2">
          Autonomous AI agents monitoring, valuing, and rebalancing Real-World Asset
          collateral on the Casper Network — powered by x402, MCP, and CSPR.click.
        </p>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PositionsTable positions={seedPositions} />
        <ActivityFeed />
      </section>
    </main>
  );
}
