#!/usr/bin/env bash
#
# Deploys the AutarcaVault contract WASM to the Casper Testnet using
# casper-client. Intended to be run locally (with your own secret key) or
# from the deploy-testnet.yml GitHub Actions workflow (with secrets).
#
# Usage:
#   ./scripts/deploy_testnet.sh --wasm contracts/wasm/AutarcaVault.wasm \
#     --min-ratio-bps 15000
#
# Required environment variables:
#   CASPER_NODE_RPC_URL   - e.g. https://node.testnet.casper.network/rpc
#   DEPLOYER_SECRET_KEY   - PEM contents of the deployer's secret key
#   AGENT_PUBLIC_KEY_HEX  - hex public key of the agent that will be
#                           authorized to call agent_* entry points

set -euo pipefail

WASM_PATH=""
MIN_RATIO_BPS="15000"
ACCURACY_TOLERANCE_BPS="200"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wasm) WASM_PATH="$2"; shift 2 ;;
    --min-ratio-bps) MIN_RATIO_BPS="$2"; shift 2 ;;
    --accuracy-tolerance-bps) ACCURACY_TOLERANCE_BPS="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [[ -z "$WASM_PATH" ]]; then
  echo "Error: --wasm <path-to-wasm> is required"
  exit 1
fi

: "${CASPER_NODE_RPC_URL:?Set CASPER_NODE_RPC_URL}"
: "${DEPLOYER_SECRET_KEY:?Set DEPLOYER_SECRET_KEY}"
: "${AGENT_PUBLIC_KEY_HEX:?Set AGENT_PUBLIC_KEY_HEX}"

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

echo "$DEPLOYER_SECRET_KEY" > "$WORKDIR/secret_key.pem"

echo "==> Installing casper-client (if not already present)"
if ! command -v casper-client >/dev/null 2>&1; then
  npm install -g casper-client-js-cli 2>/dev/null || \
    cargo install casper-client
fi

echo "==> Deploying $WASM_PATH to $CASPER_NODE_RPC_URL"
casper-client put-deploy \
  --node-address "$CASPER_NODE_RPC_URL" \
  --secret-key "$WORKDIR/secret_key.pem" \
  --chain-name casper-test \
  --payment-amount 200000000000 \
  --session-path "$WASM_PATH" \
  --session-arg "agent:public_key='$AGENT_PUBLIC_KEY_HEX'" \
  --session-arg "min_collateral_ratio_bps:u64='$MIN_RATIO_BPS'" \
  --session-arg "accuracy_tolerance_bps:u64='$ACCURACY_TOLERANCE_BPS'"

echo "==> Deploy submitted. Track it on https://testnet.cspr.live"
echo "==> Once confirmed, set AUTARCA_CONTRACT_HASH in agent/.env and frontend/.env.local"
