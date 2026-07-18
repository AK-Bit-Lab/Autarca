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
  csprCloud: {
    apiUrl: required(
      "CSPR_CLOUD_API_URL",
      "https://api.testnet.cspr.cloud"
    ),
    apiKey: process.env.CSPR_CLOUD_API_KEY ?? "",
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
    // Works with OpenAI, or any OpenAI-compatible provider (e.g. Groq,
    // OpenRouter, local Ollama) by overriding LLM_BASE_URL + LLM_MODEL.
    apiKey: required("LLM_API_KEY", process.env.OPENAI_API_KEY),
    baseUrl: process.env.LLM_BASE_URL || undefined,
    model: required("LLM_MODEL", process.env.OPENAI_MODEL || "llama-3.3-70b-versatile"),
  },
};
