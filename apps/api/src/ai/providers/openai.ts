import OpenAI from "openai";
import { env } from "process";
import type { VisionInput } from "../../agents/core/types";
import { getAIGatewayUrl } from "../utils/ai-gateway";

export const DEFAULT_OPENAI_MODEL = env.OPENAI_MODEL_NAME || "gpt-4o";

/**
 * Initialize OpenAI Client using Cloudflare AI Gateway
 */
export function createOpenAIClient(env: Env) {
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in environment variables");
  }

  return new OpenAI({
    apiKey: apiKey,
    baseURL: getAIGatewayUrl(env, { provider: "openai" }),
    defaultHeaders: {
      "cf-aig-authorization": `Bearer ${env.CLOUDFLARE_AI_GATEWAY_TOKEN}`,
    },
  });
}

export function getOpenAIModel(env: Env): string {
  return env.OPENAI_MODEL_NAME || DEFAULT_OPENAI_MODEL;
}

/**
 * Standard query to OpenAI
 */
export async function queryOpenAI(
  env: Env,
  prompt: string,
  systemPrompt?: string,
  modelName?: string,
): Promise<string> {
  const client = createOpenAIClient(env);
  const model = modelName || getOpenAIModel(env);

  try {
    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const completion = await client.chat.completions.create({
      model: model,
      messages: messages,
    });

    return completion.choices[0].message.content || "";
  } catch (error) {
    console.error("OpenAI Query Error:", error);
    throw error;
  }
}

/**
 * Generates text from an image using OpenAI.
 * NOTE: OpenAI currently requires Base64 or URL image input.
 */
export async function queryOpenAIVision(
  env: Env,
  image: VisionInput,
  prompt: string,
  modelName: string = "gpt-4o",
): Promise<string> {
  const client = createOpenAIClient(env);

  try {
    let imageUrlContent: string;

    if (image.type === "url") {
      imageUrlContent = image.data;
    } else {
      // Ensure data URI prefix exists
      imageUrlContent = image.data.startsWith("data:")
        ? image.data
        : `data:${image.mimeType || "image/jpeg"};base64,${image.data}`;
    }

    const completion = await client.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: imageUrlContent,
              },
            },
          ],
        },
      ],
    });

    return completion.choices[0].message.content || "";
  } catch (error) {
    console.error("OpenAI Vision Error:", error);
    throw error;
  }
}

/**
 * Structured query to OpenAI using JSON mode or functions
 */
export async function queryOpenAIStructured(
  env: Env,
  prompt: string,
  schema: any, // JSON Schema
  systemPrompt?: string,
  modelName?: string,
): Promise<any> {
  const client = createOpenAIClient(env);
  const model = modelName || getOpenAIModel(env);

  try {
    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const completion = await client.chat.completions.create({
      model: model,
      messages: messages,
      response_format: { type: "json_object" },
      // Note: For strict schema validation, we'd need 'json_schema' but that requires specific model versions.
      // For now, relying on 'json_object' and the prompt to adhere to schema.
    });

    const content = completion.choices[0].message.content || "{}";
    return JSON.parse(content);
  } catch (error) {
    console.error("OpenAI Structured Query Error:", error);
    throw error;
  }
}
