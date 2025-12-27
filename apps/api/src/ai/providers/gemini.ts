import { GoogleGenAI } from "@google/genai";
import type { VisionInput } from "../../agents/core/types";
import { getAIGatewayUrl } from "../utils";

// Extended Env to include Gemini secrets and optional model config
type GeminiEnv = Env;

// Default Configuration
export const DEFAULT_GEMINI_MODEL_FALLBACK = "gemini-2.5-pro";

/**
 * Initialize Gemini Client using Cloudflare AI Gateway
 *
 * Authentication flow:
 * - GEMINI_API_KEY: Used for authenticating with Google's Gemini API
 * - CLOUDFLARE_AI_GATEWAY_TOKEN: Used for Cloudflare API operations (not for Gemini auth)
 * - The AI Gateway proxies requests and adds caching/observability
 */
export function createGeminiClient(env: GeminiEnv) {
  const geminiApiKey = env.GEMINI_API_KEY;

  if (!geminiApiKey || !env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error(
      "Missing GEMINI_API_KEY or CLOUDFLARE_ACCOUNT_ID in environment variables",
    );
  }

  return new GoogleGenAI({
    apiKey: geminiApiKey,
    apiVersion: "v1beta",
    httpOptions: {
      // Proxies requests through Cloudflare AI Gateway for caching/monitoring
      baseUrl: getAIGatewayUrl(env, { provider: "google-ai-studio" }),
      headers: {
        "cf-aig-authorization": `Bearer ${env.CLOUDFLARE_AI_GATEWAY_TOKEN}`,
      },
    },
  });
}

/**
 * Helper to get the effective model
 */
export function getGeminiModel(env: GeminiEnv): string {
  return env.GEMINI_MODEL_NAME || DEFAULT_GEMINI_MODEL_FALLBACK;
}

/**
 * Standard query to Gemini
 * Mirrors: queryWorkerAI
 */
export async function queryGemini(
  env: GeminiEnv,
  prompt: string,
  systemPrompt?: string,
  modelName?: string,
): Promise<string> {
  const client = createGeminiClient(env);
  const model = modelName || getGeminiModel(env);

  try {
    const response = await client.models.generateContent({
      model: model,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    return response.text || "";
  } catch (error) {
    console.error("Gemini Query Error:", error);
    throw error;
  }
}

/**
 * Structured query to Gemini
 * Mirrors: queryWorkerAIStructured
 * * Note: Unlike the 2-step process in worker-ai.ts (GPT-OSS -> Llama),
 * Gemini supports JSON schema natively, so this is a single, faster call.
 */
export async function queryGeminiStructured(
  env: GeminiEnv,
  prompt: string,
  schema: object,
  systemPrompt?: string,
  modelName?: string,
): Promise<any> {
  const client = createGeminiClient(env);
  const model = modelName || getGeminiModel(env);

  try {
    const response = await client.models.generateContent({
      model: model,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: schema as any,
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from Gemini");

    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Structured Query Error:", error);
    throw error;
  }
}

/**
 * Generates text from an image using Gemini.
 * NOTE: Gemini currently requires Base64 image input.
 */
export async function queryGeminiVision(
  env: GeminiEnv,
  image: VisionInput,
  prompt: string,
  modelName?: string,
): Promise<string> {
  const client = createGeminiClient(env);
  const model = modelName || getGeminiModel(env); // Defaults to Pro (good for vision)

  try {
    let imagePart;

    if (image.type === "base64") {
      imagePart = {
        inlineData: {
          mimeType: image.mimeType || "image/jpeg",
          data: image.data,
        },
      };
    } else {
      // If URL, you might need to fetch it first or use fileData if supported by the specific client version
      throw new Error("Gemini via this SDK helper currently requires Base64.");
    }

    const response = await client.models.generateContent({
      model: model,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, imagePart],
        },
      ],
    });

    return response.text || "";
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    throw error;
  }
}

/**
 * Rewrite a question with full context for MCP
 * Mirrors: rewriteQuestionForMCP
 */
export async function rewriteQuestionForMCP(
  env: GeminiEnv,
  question: string,
  context?: {
    bindings?: string[];
    libraries?: string[];
    tags?: string[];
    codeSnippets?: Array<{
      file_path: string;
      code: string;
      relation: string;
    }>;
  },
): Promise<string> {
  const systemPrompt = `You are a technical documentation assistant. Rewrite the user question to be clear, comprehensive, and well-suited for querying Cloudflare documentation.`;

  let contextStr = "";
  if (context) {
    if (context.bindings?.length)
      contextStr += `Bindings: ${context.bindings.join(", ")}\n`;
    if (context.libraries?.length)
      contextStr += `Libraries: ${context.libraries.join(", ")}\n`;
    if (context.tags?.length)
      contextStr += `Tags: ${context.tags.join(", ")}\n`;
    if (context.codeSnippets?.length) {
      contextStr += `\nCode Context:\n${context.codeSnippets
        .map((s: any) => `File: ${s.file_path} (${s.relation})\n${s.code}`)
        .join("\n\n")}`;
    }
  }

  const prompt = `Original Question: ${question}\n\n${contextStr}\nRewrite this question with technical precision for a search engine.`;

  const schema = {
    type: "OBJECT",
    properties: {
      rewritten_question: {
        type: "STRING",
        description: "The rewritten, technical version of the question.",
      },
    },
    required: ["rewritten_question"],
  };

  const result = await queryGeminiStructured(env, prompt, schema, systemPrompt);
  return result.rewritten_question;
}

/**
 * Analyze MCP response and generate follow-up questions
 * Mirrors: analyzeResponseAndGenerateFollowUps
 */
export async function analyzeResponseAndGenerateFollowUps(
  env: GeminiEnv,
  originalQuestion: string,
  mcpResponse: any,
): Promise<{ analysis: string; followUpQuestions: string[] }> {
  const systemPrompt = `You are a technical documentation analyst. Analyze responses from documentation and identify gaps.`;

  const prompt = `Original Question: ${originalQuestion}

Documentation Response: ${JSON.stringify(mcpResponse, null, 2)}

Please:
1. Analyze if the response fully answers the question
2. Identify any gaps or unclear areas
3. Generate 2-3 specific follow-up questions if needed`;

  const schema = {
    type: "OBJECT",
    properties: {
      analysis: {
        type: "STRING",
        description: "Brief analysis of the response quality",
      },
      followUpQuestions: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "2-3 specific follow-up questions",
      },
    },
    required: ["analysis", "followUpQuestions"],
  };

  return await queryGeminiStructured(env, prompt, schema, systemPrompt);
}

/**
 * Stream Gemini response
 * Mirrors: streamWorkerAI
 */
export async function streamGemini(
  env: GeminiEnv,
  prompt: string,
  systemPrompt?: string,
): Promise<ReadableStream> {
  const client = createGeminiClient(env);
  const model = getGeminiModel(env);

  try {
    const result = await client.models.generateContentStream({
      model: model,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    // Convert Gemini Async Generator to standard ReadableStream for Cloudflare Workers
    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(new TextEncoder().encode(text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
  } catch (error) {
    console.error("Gemini Stream Error:", error);
    throw error;
  }
}
