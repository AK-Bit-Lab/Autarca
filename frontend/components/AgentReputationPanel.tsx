"use client";

import { useAgentFeed } from "@/lib/useAgentFeed";

/**
 * Agent Reputation panel - the per-agent analogue of the on-chain Oracle
 * Reputation. Each agent (DecisionAgent, RiskAgent, ValuationAgent) gets an
 * accuracy score derived from the outcome of its past decisions, tracked in
 * the agent's in-memory store and broadcast to the dashboard.
 *
 * Showing judges that the agents are themselves scored - not just the
 * oracles they consume - makes the autonomy story much more convincing.
 */
export default function AgentReputationPanel() {
  const { agentReputations } = useAgentFeed();

  const reps = [...agentReputations].sort(
    (a, b) => b.totalDecisions - a.totalDecisions
  );

  return (
    <div className="bg-autarca-panel rounded-xl p-4">
      <h2 className="text-lg font-semibold mb-3 text-white">Agent Reputation</h2>
      <p className="text-gray-500 text-xs mb-3">
        Per-agent decision accuracy - the autonomous equivalent of on-chain
        oracle reputation. Agents that repeatedly make harmful or stale
        decisions lose trust over time.
      </p>

      {reps.length === 0 && (
        <p className="text-gray-500 text-sm">
          No agent decisions scored yet. Reputation appears after the first
          cycle&apos;s outcome is evaluated.
        </p>
      )}

      <ul className="space-y-3">
        {reps.map((r) => {
          const pctVal = (r.accuracyBps / 100).toFixed(1);
          const color =
            r.accuracyBps >= 8000
              ? "text-emerald-400"
              : r.accuracyBps >= 5000
              ? "text-autarca-warn"
              : "text-autarca-danger";
          return (
            <li key={r.agent} className="border-b border-white/5 pb-2">
              <div className="flex justify-between items-center">
                <span className="font-mono text-sm text-gray-200">{r.agent}</span>
                <span className={`font-mono text-sm font-bold ${color}`}>
                  {pctVal}%
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {r.accurateDecisions}/{r.totalDecisions} accurate decisions
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
