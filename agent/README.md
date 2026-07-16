# Autarca Agent

The autonomous agent pipeline: Valuation Agent → Chain-State Agent (MCP) →
Decision Agent (LLM/rules) → Execution Agent (CSPR.click-style signing).

## Setup

```bash
npm install
cp .env.example .env
# fill in AUTARCA_CONTRACT_HASH after deploying contracts/, and agent keys
```

## Run in dev mode

```bash
npm run dev
```

This starts the pipeline loop (default every 60s) and a WebSocket activity
feed on `ws://localhost:4100` consumed by the `frontend/` dashboard.

## Generate an agent keypair (Testnet)

```bash
mkdir -p keys
casper-client keygen keys/
# point AGENT_PRIVATE_KEY_PATH at keys/secret_key.pem
```

## Modules

| File | Responsibility |
|---|---|
| `valuationAgent.ts` | Fetches off-chain RWA valuation, paying via x402 |
| `mcpClient.ts` | Reads on-chain position state via Casper MCP Server |
| `decisionAgent.ts` | LLM (or rule-based fallback) decision logic |
| `executionAgent.ts` | Signs & submits transactions (CSPR.click flow) |
| `activityLog.ts` | Streams agent activity to the dashboard via WebSocket |
