import { env } from "../config.js";
import { newId, newToken } from "./crypto.js";
import { fail } from "./errors.js";

export interface CreatePaymentInput {
  orderId: string;
  amountXaf: number;
  email: string;
  userId: string;
  appName: string;
  redirectUrl: string;
  /** 105 : libellé affiché chez Fapshi. Absent : `<app> — abonnement` (commandes, inchangé). */
  message?: string;
}

export interface CreatePaymentResult {
  providerRef: string;
  paymentUrl: string;
}

export type ProviderPaymentStatus = "pending" | "paid" | "failed";

export interface PayoutInput {
  amountXaf: number;
  phone: string;
  name: string;
  externalId: string;
  message: string;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  fetchStatus(providerRef: string): Promise<ProviderPaymentStatus>;
  payout(input: PayoutInput): Promise<{ providerRef: string }>;
}

/**
 * Local provider: creates a hosted page served by this API so the whole flow is
 * testable offline. Never enabled in production.
 */
class MockProvider implements PaymentProvider {
  readonly name = "mock";

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerRef = `mock_${newId()}`;
    return { providerRef, paymentUrl: `${env.publicBaseUrl}/pay/mock/${providerRef}` };
  }

  async fetchStatus(providerRef: string): Promise<ProviderPaymentStatus> {
    const { getMockPaymentStatus } = await import("../services/mockPayments.js");
    return getMockPaymentStatus(providerRef);
  }

  async payout(input: PayoutInput): Promise<{ providerRef: string }> {
    return { providerRef: `mockpayout_${newToken(8)}_${input.externalId}` };
  }
}

/**
 * Fapshi adapter.
 *
 * IMPORTANT: field names and the webhook envelope must be checked against the
 * live Fapshi documentation before switching PAYMENT_PROVIDER=fapshi. To reduce
 * that risk the webhook handler always re-fetches the transaction status from
 * the API instead of trusting the body (FAPSHI_VERIFY_WITH_API=true).
 */
class FapshiProvider implements PaymentProvider {
  readonly name = "fapshi";

  private headers(payout = false): Record<string, string> {
    return {
      apiuser: payout ? env.fapshi.payoutUser : env.fapshi.apiUser,
      apikey: payout ? env.fapshi.payoutKey : env.fapshi.apiKey,
      "content-type": "application/json",
    };
  }

  private async call(path: string, init: RequestInit, payout = false): Promise<Record<string, unknown>> {
    const res = await fetch(`${env.fapshi.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(payout), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      console.error("[fapshi] error", res.status, body);
      throw fail.paymentProvider();
    }
    return body;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const body = await this.call("/initiate-pay", {
      method: "POST",
      body: JSON.stringify({
        amount: input.amountXaf,
        email: input.email,
        userId: input.userId,
        externalId: input.orderId,
        redirectUrl: input.redirectUrl,
        message: input.message ?? `${input.appName} — abonnement`,
      }),
    });
    const link = body.link ?? body.paymentUrl;
    const transId = body.transId ?? body.transactionId;
    if (typeof link !== "string" || typeof transId !== "string") {
      console.error("[fapshi] unexpected initiate-pay response", body);
      throw fail.paymentProvider();
    }
    return { providerRef: transId, paymentUrl: link };
  }

  async fetchStatus(providerRef: string): Promise<ProviderPaymentStatus> {
    const body = await this.call(`/payment-status/${encodeURIComponent(providerRef)}`, { method: "GET" });
    const status = String(body.status ?? body.paymentStatus ?? "").toUpperCase();
    if (["SUCCESSFUL", "SUCCESS", "PAID", "COMPLETED"].includes(status)) return "paid";
    if (["FAILED", "CANCELLED", "CANCELED", "EXPIRED", "REJECTED"].includes(status)) return "failed";
    return "pending";
  }

  async payout(input: PayoutInput): Promise<{ providerRef: string }> {
    const body = await this.call(
      "/payout",
      {
        method: "POST",
        body: JSON.stringify({
          amount: input.amountXaf,
          phone: input.phone,
          name: input.name,
          externalId: input.externalId,
          message: input.message,
        }),
      },
      true,
    );
    const ref = body.transId ?? body.payoutId ?? body.reference;
    if (typeof ref !== "string") {
      console.error("[fapshi] unexpected payout response", body);
      throw fail.paymentProvider("Le versement n'a pas été accepté.");
    }
    return { providerRef: ref };
  }
}

export const payments: PaymentProvider = env.paymentProvider === "fapshi" ? new FapshiProvider() : new MockProvider();
