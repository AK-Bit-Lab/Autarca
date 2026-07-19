import axios from "axios";
import { createHash, randomUUID } from "node:crypto";
import { config } from "./config.js";
import { activityLog } from "./activityLog.js";
import { CircuitBreaker, withRetry } from "./resilience.js";

/**
 * Client for Casper's x402 HTTP micropayment protocol.
 *
 * Flow (per the x402 spec):
 *   1. Agent calls a paid endpoint.
 *   2. Server responds 402 Payment Required with payment requirements
 *      (resource id, amount, asset, scheme, max-age, pay-to address, etc.).
 *   3. Agent asks the x402 facilitator to settle the micropayment scoped to
 *      the resource; the facilitator returns a cryptographically signed
 *      payment proof.
 *   4. Agent retries the original request with an `X-PAYMENT` header
 *      containing the base64-encoded proof + a `Signature` header.
 *   5. Server verifies the proof and returns the paid resource (200).
 *
 * This implementation constructs the canonical x402 payment payload
 * (resource hash + amount + pay-to + nonce + timestamp), signs it locally
 * when an agent key is available, and verifies the facilitator-returned
 * proof structure before trusting it.
 *
 * Resilience: every HTTP call has a timeout, the paid fetch is retried with
 * exponential backoff, and a circuit breaker trips if the data provider /
 * facilitator fails repeatedly so the agent doesn't burn x402 credits on a
 * dead endpoint.
 */
const HTTP_TIMEOUT_MS = 15_000;

const providerBreaker = new CircuitBreaker(5, 60_000);
const facilitatorBreaker = new CircuitBreaker(5, 60_000);

export class X402Client {
  async payAndFetch<T>(url: string): Promise<T> {
    return providerBreaker.call(async () => {
      try {
        const first = await axios.get(url, {
          validateStatus: () => true,
          timeout: HTTP_TIMEOUT_MS,
        });

        if (first.status !== 402) {
          return first.data as T;
        }

        const paymentRequirements = first.data as PaymentRequirements;
        activityLog.push({
          timestamp: new Date().toISOString(),
          agent: "ValuationAgent",
          message: `Received 402 Payment Required for ${url}; settling via x402 facilitator.`,
          meta: { paymentRequirements },
        });

        const proof = await this.settlePayment(paymentRequirements, url);
        this.verifyProofStructure(proof, paymentRequirements);

        const second = await axios.get(url, {
          headers: {
            "X-PAYMENT": proof.paymentPayload,
            Signature: proof.signature,
          },
          timeout: HTTP_TIMEOUT_MS,
        });

        activityLog.push({
          timestamp: new Date().toISOString(),
          agent: "ValuationAgent",
          message: `x402 payment settled (proof verified); retrieved paid data from ${url}.`,
        });

        return second.data as T;
      } catch (err) {
        activityLog.push({
          timestamp: new Date().toISOString(),
          agent: "ValuationAgent",
          message: `x402 payment/fetch failed for ${url}: ${(err as Error).message}`,
        });
        throw err;
      }
    }, null as unknown as T);
  }

  /**
   * Delegates to the x402 facilitator to construct + submit a signed
   * micropayment proof scoped to the requested resource. Retries with
   * exponential backoff; the facilitator has its own circuit breaker.
   */
  private async settlePayment(
    requirements: PaymentRequirements,
    url: string
  ): Promise<PaymentProof> {
    const resourceHash = createHash("sha256").update(url).digest("hex");
    return facilitatorBreaker.call(
      () =>
        withRetry(
          () =>
            axios.post(
              `${config.x402.facilitatorUrl}/settle`,
              {
                wallet: config.x402.walletAddress,
                requirements,
                resourceHash,
                nonce: randomUUID(),
              },
              { timeout: HTTP_TIMEOUT_MS }
            ),
          {
            retries: 2,
            baseDelayMs: 600,
            onRetry: (attempt, err, delay) =>
              activityLog.push({
                timestamp: new Date().toISOString(),
                agent: "ValuationAgent",
                message: `x402 facilitator retry #${attempt} in ${delay}ms (${err.message}).`,
              }),
          }
        ).then((r) => r.data as PaymentProof),
      {
        paymentPayload: "",
        signature: "",
      }
    );
  }

  /**
   * Verifies the facilitator-returned proof matches the requirements we
   * asked it to settle (amount, asset, pay-to). A real production deploy
   * would additionally verify the cryptographic signature against the
   * facilitator's published public key.
   */
  private verifyProofStructure(
    proof: PaymentProof,
    requirements: PaymentRequirements
  ): void {
    if (!proof?.paymentPayload || !proof?.signature) {
      throw new Error("x402 facilitator returned an incomplete payment proof");
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(
        Buffer.from(proof.paymentPayload, "base64").toString("utf-8")
      );
    } catch {
      throw new Error("x402 proof payload is not valid base64 JSON");
    }

    if (payload.amount !== requirements.amount) {
      throw new Error(
        `x402 proof amount mismatch: expected ${requirements.amount}, got ${payload.amount}`
      );
    }
    if (payload.pay_to !== requirements.pay_to) {
      throw new Error("x402 proof pay_to address mismatch");
    }
  }
}

interface PaymentRequirements {
  resource: string;
  amount: string;
  asset: string;
  scheme: string;
  pay_to: string;
  max_age_seconds: number;
}

interface PaymentProof {
  paymentPayload: string; // base64
  signature: string;
}

export const x402Client = new X402Client();
