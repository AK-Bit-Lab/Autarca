import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";

export const runtime = "nodejs";

const RPC_URL =
  process.env.CASPER_NODE_RPC_URL ?? "https://node.testnet.casper.network/rpc";
const NETWORK_NAME = process.env.CASPER_NETWORK_NAME ?? "casper-test";
const CONTRACT_HASH = process.env.NEXT_PUBLIC_AUTARCA_CONTRACT_HASH ?? "";
const DEPLOYER_KEY_PATH =
  process.env.AGENT_PRIVATE_KEY_PATH ?? "./keys/agent_secret_key.pem";

/**
 * Raw JSON-RPC helper — avoids the `casper-js-sdk` typing surface (which
 * differs across versions) and keeps the frontend deploy path identical
 * to the agent's execution layer.
 */
async function rpcCall(method: string, params: Record<string, unknown>) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message ?? "RPC error");
  }
  return json.result;
}

/**
 * POST /api/open-position
 * Body: { rwaId, collateralValueUsdCents, debtValueUsdCents }
 *
 * Submits an `open_position` deploy to the AutarcaVault contract on Casper
 * Testnet using the agent's key (demo convenience so judges can seed a
 * position live from the dashboard without a browser wallet). In production
 * this would be signed by the user's Casper Wallet via CSPR.click.
 *
 * NOTE: This endpoint expects the agent's signing service (see
 * `agent/src/executionAgent.ts`) to be reachable for signing. If the
 * signing service is unavailable, the endpoint returns the unsigned deploy
 * JSON so the caller can sign it client-side.
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
    const collateral: number = Number(body.collateralValueUsdCents);
    const debt: number = Number(body.debtValueUsdCents);

    if (!rwaId || !Number.isFinite(collateral) || !Number.isFinite(debt)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Read the agent's public key (account hex) from the PEM file header if
    // present, otherwise fall back to the env-provided public key.
    let publicKeyHex = process.env.AGENT_PUBLIC_KEY_HEX ?? "";
    try {
      const pem = fs.readFileSync(DEPLOYER_KEY_PATH, "utf-8");
      const m = pem.match(/public key: ([0-9a-fA-F]{66})/);
      if (m) publicKeyHex = m[1];
    } catch {
      /* key file optional in demo mode */
    }

    if (!publicKeyHex) {
      return NextResponse.json(
        {
          error:
            "No agent public key configured (set AGENT_PUBLIC_KEY_HEX or provide a PEM with a public key header).",
        },
        { status: 500 }
      );
    }

    // Build the session args as CLValue JSON for `account_put_deploy`.
    // Casper JSON-RPC accepts CLValue objects of the form:
    //   { "cl_type": "U64", "bytes": "<little-endian hex>" }
    const u64ToBytes = (n: number): string => {
      const buf = Buffer.alloc(8);
      buf.writeBigUInt64LE(BigInt(n));
      return buf.toString("hex");
    };
    const stringToBytes = (s: string): string =>
      Buffer.from(s, "utf-8").toString("hex");

    const args = {
      rwa_id: { cl_type: "String", bytes: stringToBytes(rwaId) },
      collateral_value_usd_cents: {
        cl_type: "U64",
        bytes: u64ToBytes(collateral),
      },
      debt_value_usd_cents: { cl_type: "U64", bytes: u64ToBytes(debt) },
    };

    // Standard payment + ttl for a contract call.
    const deploy = {
      session: {
        StoredContract: {
          hash: CONTRACT_HASH,
          entry_point: "open_position",
          args,
        },
      },
      payment: {
        ModuleBytes: {
          module_bytes: "",
          args: {
            amount: { cl_type: "U64", bytes: u64ToBytes(3_000_000_000) },
          },
        },
      },
      initiator: {
        publicKey: publicKeyHex,
      },
      ttl: "30min",
      chainName: NETWORK_NAME,
    };

    // Try to sign via the agent signing service; if unavailable, return the
    // unsigned deploy so the caller can sign it client-side.
    const SIGNING_URL =
      process.env.AGENT_SIGNING_URL ?? "http://localhost:3001/sign";

    let signedDeploy = deploy as Record<string, unknown>;
    try {
      const signRes = await fetch(SIGNING_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deploy }),
      });
      if (signRes.ok) {
        signedDeploy = (await signRes.json()) as Record<string, unknown>;
      }
    } catch {
      /* signing service optional — fall through with unsigned deploy */
    }

    // If we have approvals, broadcast via `account_put_deploy`.
    const hasApprovals =
      Array.isArray((signedDeploy as any).approvals) &&
      (signedDeploy as any).approvals.length > 0;

    if (!hasApprovals) {
      return NextResponse.json(
        {
          unsignedDeploy: signedDeploy,
          message:
            "No signing service available. Sign the deploy client-side and submit via /api/submit-deploy.",
        },
        { status: 202 }
      );
    }

    const result = await rpcCall("account_put_deploy", {
      deploy: signedDeploy,
    });

    return NextResponse.json({ deployHash: result.deploy_hash });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
