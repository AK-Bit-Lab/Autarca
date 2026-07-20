/**
 * Seed script: opens 4 realistic RWA-backed collateral positions on the
 * deployed AutarcaVault contract on Casper Testnet. Run after deploying the
 * contract so the dashboard + agent have positions to monitor.
 *
 * Usage: npx tsx src/seedPositions.ts
 */
import {
  CasperClient,
  CLValueBuilder,
  Contracts,
  Keys,
  RuntimeArgs,
} from "casper-js-sdk";
import { config } from "./config.js";
import { activityLog } from "./activityLog.js";

interface SeedPosition {
  rwaId: string;
  collateralValueUsdCents: number;
  debtValueUsdCents: number;
  description: string;
}

const SEED_POSITIONS: SeedPosition[] = [
  {
    rwaId: "rwa-real-estate-001",
    collateralValueUsdCents: 210_000, // $2,100.00
    debtValueUsdCents: 100_000, // $1,000.00  → 210% ratio (Healthy)
    description: "Tokenized commercial real estate - Istanbul office unit",
  },
  {
    rwaId: "rwa-tbill-2026-q3",
    collateralValueUsdCents: 118_000, // $1,180.00
    debtValueUsdCents: 100_000, // $1,000.00  → 118% ratio (Liquidatable)
    description: "US Treasury Bill maturing Q3 2026",
  },
  {
    rwaId: "rwa-invoice-acme-0042",
    collateralValueUsdCents: 155_000, // $1,550.00
    debtValueUsdCents: 100_000, // $1,000.00  → 155% ratio (Healthy, near Warning)
    description: "Outstanding invoice - Acme Corp, net-30",
  },
  {
    rwaId: "rwa-carbon-credit-2026",
    collateralValueUsdCents: 140_000, // $1,400.00
    debtValueUsdCents: 100_000, // $1,000.00  → 140% ratio (Warning)
    description: "Verified carbon credit token (Verra VCS)",
  },
];

function loadKeys(): Keys.AsymmetricKey {
  try {
    return Keys.Secp256K1.loadKeyPairFromPrivateFile(config.agent.privateKeyPath);
  } catch {
    const fs = require("node:fs") as typeof import("node:fs");
    const pem = fs.readFileSync(config.agent.privateKeyPath, "utf-8");
    const body = pem
      .replace(/-----BEGIN[^-]+-----/, "")
      .replace(/-----END[^-]+-----/, "")
      .replace(/\s+/g, "");
    const buf = Buffer.from(body, "base64");
    return Keys.Ed25519.parseKeyPair(
      Keys.Ed25519.privateToPublicKey(buf),
      buf
    );
  }
}

async function main() {
  if (!config.casper.contractHash) {
    console.error("Set AUTARCA_CONTRACT_HASH in agent/.env before seeding.");
    process.exit(1);
  }

  const keys = loadKeys();
  const contractClient = new Contracts.Contract();
  contractClient.setContractHash(config.casper.contractHash);

  const casperClient = new CasperClient(config.casper.nodeRpcUrl);

  for (const p of SEED_POSITIONS) {
    console.log(`==> Opening position: ${p.rwaId} (${p.description})`);
    const args = RuntimeArgs.fromMap({
      rwa_id: CLValueBuilder.string(p.rwaId),
      collateral_value_usd_cents: CLValueBuilder.u64(p.collateralValueUsdCents.toString()),
      debt_value_usd_cents: CLValueBuilder.u64(p.debtValueUsdCents.toString()),
    });

    const deploy = contractClient.callEntrypoint(
      "open_position",
      args,
      keys.publicKey,
      config.casper.networkName,
      "3000000000",
      [keys]
    );

    const hash = await casperClient.putDeploy(deploy);
    console.log(`    Submitted deploy: ${hash}`);
    activityLog.push({
      timestamp: new Date().toISOString(),
      agent: "ChainStateAgent",
      message: `Seeded position ${p.rwaId} (${p.description}). Deploy: ${hash}`,
    });
  }

  console.log("==> All seed positions submitted. Wait for finalization on Testnet.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
