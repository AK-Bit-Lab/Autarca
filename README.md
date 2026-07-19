<div align="center">

# Autarca

### RWA Collateral & Yield Manager on Casper Network

**An autonomous, AI agent driven pipeline that keeps tokenized real world asset collateral trustworthy, liquid, and safe.**

Built for the **Casper Agentic Buildathon 2026** — Final Round.

[![Casper Network](https://img.shields.io/badge/Casper-Testnet-red?logo=casper)](https://casper.network)
[![Odra Framework](https://img.shields.io/badge/Odra-Rust-orange?logo=rust)](https://odra.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-Agent-blue?logo=typescript)](https://www.typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-Dashboard-black?logo=next.js)](https://nextjs.org)
[![x402 Protocol](https://img.shields.io/badge/x402-Micropayments-purple)](https://x402.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Build Status](https://img.shields.io/badge/CI-passing-brightgreen?logo=github)](.github/workflows/ci.yml)

[Live Demo](#live-demo) · [Architecture](#architecture) · [Why Autarca](#why-autarca) · [Why Casper](#why-casper) · [Demo Flow](#demo-flow) · [Roadmap](#roadmap)

</div>

---

## Screenshots

> Place the following captures in `docs/screenshots/` and the README will render them automatically.

| Dashboard | Agent Reasoning Timeline | Oracle Reputation |
|---|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Reasoning Timeline](docs/screenshots/reasoning-timeline.png) | ![Oracle Reputation](docs/screenshots/oracle-reputation.png) |

| Agent Reputation | Live Activity Feed | Open Position Modal |
|---|---|---|
| ![Agent Reputation](docs/screenshots/agent-reputation.png) | ![Activity Feed](docs/screenshots/activity-feed.png) | ![Open Position](docs/screenshots/open-position.png) |

---

## Why Autarca?

Tokenized real world assets (RWAs) are the next trillion dollar wave in DeFi — real estate, treasury bills, invoices, carbon credits. But RWA collateral has a fatal flaw that pure crypto collateral does not:

> **The value of an RWA changes off chain, and nobody is watching.**

Today, when an RWA position drifts out of safe collateral ratios, a human operator has to notice, fetch a fresh appraisal, decide whether to revalue or liquidate, and sign a transaction. That loop is slow, centralized, and trust dependent. It is exactly the kind of brittle, manual process that causes systemic failures in lending markets.

**Autarca replaces that human with a transparent, auditable, on chain AI agent pipeline.**

| Traditional RWA Lending | Autarca |
|---|---|
| Manual valuation refresh (days/weeks) | Autonomous valuation refresh every cycle |
| Human decides liquidation | AI Decision Agent with confidence + alternatives |
| No second opinion | Risk Agent veto on low confidence |
| Opaque reasoning | Full reasoning timeline published to dashboard |
| No track record for data sources | On chain Oracle Reputation scoring |
| No track record for the agent itself | On chain Agent Reputation scoring |
| Trust the operator | Verify the agent, the oracle, and the outcome |
| Single point of failure | Circuit breakers, retries, safe fallbacks |

---

## Feature Checklist

- [x] **Autonomous valuation refresh** via x402 micropayments
- [x] **AI Decision Agent** with confidence scores and alternatives considered
- [x] **Risk Agent veto** on low confidence, high volatility, or stale oracle
- [x] **Agent Memory** — decision history, valuation volatility, trend tracking
- [x] **Agent Reputation** — per agent accuracy scoring with outcome heuristics
- [x] **Oracle Reputation** — on chain per source accuracy scoring
- [x] **Explainability Timeline** — full reasoning chain per cycle in the dashboard
- [x] **Resilience** — safe JSON parsing, exponential backoff retries, timeouts, circuit breakers
- [x] **On chain execution** — signed deploys to AutarcaVault on Casper Testnet
- [x] **Live dashboard** — positions, on chain actions, oracle + agent reputation, activity feed
- [x] **Open position UI** — CSPR.click wallet integration for opening new RWA positions
- [x] **CI/CD** — cargo fmt/clippy/test, agent build/test, frontend lint/build, testnet deploy workflow

---

## Why Casper?

Autarca is built natively on Casper because Casper gives us the primitives an autonomous RWA pipeline needs that no other chain combines:

1. **Odra smart contract framework** — ergonomic Rust contracts with first class testing. The `AutarcaVault` and `OracleReputation` contracts are written in Odra and compile to Casper WASM.
2. **Casper MCP Server** — the agent reads live chain state (positions, collateral ratios, oracle reputation) through the Model Context Protocol, the same standard used by AI agents everywhere. This makes the agent a first class citizen of the Casper stack.
3. **CSPR.cloud REST + Streaming APIs** — the dashboard pulls live positions, deploys, and block data from CSPR.cloud without running a node.
4. **x402 micropayment protocol** — the Valuation Agent pays per appraisal over HTTP 402, settling each request on chain. This is the payment rail for autonomous agents buying data.
5. **CSPR.click wallet integration** — users open RWA positions directly from the dashboard with a Casper wallet.
6. **Testnet finality and predictable gas** — the Execution Agent signs and broadcasts deploys that finalize in seconds, making the autonomous loop responsive.

Casper is not just the settlement layer — it is the data layer (MCP + CSPR.cloud), the payment layer (x402), and the wallet layer (CSPR.click) for the entire pipeline.

---

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │                  DASHBOARD                   │
                    │   Next.js + TailwindCSS + WebSockets        │
                    │                                             │
                    │  Agent Reasoning Timeline  (explainability) │
                    │  Positions Table  ·  On Chain Actions        │
                    │  Oracle Reputation  ·  Agent Reputation      │
                    │  Live Activity Feed  ·  Open Position Modal  │
                    └───────────────────┬─────────────────────────┘
                                        │ WebSocket (ws://localhost:4100)
                                        │ CSPR.cloud REST
                                        ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │                         AGENT RUNTIME (Node/TS)                     │
   │                                                                    │
   │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐           │
   │  │ Valuation    │──▶│ Decision     │──▶│ Risk         │           │
   │  │ Agent        │   │ Agent (LLM + │   │ Agent (veto) │           │
   │  │ (x402 pay)   │   │ rule fallback)   └──────┬───────┘           │
   │  └──────┬───────┘   └──────┬───────┘          │                   │
   │         │                  │                  ▼                   │
   │         │            ┌─────┴────────┐   ┌──────────────┐         │
   │         │            │ Agent Memory │   │ Execution    │         │
   │         │            │ (history,    │   │ Agent (sign + │         │
   │         │            │ volatility, │   │ broadcast)   │         │
   │         │            │ reputation) │   └──────┬───────┘         │
   │         │            └─────────────┘          │                 │
   │         ▼                                     ▼                 │
   │  ┌──────────────┐                     ┌──────────────┐          │
   │  │ x402 Client  │                     │ MCP Client   │          │
   │  │ (pay + fetch)│                     │ (chain state)│          │
   │  └──────────────┘                     └──────┬───────┘          │
   └───────────────────────────────────────────────┼──────────────────┘
                                                   │
                                                   ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │                      CASPER TESTNET                                │
   │                                                                    │
   │   AutarcaVault (Odra/Rust)        OracleReputation (Odra/Rust)     │
   │   - open_position                 - record_valuation               │
   │   - agent_update_valuation        - get_reputation                 │
   │   - agent_liquidate               - accuracy tolerance check       │
   │   - min_ratio_bps guard                                            │
   └────────────────────────────────────────────────────────────────────┘
```

### Repository Layout

```
Autarca/
├── contracts/        # Odra (Rust) smart contracts: AutarcaVault + OracleReputation
├── agent/            # Node/TypeScript runtime: x402, MCP, decision, risk, execution, memory
├── frontend/         # Next.js dashboard: CSPR.cloud, reasoning timeline, reputation panels
├── scripts/          # deploy_testnet.sh, get_contract_hash.sh, seed positions
├── docs/             # architecture notes, demo script, pitch material, screenshots
└── .github/workflows # CI + manual testnet deploy
```

---

## Innovation

Autarca is not "another RWA lending app." The innovation is the **autonomous, explainable, reputation scored agent loop**:

1. **Agent Memory** — the agent remembers every decision it has made, the valuation history per RWA (used to compute volatility and trend), and the outcome of each past decision. The next decision is made *in context*, not from scratch.

2. **Confidence + Alternatives** — every decision carries a `confidence` score (0..1) and an `alternativesConsidered` list. The dashboard shows not just *what* the agent did, but *what else it could have done* and *how sure it was*.

3. **Risk Agent Veto** — a second agent reviews every liquidation proposal against six signals (confidence, volatility, oracle accuracy, recent liquidations, collateral trend, previous harmful outcome) and can veto. This is the on chain equivalent of a risk committee.

4. **Dual Reputation System** —
   - **Oracle Reputation** (on chain): each valuation source's historical accuracy is recorded in the `OracleReputation` contract, producing a verifiable per source score.
   - **Agent Reputation** (in memory + dashboard): each agent's decisions are scored by outcome heuristics (accurate / stale / harmful / pending) and displayed in the dashboard.

5. **Explainability Timeline** — the dashboard renders a vertical timeline of every decision cycle: valuation (prev → new, ratio, oracle, confidence), decision (action, confidence, decided by, alternatives), reasoning text, risk review (approved / vetoed with reasons), and execution (deploy hash linked to the explorer). Nothing the agent does is hidden.

6. **Resilience by default** — every external call (x402 provider, x402 facilitator, LLM, CSPR.cloud fallback) is wrapped in `safeJsonParse`, `withRetry` (exponential backoff + jitter), timeouts, and a `CircuitBreaker` that trips open after repeated failures. The agent degrades gracefully to a rule based fallback instead of crashing.

7. **x402 as the agent payment rail** — the Valuation Agent pays per appraisal over HTTP 402, settling each request on chain. This is the first class payment primitive that makes autonomous agents buying data economically viable.

---

## Oracle Reputation

The `OracleReputation` contract lives on Casper Testnet alongside `AutarcaVault`. Every time the Valuation Agent fetches a fresh appraisal, the source is recorded. The contract tracks:

- **total reports** per source
- **accurate reports** (within `accuracy_tolerance_bps` of the next observed value)
- a derived **accuracy ratio**

The dashboard's `OracleReputationPanel` reads these scores live from CSPR.cloud and renders per source accuracy bars. Sources are configurable via the `NEXT_PUBLIC_KNOWN_SOURCES` env var (comma separated), so the panel adapts as new oracles are added without a code change.

---

## Agent Responsibilities

| Agent | Role | Inputs | Outputs |
|---|---|---|---|
| **Valuation Agent** | Fetch fresh off chain RWA pricing | RWA id, x402 payment | `OffChainValuation` (fair value, source, timestamp) |
| **Chain State Agent** | Read live collateral ratios and positions | MCP client, CSPR.cloud | `OnChainPosition` |
| **Decision Agent** | Decide action (noop / update valuation / liquidate) | Position + valuation + memory context | `AgentDecision` (action, confidence, reasoning, alternatives) |
| **Risk Agent** | Second opinion; can veto liquidation | Position + valuation + proposed decision + memory + oracle accuracy | `RiskReview` (approved / vetoed + reasons) |
| **Execution Agent** | Sign and broadcast the deploy | Approved `AgentDecision` | Deploy hash + block hash |

The **Agent Memory** module is shared state across the loop: it records every decision, scores outcomes, tracks per RWA valuation volatility and trend, and exposes a `contextFor(rwaId)` snapshot that the Decision and Risk agents consume.

---

## Demo Flow

A complete end to end demo runs in under five minutes:

1. **Deploy the contract** to Casper Testnet (CI workflow or `scripts/deploy_testnet.sh`).
2. **Seed four realistic RWA positions** (real estate, T bill, invoice, carbon credit) via `npm run seed`.
3. **Start the agent runtime** (`npm run dev` in `agent/`). The loop begins:
   - Valuation Agent fetches a fresh appraisal over x402.
   - Chain State Agent reads the live position from MCP.
   - Decision Agent produces a decision with confidence + alternatives.
   - Risk Agent reviews and either approves or vetoes.
   - Execution Agent signs and broadcasts the deploy.
   - Agent Memory records the decision and scores the previous one.
   - The whole cycle is broadcast over WebSocket to the dashboard.
4. **Start the dashboard** (`npm run dev` in `frontend/`). Open `http://localhost:3000`:
   - Watch the **Agent Reasoning Timeline** fill in cycle by cycle.
   - See **Oracle Reputation** and **Agent Reputation** update live.
   - Open a new position yourself via the **Open Position Modal** (CSPR.click wallet).
5. **Trigger a liquidation** by seeding a position with a low collateral ratio and watching the agent autonomously liquidate it, with the full reasoning chain visible in the timeline.

---

## AI Explanation

The Decision Agent uses an OpenAI compatible LLM with tool/function calling that mirrors the contract entry points (`agent_update_valuation`, `agent_liquidate`, `noop`). Each tool call requires a `confidence` score and a `reasoning` string, so the model is forced to justify every action.

The system prompt injects the **Agent Memory context**: recent decisions for this RWA, valuation volatility, trend, recent liquidations, and the previous outcome. The model decides *in context*.

If the LLM call fails (network, malformed JSON, circuit open), the agent **falls back to a rule based engine** that factors in the same memory signals. The pipeline never halts on an LLM outage.

The Risk Agent uses the same LLM with a stricter prompt focused on downside signals, and also falls back to a rule based veto engine.

---

## Security

- **Safe JSON parsing** — `safeJsonParse` extracts JSON from noisy LLM output via regex and never throws; a validation function guards the shape.
- **Retry with backoff** — `withRetry` uses exponential backoff (`baseDelay * 2^attempt`) plus jitter, with an `onRetry` callback for observability.
- **Timeouts** — every HTTP call (x402 provider, x402 facilitator, CSPR.cloud fallback) has an explicit `timeout`.
- **Circuit breakers** — `CircuitBreaker` trips open after `threshold` failures for `cooldownMs`, then half opens to probe recovery. Used for both the x402 provider and facilitator.
- **Key loading** — the Execution Agent prefers Ed25519 keys and falls back to Secp256K1, so either key format works.
- **On chain guards** — `AutarcaVault` enforces `min_ratio_bps` and only the whitelisted agent public key can call `agent_update_valuation` / `agent_liquidate`.
- **Oracle accuracy tolerance** — `OracleReputation` enforces `accuracy_tolerance_bps` so only valuations within tolerance count as accurate.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Odra Framework (Rust), Casper Testnet |
| Runtime | Node.js, TypeScript |
| Chain Access | Casper MCP Server (`@modelcontextprotocol/sdk`), CSPR.cloud REST/Streaming API |
| Payments | x402 HTTP micropayment protocol |
| Wallet / Signing | CSPR.click integration, casper js sdk |
| Frontend | Next.js, TailwindCSS, WebSockets |
| AI | OpenAI compatible LLM with tool/function calling |

---

## Getting Started

### Quick start (end to end demo)

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

# 2. Seed four realistic RWA positions
cd ../agent && npm install && npm run seed

# 3. Start the runtime components
npm run dev

# 4. Start the dashboard
cd ../frontend && npm install && npm run dev
# open http://localhost:3000
```

### Deploying the frontend to Vercel

The dashboard can be hosted on Vercel for a public demo:

1. Install the Vercel CLI: `npm i -g vercel`
2. Log in: `vercel login`
3. Add the contract hash as an environment variable in Vercel:
   - Key: `NEXT_PUBLIC_AUTARCA_CONTRACT_HASH`
   - Value: `ffd6159dfccb213409230b82972b7cddd925328b85670e78b929e226eb59aa65`
4. Deploy from the `frontend` directory: `vercel --prod --confirm`

See `contracts/README.md`, `agent/README.md`, and `frontend/README.md` for per subsystem setup.

---

## CI/CD

- `.github/workflows/ci.yml` — runs on every push/PR: `cargo fmt`/`clippy`/`test` for contracts, `npm run build`/`test` for the agent, and `npm run lint`/`build` for the frontend.
- `.github/workflows/deploy-testnet.yml` — manually triggered workflow that builds the Odra WASM and deploys `AutarcaVault` to Casper Testnet using `scripts/deploy_testnet.sh`. Requires repo secrets: `CASPER_NODE_RPC_URL`, `DEPLOYER_SECRET_KEY`, `AGENT_PUBLIC_KEY_HEX`.

---

## Roadmap

| Phase | Status | Scope |
|---|---|---|
| **Testnet (now)** | Shipped | Autonomous agent pipeline + dashboard + on chain oracle reputation |
| **Pilot (Q4 2026)** | Planned | Partner with one or two Casper ecosystem RWA issuers; real valuation feeds gated by oracle reputation |
| **Mainnet (2027)** | Planned | Launch `AutarcaVault` on Casper Mainnet with DAO governed parameters; protocol fee on liquidations routed to a DAO treasury |
| **DAO governance** | Planned | Community governed collateral parameters (min ratio, accuracy tolerance) |
| **Multi asset** | Seeded in demo | Real estate, T bills, invoices, carbon credits |

---

## Contribution to Casper

Autarca is built to give back to the Casper ecosystem, not just to sit on top of it:

- **Open source RWA valuation oracle** — the valuation pipeline will be open sourced as a reusable Casper MCP tool so other Casper dApps can consume trust scored RWA data. Autarca positions itself as infrastructure, not just an app.
- **x402 agent payment pattern** — a reference implementation of an autonomous agent paying for data over HTTP 402, settling on Casper. Other agent builders on Casper can copy this pattern.
- **Agent reputation primitive** — a novel on chain + in memory reputation system for autonomous agents that other Casper agent projects can adopt.
- **Odra contract reference** — `AutarcaVault` and `OracleReputation` serve as production quality Odra examples for the community.

---

## Go to Market

**Target users:** DeFi lending protocols that accept RWA collateral, regulated RWA token issuers, and institutional treasury managers.

**Phase 1 — Testnet (now):** Open source reference pipeline + dashboard; community feedback via CSPR.fans voting.

**Phase 2 — Pilot (Q4 2026):** Partner with one or two Casper ecosystem RWA issuers to run a pilot with real valuation feeds, gated by the on chain oracle reputation system.

**Phase 3 — Mainnet (2027):** Launch the `AutarcaVault` on Casper Mainnet with a DAO governed parameter set (min collateral ratio, accuracy tolerance). Introduce a protocol fee on liquidations, routed to a treasury controlled by the DAO.

---

## Team & Links

- **GitHub:** https://github.com/autarca/autarca
- **Demo video:** https://youtube.com/@autarca (linked on submission)
- **Twitter/X:** https://twitter.com/autarca_xyz
- **Discord:** https://discord.gg/autarca
- **Landing page:** https://autarca.xyz (see `/landing` route in this repo)

---

## License

MIT
