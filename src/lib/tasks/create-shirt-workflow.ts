import type { TCreateShirt } from "@/lib/contracts/shirt";
import { generateShirtDesign } from "@/lib/services/image-generation";
import { createDirectPrintifyOrder } from "@/lib/services/printify-order";
import { withRetry, RETRY_PRESETS } from "@/lib/utils/retry";

/**
 * Complete workflow for creating a shirt
 * 1. Generate image and title from prompt using LLM
 * 2. Create product in Printify and publish it
 * 3. Create order using the product
 */
export async function executeCreateShirtWorkflow(
  input: TCreateShirt,
  jobId: string,
  options: {
    imageProvider?: "google" | "openai";
    variantId?: number;
  } = {},
): Promise<ShirtWorkflowResult> {
  const { imageProvider = "google", variantId } = options;

  return withRetry(
    async () => {
      // Step 1: Generate image and title (already has retry logic)
      const { imageUrl, title } = await generateShirtDesign(input.prompt, imageProvider);

      // Step 2: Create product and order (already has retry logic)
      const order = await createDirectPrintifyOrder({
        imageUrl,
        size: input.size,
        color: input.color,
        variantId,
        quantity: 1,
        addressTo: input.address_to,
      });

      return {
        success: true,
        jobId,
        imageUrl,
        productId: order.productId,
        orderId: order.id,
        trackingInfo: null,
      };
    },
    RETRY_PRESETS.WORKFLOW,
    `Shirt creation workflow for job ${jobId}`
  ).catch((error) => {
    console.error(`[Workflow] All retry attempts failed for job ${jobId}:`, error);

    return {
      success: false,
      jobId,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  });
}

/**
 * Queue the workflow for background processing
 * In production, this would use a queue system like BullMQ, Inngest, etc.
 */
export async function queueCreateShirtWorkflow(input: TCreateShirt, jobId: string): Promise<void> {
  // TODO: Implement with proper queue system
  // Example with BullMQ:
  // await shirtQueue.add('create-shirt', { input, jobId }, {
  //   attempts: 3,
  //   backoff: { type: 'exponential', delay: 2000 },
  // });

  // For now, execute immediately in the background
  // In production, you'd want a proper queue worker
  console.log(`📋 Queuing workflow for job ${jobId}`);

  // Execute asynchronously (fire and forget for now)
  executeCreateShirtWorkflow(input, jobId)
    .then((result) => {
      // TODO: Update job status in database
      console.log("Workflow result:", result);
    })
    .catch((error) => {
      console.error("Workflow error:", error);
    });
}

// Workflow result types
export interface ShirtWorkflowResult {
  success: boolean;
  jobId: string;
  imageUrl?: string;
  productId?: string;
  orderId?: string;
  trackingInfo?: {
    carrier: string;
    trackingNumber: string;
    trackingUrl: string;
  } | null;
  error?: string;
}

/**
 * Get workflow status (for future status endpoint)
 */
export async function getWorkflowStatus(jobId: string): Promise<WorkflowStatus> {
  // TODO: Implement status retrieval from database/queue
  return {
    jobId,
    status: "processing",
    steps: [
      { name: "generate_image", status: "completed", completedAt: new Date() },
      { name: "create_product", status: "processing", completedAt: null },
      { name: "create_order", status: "pending", completedAt: null },
    ],
  };
}

export interface WorkflowStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  steps: WorkflowStep[];
  result?: ShirtWorkflowResult;
}

export interface WorkflowStep {
  name: string;
  status: "pending" | "processing" | "completed" | "failed";
  completedAt: Date | null;
  error?: string;
}
