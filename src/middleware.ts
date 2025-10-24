import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware for x402 payment-protected routes
 *
 * NOTE: This middleware is now DISABLED because we handle payment verification
 * and settlement manually in the route handlers. This ensures users are ONLY
 * charged AFTER successful shirt creation, preventing charges on failures.
 *
 * Payment flow:
 * 1. Route handler verifies payment (checks signature, no charge)
 * 2. Route handler creates shirt
 * 3. Route handler settles payment ONLY if creation succeeds
 *
 * See: src/lib/x402-payment.ts for payment handling
 * See: src/app/api/shirts/route.ts and from-image/route.ts for usage
 */
export async function middleware(request: NextRequest) {
  // Pass through all requests - payment handling is done in route handlers
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/shirts/:path*"],
  runtime: "nodejs",
};
