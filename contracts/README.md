# Autarca Contracts (Odra)

The `AutarcaVault` contract represents a single tokenized RWA collateral
position and exposes agent-only endpoints for autonomous valuation updates
and liquidation.

## Build (WASM for Casper Testnet)

```bash
cargo odra build
```

## Test (off-chain, using odra-test)

```bash
cargo test
```

## Deploy to Testnet

```bash
cargo odra build -b casper
# then deploy the produced .wasm from wasm/ using casper-client or CSPR.click
```

## Key entry points

| Function | Caller | Purpose |
|---|---|---|
| `open_position` | Any user | Opens a new RWA-backed collateral position |
| `agent_update_valuation` | Authorized agent only | Updates collateral value from off-chain valuation pipeline |
| `agent_liquidate` | Authorized agent only | Liquidates an unhealthy position |
| `set_agent` | Owner only | Rotates the authorized agent signing key |
| `get_position` | Any (read-only) | Fetches position state, consumed by MCP server / dashboard |
