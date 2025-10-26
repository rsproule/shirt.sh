import Printify from "printify-sdk-js";
import { withRetry, RETRY_PRESETS } from "@/lib/utils/retry";

const PRINTIFY_API_KEY = process.env.PRINTIFY_API_KEY || process.env.PRINTIFY_ORDER_API_KEY;
const PRINTIFY_SHOP_ID = process.env.PRINTIFY_SHOP_ID || process.env.PRINTIFY_ORDER_SHOP_ID;

// Initialize Printify SDK
const getPrintifyClient = () => {
  if (!PRINTIFY_API_KEY || !PRINTIFY_SHOP_ID) {
    throw new Error(
      "PRINTIFY_API_KEY (or PRINTIFY_ORDER_API_KEY) and PRINTIFY_SHOP_ID (or PRINTIFY_ORDER_SHOP_ID) must be set",
    );
  }

  return new Printify({
    accessToken: PRINTIFY_API_KEY,
    shopId: PRINTIFY_SHOP_ID,
    enableLogging: false,
  });
};

// Default configuration for t-shirt products
const DEFAULT_BLUEPRINT_ID = 706; // Comfort Colors t-shirt
const DEFAULT_PRINT_PROVIDER_ID = 99;

// Comfort Colors variant IDs
const COMFORT_COLORS_VARIANTS = [
  78994, 73199, 78993, 78962, 78991, 78964, 78961, 78963, 73203, 78992, 73211, 73207, 78965, 73215,
  78995,
];

/**
 * Upload image to Printify
 * @param imageUrl - Base64 data URL or remote URL
 * @returns Printify image upload ID
 */
export async function uploadImageToPrintify(imageUrl: string): Promise<string> {
  return withRetry(
    async () => {
      const printify = getPrintifyClient();

      const uploadPayload = imageUrl.startsWith("data:")
        ? {
            file_name: `shirt-design-${Date.now()}.png`,
            contents: imageUrl.split(",")[1], // base64 data
          }
        : {
            file_name: `shirt-design-${Date.now()}.png`,
            url: imageUrl, // regular URL
          };

      const result = await printify.uploads.uploadImage(uploadPayload);

      if (!result || !result.id) {
        throw new Error("Invalid response from Printify upload API");
      }

      return result.id;
    },
    RETRY_PRESETS.PRINTIFY_OPERATION,
    "Printify image upload"
  );
}

/**
 * Upload image and return both ID and preview URL
 */
export async function uploadImageAndGetUrl(imageUrl: string): Promise<{
  id: string;
  previewUrl: string;
}> {
  return withRetry(
    async () => {
      const printify = getPrintifyClient();

      const uploadPayload = imageUrl.startsWith("data:")
        ? {
            file_name: `shirt-design-${Date.now()}.png`,
            contents: imageUrl.split(",")[1], // base64 data
          }
        : {
            file_name: `shirt-design-${Date.now()}.png`,
            url: imageUrl, // regular URL
          };

      const result = await printify.uploads.uploadImage(uploadPayload);

      if (!result || !result.id) {
        throw new Error("Invalid response from Printify upload API");
      }

      const previewUrl = result.preview_url || `https://images-api.printify.com/${result.id}`;

      return {
        id: result.id,
        previewUrl,
      };
    },
    RETRY_PRESETS.PRINTIFY_OPERATION,
    "Printify image upload with URL"
  );
}

/**
 * Create a product in Printify with the generated image
 */
export async function createPrintifyProduct(params: {
  imageUrl: string;
  title: string;
  description: string;
  placement?: "front" | "back";
}): Promise<PrintifyProduct> {
  // Step 1: Upload image to Printify (already has retry logic)
  console.log("[Printify] Uploading image...");
  const uploadedImageId = await uploadImageToPrintify(params.imageUrl);
  console.log("[Printify] Image uploaded successfully:", uploadedImageId);

  // Step 2: Create product with uploaded image (with retry)
  const product = await withRetry(
    async () => {
      const printify = getPrintifyClient();

      const productPayload = {
        title: params.title,
        description: params.description || "",
        blueprint_id: DEFAULT_BLUEPRINT_ID,
        print_provider_id: DEFAULT_PRINT_PROVIDER_ID,
        variants: COMFORT_COLORS_VARIANTS.map((id) => ({
          id,
          price: 2500, // $25.00 in cents
          is_enabled: true,
        })),
        print_areas: [
          {
            variant_ids: COMFORT_COLORS_VARIANTS,
            placeholders: [
              {
                position: params.placement === "back" ? "back" : "front",
                images: [
                  {
                    id: uploadedImageId,
                    x: 0.5,
                    y: 0.4,
                    scale: 0.5,
                    angle: 0,
                  },
                ],
              },
            ],
          },
        ],
      };

      console.log("[Printify] Creating product...");
      const result = await printify.products.create(productPayload);

      if (!result || !result.id) {
        throw new Error("Invalid response from Printify product creation API");
      }

      console.log("[Printify] Product created successfully:", result.id);
      return result as PrintifyProduct;
    },
    RETRY_PRESETS.PRINTIFY_OPERATION,
    "Printify product creation"
  );

  // Step 3: Publish the product (with retry)
  console.log("[Printify] Publishing product...");
  await publishPrintifyProduct(product.id);
  console.log("[Printify] Product published successfully");

  return product;
}

/**
 * Publish a product to make it available
 */
export async function publishPrintifyProduct(productId: string): Promise<void> {
  return withRetry(
    async () => {
      const printify = getPrintifyClient();

      await printify.products.publishOne(productId, {
        title: true,
        description: true,
        images: true,
        variants: true,
        tags: true,
        keyFeatures: true,
        shipping_template: true,
      });
    },
    RETRY_PRESETS.PRINTIFY_OPERATION,
    "Printify product publishing"
  );
}

/**
 * Get product details from Printify
 */
export async function getPrintifyProduct(productId: string): Promise<PrintifyProduct> {
  return withRetry(
    async () => {
      const printify = getPrintifyClient();
      const product = await printify.products.getOne(productId);

      if (!product || !product.id) {
        throw new Error("Invalid response from Printify get product API");
      }

      return product as PrintifyProduct;
    },
    RETRY_PRESETS.PRINTIFY_OPERATION,
    "Printify get product"
  );
}

// Printify API Types
export interface PrintifyProduct {
  id: string;
  title: string;
  description: string;
  blueprint_id: number;
  print_provider_id: number;
  variants: PrintifyVariant[];
  images: PrintifyImage[];
}

export interface PrintifyVariant {
  id: number;
  sku: string;
  price: number;
  is_enabled: boolean;
}

export interface PrintifyImage {
  src: string;
  variant_ids: number[];
  position: string;
}
