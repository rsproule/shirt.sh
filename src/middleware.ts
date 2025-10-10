import { facilitator } from "@coinbase/x402";
import { paymentMiddleware } from "x402-next";
import { z } from "zod";
import { CreateShirtFromImageBody } from "./app/api/shirts/from-image/route";
import { CreateProductBody } from "./app/api/shirts/products/route";
import { CreateShirtBody, ShirtJob } from "./lib/contracts/shirt";
import { inputSchemaToX402 } from "./lib/x402-schema";

export const middleware = paymentMiddleware(
  "0xc0541B06F703c6753B842D83cF62d55F93EE81bE",
  {
    "/api/shirts": {
      price: "$25.00",
      network: "base",
      config: {
        description: "AI-generated shirt design + purchase",
        discoverable: true,
        inputSchema: inputSchemaToX402(CreateShirtBody),
        outputSchema: z.toJSONSchema(ShirtJob),
      },
    },
    "/api/shirts/from-image": {
      price: "$25.00",
      network: "base",
      config: {
        description: "Custom shirt from your image",
        discoverable: true,
        inputSchema: inputSchemaToX402(CreateShirtFromImageBody),
        outputSchema: z.toJSONSchema(ShirtJob),
      },
    },
    "/api/shirts/products": {
      price: "$0.01",
      network: "base",
      config: {
        description: "Create a shirt product with custom margin (no order)",
        discoverable: true,
        inputSchema: inputSchemaToX402(CreateProductBody),
        outputSchema: z.toJSONSchema(
          z.object({
            id: z.string().uuid(),
            productId: z.string(),
            imageUrl: z.string().url(),
            title: z.string(),
            description: z.string(),
            priceInCents: z.number(),
            marginInCents: z.number(),
          }),
        ),
      },
    },
    // Note: /api/shirts/products/[productId]/order handles its own payment verification
    // because it needs dynamic pricing based on the product's margin
  },
  facilitator,
);

export const config = {
  matcher: [
    "/api/shirts",
    "/api/shirts/from-image",
    "/api/shirts/products",
    // Exclude the order endpoint - it handles payment separately
    // "/api/shirts/products/*/order"
  ],
  runtime: "nodejs", // Required for @coinbase/x402 until Edge support is added
};
