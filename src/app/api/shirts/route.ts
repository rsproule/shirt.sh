import { CreateShirtBody } from "@/lib/contracts/shirt";
import { executeCreateShirtWorkflow } from "@/lib/tasks/create-shirt-workflow";
import { settlePayment, verifyPayment } from "@/lib/x402-payment";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

// Business validators that go beyond Zod
function validateAddressBusinessRules(addr: { country: string; zip: string }) {
  // Add country-specific ZIP heuristics as needed; keep minimal for now.
  if (addr.country === "US" && !/^\d{5}(-\d{4})?$/.test(addr.zip)) {
    return {
      ok: false as const,
      code: "INVALID_ADDRESS",
      message: "Invalid US ZIP format",
    };
  }
  return { ok: true as const };
}

// Example: idempotency (optional but recommended)
function idempotencyKey(req: NextRequest) {
  return req.headers.get("Idempotency-Key") ?? null;
}

export async function POST(req: NextRequest) {
  try {
    // STEP 1: Verify payment WITHOUT settling (no charge yet)
    const paymentResult = await verifyPayment(req, {
      price: "$20.00",
      network: "base",
      description: "AI-generated shirt design + purchase",
      resource: `${req.nextUrl.protocol}//${req.nextUrl.host}/api/shirts`,
    });

    if (!paymentResult.success) {
      return paymentResult.response;
    }

    const { payment, requirements } = paymentResult;

    // STEP 2: Validate and process the request
    const body = await req.json();

    // Validate with Zod
    const validation = CreateShirtBody.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "BAD_REQUEST",
            message: "Invalid request body",
            details: validation.error.issues,
          },
        },
        { status: 400 },
      );
    }

    const validatedBody = validation.data;

    // Business checks in addition to Zod
    const biz = validateAddressBusinessRules({
      country: validatedBody.address_to.country,
      zip: validatedBody.address_to.zip,
    });
    if (!biz.ok) {
      return NextResponse.json(
        { ok: false, error: { code: biz.code, message: biz.message } },
        { status: 422 },
      );
    }

    // Generate job ID
    const jobId = randomUUID();

    // STEP 3: Execute the complete workflow synchronously
    // (image generation + product creation + order submission)
    const result = await executeCreateShirtWorkflow(validatedBody, jobId, {
      variantId: undefined, // Will be determined by size/color
    });

    // STEP 4: Only settle payment if the workflow succeeded
    if (result.success) {
      // Settle the payment now that shirt creation succeeded
      const settlement = await settlePayment(payment, requirements);

      if (!settlement.success) {
        console.error("Settlement failed after successful shirt creation:", settlement.error);
        // Shirt was created but payment settlement failed - log for manual review
        // In production, you might want to handle this differently
      }

      return NextResponse.json(
        {
          id: jobId,
          status: "completed" as const,
          productId: result.productId,
          orderId: result.orderId,
          trackingInfo: result.trackingInfo,
        },
        { status: 200 },
      );
    } else {
      // Workflow failed - DO NOT settle payment, user is not charged
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "WORKFLOW_FAILED",
            message: result.error || "Shirt creation workflow failed",
          },
        },
        { status: 500 },
      );
    }
  } catch (e: any) {
    // Exception occurred - DO NOT settle payment, user is not charged
    console.error("Error in shirt creation:", e);
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to create shirt" },
      },
      { status: 500 },
    );
  }
}
