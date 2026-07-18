import { config } from "./config.js";
import { activityLog } from "./activityLog.js";
import { mcpClient } from "./mcpClient.js";
import { fetchOffChainValuation } from "./valuationAgent.js";
import { decide } from "./decisionAgent.js";
import { executionAgent } from "./executionAgent.js";

const ACTIVITY_LOG_WS_PORT = 4100;

async function runPipelineOnce() {
  const positionCount = await mcpClient.getPositionCount().catch(() => 0);

  if (positionCount === 0) {
    activityLog.push({
      timestamp: new Date().toISOString(),
      agent: "ChainStateAgent",
      message: "No positions found yet. Waiting for the first open_position() call.",
    });
    return;
  }

  for (let positionId = 0; positionId < positionCount; positionId++) {
    try {
      const position = await mcpClient.getPosition(positionId);
      if (position.status === "Liquidated") continue;

      const valuation = await fetchOffChainValuation(position.rwaId);
      const decision = await decide(position, valuation);
      // Attach the valuation source so the Execution Agent records it on-chain
      // for oracle reputation scoring.
      decision.valuationSource = valuation.source;
      await executionAgent.execute(decision);
    } catch (err) {
      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "ChainStateAgent",
        message: `Pipeline error for position #${positionId}: ${(err as Error).message}`,
      });
    }
  }
}

async function main() {
  activityLog.listen(ACTIVITY_LOG_WS_PORT);

  activityLog.push({
    timestamp: new Date().toISOString(),
    agent: "ChainStateAgent",
    message: `Autarca agent starting. Contract: ${config.casper.contractHash || "(not set)"}, network: ${config.casper.networkName}`,
  });

  // Run immediately, then on an interval.
  await runPipelineOnce();
  setInterval(runPipelineOnce, config.agent.pollIntervalMs);
}

main().catch((err) => {
  console.error("Fatal error in Autarca agent:", err);
  process.exit(1);
});
