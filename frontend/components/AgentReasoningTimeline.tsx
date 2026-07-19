"use client";

import { useAgentFeed } from "@/lib/useAgentFeed";
import type { AgentAction, DecisionRecord } from "@/lib/types";

const ACTION_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  NOOP: { dot: "bg-gray-500", label: "NOOP", text: "text-gray-400" },
  UPDATE_VALUATION: { dot: "bg-autarca-accent", label: "UPDATE", text: "text-autarca-accent" },
  LIQUIDATE: { dot: "bg-autarca-danger", label: "LIQUIDATE", text: "text-autarca-danger" },
  ALLOCATE_YIELD: { dot: "bg-emerald-500", label: "YIELD", text: "text-emerald-400" },
};

const OUTCOME_STYLES: Record<string, string> = {
  accurate: "text-emerald-400",
  stale: "text-autarca-warn",
  harmful: "text-autarca-danger",
  pending: "text-gray-500",
};

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

function confidenceColor(c: number): string {
  if (c >= 0.85) return "text-emerald-400";
  if (c >= 0.6) return "text-autarca-warn";
  return "text-autarca-danger";
}

/**
 * Agent Reasoning Timeline — the centerpiece explainability feature.
 *
 * For each agent cycle it renders the full reasoning chain a judge can follow
 * in seconds:
 *
 *   Chain State → Valuation → Decision (action + confidence + alternatives)
 *   → Risk Agent (approved / vetoed) → Execution (deploy hash + block)
 *   → Outcome (accurate / stale / harmful / pending)
 *
 * This transforms the project from "an AI that executes transactions" into
 * "a transparent autonomous system".
 */
export default function AgentReasoningTimeline() {
  const { decisions } = useAgentFeed();

  return (
    <div className="bg-autarca-panel rounded-xl p-4 h-[560px] overflow-y-auto">
      <h2 className="text-lg font-semibold mb-1 text-white">
        Agent Reasoning Timeline
      </h2>
      <p className="text-gray-500 text-xs mb-4">
        Every autonomous cycle, explained: valuation → decision → risk review →
        on-chain execution → outcome.
      </p>

      {decisions.length === 0 && (
        <p className="text-gray-500 text-sm">
          No agent decisions yet. The timeline populates as soon as the agent
          completes its first cycle.
        </p>
      )}

      <ol className="relative border-l border-white/10 ml-2 space-y-6">
        {decisions.map((d) => (
          <TimelineEntry key={d.id} d={d} />
        ))}
      </ol>
    </div>
  );
}

function TimelineEntry({ d }: { d: DecisionRecord }) {
  const style = ACTION_STYLES[d.action];
  const explorer = process.env.NEXT_PUBLIC_CASPER_EXPLORER_URL ?? "https://testnet.cspr.live";

  return (
    <li className="ml-4">
      {/* Header: time + position + action badge */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 ${style.text} text-xs font-bold`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
        <span className="text-gray-400 text-xs font-mono">
          #{d.positionId} · {d.rwaId}
        </span>
        <span className="text-gray-500 text-xs">
          {new Date(d.timestamp).toLocaleTimeString()}
        </span>
        {d.outcome && (
          <span className={`text-xs font-semibold ${OUTCOME_STYLES[d.outcome] ?? ""}`}>
            outcome: {d.outcome}
          </span>
        )}
      </div>

      {/* Reasoning chain */}
      <div className="space-y-1.5 text-sm">
        <ChainRow label="Valuation">
          <span className="text-gray-200">
            {usd(d.previousCollateralValueUsdCents)} →{" "}
            <span className="font-semibold">{usd(d.newCollateralValueUsdCents)}</span>
          </span>
          <span className="text-gray-500"> · ratio {pct(d.collateralRatioBps)}</span>
          <span className="text-gray-500">
            {" "}· oracle{" "}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-[0_0_8px_rgba(168,85,247,0.4)] relative -top-[1px]">
              💸 x402
            </span>{" "}
            {d.valuationSource}
          </span>
          <span className="text-gray-500">
            {" "}· conf {pct(Math.round(d.valuationConfidence * 10000))}
          </span>
        </ChainRow>

        <ChainRow label="Decision">
          <span className={style.text}>{d.action}</span>
          <span className={`ml-2 ${confidenceColor(d.decisionConfidence)}`}>
            conf {pct(Math.round(d.decisionConfidence * 10000))}
          </span>
          <span className="text-gray-500">
            {" "}· by {d.decidedBy}
          </span>
          {d.alternativesConsidered.length > 0 && (
            <span className="text-gray-500">
              {" "}· considered: {d.alternativesConsidered.join(", ")}
            </span>
          )}
        </ChainRow>

        <ChainRow label="Reason">
          <span className="text-gray-300">{d.reasoning}</span>
        </ChainRow>

        <ChainRow label="Risk">
          {d.riskApproved ? (
            <span className="text-emerald-400">approved</span>
          ) : (
            <span className="text-autarca-warn">vetoed → UPDATE_VALUATION</span>
          )}
          {d.riskReasoning && d.action === "LIQUIDATE" && (
            <span className="text-gray-500"> · {d.riskReasoning}</span>
          )}
        </ChainRow>

        <ChainRow label="Execution">
          {d.deployHash ? (
            <a
              href={`${explorer}/deploy/${d.deployHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-autarca-accent hover:underline font-mono text-xs break-all"
            >
              {d.deployHash.slice(0, 16)}…
            </a>
          ) : d.action === "NOOP" ? (
            <span className="text-gray-500">no on-chain action</span>
          ) : (
            <span className="text-gray-500">pending finalization…</span>
          )}
          {d.blockHash && (
            <span className="text-gray-500 text-xs">
              {" "}· block {d.blockHash.slice(0, 10)}…
            </span>
          )}
        </ChainRow>
      </div>
    </li>
  );
}

function ChainRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 w-20 shrink-0 text-xs uppercase tracking-wide">
        {label}
      </span>
      <span className="text-gray-200">{children}</span>
    </div>
  );
}
