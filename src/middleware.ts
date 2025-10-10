import { facilitator } from "@coinbase/x402";
import { paymentMiddleware } from "x402-next";
import { z } from "zod";
import { CreateShirtFromImageBody } from "./app/api/shirts/from-image/route";
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
  },
  facilitator,
);

export const config = {
  matcher: ["/api/shirts/:path*"],
  runtime: "nodejs", // Required for @coinbase/x402 until Edge support is added
};
