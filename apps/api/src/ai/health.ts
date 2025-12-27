import { queryGemini } from "./providers/gemini";
import { queryOpenAI } from "./providers/openai";
import {
  generateEmbedding,
  generateStructured,
  generateText,
} from "./providers/worker-ai";
import {
  analyzeFailure,
  cleanAiJsonOutput,
  getAIGatewayUrl,
  sanitizeAndFormatAiResponse,
} from "./utils";

/**
 * Checks the health of the AI domain by validating:
 * 1. Sanitizer utilities (CPU-bound)
 * 2. Unstructured Text Generation (Network-bound)
 * 3. Structured JSON Generation (Network-bound, Multi-step)
 * 4. Vector Embeddings (Network-bound)
 * 5. Gemini via AI Gateway (SDK + Raw)
 * 6. OpenAI via AI Gateway (SDK + Raw)
 * 7. Diagnostician (self-test)
 */
export async function checkHealth(env: Env) {
  const start = Date.now();
  const subChecks: Record<string, any> = {};

  // Helper to run a check safely
  const runCheck = async (name: string, fn: () => Promise<any>) => {
    const checkStart = Date.now();
    try {
      const result = await fn();
      subChecks[name] = {
        status: "OK",
        latency: Date.now() - checkStart,
        ...result,
      };
    } catch (e) {
      subChecks[name] = {
        status: "FAILURE",
        latency: Date.now() - checkStart,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  };

  // --- 1. Test Sanitizers (Fast, Synchronous) ---
  try {
    const dirtyJson = '```json\n{"status": "ok"}\n```';
    const cleanJson = cleanAiJsonOutput(dirtyJson);
    if (cleanJson !== '{"status": "ok"}') {
      throw new Error(`cleanAiJsonOutput failed. Got: ${cleanJson}`);
    }

    const markdown = "**Bold** and `code`";
    const html = sanitizeAndFormatAiResponse(markdown);
    if (
      !html.includes("<strong>Bold</strong>") ||
      !html.includes("<code>code</code>")
    ) {
      throw new Error(`sanitizeAndFormatAiResponse failed. Got: ${html}`);
    }
    subChecks.sanitizer = { status: "OK" };
  } catch (e) {
    subChecks.sanitizer = {
      status: "FAILURE",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // --- 2. Test Text Generation (GPT-OSS-120B) ---
  if (!env.AI) {
    subChecks.generateText = {
      status: "SKIPPED",
      reason: "env.AI binding missing",
    };
  } else {
    await runCheck("generateText", async () => {
      const response = await generateText(env.AI, "Reply with exactly: Pong");
      if (!response || response.trim().length === 0) {
        throw new Error("Empty response");
      }
      return { sample: response.substring(0, 50) };
    });
  }

  // --- 3. Test Structured Output (GPT-OSS → Llama 3.3) ---
  if (!env.AI) {
    subChecks.generateStructured = {
      status: "SKIPPED",
      reason: "env.AI binding missing",
    };
  } else {
    await runCheck("generateStructured", async () => {
      const schema = {
        type: "object",
        properties: {
          message: { type: "string" },
          number: { type: "number" },
        },
        required: ["message", "number"],
      };

      // Use a clear, unambiguous prompt
      const result = await generateStructured<{
        message: string;
        number: number;
      }>(
        env.AI,
        "Generate a test response with message='hello' and number=42",
        schema,
        { reasoningEffort: "low" },
      );

      if (!result.message || typeof result.number !== "number") {
        throw new Error(`Invalid response: ${JSON.stringify(result)}`);
      }
      return { response: result };
    });
  }

  // --- 4. Test Embeddings ---
  if (!env.AI) {
    subChecks.generateEmbedding = {
      status: "SKIPPED",
      reason: "env.AI binding missing",
    };
  } else {
    await runCheck("generateEmbedding", async () => {
      const vector = await generateEmbedding(
        env,
        "Health check embedding test",
      );
      if (!Array.isArray(vector) || vector.length === 0) {
        throw new Error("Invalid vector returned");
      }
      return { dimensions: vector.length };
    });
  }

  // --- 5. Test AI Gateway Configuration ---
  // First verify all required env vars are present
  const aigEnvCheck: Record<string, boolean> = {
    CLOUDFLARE_ACCOUNT_ID: !!env.CLOUDFLARE_ACCOUNT_ID,
    AI_GATEWAY_NAME: !!env.AI_GATEWAY_NAME,
    CLOUDFLARE_AI_GATEWAY_TOKEN: !!env.CLOUDFLARE_AI_GATEWAY_TOKEN,
    GEMINI_API_KEY: !!env.GEMINI_API_KEY,
    OPENAI_API_KEY: !!env.OPENAI_API_KEY,
  };

  const missingEnvVars = Object.entries(aigEnvCheck)
    .filter(([_, present]) => !present)
    .map(([name, _]) => name);

  if (missingEnvVars.length > 0) {
    subChecks.aiGatewayConfig = {
      status: "FAILURE",
      error: `Missing env vars: ${missingEnvVars.join(", ")}`,
      envCheck: aigEnvCheck,
    };
  } else {
    subChecks.aiGatewayConfig = { status: "OK", envCheck: aigEnvCheck };
  }

  // --- 5b. Verify AI Gateway Token is Active ---
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_GATEWAY_TOKEN) {
    await runCheck("aiGatewayToken", async () => {
      const verifyUrl = `https://api.cloudflare.com/client/v4/user/tokens/verify`;
      const response = await fetch(verifyUrl, {
        headers: { Authorization: `Bearer ${env.CLOUDFLARE_AI_GATEWAY_TOKEN}` },
      });

      const data = (await response.json()) as any;

      if (!data.success) {
        throw new Error(
          `Token verification failed. Ensure you are using a USER token, not an ACCOUNT token: ${JSON.stringify(data.errors)}`,
        );
      }

      if (data.result?.status !== "active") {
        throw new Error(`Token status: ${data.result?.status || "unknown"}`);
      }

      return {
        tokenStatus: data.result.status,
        message: data.messages?.[0]?.message || "Token valid",
      };
    });
  } else {
    subChecks.aiGatewayToken = {
      status: "SKIPPED",
      reason: "Missing required env vars",
    };
  }

  // --- 5c. Test Gemini (SDK) ---
  if (!env.GEMINI_API_KEY) {
    subChecks.gemini = { status: "SKIPPED", reason: "Missing GEMINI_API_KEY" };
  } else {
    await runCheck("gemini", async () => {
      const response = await queryGemini(
        env,
        "Reply with: Pong",
        "You are a ping bot.",
      );
      if (!response.toLowerCase().includes("pong")) {
        throw new Error(`Unexpected response: ${response.substring(0, 100)}`);
      }
      return { sample: response.substring(0, 50) };
    });
  }

  // --- 5d. Test Gemini (Raw Fetch via v1beta) ---
  // Mirrors Python script: test_endpoint manual check
  if (!env.GEMINI_API_KEY || !env.CLOUDFLARE_ACCOUNT_ID) {
    subChecks.geminiRaw = { status: "SKIPPED", reason: "Missing Env Vars" };
  } else {
    await runCheck("geminiRaw", async () => {
      const model = env.GEMINI_MODEL_NAME || "gemini-2.5-flash"; // Default if not set, though python script used gemini-3-pro-preview
      // Note: Python script used v1beta for manual, which fixed the issue.
      const url = getAIGatewayUrl(env, {
        provider: "google-ai-studio",
        modelName: model,
        apiVersion: "v1beta",
      });

      const payload = {
        contents: [
          {
            role: "user",
            parts: [{ text: "Reply with: Pong" }],
          },
        ],
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-aig-authorization": `Bearer ${env.CLOUDFLARE_AI_GATEWAY_TOKEN}`,
          "x-goog-api-key": env.GEMINI_API_KEY!,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const data = (await response.json()) as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text.toLowerCase().includes("pong")) {
        throw new Error(
          `Unexpected Raw response: ${JSON.stringify(data).substring(0, 200)}`,
        );
      }
      return { success: true, model: model };
    });
  }

  // --- 5e. Test OpenAI (SDK) ---
  if (!env.OPENAI_API_KEY) {
    subChecks.openai = { status: "SKIPPED", reason: "Missing OPENAI_API_KEY" };
  } else {
    await runCheck("openai", async () => {
      const response = await queryOpenAI(
        env,
        "Reply with: Pong",
        "You are a ping bot.",
      );
      if (!response.toLowerCase().includes("pong")) {
        throw new Error(`Unexpected response: ${response.substring(0, 100)}`);
      }
      return { sample: response.substring(0, 50) };
    });
  }

  // --- 5f. Test OpenAI (Raw Fetch) ---
  if (!env.OPENAI_API_KEY || !env.CLOUDFLARE_ACCOUNT_ID) {
    subChecks.openaiRaw = { status: "SKIPPED", reason: "Missing Env Vars" };
  } else {
    await runCheck("openaiRaw", async () => {
      const model = env.OPENAI_MODEL_NAME || "gpt-4o";
      const url = getAIGatewayUrl(env, {
        provider: "openai",
        modelName: model,
      });

      const payload = {
        model: model,
        messages: [{ role: "user", content: "Reply with: Pong" }],
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-aig-authorization": `Bearer ${env.CLOUDFLARE_AI_GATEWAY_TOKEN}`,
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const data = (await response.json()) as any;
      const text = data?.choices?.[0]?.message?.content || "";
      if (!text.toLowerCase().includes("pong")) {
        throw new Error(
          `Unexpected Raw response: ${JSON.stringify(data).substring(0, 200)}`,
        );
      }
      return { success: true, model: model };
    });
  }

  // --- 6. Test Diagnostician (Self-Test) ---
  if (!env.AI) {
    subChecks.diagnostician = {
      status: "SKIPPED",
      reason: "env.AI binding missing",
    };
  } else {
    await runCheck("diagnostician", async () => {
      // Call diagnostician with mock failure data
      const mockAnalysis = await analyzeFailure(
        env,
        "Mock Test Step",
        "This is a mock error for testing the diagnostician",
        { testKey: "testValue", status: "FAILURE" },
      );

      if (!mockAnalysis) {
        throw new Error("Diagnostician returned null");
      }
      if (!mockAnalysis.rootCause || !mockAnalysis.suggestedFix) {
        throw new Error(`Incomplete analysis: ${JSON.stringify(mockAnalysis)}`);
      }
      // Verify it echoed back context
      if (mockAnalysis.providedContext?.stepName === "Unknown") {
        throw new Error("Diagnostician failed to capture input context");
      }
      return {
        rootCause: mockAnalysis.rootCause.substring(0, 100),
        confidence: mockAnalysis.confidence,
      };
    });
  }

  // --- Determine Overall Status ---
  const allChecks = Object.values(subChecks);
  const hasFailure = allChecks.some((c: any) => c.status === "FAILURE");
  const allSkipped = allChecks.every((c: any) => c.status === "SKIPPED");

  let overallStatus: "success" | "failure" = "success";
  let message = "All AI subsystems operational";

  if (hasFailure) {
    overallStatus = "failure";
    const failedChecks = Object.entries(subChecks)
      .filter(([_, v]: [string, any]) => v.status === "FAILURE")
      .map(([k, _]) => k);
    message = `Failed: ${failedChecks.join(", ")}`;
  } else if (allSkipped) {
    message = "All checks skipped (bindings missing)";
  }

  return {
    status: overallStatus === "success" ? "OK" : "FAILURE",
    message,
    durationMs: Date.now() - start,
    details: subChecks,
  };
}
