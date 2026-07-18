# Autarca

**Autonomous Agentic RWA Collateral & Yield Manager on Casper Network**

Built for the Casper Agentic Buildathon 2026 — Final Round.

Autarca tokenizes real-world assets (RWAs), continuously audits their real-world valuation using an autonomous multi-agent pipeline, and manages their use as DeFi collateral on the Casper Network. It uses Casper's full Agentic AI toolkit: **x402 micropayments**, **MCP servers**, **CSPR.click Agent Skill**, **CSPR.cloud APIs**, and the **Odra smart contract framework**.

## Problem

Tokenized RWA collateral (real estate, treasury bills, invoices, carbon credits) goes stale between valuations. Manual liquidation/rebalancing is slow, centralized, and creates systemic risk in DeFi protocols that accept RWA collateral.

## Solution

An autonomous multi-agent pipeline that:

1. **Valuation Agent** — scrapes/queries off-chain RWA pricing & risk data from third-party APIs, paying per-request via the **x402** micropayment protocol with cryptographic proof of payment.
2. **Chain-State Agent** — reads live collateral ratios, loan positions, and contract state from the Casper Testnet via a **Casper MCP Server** (spec-compliant Model Context Protocol client).
3. **Decision Agent (LLM)** — uses OpenAI **tool-calling** (tools mirror the contract's `agent_*` entry points) to decide whether a position needs to be re-valued or liquidated.
4. **Risk Agent** — a second-opinion agent that can **veto** a liquidation when the valuation source confidence is low, downgrading it to a re-valuation instead. Multi-agent guardrail.
5. **Execution Agent** — signs and **broadcasts** the resulting transaction to the Odra-based RWA Collateral smart contract on Casper Testnet via `casper-js-sdk`, then waits for finalization.
6. **On-Chain Oracle Reputation** — the contract records each valuation source's historical accuracy on-chain, producing a verifiable reputation score (trust-minimized RWA oracle).
7. **Dashboard** — a Next.js frontend, powered by **CSPR.cloud REST APIs**, visualizes live positions, recent on-chain actions, oracle reputation, and the real-time agent activity feed.

## Architecture

```
Autarca/
├── contracts/        # Odra (Rust) smart contracts — RWA Collateral Vault + Oracle Reputation
├── agent/            # Node/TypeScript autonomous agent (x402, MCP client, CSPR.click, Risk Agent)
├── frontend/         # Next.js dashboard (CSPR.cloud REST API, live positions, open-position UI)
└── docs/             # Architecture notes, demo script, pitch material
```

### Agent Pipeline

```
  ┌──────────────┐    ┌──────────────────┐    ┌────────────────┐    ┌──────────────┐
  │ Valuation    │───▶│ Chain-State      │───▶│ Decision Agent │───▶│ Risk Agent   │
  │ Agent (x402) │    │ Agent (MCP)      │    │ (LLM tools)    │    │ (veto guard) │
  └──────────────┘    └──────────────────┘    └────────────────┘    └──────┬───────┘
                                                                                    │
                                          ┌─────────────────────────────────────────┘
                                          ▼
                                ┌──────────────────┐    ┌──────────────────────────┐
                                │ Execution Agent   │───▶│ AutarcaVault (Odra,      │
                                │ (CSPR.click/sdk)  │    │  Casper Testnet)         │
                                └──────────────────┘    │  + Oracle Reputation     │
                                                        └──────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Odra Framework (Rust), Casper Testnet |
| Agent Runtime | Node.js, TypeScript, OpenAI SDK (tool-calling) |
| Chain Access | Casper MCP Server (`@modelcontextprotocol/sdk`), CSPR.cloud REST/Streaming API |
| Payments | x402 HTTP micropayment protocol |
| Wallet/Signing | CSPR.click Agent Skill, casper-js-sdk |
| Frontend | Next.js, TailwindCSS, WebSockets |

## Getting Started

See `contracts/README.md`, `agent/README.md`, and `frontend/README.md` for setup instructions for each subsystem.

### Quick start (end-to-end demo)

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

# 3. Start the autonomous agent
npm run dev

# 4. Start the dashboard
cd ../frontend && npm install && npm run dev
# open http://localhost:3000
```

## CI/CD

- **`.github/workflows/ci.yml`** — runs on every push/PR: `cargo fmt`/`clippy`/`test` for contracts, `npm run build`/`test` for the agent, and `npm run lint`/`build` for the frontend.
- **`.github/workflows/deploy-testnet.yml`** — manually triggered (`workflow_dispatch`) workflow that builds the Odra WASM and deploys `AutarcaVault` to Casper Testnet using `scripts/deploy_testnet.sh`. Requires repo secrets: `CASPER_NODE_RPC_URL`, `DEPLOYER_SECRET_KEY`, `AGENT_PUBLIC_KEY_HEX`.

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

## Roadmap (Post-Buildathon)

- Multi-asset support (real estate, T-bills, invoices, carbon credits) — seeded in demo
- On-chain reputation scoring for the Valuation Agent (RWA oracle trust score) — **shipped**
- DAO governance module for collateral parameter changes
- Mainnet launch with regulated RWA issuer partners

## Go-to-Market

**Target users:** DeFi lending protocols that accept RWA collateral, regulated RWA token issuers, and institutional treasury managers.

**Phase 1 — Testnet (now):** Open-source reference pipeline + dashboard; community feedback via CSPR.fans voting.

**Phase 2 — Pilot (Q4 2026):** Partner with 1–2 Casper ecosystem RWA issuers (e.g. tokenized real estate / T-bill issuers) to run a pilot with real valuation feeds, gated by the on-chain oracle reputation system.

**Phase 3 — Mainnet (2027):** Launch the AutarcaVault on Casper Mainnet with a DAO-governed parameter set (min collateral ratio, accuracy tolerance). Introduce a protocol fee on liquidations, routed to a treasury controlled by the DAO.

**Ecosystem contribution:** The RWA valuation oracle will be open-sourced as a reusable Casper MCP tool / Agent Skill so other Casper dApps can consume trust-scored RWA data — positioning Autarca as infrastructure, not just an app.

## Team & Links

- **GitHub:** https://github.com/autarca/autarca
- **Demo video:** https://youtube.com/@autarca (linked on submission)
- **Twitter/X:** https://twitter.com/autarca_xyz
- **Discord:** https://discord.gg/autarca
- **Landing page:** https://autarca.xyz (see `/landing` route in this repo)

## License

MIT
