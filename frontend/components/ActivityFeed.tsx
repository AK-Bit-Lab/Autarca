"use client";

import { useEffect, useRef, useState } from "react";
import type { ActivityLogEntry } from "@/lib/types";

const AGENT_COLORS: Record<ActivityLogEntry["agent"], string> = {
  ValuationAgent: "text-autarca-accent",
  ChainStateAgent: "text-sky-400",
  DecisionAgent: "text-autarca-warn",
  RiskAgent: "text-purple-400",
  ExecutionAgent: "text-autarca-danger",
};

export default function ActivityFeed() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_AGENT_WS_URL ?? "ws://localhost:4100";
    const socket = new WebSocket(url);
    wsRef.current = socket;

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "history") setEntries(payload.entries);
      if (payload.type === "entry") setEntries((prev) => [...prev.slice(-199), payload.entry]);
    };

    return () => socket.close();
  }, []);

  return (
    <div className="bg-autarca-panel rounded-xl p-4 h-[480px] overflow-y-auto font-mono text-sm">
      <h2 className="text-lg font-semibold mb-3 text-white">Live Agent Activity</h2>
      {entries.length === 0 && (
        <p className="text-gray-500">Waiting for agent activity... start the agent process.</p>
      )}
      <ul className="space-y-1">
        {entries
          .slice()
          .reverse()
          .map((entry, i) => (
            <li key={i} className="border-b border-white/5 pb-1">
              <span className="text-gray-500">
                {new Date(entry.timestamp).toLocaleTimeString()}{" "}
              </span>
              <span className={AGENT_COLORS[entry.agent]}>[{entry.agent}]</span>{" "}
              <span className="text-gray-200">{entry.message}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
