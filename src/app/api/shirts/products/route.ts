import { generateShirtDesign } from "@/lib/services/image-generation";
import { createPrintifyProduct } from "@/lib/services/printify-product";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Schema for creating a product with custom margin
export const CreateProductBody = z
  .object({
    // Either provide a prompt (we generate the image) or an imageUrl (use directly)
    prompt: z.string().min(10, "Prompt too short").max(4000, "Prompt too long").optional(),
    imageUrl: z.string().url().optional(),
    title: z.string().min(1).max(200).optional(), // Optional custom title
    description: z.string().max(5000).optional(), // Optional custom description
    margin: z.number().min(0).max(10000).default(0), // Margin in cents (e.g., 500 = $5.00)
    creatorAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"), // Creator's payment address
    placement: z.enum(["front", "back"]).default("front"),
  })
  .refine((data) => data.prompt || data.imageUrl, {
    message: "Either 'prompt' or 'imageUrl' must be provided",
    path: ["prompt"],
  });

type TCreateProduct = z.infer<typeof CreateProductBody>;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate with Zod
    const validation = CreateProductBody.safeParse(body);
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
    const jobId = randomUUID();

    let imageUrl: string;
    let title: string;
    let description: string;

    // Generate or use provided image
    if (validatedBody.prompt) {
      // Generate image and title from prompt
      console.log("[Create Product] Generating image from prompt");
      const generated = await generateShirtDesign(validatedBody.prompt, "google");
      imageUrl = generated.imageUrl;
      title = validatedBody.title || generated.title;
      description = validatedBody.description || validatedBody.prompt;
      console.log("[Create Product] Image generated successfully");
    } else if (validatedBody.imageUrl) {
      // Use provided image URL
      console.log("[Create Product] Using provided image URL:", validatedBody.imageUrl);
      imageUrl = validatedBody.imageUrl;
      title = validatedBody.title || "Custom Shirt Design";
      description = validatedBody.description || "Custom shirt with uploaded image";
    } else {
      // This shouldn't happen due to Zod validation, but TypeScript needs it
      throw new Error("Either prompt or imageUrl must be provided");
    }

    // Calculate total price: base price + margin
    // Base price for Printify is around $15-20, we set it at $25 by default
    const basePriceInCents = 2500; // $25.00
    const totalPriceInCents = basePriceInCents + validatedBody.margin;

    // Encode margin and creator address in description for later retrieval
    const descriptionWithMetadata = JSON.stringify({
      description,
      margin: validatedBody.margin,
      basePrice: basePriceInCents,
      creatorAddress: validatedBody.creatorAddress,
    });

    // Create product with custom price
    const product = await createPrintifyProduct({
      imageUrl,
      title,
      description: descriptionWithMetadata,
      placement: validatedBody.placement,
      priceInCents: totalPriceInCents,
    });

    return NextResponse.json(
      {
        id: jobId,
        productId: product.id,
        imageUrl,
        title,
        description,
        priceInCents: totalPriceInCents,
        marginInCents: validatedBody.margin,
        variants: product.variants,
      },
      { status: 200 },
    );
  } catch (e: any) {
    console.error("[Create Product] Error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: e instanceof Error ? e.message : "Failed to create product",
        },
      },
      { status: 500 },
    );
  }
}
