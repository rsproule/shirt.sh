import type { TAddressTo } from "@/lib/contracts/shirt";
import { toPrintifyAddress } from "@/lib/providers/printify";
import { randomUUID } from "crypto";
import Printify from "printify-sdk-js";
import { withRetry, RETRY_PRESETS } from "@/lib/utils/retry";

const PRINTIFY_ORDER_API_KEY = process.env.PRINTIFY_ORDER_API_KEY;
const PRINTIFY_ORDER_SHOP_ID = process.env.PRINTIFY_ORDER_SHOP_ID;

// Comfort Colors configuration
const CC_BLUEPRINT_ID = 706;
const CC_PRINT_PROVIDER_ID = 99;

// Comfort Colors variant mapping (variant_id -> size + color)
const CC_VARIANT_MAP: Record<number, { size: string; color: string }> = {
  78994: { size: "S", color: "Black" },
  73199: { size: "M", color: "Black" },
  78993: { size: "L", color: "Black" },
  78962: { size: "XL", color: "Black" },
  78991: { size: "2XL", color: "Black" },
  78964: { size: "3XL", color: "Black" },
  78961: { size: "4XL", color: "Black" },
  78963: { size: "5XL", color: "Black" },
  73203: { size: "S", color: "White" },
  78992: { size: "M", color: "White" },
  73211: { size: "L", color: "White" },
  73207: { size: "XL", color: "White" },
  78965: { size: "2XL", color: "White" },
  73215: { size: "3XL", color: "White" },
  78995: { size: "4XL", color: "White" },
};

// Default variant (XL White)
const DEFAULT_CC_VARIANT_ID = 73207;
const DEFAULT_SIZE = "XL";
const DEFAULT_COLOR = "White";

/**
 * Get variant ID by size and color from Printify catalog
 */
export async function getVariantIdByOptions(params: {
  size: string;
  color: string;
}): Promise<number> {
  return withRetry(
    async () => {
      const printify = getPrintifyOrderClient();

      const blueprintVariants = await printify.catalog.getBlueprintVariants(
        CC_BLUEPRINT_ID.toString(),
        CC_PRINT_PROVIDER_ID.toString(),
      );

      if (!blueprintVariants || !blueprintVariants.variants) {
        throw new Error("Invalid response from Printify catalog API");
      }

      const variant = blueprintVariants.variants.find(
        (v) => v.options.size === params.size && v.options.color === params.color,
      );

      if (!variant) {
        throw new Error(`Variant not found for ${params.size} ${params.color}`);
      }

      return variant.id;
    },
    RETRY_PRESETS.PRINTIFY_OPERATION,
    "Printify variant lookup"
  );
}

// Initialize Printify SDK for order operations
const getPrintifyOrderClient = () => {
  if (!PRINTIFY_ORDER_API_KEY || !PRINTIFY_ORDER_SHOP_ID) {
    throw new Error("PRINTIFY_ORDER_API_KEY and PRINTIFY_ORDER_SHOP_ID must be set");
  }

  return new Printify({
    accessToken: PRINTIFY_ORDER_API_KEY,
    shopId: PRINTIFY_ORDER_SHOP_ID,
    enableLogging: false,
  });
};

/**
 * Create and submit an order to Printify production
 * Note: Printify's submit endpoint creates and submits the order in one call
 */
export async function createPrintifyOrder(params: {
  productId: string;
  variantId: number;
  quantity: number;
  addressTo: TAddressTo;
}): Promise<PrintifyOrder> {
  return withRetry(
    async () => {
      const printify = getPrintifyOrderClient();

      // Convert address to Printify format
      const printifyAddress = toPrintifyAddress(params.addressTo);

      const externalId = randomUUID();
      const orderPayload = {
        external_id: externalId,
        label: externalId.slice(0, 10),
        line_items: [
          {
            product_id: params.productId,
            variant_id: params.variantId,
            quantity: params.quantity,
          },
        ],
        shipping_method: 1,
        is_printify_express: false,
        is_economy_shipping: false,
        send_shipping_notification: true,
        address_to: printifyAddress,
      };

      const order = await printify.orders.submit(orderPayload);

      if (!order || !order.id) {
        throw new Error("Invalid response from Printify order submission API");
      }

      return order as PrintifyOrder;
    },
    RETRY_PRESETS.PRINTIFY_OPERATION,
    "Printify order creation"
  );
}

/**
 * Create and submit an order using two-step approach internally
 * Step 1: Create and publish product (with image upload)
 * Step 2: Create order using the product ID
 * This avoids timeouts by splitting the long-running product creation from order submission
 */
export async function createDirectPrintifyOrder(params: {
  imageUrl: string;
  variantId?: number;
  size?: string;
  color?: string;
  quantity: number;
  addressTo: TAddressTo;
}): Promise<PrintifyOrderWithProduct> {
  return withRetry(
    async () => {
      // Step 1: Create and publish product (already has retry logic)
      const { createPrintifyProduct } = await import("./printify-product");

      const product = await createPrintifyProduct({
        imageUrl: params.imageUrl,
        title: `Custom Shirt Design ${Date.now()}`,
        description: "Custom designed shirt",
        placement: "front",
      });

      // Step 2: Determine variant ID (with retry logic if needed)
      let variantId: number;
      if (params.variantId) {
        // Use provided variant ID
        variantId = params.variantId;
      } else if (params.size && params.color) {
        // Dynamically fetch variant ID by size and color (already has retry logic)
        variantId = await getVariantIdByOptions({
          size: params.size,
          color: params.color,
        });
      } else {
        // Use default
        variantId = DEFAULT_CC_VARIANT_ID;
      }

      // Step 3: Create order with the product (already has retry logic)
      const order = await createPrintifyOrder({
        productId: product.id,
        variantId: variantId,
        quantity: params.quantity,
        addressTo: params.addressTo,
      });

      // Return order with product ID included
      return {
        ...order,
        productId: product.id,
      };
    },
    RETRY_PRESETS.WORKFLOW,
    "Direct Printify order creation"
  );
}

/**
 * Get variant info from variant ID
 */
export function getVariantInfo(variantId: number) {
  return CC_VARIANT_MAP[variantId] || { size: "Unknown", color: "Unknown" };
}

// Printify Order Types
export interface PrintifyOrder {
  id: string;
  external_id: string;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  line_items: PrintifyLineItem[];
  address_to: any;
  shipment: PrintifyShipment;
  created_at: string;
}

export interface PrintifyOrderWithProduct extends PrintifyOrder {
  productId: string;
}

export interface PrintifyLineItem {
  product_id: string;
  variant_id: number;
  quantity: number;
  price: number;
}

export interface PrintifyShipment {
  carrier: string;
  tracking_number: string | null;
  tracking_url: string | null;
}
