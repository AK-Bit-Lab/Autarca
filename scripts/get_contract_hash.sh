#!/usr/bin/env bash
#
# Given a deploy hash from deploy_testnet.sh, polls the Casper Testnet node
# until the deploy is executed and prints the resulting contract hash.
#
# Usage: ./scripts/get_contract_hash.sh <deploy-hash>

set -euo pipefail

DEPLOY_HASH="${1:?Usage: $0 <deploy-hash>}"
NODE_URL="${CASPER_NODE_RPC_URL:-https://node.testnet.casper.network/rpc}"

echo "==> Polling deploy $DEPLOY_HASH on $NODE_URL"

for i in $(seq 1 30); do
  RESULT=$(casper-client get-deploy --node-address "$NODE_URL" "$DEPLOY_HASH" 2>/dev/null || true)
  if echo "$RESULT" | grep -q '"Success"'; then
    echo "$RESULT" | grep -o '"contract_hash":"[^"]*"' || \
      echo "Deploy succeeded. Inspect full output below to find the named key with the contract hash:"
    echo "$RESULT"
    exit 0
  fi
  echo "  ...not yet finalized, retrying ($i/30)"
  sleep 5
done

echo "Timed out waiting for deploy to finalize."
exit 1
