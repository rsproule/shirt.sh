import { AddressTo } from "@/lib/contracts/shirt";
import { createDirectPrintifyOrder } from "@/lib/services/printify-order";
import { settlePayment, verifyPayment } from "@/lib/x402-payment";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Schema for image-based shirt creation
export const CreateShirtFromImageBody = z.object({
  imageUrl: z
    .string()
    .min(1, "Image URL is required")
    .describe("HTTP/HTTPS URL or base64 data URL (data:image/...)"),
  size: z.enum(["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]).default("XL"),
  color: z.enum(["Black", "White"]).default("White"),
  address_to: AddressTo,
});

type TCreateShirtFromImage = z.infer<typeof CreateShirtFromImageBody>;

// Business validation
function validateAddressBusinessRules(addr: { country: string; zip: string }) {
  if (addr.country === "US" && !/^\d{5}(-\d{4})?$/.test(addr.zip)) {
    return {
      ok: false as const,
      code: "INVALID_ADDRESS",
      message: "Invalid US ZIP format",
    };
  }
  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  try {
    // STEP 1: Verify payment WITHOUT settling (no charge yet)
    const paymentResult = await verifyPayment(req, {
      price: "$20.00",
      network: "base",
      description: "Custom shirt from your image",
      resource: `${req.nextUrl.protocol}//${req.nextUrl.host}/api/shirts/from-image`,
    });

    if (!paymentResult.success) {
      return paymentResult.response;
    }

    const { payment, requirements } = paymentResult;

    // STEP 2: Validate and process the request
    const body = await req.json();

    // Validate with Zod
    const validation = CreateShirtFromImageBody.safeParse(body);
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

    // Business checks
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

    // STEP 3: Create product and order with provided image (skip AI generation)
    // Product is created first, then order is placed (handled internally by createDirectPrintifyOrder)
    const order = await createDirectPrintifyOrder({
      imageUrl: validatedBody.imageUrl,
      size: validatedBody.size,
      color: validatedBody.color,
      quantity: 1,
      addressTo: validatedBody.address_to,
    });

    // STEP 4: Only settle payment now that shirt creation succeeded
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
        orderId: order.id,
        productId: order.productId,
      },
      { status: 200 },
    );
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
