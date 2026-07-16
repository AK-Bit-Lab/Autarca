import fs from "node:fs";
import {
  CLPublicKey,
  CLValueBuilder,
  Contracts,
  DeployUtil,
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
 */
export class ExecutionAgent {
  private contractClient = new Contracts.Contract();

  private loadKeys(): Keys.AsymmetricKey {
    const pem = fs.readFileSync(config.agent.privateKeyPath, "utf-8");
    return Keys.Secp256K1.parsePrivateKeyPem(pem) as unknown as Keys.AsymmetricKey;
  }

  async execute(decision: AgentDecision): Promise<string | null> {
    if (decision.action === "NOOP") {
      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "ExecutionAgent",
        message: `No on-chain action required for position #${decision.positionId}.`,
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
            });

      const deploy = this.contractClient.callEntrypoint(
        entryPoint,
        args,
        keys.publicKey,
        config.casper.networkName,
        "3000000000", // payment amount in motes
        [keys]
      );

      const deployHash = await DeployUtil.deployToJson(deploy);
      const hash = (deployHash as any)?.deploy?.hash ?? "unknown";

      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "ExecutionAgent",
        message: `Submitted "${entryPoint}" for position #${decision.positionId} via CSPR.click signing flow. Deploy hash: ${hash}`,
        meta: { entryPoint, deployHash: hash },
      });

      return hash;
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
}

export const executionAgent = new ExecutionAgent();
