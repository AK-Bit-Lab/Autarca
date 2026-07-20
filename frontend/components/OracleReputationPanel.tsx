"use client";

import { useEffect, useState } from "react";
import { getOracleReputation } from "@/lib/csprCloud";
import type { OracleReputation } from "@/lib/types";

const KNOWN_SOURCES = (process.env.NEXT_PUBLIC_KNOWN_SOURCES?.split(",") ?? [
  "autarca-agent",
  "chainlink-rwa",
  "simulated-fallback",
]).map((s) => s.trim());

export default function OracleReputationPanel() {
  const [reps, setReps] = useState<OracleReputation[]>([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const results = await Promise.all(
        KNOWN_SOURCES.map((s) => getOracleReputation(s))
      );
      if (mounted) {
        setReps(
          results
            .filter((r): r is OracleReputation => r !== null)
            .sort((a, b) => b.totalReports - a.totalReports)
        );
      }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="bg-autarca-panel rounded-xl p-4">
      <h2 className="text-lg font-semibold mb-3 text-white">
        RWA Oracle Reputation
      </h2>
      <p className="text-gray-500 text-xs mb-3">
        On-chain accuracy score for each valuation source - trust-minimized RWA
        oracle reputation (verifiable on Casper Testnet).
      </p>
      {reps.length === 0 && (
        <p className="text-gray-500 text-sm">
          No oracle reports recorded yet. Reputation appears after the first
          agent valuation cycle.
        </p>
      )}
      <ul className="space-y-3">
        {reps.map((r) => {
          const pct = (r.accuracyBps / 100).toFixed(1);
          const color =
            r.accuracyBps >= 8000
              ? "text-emerald-400"
              : r.accuracyBps >= 5000
              ? "text-autarca-warn"
              : "text-autarca-danger";
          return (
            <li key={r.source} className="border-b border-white/5 pb-2">
              <div className="flex justify-between items-center">
                <span className="font-mono text-sm text-gray-200">
                  {r.source}
                </span>
                <span className={`font-mono text-sm font-bold ${color}`}>
                  {pct}%
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {r.accurateReports}/{r.totalReports} accurate reports
              </div>
              <div className="h-1.5 bg-white/5 rounded-full mt-1 overflow-hidden">
                <div
                  className={`h-full ${
                    r.accuracyBps >= 8000
                      ? "bg-emerald-400"
                      : r.accuracyBps >= 5000
                      ? "bg-autarca-warn"
                      : "bg-autarca-danger"
                  }`}
                  style={{ width: `${r.accuracyBps / 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
