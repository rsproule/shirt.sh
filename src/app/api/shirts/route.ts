import { CreateShirtBody } from "@/lib/contracts/shirt";
import { executeCreateShirtWorkflow } from "@/lib/tasks/create-shirt-workflow";
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

    // Execute the complete workflow synchronously
    // (image generation + product creation + order submission)
    const result = await executeCreateShirtWorkflow(validatedBody, jobId, {
      variantId: undefined, // Will be determined by size/color
    });

    // Return the complete result
    if (result.success) {
      return NextResponse.json(
        {
          id: jobId,
          status: "completed" as const,
          imageUrl: result.imageUrl,
          productId: result.productId,
          orderId: result.orderId,
          trackingInfo: result.trackingInfo,
        },
        { status: 200 },
      );
    } else {
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
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to queue job" },
      },
      { status: 500 },
    );
  }
}
