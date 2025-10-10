import { NextRequest } from "next/server";

/**
 * Verify x402 payment for a custom amount
 * This is used when we need dynamic pricing that the middleware can't handle
 */
export async function verifyX402Payment(
  req: NextRequest,
  expectedAmountInCents: number,
): Promise<{ valid: boolean; error?: string }> {
  // Get payment token from headers
  const paymentToken = req.headers.get("X-Payment-Token") || req.headers.get("x-payment-token");

  if (!paymentToken) {
    return {
      valid: false,
      error: "Missing payment token. Please include X-Payment-Token header.",
    };
  }

  try {
    // Call x402 facilitator to verify payment
    const facilitatorUrl = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";

    const response = await fetch(`${facilitatorUrl}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: paymentToken,
        expectedAmount: (expectedAmountInCents / 100).toFixed(2), // Convert to dollars
        network: "base",
      }),
    });

    if (!response.ok) {
      return {
        valid: false,
        error: `Payment verification failed: ${response.statusText}`,
      };
    }

    const result = await response.json();

    if (!result.valid) {
      return {
        valid: false,
        error: result.error || "Payment verification failed",
      };
    }

    return { valid: true };
  } catch (error) {
    console.error("[Payment Verification] Error:", error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Payment verification error",
    };
  }
}

/**
 * Create a payment-required response with pricing information
 */
export function createPaymentRequiredResponse(priceInCents: number, metadata?: any) {
  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        code: "PAYMENT_REQUIRED",
        message: "Payment required to access this resource",
        price: `$${(priceInCents / 100).toFixed(2)}`,
        priceInCents,
        metadata,
      },
    }),
    {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "X-Required-Payment": `$${(priceInCents / 100).toFixed(2)}`,
        "X-Payment-Network": "base",
      },
    },
  );
}



