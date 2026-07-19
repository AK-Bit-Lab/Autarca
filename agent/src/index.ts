import { config } from "./config.js";
import { activityLog } from "./activityLog.js";
import { agentMemory } from "./agentMemory.js";
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

      // Score the previous decision for this position against the freshly
      // observed on-chain state + new valuation. This is what feeds the
      // per-agent reputation and the "outcome" column on the timeline.
      const valuation = await fetchOffChainValuation(position.rwaId);
      agentMemory.scorePreviousDecision(position, valuation);

      const decision = await decide(position, valuation);
      // Attach the valuation source so the Execution Agent records it on-chain
      // for oracle reputation scoring.
      decision.valuationSource = valuation.source;

      // Record the decision into Agent Memory (for replay + reputation).
      const ratioBps =
        position.debtValueUsdCents === 0
          ? Infinity
          : (valuation.fairValueUsdCents * 10_000) / position.debtValueUsdCents;
      const record = agentMemory.recordDecision({
        positionId: position.id,
        rwaId: position.rwaId,
        timestamp: new Date().toISOString(),
        previousCollateralValueUsdCents: position.collateralValueUsdCents,
        newCollateralValueUsdCents:
          decision.newCollateralValueUsdCents ?? position.collateralValueUsdCents,
        debtValueUsdCents: position.debtValueUsdCents,
        collateralRatioBps: Number.isFinite(ratioBps) ? Math.round(ratioBps) : 0,
        valuationSource: valuation.source,
        valuationConfidence: valuation.confidence,
        action: decision.action,
        decisionConfidence: decision.confidence ?? 0,
        reasoning: decision.reasoning,
        alternativesConsidered: decision.alternativesConsidered ?? [],
        decidedBy: decision.decidedBy ?? "RuleEngine",
        riskApproved: decision.action !== "LIQUIDATE",
        riskReasoning: decision.reasoning,
        finalized: false,
      });

      // Broadcast a structured "decision" event so the dashboard timeline
      // can render the full reasoning chain in real time.
      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "DecisionAgent",
        message: `Decision recorded for position #${position.id}: ${decision.action} (confidence ${((decision.confidence ?? 0) * 100).toFixed(0)}%).`,
        meta: { decisionRecord: record },
      });

      const deployHash = await executionAgent.execute(decision);
      if (deployHash) {
        agentMemory.attachOutcome(position.id, {
          deployHash,
          finalized: true,
        });
      }
    } catch (err) {
      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "ChainStateAgent",
        message: `Pipeline error for position #${positionId}: ${(err as Error).message}`,
      });
    }
  }

  // Broadcast the latest agent reputations so the dashboard can render them.
  const reps = agentMemory.reputationsList();
  if (reps.length) {
    activityLog.push({
      timestamp: new Date().toISOString(),
      agent: "ChainStateAgent",
      message: `Agent reputations updated: ${reps
        .map((r) => `${r.agent}=${(r.accuracyBps / 100).toFixed(1)}%`)
        .join(", ")}.`,
      meta: { agentReputations: reps },
    });
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
