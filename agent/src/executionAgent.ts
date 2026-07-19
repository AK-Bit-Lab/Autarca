import fs from "node:fs";
import {
  CasperClient,
  CLValueBuilder,
  Contracts,
  Keys,
  RuntimeArgs,
} from "casper-js-sdk";
import { config } from "./config.js";
import { activityLog } from "./activityLog.js";
import type { AgentDecision } from "./types.js";

/**
 * Execution Agent: signs and submits Casper Testnet transactions using the
 * agent's own key (bound to CSPR.click's Agent Skill in production, using
 * casper-js-sdk directly here for a transparent, auditable reference
 * implementation of what CSPR.click does under the hood).
 *
 * This implementation BROADCASTS the signed deploy to the Casper node via
 * `CasperClient.putDeploy` and then polls `getDeploy` until the deploy is
 * finalized, returning the real on-chain deploy hash + block hash.
 */
export class ExecutionAgent {
  private contractClient = new Contracts.Contract();

  private loadKeys(): Keys.AsymmetricKey {
    const pem = fs.readFileSync(config.agent.privateKeyPath, "utf-8");
    // Prefer Ed25519 (most Casper test keys). If parsing fails, fall back to Secp256K1.
    try {
      const body = pem
        .replace(/-----BEGIN[^-]+-----/, "")
        .replace(/-----END[^-]+-----/, "")
        .replace(/\s+/g, "");
      const buf = Buffer.from(body, "base64");
      return Keys.Ed25519.parseKeyPair(
        Keys.Ed25519.privateToPublicKey(buf),
        buf
      );
    } catch {
      // Fallback to Secp256K1 if Ed25519 parsing fails.
      return Keys.Secp256K1.loadKeyPairFromPrivateFile(
        config.agent.privateKeyPath
      );
    }
  }

  /**
   * Submits a signed deploy to the node and waits for finalization.
   * Returns the on-chain deploy hash (hex) or null on failure.
   */
  async execute(decision: AgentDecision): Promise<string | null> {
    if (decision.action === "NOOP") {
      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "ExecutionAgent",
        message: `No on-chain action required for position #${decision.positionId}.`,
      });
      return null;
    }

    if (!config.casper.contractHash) {
      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "ExecutionAgent",
        message: `Cannot execute: AUTARCA_CONTRACT_HASH is not set. Deploy the contract first.`,
      });
      return null;
    }

    try {
      const keys = this.loadKeys();
      this.contractClient.setContractHash(config.casper.contractHash);

      const entryPoint =
        decision.action === "LIQUIDATE" ? "agent_liquidate" : "agent_update_valuation";

      const args =
        decision.action === "LIQUIDATE"
          ? RuntimeArgs.fromMap({
              position_id: CLValueBuilder.u64(decision.positionId),
            })
          : RuntimeArgs.fromMap({
              position_id: CLValueBuilder.u64(decision.positionId),
              new_collateral_value_usd_cents: CLValueBuilder.u64(
                decision.newCollateralValueUsdCents ?? 0
              ),
              valuation_source: CLValueBuilder.string(
                decision.valuationSource ?? "autarca-agent"
              ),
            });

      // Build the signed deploy.
      const deploy = this.contractClient.callEntrypoint(
        entryPoint,
        args,
        keys.publicKey,
        config.casper.networkName,
        "3000000000", // payment amount in motes
        [keys]
      );

      // Actually broadcast to the node via JSON-RPC.
      const casperClient = new CasperClient(config.casper.nodeRpcUrl);
      const putDeployHash = await casperClient.putDeploy(deploy);

      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "ExecutionAgent",
        message: `Broadcast "${entryPoint}" for position #${decision.positionId} to ${config.casper.nodeRpcUrl}. Deploy hash: ${putDeployHash}`,
        meta: { entryPoint, deployHash: putDeployHash },
      });

      // Wait for finalization so the dashboard can show a confirmed tx.
      const finalized = await this.waitForDeploy(casperClient, putDeployHash);
      if (finalized) {
        activityLog.push({
          timestamp: new Date().toISOString(),
          agent: "ExecutionAgent",
          message: `Deploy ${putDeployHash} finalized in block ${finalized.blockHash}.`,
          meta: { deployHash: putDeployHash, blockHash: finalized.blockHash },
        });
      }

      return putDeployHash;
    } catch (err) {
      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "ExecutionAgent",
        message: `Failed to execute "${decision.action}" for position #${decision.positionId}: ${
          (err as Error).message
        }`,
      });
      return null;
    }
  }

  /**
   * Polls the node until the deploy is finalized or the timeout expires.
   * Casper deploys are finalized after enough block confirmations.
   */
  private async waitForDeploy(
    casperClient: CasperClient,
    deployHash: string,
    timeoutMs = 120_000
  ): Promise<{ blockHash: string } | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const [, result] = await casperClient.getDeploy(deployHash);
        if (result?.execution_results?.length) {
          const blockHash = result.execution_results[0]?.block_hash ?? "";
          if (blockHash) return { blockHash };
        }
      } catch {
        // deploy not yet known / not finalized — keep polling
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
    return null;
  }
}

export const executionAgent = new ExecutionAgent();
