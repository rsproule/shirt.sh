import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { experimental_generateImage as generateImage, generateText } from "ai";
import { withRetry, RETRY_PRESETS } from "@/lib/utils/retry";

/**
 * Generate a catchy product title using an LLM
 * @param prompt - The original design prompt
 * @returns A concise, creative title for the shirt
 */
export async function generateShirtTitle(prompt: string): Promise<string> {
  return withRetry(
    async () => {
      const openai = createOpenAI({
        apiKey: process.env.ECHO_API_KEY!,
        baseURL: "https://echo.router.merit.systems",
      });
      const result = await generateText({
        model: openai("gpt-5"),
        prompt: `Generate a short, catchy product title (max 50 characters) for a t-shirt with this design: "${prompt}". Return only the title, nothing else.`,
      });

      return result.text.trim();
    },
    RETRY_PRESETS.API_CALL,
    "Title generation"
  ).catch((error) => {
    console.error("[Title Generation] All retry attempts failed:", error);

    // Fallback to simple title generation
    const words = prompt.split(" ").slice(0, 4);
    const fallbackTitle = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    console.log("[Title Generation] Using fallback title:", fallbackTitle);
    return fallbackTitle;
  });
}

/**
 * Generate shirt design image using Google Gemini
 * @param prompt - The design prompt from the user
 * @returns Base64 encoded image data URL
 * @throws Error if image generation fails
 */
async function generateImageWithGoogle(prompt: string): Promise<string> {
  return withRetry(
    async () => {
      const google = createGoogleGenerativeAI({
        apiKey: process.env.ECHO_API_KEY!,
        baseURL: "https://echo.router.merit.systems",
      });
      const result = await generateText({
        model: google("gemini-2.5-flash-image-preview"),
        prompt,
      });

      const imageFile = result.files?.find((file) => file.mediaType?.startsWith("image/"));

      if (!imageFile || !imageFile.base64) {
        throw new Error("No image data returned from Google Gemini");
      }

      return `data:${imageFile.mediaType};base64,${imageFile.base64}`;
    },
    RETRY_PRESETS.IMAGE_GENERATION,
    "Google image generation"
  );
}

/**
 * Generate shirt design image using OpenAI
 * @param prompt - The design prompt from the user
 * @returns Base64 encoded image data URL
 * @throws Error if image generation fails
 */
async function generateImageWithOpenAI(prompt: string): Promise<string> {
  return withRetry(
    async () => {
      const openai = createOpenAI({
        apiKey: process.env.ECHO_API_KEY!,
        baseURL: "https://echo.router.merit.systems",
      });
      const result = await generateImage({
        model: openai.image("gpt-image-1"),
        prompt,
      });

      const imageData = result.image;

      if (!imageData || !imageData.base64) {
        throw new Error("No image data returned from OpenAI");
      }

      return `data:${imageData.mediaType};base64,${imageData.base64}`;
    },
    RETRY_PRESETS.IMAGE_GENERATION,
    "OpenAI image generation"
  );
}

/**
 * Generate shirt design image using AI (defaults to Google)
 * @param prompt - The design prompt from the user
 * @param provider - Which AI provider to use ('google' or 'openai')
 * @returns URL of the generated image
 */
export async function generateShirtImage(
  prompt: string,
  provider: "google" | "openai" = "google",
): Promise<string> {
  try {
    if (provider === "openai") {
      return await generateImageWithOpenAI(prompt);
    } else {
      return await generateImageWithGoogle(prompt);
    }
  } catch (error) {
    console.error(`[Image Generation] ${provider} failed after retries, using fallback:`, error);

    const fallbackImageUrl = `https://via.placeholder.com/1024x1024.png?text=${encodeURIComponent(
      prompt.slice(0, 50),
    )}`;
    console.log("[Image Generation] Using fallback image:", fallbackImageUrl);
    return fallbackImageUrl;
  }
}

/**
 * Generate both image and title for a shirt design
 * @param prompt - The design prompt from the user
 * @param provider - Which AI provider to use for image generation ('google' or 'openai')
 * @returns Image URL and generated title
 */
export async function generateShirtDesign(
  prompt: string,
  provider: "google" | "openai" = "google",
): Promise<{
  imageUrl: string;
  title: string;
}> {
  try {
    // Generate both in parallel for better performance
    const [imageUrl, title] = await Promise.all([
      generateShirtImage(prompt, provider),
      generateShirtTitle(prompt),
    ]);

    return { imageUrl, title };
  } catch (error) {
    console.error("[Design Generation] Error:", error);
    throw new Error(
      `Complete design generation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Configuration for image generation
 */
export interface ImageGenerationConfig {
  model?: string;
  size?: "1024x1024" | "1792x1024" | "1024x1792";
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
}

export const DEFAULT_IMAGE_CONFIG: ImageGenerationConfig = {
  model: "gpt-image-1",
  size: "1024x1024",
  quality: "hd",
  style: "vivid",
};
