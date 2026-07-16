import axios from "axios";
import { config } from "./config.js";
import { activityLog } from "./activityLog.js";

/**
 * Minimal client for Casper's x402 HTTP micropayment protocol.
 *
 * Flow (per the x402 spec): the agent calls a paid endpoint; the server
 * responds 402 Payment Required with payment details; the agent signs a
 * micropayment via the x402 facilitator and retries the request with an
 * `X-PAYMENT` header containing cryptographic proof of payment.
 */
export class X402Client {
  async payAndFetch<T>(url: string): Promise<T> {
    try {
      const first = await axios.get(url, { validateStatus: () => true });

      if (first.status !== 402) {
        return first.data as T;
      }

      const paymentRequirements = first.data;
      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "ValuationAgent",
        message: `Received 402 Payment Required for ${url}, requesting payment via x402 facilitator`,
        meta: { paymentRequirements },
      });

      const proof = await this.settlePayment(paymentRequirements);

      const second = await axios.get(url, {
        headers: { "X-PAYMENT": proof },
      });

      activityLog.push({
        timestamp: new Date().toISOString(),
        agent: "ValuationAgent",
        message: `x402 payment settled, retrieved paid data from ${url}`,
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
  }

  private async settlePayment(paymentRequirements: unknown): Promise<string> {
    // Delegates to the x402 facilitator to construct + submit a signed
    // micropayment proof scoped to the requested resource.
    const response = await axios.post(`${config.x402.facilitatorUrl}/settle`, {
      wallet: config.x402.walletAddress,
      requirements: paymentRequirements,
    });
    return response.data.paymentProof as string;
  }
}

export const x402Client = new X402Client();
