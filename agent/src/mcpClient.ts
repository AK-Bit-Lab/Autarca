import axios from "axios";
import { config } from "./config.js";
import { activityLog } from "./activityLog.js";
import type { OnChainPosition } from "./types.js";

/**
 * Client for the Casper MCP Server, which exposes Casper smart contract
 * state (and query tools) to the AI agent via the Model Context Protocol.
 *
 * This client wraps MCP "tools/call" invocations for the specific tools the
 * Casper MCP Server exposes for reading contract state
 * (see https://www.casper.network/ai for the official MCP server).
 */
export class McpClient {
  private async callTool<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
    const response = await axios.post(`${config.mcp.serverUrl}/tools/call`, {
      name: toolName,
      arguments: args,
    });
    return response.data.result as T;
  }

  async getPosition(positionId: number): Promise<OnChainPosition> {
    const raw = await this.callTool<any>("casper.query_contract_dictionary", {
      contractHash: config.casper.contractHash,
      entryPoint: "get_position",
      args: { position_id: positionId },
    });

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
    const raw = await this.callTool<any>("casper.query_contract_dictionary", {
      contractHash: config.casper.contractHash,
      entryPoint: "get_position_count",
      args: {},
    });
    return Number(raw);
  }
}

export const mcpClient = new McpClient();
