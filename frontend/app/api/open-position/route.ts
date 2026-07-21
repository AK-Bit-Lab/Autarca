import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import {
  CasperClient,
  Contracts,
  Keys,
  CLValueBuilder,
  RuntimeArgs,
} from "casper-js-sdk";

export const runtime = "nodejs";

const RPC_URL =
  process.env.CASPER_NODE_RPC_URL ?? "http://138.201.54.44:7777/rpc"; // Fallback to an active IP IP node over Testnet if node.testnet.casper.network is unresolvable
const NETWORK_NAME = process.env.CASPER_NETWORK_NAME ?? "casper-test";
const CONTRACT_HASH = process.env.NEXT_PUBLIC_AUTARCA_CONTRACT_HASH ?? "";
const DEPLOYER_KEY_PATH =
  process.env.AGENT_PRIVATE_KEY_PATH ?? "./keys/agent_secret_key.pem";

/**
 * Load the agent's signing key from the PEM file.
 * Mirrors the logic in `agent/src/executionAgent.ts`: prefer Ed25519,
 * fall back to Secp256K1 if Ed25519 parsing fails.
 */
function loadKeys(): Keys.AsymmetricKey {
  const pem = fs.readFileSync(DEPLOYER_KEY_PATH, "utf-8");
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
    return Keys.Secp256K1.loadKeyPairFromPrivateFile(DEPLOYER_KEY_PATH);
  }
}

/**
 * POST /api/open-position
 * Body: { rwaId, collateralValueUsdCents, debtValueUsdCents }
 *
 * Signs and submits an `open_position` deploy to the AutarcaVault contract
 * on Casper Testnet using the agent's key. This is the demo convenience
 * path so judges can seed a position live from the dashboard without a
 * browser wallet. In production this would be signed by the user's Casper
 * Wallet via CSPR.click.
 */
export async function POST(req: NextRequest) {
  if (!CONTRACT_HASH) {
    return NextResponse.json(
      {
        error:
          "Contract not deployed (NEXT_PUBLIC_AUTARCA_CONTRACT_HASH unset)",
      },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const rwaId: string = body.rwaId;
    // Accept string or number, convert directly to BigInt to avoid precision loss.
    const collateralBig: bigint =
      typeof body.collateralValueUsdCents === "bigint"
        ? body.collateralValueUsdCents
        : BigInt(body.collateralValueUsdCents);
    const debtBig: bigint =
      typeof body.debtValueUsdCents === "bigint"
        ? body.debtValueUsdCents
        : BigInt(body.debtValueUsdCents);

    if (!rwaId || collateralBig < BigInt(0) || debtBig < BigInt(0)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Load the agent's signing key.
    let keys: Keys.AsymmetricKey;
    try {
      keys = loadKeys();
    } catch {
      return NextResponse.json(
        {
          error:
            "No agent signing key configured (set AGENT_PRIVATE_KEY_PATH or AGENT_PUBLIC_KEY_HEX).",
        },
        { status: 500 }
      );
    }

    // Build the signed deploy using casper-js-sdk.
    // casper-js-sdk expects the contract hash with a "hash-" prefix.
    const contractHash = CONTRACT_HASH.startsWith("hash-")
      ? CONTRACT_HASH
      : `hash-${CONTRACT_HASH}`;
    const casperClient = new CasperClient(RPC_URL);
    const contractClient = new Contracts.Contract(casperClient);
    contractClient.setContractHash(contractHash);
    const args = RuntimeArgs.fromMap({
      rwa_id: CLValueBuilder.string(rwaId),
      collateral_value_usd_cents: CLValueBuilder.u64(collateralBig.toString()),
      debt_value_usd_cents: CLValueBuilder.u64(debtBig.toString()),
    });

    const deploy = contractClient.callEntrypoint(
      "open_position",
      args,
      keys.publicKey,
      NETWORK_NAME,
      "3000000000", // payment amount in motes
      [keys]
    );

    // Broadcast to the node.
    const deployHash = await casperClient.putDeploy(deploy);

    return NextResponse.json({
      deployHash,
      message: `Open position deploy submitted to ${NETWORK_NAME}.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
