"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ActivityLogEntry,
  AgentReputation,
  DecisionRecord,
} from "@/lib/types";

interface AgentFeedState {
  entries: ActivityLogEntry[];
  decisions: DecisionRecord[];
  agentReputations: AgentReputation[];
}

/**
 * Subscribes to the Autarca agent's WebSocket activity feed and derives:
 *   - the raw activity log entries,
 *   - structured DecisionRecords (extracted from DecisionAgent `meta.decisionRecord`),
 *   - the latest per-agent reputations (from ChainStateAgent `meta.agentReputations`).
 *
 * This is the single source of truth the Agent Reasoning Timeline and the
 * Agent Reputation panel read from.
 */
export function useAgentFeed(): AgentFeedState {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [agentReputations, setAgentReputations] = useState<AgentReputation[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_AGENT_WS_URL ?? "ws://localhost:4100";
    const socket = new WebSocket(url);
    wsRef.current = socket;

    const ingestEntry = (entry: ActivityLogEntry) => {
      setEntries((prev) => [...prev.slice(-199), entry]);

      // Extract a structured decision record when the DecisionAgent emits one.
      const meta = entry.meta ?? {};
      if (entry.agent === "DecisionAgent" && meta.decisionRecord) {
        const record = meta.decisionRecord as DecisionRecord;
        setDecisions((prev) => {
          // Replace any prior record for the same position/id, then keep newest first.
          const filtered = prev.filter(
            (d) => d.id !== record.id && d.positionId !== record.positionId
          );
          return [record, ...filtered].slice(0, 100);
        });
      }

      // Extract agent reputations when the ChainStateAgent broadcasts them.
      if (entry.agent === "ChainStateAgent" && meta.agentReputations) {
        setAgentReputations(meta.agentReputations as AgentReputation[]);
      }
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "history") {
          setEntries(payload.entries ?? []);
          // Replay history to rebuild decisions + reputations.
          setDecisions([]);
          setAgentReputations([]);
          (payload.entries ?? []).forEach(ingestEntry);
        }
        if (payload.type === "entry") {
          ingestEntry(payload.entry);
        }
      } catch {
        // ignore malformed frames
      }
    };

    return () => socket.close();
  }, []);

  return { entries, decisions, agentReputations };
}
