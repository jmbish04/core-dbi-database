/**
 * @module WorkerAI
 * @description Centralized utility module for interacting with Cloudflare Workers AI.
 * * This module abstracts the complexity of model selection, prompting strategies,
 * and response parsing. It is designed to be the single source of truth for all AI operations.
 * * Capabilities:
 * 1. `generateText`: Unstructured reasoning using high-intelligence models (GPT-OSS-120B). Supports HTML sanitization.
 * 2. `generateStructured`: Structured data extraction using schema-enforcing models (Llama 3.3).
 * 3. `generateEmbedding`: Vector embedding generation using the environment-configured model.
 * * @requires Env - The Cloudflare Worker environment bindings.
 * @requires sanitizeAndFormatAiResponse - Utility for cleaning AI output for frontend display.
 */

import type { VisionInput } from "../../agents/core/types";
import { cleanAiJsonOutput, sanitizeAndFormatAiResponse } from "../utils";

// Type alias for the AI binding to ensure compatibility across various Worker types
type AiBinding = any;

// --- Model Configuration ---

/** * @constant REASONING_MODEL
 * @description GPT-OSS-120B is selected for its high reasoning capabilities.
 * It is used via the Responses API for broad analysis, brainstorming, and drafting.
 */
const REASONING_MODEL = "@cf/openai/gpt-oss-120b";

/** * @constant STRUCTURING_MODEL
 * @description Llama 3.3 70B is selected for its ability to strictly adhere to
 * JSON schemas via the 'response_format' parameter.
 */
const STRUCTURING_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** * @constant VISION_MODEL
 * @description Llama 3.2 11B is selected for its ability to process images and
 * generate text descriptions.
 */
const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

// --- Types ---

export interface ReasoningOptions {
  /** * Constrains effort on reasoning.
   * - 'low': Faster, superficial answer.
   * - 'medium': Balanced (Default).
   * - 'high': Deep thought, better for complex architectural questions.
   */
  effort?: "low" | "medium" | "high";

  /** * Controls the verbosity of the reasoning summary returned by the model.
   */
  summary?: "concise" | "detailed" | "auto";

  /** * If true, the output will be run through the `sanitizeAndFormatAiResponse` utility.
   * This converts Markdown to safe HTML and strips unsafe tags.
   * Use this when displaying the result directly in the Frontend.
   * @default false
   */
  sanitize?: boolean;
}

export interface StructuredOptions {
  /** Constrains effort on the initial reasoning pass before structuring. */
  reasoningEffort?: "low" | "medium" | "high";
  /** Optional system prompt to guide the final JSON formatting step. */
  structuringInstruction?: string;
}

// --- Core AI Functions ---

/**
 * Generates unstructured text using a high-reasoning model (GPT-OSS-120B).
 * * Use this function for:
 * - Chat interfaces
 * - Brainstorming
 * - Explanations
 * - Summarization
 * * @param ai - The Cloudflare AI binding (env.AI)
 * @param input - The user prompt or input text to analyze
 * @param systemInstruction - Optional system context or persona instructions
 * @param options - Configuration for reasoning effort and output sanitization
 * @returns A string containing the model's response. If `options.sanitize` is true, returns HTML.
 */
export async function generateText(
  ai: AiBinding,
  input: string,
  systemInstruction?: string,
  options?: ReasoningOptions,
): Promise<string> {
  // GPT-OSS-120B Responses API strictly expects 'input' and 'reasoning'
  const payload: any = {
    input: systemInstruction
      ? `Instructions: ${systemInstruction}\n\nInput: ${input}`
      : input,
    reasoning: {
      effort: options?.effort || "medium",
      summary: options?.summary || "concise",
    },
  };

  try {
    const response = await ai.run(REASONING_MODEL, payload);
    let textResult = "";

    // Handle Responses API output format
    if (
      typeof response === "object" &&
      response !== null &&
      "response" in response
    ) {
      textResult = (response as any).response;
    } else {
      textResult = String(response);
    }

    // Apply sanitization if requested
    if (options?.sanitize) {
      return sanitizeAndFormatAiResponse(textResult);
    }

    return textResult;
  } catch (error) {
    console.error("Worker AI Generation Error:", error);
    throw new Error(
      `Failed to generate text: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Generates a strictly typed JSON object using a 2-step Chain-of-Thought process.
 * * Process:
 * 1. Runs the prompt through the Reasoning Model (GPT-OSS-120B) to generate a comprehensive analysis.
 * 2. Feeds that analysis into the Structuring Model (Llama 3.3) with a JSON Schema to enforce format.
 * * Use this function for:
 * - Data extraction
 * - Classification
 * - Generating API payloads
 * * @template T - The expected TypeScript interface of the returned JSON.
 * @param ai - The Cloudflare AI binding (env.AI)
 * @param prompt - The input prompt describing the data to generate or extract
 * @param jsonSchema - The JSON Schema object defining the structure of T
 * @param options - Configuration for the reasoning pass
 * @returns A promise resolving to the structured object T
 */
export async function generateStructured<T = any>(
  ai: AiBinding,
  prompt: string,
  jsonSchema: object,
  options?: StructuredOptions,
): Promise<T> {
  try {
    // --- Step 1: Reasoning Phase ---
    // We ask the "smart" model to think about the problem without JSON constraints.
    // FORCE sanitize: false because we need raw markdown/text for the next step.
    const reasoningOutput = await generateText(
      ai,
      prompt,
      "Analyze the following input comprehensively. Provide a detailed analysis that covers all aspects required.",
      { effort: options?.reasoningEffort || "high", sanitize: false },
    );

    // Validate reasoning output before proceeding
    if (!reasoningOutput || reasoningOutput.trim().length === 0) {
      console.error(
        "[generateStructured] Reasoning model returned empty output for prompt:",
        prompt,
      );
      throw new Error(
        "Reasoning model returned no content. Cannot proceed to structuring phase.",
      );
    }

    // --- Step 2: Structuring Phase ---
    // We ask the "compliant" model to map that reasoning into the schema.
    const structuringPrompt =
      options?.structuringInstruction ||
      "You are a data extraction engine. Extract the information from the analysis below and format it strictly according to the JSON schema.";

    const messages = [
      { role: "system", content: structuringPrompt },
      { role: "user", content: `Analysis Content:\n${reasoningOutput}` },
    ];

    const response = await ai.run(STRUCTURING_MODEL, {
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "structured_output",
          schema: jsonSchema,
          strict: true,
        },
      },
    });

    // Parse Llama 3.3 output
    if (
      typeof response === "object" &&
      response !== null &&
      "response" in response
    ) {
      const rawJson = (response as any).response;
      // Ensure we clean any potential markdown wrappers before parsing
      return typeof rawJson === "object"
        ? rawJson
        : JSON.parse(cleanAiJsonOutput(String(rawJson)));
    }

    throw new Error("Unexpected response format from structuring model");
  } catch (error) {
    console.error("Worker AI Structured Chain Error:", error);
    throw error;
  }
}

/**
 * Generates text from an image using Cloudflare Workers AI (Llama 3.2 Vision).
 * NOTE: Llama 3.2 on Workers AI currently expects an array of integers for the image.
 */
export async function generateVision(
  env: Env,
  image: VisionInput,
  prompt: string,
): Promise<string> {
  let imageInput: number[] = [];

  if (image.type === "base64") {
    // Convert Base64 string to ArrayBuffer then to number array
    const binaryString = atob(image.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    imageInput = Array.from(bytes);
  } else {
    throw new Error("Worker AI currently requires Base64 image input.");
  }

  try {
    const response = await env.AI.run(VISION_MODEL, {
      prompt: prompt,
      image: imageInput,
    });

    // Parse standard Llama response
    return (response as any).response || JSON.stringify(response);
  } catch (error) {
    console.error("Worker AI Vision Error:", error);
    throw error;
  }
}

/**
 * Generates vector embeddings for a given text using the environment-configured model.
 * * @param env - The full Worker Environment object (must contain AI and DEFAULT_MODEL_EMBEDDING).
 * @param text - The text string to embed.
 * @returns A promise resolving to an array of numbers (the vector).
 * @throws Error if DEFAULT_MODEL_EMBEDDING is not set in wrangler.toml/vars.
 */
export async function generateEmbedding(
  env: Env,
  text: string,
): Promise<number[]> {
  // Access model from environment variable (set in wrangler.jsonc)
  // @ts-ignore - Assuming Env has this property added via wrangler
  const model = env.DEFAULT_MODEL_EMBEDDING;

  if (!model) {
    throw new Error(
      "DEFAULT_MODEL_EMBEDDING is not set in environment variables.",
    );
  }

  try {
    const response = await env.AI.run(model, { text: [text] });
    return (response as any).data[0];
  } catch (error) {
    console.error(`Worker AI Embedding Error (${model}):`, error);
    throw error;
  }
}

/**
 * Rewrites a user query into a technical search query optimized for Cloudflare Docs.
 * Injects context about bindings, libraries, and code snippets.
 * * @param ai - Cloudflare AI binding
 * @param question - The user's original question
 * @param context - Optional context object containing code analysis data
 * @returns The rewritten search query string
 */
export async function rewriteQuestionForMCP(
  ai: AiBinding,
  question: string,
  context?: {
    bindings?: string[];
    libraries?: string[];
    tags?: string[];
    codeSnippets?: Array<{ file_path: string; code: string; relation: string }>;
  },
): Promise<string> {
  let prompt = `Original Question: ${question}\n\n`;

  if (context) {
    if (context.bindings?.length)
      prompt += `Bindings: ${context.bindings.join(", ")}\n`;
    if (context.libraries?.length)
      prompt += `Libraries: ${context.libraries.join(", ")}\n`;
    if (context.tags?.length) prompt += `Tags: ${context.tags.join(", ")}\n`;
    if (context.codeSnippets?.length) {
      prompt += `\nCode Context:\n`;
      context.codeSnippets.forEach((s) => {
        prompt += `File: ${s.file_path} (${s.relation})\n${s.code.substring(0, 500)}...\n\n`;
      });
    }
  }

  const schema = {
    type: "object",
    properties: {
      rewritten_question: {
        type: "string",
        description:
          "A technical, search-optimized version of the question including relevant context.",
      },
    },
    required: ["rewritten_question"],
    additionalProperties: false,
  };

  const result = await generateStructured<{ rewritten_question: string }>(
    ai,
    prompt,
    schema,
    {
      structuringInstruction:
        "Rewrite the user question to be clear, comprehensive, and optimized for querying Cloudflare documentation.",
    },
  );

  return result.rewritten_question;
}

/**
 * Analyzes a documentation response to determine if it answers the user's question
 * and identifies follow-up questions for missing information.
 * * @param ai - Cloudflare AI binding
 * @param originalQuestion - The user's question
 * @param mcpResponse - The data returned from the documentation search
 * @returns Structured analysis and follow-up questions
 */
export async function analyzeResponseAndGenerateFollowUps(
  ai: AiBinding,
  originalQuestion: string,
  mcpResponse: any,
): Promise<{ analysis: string; followUpQuestions: string[] }> {
  const prompt = `Original Question: ${originalQuestion}\n\nDocumentation Response: ${JSON.stringify(mcpResponse, null, 2)}`;

  const schema = {
    type: "object",
    properties: {
      analysis: {
        type: "string",
        description:
          "Analysis of whether the response answers the question and what gaps remain.",
      },
      followUpQuestions: {
        type: "array",
        items: { type: "string" },
        description:
          "2-3 specific follow-up questions to fill identified gaps.",
      },
    },
    required: ["analysis", "followUpQuestions"],
    additionalProperties: false,
  };

  return await generateStructured(ai, prompt, schema, {
    structuringInstruction: "Analyze the response quality and identify gaps.",
  });
}

/**
 * Analyzes a code comment to determine if it implies a need for Cloudflare services.
 * * @param ai - Cloudflare AI binding
 * @param comment - The code comment text
 * @param context - File location context
 * @returns structured analysis including relevance boolean and specific questions
 */
export async function analyzeCommentForCloudflare(
  ai: AiBinding,
  comment: string,
  context?: { filePath?: string; line?: number },
): Promise<{
  isCloudflareRelated: boolean;
  cloudflareContext?: string;
  questions: string[];
}> {
  const prompt = `Code Comment: "${comment}"\nLocation: ${context?.filePath || "unknown"}:${context?.line || 0}`;

  const schema = {
    type: "object",
    properties: {
      isCloudflareRelated: { type: "boolean" },
      cloudflareContext: { type: "string" },
      questions: { type: "array", items: { type: "string" } },
    },
    required: ["isCloudflareRelated", "questions"],
    additionalProperties: false,
  };

  return await generateStructured(ai, prompt, schema, {
    structuringInstruction:
      "Determine if this comment implies a need for Cloudflare services and generate technical questions.",
  });
}

// --- Backward Compatibility Exports ---
// These ensure existing code doesn't break while migrating to the new signatures.

export const queryWorkerAI = generateText;
export const queryWorkerAIStructured = async (
  ai: AiBinding,
  prompt: string,
  schema: object,
  systemPrompt?: string,
) => {
  return generateStructured(ai, prompt, schema, {
    structuringInstruction: systemPrompt,
  });
};
