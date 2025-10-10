import { AddressTo } from "@/lib/contracts/shirt";
import { transferMarginToCreator } from "@/lib/payments/split-payment";
import {
  createPaymentRequiredResponse,
  verifyX402Payment,
} from "@/lib/payments/verify-x402-payment";
import { createPrintifyOrder } from "@/lib/services/printify-order";
import { extractProductMetadata, getPrintifyProduct } from "@/lib/services/printify-product";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Schema for ordering an existing product
export const OrderProductBody = z.object({
  size: z.enum(["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]).default("XL"),
  color: z.enum(["Black", "White"]).default("White"),
  quantity: z.number().int().min(1).max(100).default(1),
  address_to: AddressTo,
});

type TOrderProduct = z.infer<typeof OrderProductBody>;

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

/**
 * GET endpoint to retrieve pricing information for a product
 * This allows clients to know the price before making payment
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  try {
    const { productId } = await params;

    // Fetch the product
    const product = await getPrintifyProduct(productId);

    if (!product) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Product ${productId} not found`,
          },
        },
        { status: 404 },
      );
    }

    // Extract metadata
    const metadata = extractProductMetadata(product);

    if (!metadata) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INVALID_PRODUCT",
            message: "Product metadata not found or invalid",
          },
        },
        { status: 500 },
      );
    }

    const BASE_ORDER_PRICE = 2000; // $20.00 base cost
    const totalPriceInCents = BASE_ORDER_PRICE + metadata.margin;

    return NextResponse.json(
      {
        productId,
        title: product.title,
        pricing: {
          totalInCents: totalPriceInCents,
          totalFormatted: `$${(totalPriceInCents / 100).toFixed(2)}`,
          basePriceInCents: BASE_ORDER_PRICE,
          marginInCents: metadata.margin,
          creatorAddress: metadata.creatorAddress,
        },
        variants: product.variants
          .filter((v) => v.is_enabled)
          .map((v) => ({
            id: v.id,
            sku: v.sku,
            price: v.price,
          })),
      },
      { status: 200 },
    );
  } catch (e: any) {
    console.error("[Get Product Pricing] Error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: e instanceof Error ? e.message : "Failed to get product pricing",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  try {
    const { productId } = await params;
    const body = await req.json();

    // Validate with Zod
    const validation = OrderProductBody.safeParse(body);
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

    // Fetch the product to get variant information
    const product = await getPrintifyProduct(productId);

    if (!product) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Product ${productId} not found`,
          },
        },
        { status: 404 },
      );
    }

    // Extract margin and pricing metadata
    const metadata = extractProductMetadata(product);

    if (!metadata) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INVALID_PRODUCT",
            message: "Product metadata not found or invalid",
          },
        },
        { status: 500 },
      );
    }

    // Calculate dynamic price: base price + margin
    const BASE_ORDER_PRICE = 2000; // $20.00 base cost for ordering
    const totalPriceInCents = BASE_ORDER_PRICE + metadata.margin;

    // Verify payment for the full amount (base + margin)
    const paymentVerification = await verifyX402Payment(req, totalPriceInCents);

    if (!paymentVerification.valid) {
      // Payment required - return 402 with pricing info
      return createPaymentRequiredResponse(totalPriceInCents, {
        productId,
        basePriceInCents: BASE_ORDER_PRICE,
        marginInCents: metadata.margin,
        creatorAddress: metadata.creatorAddress,
      });
    }

    // Find the variant that matches the requested size and color
    // Note: This is a simplified approach - in production you'd want to match
    // variants more precisely using the variant options from Printify
    const variant = product.variants.find((v) => v.is_enabled);

    if (!variant) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VARIANT_NOT_FOUND",
            message: `No enabled variant found for size ${validatedBody.size} and color ${validatedBody.color}`,
          },
        },
        { status: 404 },
      );
    }

    const jobId = randomUUID();

    // Create order
    const order = await createPrintifyOrder({
      productId,
      variantId: variant.id,
      quantity: validatedBody.quantity,
      addressTo: validatedBody.address_to,
    });

    // Handle split payment: transfer margin to creator
    let splitPaymentTx: string | null = null;
    if (metadata.creatorAddress && metadata.margin > 0) {
      try {
        const result = await transferMarginToCreator({
          creatorAddress: metadata.creatorAddress,
          marginInCents: metadata.margin,
        });
        splitPaymentTx = result.txHash;
        console.log(
          `[Split Payment] Transferred $${metadata.margin / 100} to ${metadata.creatorAddress}. Tx: ${splitPaymentTx}`,
        );
      } catch (error) {
        console.error("[Split Payment] Failed to transfer margin:", error);
        // Don't fail the order, but log the error
        // You might want to queue this for retry
      }
    }

    return NextResponse.json(
      {
        id: jobId,
        status: "completed" as const,
        productId,
        orderId: order.id,
        variantId: variant.id,
        pricing: {
          totalPaid: totalPriceInCents,
          basePrice: BASE_ORDER_PRICE,
          margin: metadata.margin,
          creatorAddress: metadata.creatorAddress,
          splitPaymentTx,
        },
        trackingInfo: order.shipment
          ? {
              carrier: order.shipment.carrier,
              trackingNumber: order.shipment.tracking_number,
              trackingUrl: order.shipment.tracking_url,
            }
          : null,
      },
      { status: 200 },
    );
  } catch (e: any) {
    console.error("[Order Product] Error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: e instanceof Error ? e.message : "Failed to create order",
        },
      },
      { status: 500 },
    );
  }
}
