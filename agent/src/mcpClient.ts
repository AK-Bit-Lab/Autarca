import axios from "axios";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "./config.js";
import { activityLog } from "./activityLog.js";
import { withRetry } from "./resilience.js";
import type { OnChainPosition } from "./types.js";

const HTTP_TIMEOUT_MS = 15_000;

/**
 * Spec-compliant client for the Casper MCP Server.
 *
 * Speaks the Model Context Protocol over HTTP: performs the `initialize`
 * handshake, discovers available tools via `tools/list`, and invokes
 * `tools/call` for reading AutarcaVault contract state. Falls back to a
 * direct CSPR.cloud REST query if the MCP server is unreachable so the
 * pipeline still runs end-to-end during local development.
 *
 * See https://www.casper.network/ai for the official Casper MCP server.
 */
export class McpClient {
  private client: Client | null = null;
  private initialized = false;
  private toolNames: Set<string> = new Set();

  private async ensureConnected(): Promise<Client | null> {
    if (this.initialized && this.client) return this.client;

    try {
      const transport = new StreamableHTTPClientTransport(
        new URL(config.mcp.serverUrl)
      );
      const client = new Client(
        { name: "autarca-agent", version: "0.1.0" },
        { capabilities: {} }
      );
      await client.connect(transport);

      const toolsList = await client.listTools();
      this.toolNames = new Set(toolsList.tools.map((t: { name: string }) => t.name));

      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "ChainStateAgent",
        message: `Connected to Casper MCP Server at ${config.mcp.serverUrl}; discovered ${this.toolNames.size} tools.`,
      });

      this.client = client;
      this.initialized = true;
      return client;
    } catch (err) {
      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "ChainStateAgent",
        message: `MCP server unavailable (${(err as Error).message}); falling back to CSPR.cloud REST for contract reads.`,
      });
      this.initialized = true; // don't retry every call
      return null;
    }
  }

  private async callTool<T>(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<T> {
    const client = await this.ensureConnected();
    if (!client || !this.toolNames.has(toolName)) {
      throw new Error(`MCP tool "${toolName}" not available`);
    }
    const result = await client.callTool({ name: toolName, arguments: args });
    return result.content as unknown as T;
  }

  async getPosition(positionId: number): Promise<OnChainPosition> {
    const raw = await this.callTool<any>("casper.query_contract_dictionary", {
      contractHash: config.casper.contractHash,
      entryPoint: "get_position",
      args: { position_id: positionId },
    }).catch(() => this.fallbackGetPosition(positionId));

    const position: OnChainPosition = {
      id: positionId,
      owner: raw.owner,
      rwaId: raw.rwa_id,
      collateralValueUsdCents: Number(raw.collateral_value_usd_cents),
      debtValueUsdCents: Number(raw.debt_value_usd_cents),
      lastValuationTimestamp: Number(raw.last_valuation_timestamp),
      status: raw.status,
      agentUpdates: Number(raw.agent_updates),
    };

    activityLog.push({
      timestamp: new Date().toISOString(),
      agent: "ChainStateAgent",
      message: `Fetched position #${positionId} via Casper MCP Server (status: ${position.status})`,
    });

    return position;
  }

  async getPositionCount(): Promise<number> {
    const raw = await this.callTool<any>(
      "casper.query_contract_dictionary",
      {
        contractHash: config.casper.contractHash,
        entryPoint: "get_position_count",
        args: {},
      }
    ).catch(() => this.fallbackGetPositionCount());
    return Number(raw);
  }

  /** CSPR.cloud REST fallback used when the MCP server is not running. */
  private async fallbackGetPosition(positionId: number): Promise<any> {
    const base = config.csprCloud.apiUrl;
    const url = `${base}/contracts/${config.casper.contractHash}/state`;
    const res = await withRetry(
      () =>
        axios.get(url, {
          headers: config.csprCloud.apiKey
            ? { Authorization: `Bearer ${config.csprCloud.apiKey}` }
            : {},
          timeout: HTTP_TIMEOUT_MS,
        }),
      { retries: 2, baseDelayMs: 600 }
    );
    const positions = res.data?.data ?? [];
    const found = positions.find((p: any) => Number(p.id) === positionId);
    if (!found) throw new Error(`Position #${positionId} not found`);
    return found;
  }

  private async fallbackGetPositionCount(): Promise<number> {
    const base = config.csprCloud.apiUrl;
    const url = `${base}/contracts/${config.casper.contractHash}/state`;
    const res = await withRetry(
      () =>
        axios.get(url, {
          headers: config.csprCloud.apiKey
            ? { Authorization: `Bearer ${config.csprCloud.apiKey}` }
            : {},
          timeout: HTTP_TIMEOUT_MS,
        }),
      { retries: 2, baseDelayMs: 600 }
    );
    return Number(res.data?.data?.length ?? 0);
  }
}

export const mcpClient = new McpClient();
