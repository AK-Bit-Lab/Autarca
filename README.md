# Autarca

**Autonomous Agentic RWA Collateral & Yield Manager on Casper Network**

Built for the Casper Agentic Buildathon 2026 — Final Round.

Autarca tokenizes real-world assets (RWAs), continuously audits their real-world valuation using an autonomous AI agent, and manages their use as DeFi collateral on the Casper Network. It uses Casper's full Agentic AI toolkit: **x402 micropayments**, **MCP servers**, **CSPR.click Agent Skill**, **CSPR.cloud APIs**, and the **Odra smart contract framework**.

## Problem

Tokenized RWA collateral (real estate, treasury bills, invoices) goes stale between valuations. Manual liquidation/rebalancing is slow, centralized, and creates systemic risk in DeFi protocols that accept RWA collateral.

## Solution

An autonomous multi-agent pipeline that:

1. **Valuation Agent** — scrapes/queries off-chain RWA pricing & risk data from third-party APIs, paying per-request via the **x402** micropayment protocol with cryptographic proof of payment.
2. **Chain-State Agent** — reads live collateral ratios, loan positions, and contract state from the Casper Testnet via a **Casper MCP Server**.
3. **Decision Agent (LLM)** — combines off-chain valuation + on-chain state to decide whether a position needs to be rebalanced, topped-up, or liquidated.
4. **Execution Agent** — uses the **CSPR.click AI Agent Skill** to autonomously sign and submit the resulting transaction to the Odra-based RWA Collateral smart contract on Casper Testnet.
5. **Dashboard** — a Next.js frontend, powered by **CSPR.cloud Streaming/REST APIs**, visualizes the live agent activity log, collateral health, and on-chain transactions in real time.

## Architecture

```
Autarca/
├── contracts/        # Odra (Rust) smart contracts — RWA Collateral Vault
├── agent/            # Node/TypeScript autonomous agent (x402, MCP client, CSPR.click)
├── frontend/         # Next.js dashboard (CSPR.cloud REST + Streaming API)
└── docs/             # Architecture notes, demo script, pitch material
```

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Odra Framework (Rust), Casper Testnet |
| Agent Runtime | Node.js, TypeScript, OpenAI/LLM SDK |
| Chain Access | Casper MCP Server, CSPR.cloud REST/Streaming API |
| Payments | x402 HTTP micropayment protocol |
| Wallet/Signing | CSPR.click Agent Skill |
| Frontend | Next.js, TailwindCSS, WebSockets |

## Getting Started

See `contracts/README.md`, `agent/README.md`, and `frontend/README.md` for setup instructions for each subsystem.

## Roadmap (Post-Buildathon)

- Multi-asset support (real estate, T-bills, invoices, carbon credits)
- On-chain reputation scoring for the Valuation Agent (RWA oracle trust score)
- DAO governance module for collateral parameter changes
- Mainnet launch with regulated RWA issuer partners

## Team & Links

- GitHub: (add repo link)
- Demo video: (add link)
- Twitter/X: (add handle)
- Discord: (add invite)

## License

MIT
