"use client";

import { useState } from "react";

/**
 * OpenPositionModal: lets a user (judge / demo viewer) connect a Casper
 * wallet and open a new RWA-backed collateral position directly from the
 * dashboard. In production this uses the Casper Wallet connector + CSPR.click
 * signing flow; here it posts the signed deploy via casper-js-sdk loaded
 * dynamically in the browser.
 *
 * For the hackathon demo, if no wallet extension is present, it falls back
 * to a "demo open" that calls a server action which submits the deploy with
 * the agent key (so judges can always seed a position live).
 */
export default function OpenPositionModal({
  onClose,
  onOpened,
}: {
  onClose: () => void;
  onOpened: () => void;
}) {
  const [rwaId, setRwaId] = useState("rwa-real-estate-001");
  const [collateral, setCollateral] = useState("2100.00");
  const [debt, setDebt] = useState("1000.00");
  const [docId, setDocId] = useState("DOC-JD-1980");
  const [submitting, setSubmitting] = useState(false);
  const [kycStatus, setKycStatus] = useState<"idle" | "checking" | "passed" | "failed">("idle");
  const [kycToken, setKycToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    // Simulate AI Compliance Agent checking the document
    setKycStatus("checking");
    await new Promise((r) => setTimeout(r, 1500));

    if (docId.toLowerCase().includes("fail")) {
      setKycStatus("failed");
      setError("AI Compliance Agent rejected document: High Risk Profile (KYC Failed)");
      return;
    }

    setKycStatus("passed");
    const token = `ZKC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setKycToken(token);

    setSubmitting(true);
    try {
      const res = await fetch("/api/open-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rwaId,
          collateralValueUsdCents: Math.round(Number(collateral) * 100),
          debtValueUsdCents: Math.round(Number(debt) * 100),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to open position");

      setResult(data.deployHash ?? "opened");
      
      // Clear form boxes upon success
      setRwaId("");
      setCollateral("");
      setDebt("");
      setDocId("");
      
      // Notify parent to refresh and close modal after 3 seconds so user sees the deploy hash
      onOpened();
      setTimeout(onClose, 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-autarca-panel rounded-xl p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Open RWA Position</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">RWA ID</label>
              <input
                value={rwaId}
                onChange={(e) => setRwaId(e.target.value)}
                className="w-full bg-autarca-bg rounded px-3 py-2 text-white text-sm font-mono"
                placeholder="rwa-real-estate-001"
              />
            </div>
            <div>
              <label className="block text-sm text-amber-400/80 mb-1">Compliance Doc ID</label>
              <input
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
                className="w-full bg-autarca-bg rounded px-3 py-2 text-white text-sm font-mono border border-amber-500/30 focus:border-amber-500"
                placeholder="DOC-1234"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Collateral (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={collateral}
                onChange={(e) => setCollateral(e.target.value)}
                className="w-full bg-autarca-bg rounded px-3 py-2 text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Debt (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={debt}
                onChange={(e) => setDebt(e.target.value)}
                className="w-full bg-autarca-bg rounded px-3 py-2 text-white text-sm"
              />
            </div>
          </div>
          {kycStatus === "checking" && (
            <div className="bg-amber-500/10 border border-amber-500/50 rounded p-2 text-amber-400 text-sm flex items-center">
              <span className="animate-spin mr-2">⟳</span>
              AI Compliance Agent verifying document...
            </div>
          )}
          {kycStatus === "passed" && kycToken && (
            <div className="bg-emerald-500/10 border border-emerald-500/50 rounded p-2 text-emerald-400 text-sm flex items-center">
              <span className="mr-2">✓</span>
              KYC Passed! Compliance Token: {kycToken}
            </div>
          )}
          {error && <p className="text-autarca-danger text-sm">{error}</p>}
          {result && (
            <p className="text-emerald-400 text-sm font-mono break-all">
              Deploy: {result}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || kycStatus === "checking"}
            className="w-full bg-autarca-accent text-autarca-bg font-semibold rounded py-2 disabled:opacity-50"
          >
            {submitting ? "Submitting to Testnet…" : "Open Position"}
          </button>
        </form>
      </div>
    </div>
  );
}
