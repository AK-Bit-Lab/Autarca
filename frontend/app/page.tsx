"use client";

import { useCallback, useEffect, useState } from "react";
import ActivityFeed from "@/components/ActivityFeed";
import PositionsTable from "@/components/PositionsTable";
import OnChainActions from "@/components/OnChainActions";
import OracleReputationPanel from "@/components/OracleReputationPanel";
import OpenPositionModal from "@/components/OpenPositionModal";
import { getPositions } from "@/lib/csprCloud";
import type { Position } from "@/lib/types";

export default function HomePage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOpenModal, setShowOpenModal] = useState(false);

  const refresh = useCallback(async () => {
    const live = await getPositions();
    setPositions(live);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000); // poll CSPR.cloud every 15s
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-8 flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Autarca <span className="text-autarca-accent">/</span> Agentic RWA
            Manager
          </h1>
          <p className="text-gray-400 mt-2">
            Autonomous AI agents monitoring, valuing, and rebalancing
            Real-World Asset collateral on the Casper Network — powered by x402,
            MCP, and CSPR.click.
          </p>
        </div>
        <button
          onClick={() => setShowOpenModal(true)}
          className="bg-autarca-accent text-autarca-bg font-semibold rounded-lg px-4 py-2 text-sm whitespace-nowrap"
        >
          + Open Position
        </button>
      </header>

      {loading && <p className="text-gray-500">Loading live positions from CSPR.cloud…</p>}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PositionsTable positions={positions} />
        <ActivityFeed />
        <OnChainActions />
        <OracleReputationPanel />
      </section>

      {showOpenModal && (
        <OpenPositionModal
          onClose={() => setShowOpenModal(false)}
          onOpened={refresh}
        />
      )}
    </main>
  );
}
