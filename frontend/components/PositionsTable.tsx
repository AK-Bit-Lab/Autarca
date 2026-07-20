"use client";

import type { Position } from "@/lib/types";

const STATUS_STYLES: Record<Position["status"], string> = {
  Healthy: "bg-emerald-500/20 text-emerald-400",
  Warning: "bg-autarca-warn/20 text-autarca-warn",
  Liquidatable: "bg-autarca-danger/20 text-autarca-danger",
  Liquidated: "bg-gray-500/20 text-gray-400",
};

function usd(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <div className="bg-autarca-panel rounded-xl p-4">
      <h2 className="text-lg font-semibold mb-3 text-white">RWA Collateral Positions</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 border-b border-white/10">
            <th className="py-2 pr-4">#</th>
            <th className="py-2 pr-4">RWA</th>
            <th className="py-2 pr-4">Collateral</th>
            <th className="py-2 pr-4">Debt</th>
            <th className="py-2 pr-4">Ratio</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Agent Updates</th>
          </tr>
        </thead>
        <tbody>
          {positions.length === 0 && (
            <tr>
              <td colSpan={7} className="py-4 text-gray-500">
                No positions yet. Open one from the contract to see it here.
              </td>
            </tr>
          )}
          {positions.map((p) => (
            <tr key={p.id} className="border-b border-white/5">
              <td className="py-2 pr-4">{p.id}</td>
              <td className="py-2 pr-4">{p.rwaId}</td>
              <td className="py-2 pr-4">{usd(p.collateralValueUsdCents)}</td>
              <td className="py-2 pr-4">{usd(p.debtValueUsdCents)}</td>
              <td className="py-2 pr-4">
                {p.debtValueUsdCents > 0
                  ? `${((p.collateralValueUsdCents / p.debtValueUsdCents) * 100).toFixed(0)}%`
                  : "-"}
              </td>
              <td className="py-2 pr-4">
                <span className={`px-2 py-1 rounded-md text-xs ${STATUS_STYLES[p.status]}`}>
                  {p.status}
                </span>
              </td>
              <td className="py-2 pr-4">{p.agentUpdates}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
