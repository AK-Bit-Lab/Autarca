import Link from "next/link";

export const metadata = {
  title: "Autarca — Autonomous RWA Collateral Manager on Casper",
  description:
    "Autarca keeps RWA collateral in DeFi honest. Autonomous AI agents continuously value, rebalance, and liquidate real-world-asset collateral on the Casper Network.",
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-autarca-bg text-white">
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">
        <span className="inline-block text-autarca-accent text-sm font-mono mb-4 border border-autarca-accent/30 rounded-full px-3 py-1">
          Built on Casper · Agentic AI · DeFi · RWA
        </span>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
          RWA collateral that{" "}
          <span className="text-autarca-accent">never goes stale.</span>
        </h1>
        <p className="text-gray-400 mt-6 text-lg max-w-2xl mx-auto">
          Autarca is an autonomous multi-agent pipeline that continuously
          re-values real-world-asset collateral and auto-rebalances DeFi
          positions on the Casper Network — powered by x402, MCP, and
          CSPR.click.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Link
            href="/"
            className="bg-autarca-accent text-autarca-bg font-semibold rounded-lg px-6 py-3"
          >
            Launch Dashboard
          </Link>
          <a
            href="https://github.com/autarca/autarca"
            target="_blank"
            rel="noreferrer"
            className="border border-white/20 rounded-lg px-6 py-3 font-semibold hover:bg-white/5"
          >
            View on GitHub
          </a>
        </div>
      </section>

      {/* Pipeline */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          How the agent pipeline works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[
            { n: "1", t: "Valuation Agent", d: "Fetches off-chain RWA pricing via x402 micropayments." },
            { n: "2", t: "Chain-State Agent", d: "Reads live positions via Casper MCP Server." },
            { n: "3", t: "Decision Agent", d: "LLM tool-calling decides the next on-chain action." },
            { n: "4", t: "Risk Agent", d: "Second opinion can veto premature liquidations." },
            { n: "5", t: "Execution Agent", d: "Signs + broadcasts the tx to Casper Testnet." },
          ].map((s) => (
            <div
              key={s.n}
              className="bg-autarca-panel rounded-xl p-5 text-center"
            >
              <div className="text-autarca-accent text-2xl font-bold mb-2">
                {s.n}
              </div>
              <div className="font-semibold mb-1">{s.t}</div>
              <div className="text-gray-400 text-sm">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          Why Autarca
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-autarca-panel rounded-xl p-6">
            <h3 className="font-semibold text-autarca-accent mb-2">
              Trust-minimized oracle
            </h3>
            <p className="text-gray-400 text-sm">
              Each valuation source earns an on-chain reputation score based on
              historical accuracy — verifiable by anyone.
            </p>
          </div>
          <div className="bg-autarca-panel rounded-xl p-6">
            <h3 className="font-semibold text-autarca-accent mb-2">
              Full Casper AI toolkit
            </h3>
            <p className="text-gray-400 text-sm">
              x402 payments, MCP servers, CSPR.click signing, CSPR.cloud APIs,
              and Odra contracts — all in one coherent product.
            </p>
          </div>
          <div className="bg-autarca-panel rounded-xl p-6">
            <h3 className="font-semibold text-autarca-accent mb-2">
              Multi-asset ready
            </h3>
            <p className="text-gray-400 text-sm">
              Real estate, T-bills, invoices, and carbon credits — seeded on
              Testnet with distinct valuation sources.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Make Casper the home of agentic RWA finance.
        </h2>
        <p className="text-gray-400 mb-8">
          Try the live dashboard on Casper Testnet, or read the architecture in
          the GitHub repo.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/"
            className="bg-autarca-accent text-autarca-bg font-semibold rounded-lg px-6 py-3"
          >
            Open Dashboard
          </Link>
          <a
            href="https://twitter.com/autarca_xyz"
            target="_blank"
            rel="noreferrer"
            className="border border-white/20 rounded-lg px-6 py-3 font-semibold hover:bg-white/5"
          >
            Follow on X
          </a>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-gray-600 text-sm">
        Autarca · Casper Agentic Buildathon 2026 · MIT License
      </footer>
    </main>
  );
}
