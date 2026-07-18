# Autarca

**RWA Collateral & Yield Manager on Casper Network**

Built for the Casper Buildathon 2026 – Final Round.

Autarca tokenizes real-world assets (RWAs) and manages their use as DeFi collateral on the Casper Network. It leverages Casper's ecosystem tools: x402 micropayments, MCP servers, CSPR.cloud APIs, and the Odra smart contract framework.

## Problem

Tokenized RWA collateral (real estate, treasury bills, invoices, carbon credits) can become outdated. Manual liquidation and rebalancing are slow and centralized, creating systemic risk for DeFi protocols that accept RWA collateral.

## Solution

A multi‑component pipeline that:

1. **Valuation Component** – fetches off‑chain RWA pricing and risk data via the x402 micropayment protocol.
2. **Chain‑State Component** – reads live collateral ratios, loan positions, and contract state from the Casper Testnet using an MCP client.
3. **Decision Logic** – determines whether a position needs re‑valuation or liquidation based on the fetched data.
4. **Risk Guard** – provides a second‑opinion check that can veto a liquidation when confidence is low.
5. **Execution Component** – signs and broadcasts the resulting transaction to the AutarcaVault contract on Casper Testnet.
6. **On‑Chain Oracle Reputation** – records each valuation source's historical accuracy on‑chain, producing a verifiable reputation score.
7. **Dashboard** – a Next.js frontend, powered by CSPR.cloud REST APIs, visualizes live positions, recent on‑chain actions, oracle reputation, and the real‑time activity feed.

## Architecture

```
Autarca/
├── contracts/        # Odra (Rust) smart contracts – RWA Collateral Vault + Oracle Reputation
├── agent/            # Node/TypeScript components (x402, MCP client, risk guard, execution)
├── frontend/         # Next.js dashboard (CSPR.cloud REST API, live positions, open‑position UI)
└── docs/             # Architecture notes, demo script, pitch material
```

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Odra Framework (Rust), Casper Testnet |
| Runtime | Node.js, TypeScript |
| Chain Access | Casper MCP Server (`@modelcontextprotocol/sdk`), CSPR.cloud REST/Streaming API |
| Payments | x402 HTTP micropayment protocol |
| Wallet/Signing | CSPR.click integration, casper‑js‑sdk |
| Frontend | Next.js, TailwindCSS, WebSockets |

## Getting Started

### Deploying the frontend to Vercel

The dashboard can be hosted on Vercel for a public demo. Follow these steps:

1. **Create a Vercel account** and install the Vercel CLI:
   ```bash
   npm i -g vercel
   ```
2. **Log in**:
   ```bash
   vercel login
   ```
3. **Add the contract hash** as an environment variable in Vercel:
   - Key: `NEXT_PUBLIC_AUTARCA_CONTRACT_HASH`
   - Value: `ffd6159dfccb213409230b82972b7cddd925328b85670e78b929e226eb59aa65`
4. **Deploy** from the `frontend` directory:
   ```bash
   cd frontend
   vercel --prod --confirm
   ```
   The deployment will be available at `https://autarca.vercel.app`.

---

See `contracts/README.md`, `agent/README.md`, and `frontend/README.md` for setup instructions for each subsystem.

### Quick start (end‑to‑end demo)

```bash
# 1. Build + deploy the contract to Casper Testnet
cd contracts && cargo odra build -b casper
CASPER_NODE_RPC_URL=https://node.testnet.casper.network/rpc \
DEPLOYER_SECRET_KEY="$(cat ~/keys/secret_key.pem)" \
AGENT_PUBLIC_KEY_HEX=01... \
  ../scripts/deploy_testnet.sh --wasm wasm/AutarcaVault.wasm --min-ratio-bps 15000 --accuracy-tolerance-bps 200

# Resolve the contract hash after finalization:
./scripts/get_contract_hash.sh <deploy-hash>
# then set AUTARCA_CONTRACT_HASH in agent/.env and NEXT_PUBLIC_AUTARCA_CONTRACT_HASH in frontend/.env.local

# 2. Seed 4 realistic RWA positions
cd ../agent && npm install && npm run seed

# 3. Start the runtime components
npm run dev

# 4. Start the dashboard
cd ../frontend && npm install && npm run dev
# open http://localhost:3000
```

## CI/CD

- `.github/workflows/ci.yml` – runs on every push/PR: `cargo fmt`/`clippy`/`test` for contracts, `npm run build`/`test` for the runtime, and `npm run lint`/`build` for the frontend.
- `.github/workflows/deploy-testnet.yml` – manually triggered workflow that builds the Odra WASM and deploys `AutarcaVault` to Casper Testnet using `scripts/deploy_testnet.sh`. Requires repo secrets: `CASPER_NODE_RPC_URL`, `DEPLOYER_SECRET_KEY`, `AGENT_PUBLIC_KEY_HEX`.

## Manual Deployment

```bash
cd contracts && cargo odra build -b casper
CASPER_NODE_RPC_URL=https://node.testnet.casper.network/rpc \
DEPLOYER_SECRET_KEY="$(cat ~/keys/secret_key.pem)" \
AGENT_PUBLIC_KEY_HEX=01... \
  ../scripts/deploy_testnet.sh --wasm wasm/AutarcaVault.wasm --min-ratio-bps 15000 --accuracy-tolerance-bps 200

# Once the deploy finalizes, resolve the contract hash:
./scripts/get_contract_hash.sh <deploy-hash>
# then set AUTARCA_CONTRACT_HASH in agent/.env and NEXT_PUBLIC_AUTARCA_CONTRACT_HASH in frontend/.env.local
```

## Roadmap (Post‑Buildathon)

- Multi‑asset support (real estate, T‑bills, invoices, carbon credits) – seeded in demo
- On‑chain reputation scoring for the valuation component – shipped
- DAO governance module for collateral parameter changes
- Mainnet launch with regulated RWA issuer partners

## Go‑to‑Market

**Target users:** DeFi lending protocols that accept RWA collateral, regulated RWA token issuers, and institutional treasury managers.

**Phase 1 – Testnet (now):** Open‑source reference pipeline + dashboard; community feedback via CSPR.fans voting.

**Phase 2 – Pilot (Q4 2026):** Partner with 1–2 Casper ecosystem RWA issuers to run a pilot with real valuation feeds, gated by the on‑chain oracle reputation system.

**Phase 3 – Mainnet (2027):** Launch the AutarcaVault on Casper Mainnet with a DAO‑governed parameter set (min collateral ratio, accuracy tolerance). Introduce a protocol fee on liquidations, routed to a treasury controlled by the DAO.

**Ecosystem contribution:** The RWA valuation oracle will be open‑sourced as a reusable Casper MCP tool so other Casper dApps can consume trust‑scored RWA data – positioning Autarca as infrastructure, not just an app.

## Team & Links

- **GitHub:** https://github.com/autarca/autarca
- **Demo video:** https://youtube.com/@autarca (linked on submission)
- **Twitter/X:** https://twitter.com/autarca_xyz
- **Discord:** https://discord.gg/autarca
- **Landing page:** https://autarca.xyz (see `/landing` route in this repo)

## License

MIT
