import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    console.warn(`[config] Warning: env var ${name} is not set.`);
    return "";
  }
  return value;
}

export const config = {
  casper: {
    nodeRpcUrl: required("CASPER_NODE_RPC_URL", "https://node.testnet.casper.network/rpc"),
    networkName: required("CASPER_NETWORK_NAME", "casper-test"),
    contractHash: required("AUTARCA_CONTRACT_HASH"),
  },
  agent: {
    privateKeyPath: required("AGENT_PRIVATE_KEY_PATH", "./keys/agent_secret_key.pem"),
    publicKeyHex: required("AGENT_PUBLIC_KEY_HEX"),
    pollIntervalMs: Number(process.env.AGENT_POLL_INTERVAL_MS ?? 60_000),
  },
  mcp: {
    serverUrl: required("MCP_SERVER_URL", "http://localhost:4000"),
  },
  x402: {
    facilitatorUrl: required("X402_FACILITATOR_URL", "https://x402.casper.network"),
    walletAddress: required("X402_WALLET_ADDRESS"),
  },
  rwa: {
    dataProviderUrl: required(
      "RWA_DATA_PROVIDER_URL",
      "https://api.example-rwa-data.com/v1/valuation"
    ),
  },
  llm: {
    apiKey: required("OPENAI_API_KEY"),
    model: required("OPENAI_MODEL", "gpt-4.1-mini"),
  },
};
