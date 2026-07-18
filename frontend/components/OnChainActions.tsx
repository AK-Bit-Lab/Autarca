"use client";

import { useEffect, useState } from "react";
import { getContractDeploys } from "@/lib/csprCloud";
import type { OnChainDeploy } from "@/lib/types";

export default function OnChainActions() {
  const [deploys, setDeploys] = useState<OnChainDeploy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const d = await getContractDeploys();
      if (mounted) {
        setDeploys(d);
        setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 15_000); // refresh every 15s
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="bg-autarca-panel rounded-xl p-4">
      <h2 className="text-lg font-semibold mb-3 text-white">
        Recent On-Chain Actions
      </h2>
      {loading && <p className="text-gray-500 text-sm">Loading deploys…</p>}
      {!loading && deploys.length === 0 && (
        <p className="text-gray-500 text-sm">
          No deploys yet. Once the agent acts, transactions will appear here.
        </p>
      )}
      <ul className="space-y-2 text-sm font-mono">
        {deploys.map((d) => (
          <li
            key={d.deployHash}
            className="border-b border-white/5 pb-2 flex flex-col gap-1"
          >
            <div className="flex items-center gap-2">
              <span className="text-autarca-accent">
                {d.entryPoint ?? "call"}
              </span>
              {d.status && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    d.status === "executed"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-autarca-warn/20 text-autarca-warn"
                  }`}
                >
                  {d.status}
                </span>
              )}
            </div>
            <span className="text-gray-400 text-xs break-all">
              {d.deployHash}
            </span>
            {d.timestamp && (
              <span className="text-gray-600 text-xs">
                {new Date(d.timestamp).toLocaleString()}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
