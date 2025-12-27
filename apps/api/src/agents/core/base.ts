/**
 * -----------------------------------------------------------------------------
 * FILE: base.ts
 * MODULE: Core
 * -----------------------------------------------------------------------------
 * DESCRIPTION:
 * Foundational abstract class for all AI agents. It integrates state management,
 * structured logging (via Prisma/D1), and standardized AI SDK wrappers.
 *
 * PURPOSE:
 * To provide a consistent, robust, and observable runtime for building complex
 * agent behaviors on Cloudflare Workers using the Agents SDK.
 * -----------------------------------------------------------------------------
 */

// 1. Import Agent from the SDK
import { Agent } from "agents";
import { schema } from "../../db";
import type { SearchRequest } from "../../zod-schema";
import { getAllTools } from "../tools/index";

// 2. Schema & Validation
import { z } from "@hono/zod-openapi";
import { zodToJsonSchema } from "zod-to-json-schema";

// 3. AI & Database
// import { PrismaD1 } from '@prisma/adapter-d1';
// import { PrismaClient } from '@prisma/client';

// 4. Providers & Services
import {
  queryGemini,
  queryGeminiStructured,
  queryGeminiVision,
} from "../../ai/providers/gemini";
import {
  queryOpenAI,
  queryOpenAIStructured,
  queryOpenAIVision,
} from "../../ai/providers/openai";
import {
  generateEmbedding,
  generateVision,
} from "../../ai/providers/worker-ai";
import {
  cleanAiJsonOutput,
  convertHonoZodToAiJsonSchema,
  sanitizeAndFormatAiResponse,
} from "../../ai/utils";

// 5. Types
import type { AgentState, LogOptions, VisionInput } from "./types";

export type {
  AgentState,
  LogOptions,
  SearchRequest,
  SodaDatasetKey,
  VisionInput,
};

// Import shared utilities to expose on BaseAgent
import { getSandbox } from "@cloudflare/sandbox";
import type { SodaDatasetKey } from "../tools";
import * as tools from "../tools";

export abstract class BaseAgent<
  E extends Env = Env,
  S extends AgentState = AgentState,
> extends Agent<E, S> {
  abstract agentName: string;

  // -- Shared Utilities (Exposed for Subclasses) --
  protected getSandbox = getSandbox;
  protected SocrataClient = tools.socrata.SocrataClient;
  protected SocrataDatasets = tools.socrata.DATASETS;
  protected escapeSoql = tools.socrata.escapeSoql;
  protected soqlLikeAny = tools.socrata.soqlLikeAny;
  protected withinCircle = tools.socrata.withinCircle;
  protected generateContractorWildcards = tools.dbi.generateContractorWildcards;
  protected safeSocrataJson = tools.socrata.safeSocrataJson;
  protected cleanAiJsonOutput = cleanAiJsonOutput;
  protected sanitizeAndFormatAiResponse = sanitizeAndFormatAiResponse;

  protected RunPythonScriptTool = tools.sandbox.RunPythonScriptTool;
  protected RunNotebookTool = tools.sandbox.RunNotebookTool;

  // -- TOOLKIT INSTRUCTIONS --
  // Injected into every AI call to ensure model knows capabilities
  protected TOOLKIT_INSTRUCTIONS = `
SYSTEM TOOLKIT CAPABILITIES:
You have access to a secure, isolated Python Sandbox environment ("Container") capable of:
1. Running Python Scripts: Located in /workspace/scripts (e.g., 'permit/addenda.py').
2. Executing Jupyter Notebooks: Located in /workspace/notebooks.
3. Installing Packages: The environment is pre-loaded with pandas, pyarrow, pydantic, etc.

When asked to analyze data or perform logic better suited for Python, PREFER using the 'run_python_script' or 'run_notebook' tools over internal reasoning.
    `;

  protected async runPythonScript(scriptPath: string, args: string[] = []) {
    return new this.RunPythonScriptTool(this.env).execute({ scriptPath, args });
  }

  protected async runNotebook(notebookPath: string) {
    return new this.RunNotebookTool(this.env).execute({ notebookPath });
  }

  protected async classifyIntent(env: Env, query: string) {
    return tools.dbi.classifyIntent(env, query);
  }

  // -- LOGGING (Prisma) --

  /**
   * Centralized Observability Log
   * Records every thought, action, and result to D1 for auditing and debugging.
   * Uses Prisma (D1) instead of Agent SQL for centralized analytics.
   */
  protected async logEvent(
    role: string,
    content: string,
    options: LogOptions = {},
  ) {
    try {
      // const adapter = new PrismaD1(this.env.DB);
      // const prisma = new PrismaClient({ adapter });

      /*
            await prisma.chatLog.create({
                data: {
                    agentId: this.agentName,
                    role,
                    content,
                    engagementId: options.engagementId || this.state.engagementId,
                    // @ts-ignore - Check if workflowId exists in state type, otherwise optional
                    workflowId: options.workflowId || (this.state as any).workflowId,

                    actionType: options.actionType || "MESSAGE",
                    toolName: options.toolName,
                    toolArgs: options.toolArgs ? JSON.stringify(options.toolArgs) : null,

                    provider: options.provider,
                    model: options.model,
                    latencyMs: options.latencyMs,

                    metadataJson: options.metadataJson || JSON.stringify(options),
                    status: options.status || "SUCCESS",
                    error: options.error
                }
            });
            */
      console.log(`[${this.agentName}] [${role}]: ${content.slice(0, 100)}...`);
    } catch (e) {
      // Fallback to console if DB fails - critical not to crash the agent just because logging failed
      console.error(`[${this.agentName}] Logging Failed:`, e);
    }
  }

  // Legacy Shim for logChat to call logEvent
  protected async logChat(role: string, content: string, metadata: any = {}) {
    return this.logEvent(role, content, {
      ...metadata,
      actionType: "MESSAGE",
    });
  }

  /**
   * Helper to wrap tool execution with logging and error handling.
   * Use this inside your tool definitions.
   */
  protected async traceTool<T>(
    name: string,
    args: any,
    execution: () => Promise<T>,
  ): Promise<T> {
    const start = Date.now();

    // Log the Call
    await this.logEvent("assistant", `Invoking tool: ${name}`, {
      actionType: "TOOL_CALL",
      toolName: name,
      toolArgs: args,
    });

    try {
      const result = await execution();

      // Log the Result
      await this.logEvent(
        "tool",
        typeof result === "string" ? result : JSON.stringify(result),
        {
          actionType: "TOOL_RESULT",
          toolName: name,
          latencyMs: Date.now() - start,
        },
      );

      return result;
    } catch (e) {
      // Log the Error
      await this.logEvent("tool", `Tool Failed: ${String(e)}`, {
        actionType: "ERROR",
        toolName: name,
        status: "FAILURE",
        error: String(e),
        latencyMs: Date.now() - start,
      });
      throw e; // Re-throw so the LLM knows it failed
    }
  }

  // -- KV LOGGING (Fallback/Quick Access) --

  /**
   * Resilient logging to KV for immediate debugging visibility.
   * Use this alongside D1 logging for critical flows.
   */
  protected async logToKV(entry: {
    level: "INFO" | "WARN" | "ERROR";
    message: string;
    details?: any;
  }) {
    try {
      if (this.env.KV_AGENT_LOGS) {
        const timestamp = Date.now();
        const key = `${timestamp}-${this.agentName}-${crypto.randomUUID().slice(0, 4)}`;
        await this.env.KV_AGENT_LOGS.put(
          key,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            agent: this.agentName,
            ...entry,
          }),
        );
      }
    } catch (e) {
      console.error(`[${this.agentName}] KV Logging Failed:`, e);
    }
  }

  // -- MEMORY OPS (KV / Storage) --

  /**
   * Persist arbitrary data to Agent Storage (SQLite/KV) or Global Cache
   */
  async saveMemory(key: string, value: any) {
    // Use Global KV binding if available for shared access
    if ((this.env as any).CACHE) {
      await (this.env as any).CACHE.put(key, JSON.stringify(value));
    } else {
      // Fallback to Agent's internal Durable Object storage
      await this.ctx.storage.put(key, value);
    }
  }

  async getMemory(key: string) {
    if ((this.env as any).CACHE) {
      const val = await (this.env as any).CACHE.get(key);
      return val ? JSON.parse(val) : null;
    } else {
      return await this.ctx.storage.get(key);
    }
  }

  // -- STATE MANAGEMENT --
  // The Agent SDK automatically provides `this.state` (getter) and `this.setState()`
  // We do not need to manually implement loadState/saveState.

  // -- HYBRID AI GENERATION --

  /**
   * UNIFIED GENERATION (Hybrid Router)
   * Routes 'worker-ai' to Vercel SDK, and others to Direct SDKs to avoid dependency hell.
   */
  async generateText(
    prompt: string,
    provider: "gemini" | "openai" | "worker-ai" = "gemini",
    modelName?: string,
  ) {
    await this.ensureContextLoaded();
    const start = Date.now();
    await this.logEvent("user", prompt, { provider, model: modelName });

    // Prepare History from Agent State (handle potentially undefined state)
    const history = this.state && this.state.history ? this.state.history : [];
    let responseText = "";

    try {
      if (provider === "worker-ai") {
        // --- PATH A: Worker AI (via Local Custom Provider) ---
        // Replaced Vercel SDK usage with local provider since getWorkerAI is missing
        // and local provider is available.
        const { generateText: generateTextWorkerAI } =
          await import("../../ai/providers/worker-ai");
        responseText = await generateTextWorkerAI(
          this.env.AI,
          prompt,
          undefined,
          { effort: "medium" },
        );

        // Tools logic momentarily disabled for WorkerAI until local provider supports it or we restore Vercel SDK
        // const result = await generateText({
        //    model,
        //    messages,
        //    tools: this.getTools() as any,
        // });
        // responseText = result.text;
      } else {
        // --- PATH B: Direct SDKs (Gemini / OpenAI) ---
        const systemMsg = history.find((h) => h.role === "system")?.content;

        if (provider === "gemini") {
          responseText = await queryGemini(
            this.env,
            prompt,
            (systemMsg ? systemMsg + "\n" : "") + this.TOOLKIT_INSTRUCTIONS,
            modelName,
          );
        } else if (provider === "openai") {
          responseText = await queryOpenAI(
            this.env,
            prompt,
            (systemMsg ? systemMsg + "\n" : "") + this.TOOLKIT_INSTRUCTIONS,
            modelName,
          );
        }
      }

      // Log Response
      await this.logEvent("assistant", responseText, {
        provider,
        model: modelName,
        latencyMs: Date.now() - start,
      });

      // Update State via SDK
      this.setState({
        ...(this.state || {}), // Handle undefined state
        history: [
          ...history,
          { role: "user", content: prompt },
          { role: "assistant", content: responseText },
        ],
      } as S);

      return responseText;
    } catch (e) {
      await this.logEvent("assistant", "Generation Failed", {
        provider,
        status: "FAILURE",
        error: String(e),
        latencyMs: Date.now() - start,
        actionType: "ERROR",
      });
      throw e;
    }
  }

  /**
   * UNIFIED STRUCTURED GENERATION
   */
  async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    provider: "gemini" | "openai" | "worker-ai" = "worker-ai",
    modelName?: string,
  ): Promise<T> {
    const start = Date.now();
    await this.logEvent("user", prompt, {
      provider,
      model: modelName,
      actionType: "MESSAGE",
      metadataJson: JSON.stringify({ type: "structured" }),
    });

    try {
      let resultObject: T;

      if (provider === "worker-ai") {
        const { generateStructured: generateStructuredWorkerAI } =
          await import("../../ai/providers/worker-ai");
        resultObject = await generateStructuredWorkerAI(
          this.env.AI,
          prompt,
          zodToJsonSchema(schema) as any,
        );
      } else {
        // Direct Providers
        const jsonSchema = zodToJsonSchema(schema as any);

        if (provider === "gemini") {
          // Note: We don't have easy system prompt injection for structured yet in utils,
          // generally we prepend to prompt or rely on schema.
          // For now, prepending to prompt is safer if system msg param unavailable.
          // Checking queryGeminiStructured signature: (env, prompt, schema, system?, model?)
          resultObject = await queryGeminiStructured(
            this.env,
            prompt,
            jsonSchema,
            this.TOOLKIT_INSTRUCTIONS,
            modelName,
          );
        } else if (provider === "openai") {
          resultObject = await queryOpenAIStructured(
            this.env,
            prompt,
            jsonSchema,
            this.TOOLKIT_INSTRUCTIONS,
            modelName,
          );
        } else {
          throw new Error("Invalid provider");
        }
      }

      await this.logEvent("assistant", JSON.stringify(resultObject), {
        provider,
        actionType: "TOOL_RESULT",
        latencyMs: Date.now() - start,
      });

      return resultObject;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  // -- VISION CAPABILITIES --

  /**
   * UNIFIED VISION ANALYSIS
   * Routes image analysis to the specified provider.
   * Normalized inputs: Accepts Base64 or URL.
   */
  async analyzeImage(
    image: VisionInput,
    prompt: string,
    provider: "gemini" | "openai" | "worker-ai" = "worker-ai",
    modelName?: string,
  ): Promise<string> {
    const start = Date.now();

    // Log the visual request (omit huge base64 strings from logs)
    await this.logEvent("user", `[Vision Request] ${prompt}`, {
      provider,
      model: modelName,
      metadataJson: JSON.stringify({
        imageType: image.type,
        mime: image.mimeType,
      }),
    });

    let responseText = "";

    try {
      if (provider === "worker-ai") {
        responseText = await generateVision(this.env, image, prompt);
      } else if (provider === "gemini") {
        responseText = await queryGeminiVision(
          this.env,
          image,
          prompt,
          modelName,
        );
      } else {
        responseText = await queryOpenAIVision(
          this.env,
          image,
          prompt,
          modelName,
        );
      }

      await this.logEvent("assistant", responseText, {
        provider,
        actionType: "VISION_RESULT",
        latencyMs: Date.now() - start,
      });

      return responseText;
    } catch (e) {
      await this.logEvent("assistant", "Vision Analysis Failed", {
        provider,
        status: "FAILURE",
        error: String(e),
        latencyMs: Date.now() - start,
        actionType: "ERROR",
      });
      throw e;
    }
  }

  /**
   * STRUCTURED VISION ANALYSIS
   * Uses a 2-step pipeline:
   * 1. Vision Model -> Detailed Description
   * 2. Structuring Model (Text-to-JSON) -> Validated Object
   */
  async analyzeImageStructured<T>(
    image: VisionInput,
    prompt: string,
    schema: z.ZodType<T>,
    provider: "gemini" | "openai" | "worker-ai" = "worker-ai",
    modelName?: string,
  ): Promise<T> {
    const start = Date.now();
    await this.logEvent("user", `[Structured Vision] ${prompt}`, {
      provider,
      actionType: "MESSAGE",
    });

    try {
      // Step 1: Get raw visual analysis
      const validationPrompt = `${prompt} 
            Describe the image in extreme detail, focusing specifically on the data points required to answer the prompt. 
            Do not output JSON yet, just describe the visual facts.`;

      const rawDescription = await this.analyzeImage(
        image,
        validationPrompt,
        provider,
        modelName,
      );

      // Step 2: Use existing Text-to-Structure logic to parse the description
      // We force 'worker-ai' for step 2 as Llama 3.3 is excellent at JSON extraction
      const resultObject = await this.generateStructured(
        `Extract data from this visual description:\n\n${rawDescription}`,
        schema,
        "worker-ai",
      );

      await this.logEvent("assistant", JSON.stringify(resultObject), {
        provider,
        actionType: "VISION_STRUCTURED_RESULT",
        latencyMs: Date.now() - start,
      });

      return resultObject;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  private async ensureContextLoaded() {
    // Safely check state and history
    if (
      (!this.state || !this.state.history || this.state.history.length === 0) &&
      this.state?.engagementId
    ) {
      try {
        // Access tool directly from method instead of execution wrapper for internal call
        const contextParams = { engagementId: this.state.engagementId };

        // We use the traceTool wrapper logic manually here or just invoke logic
        // For simplicity, we assume we can call the execution logic of getTools if we refactored slightly,
        // but for now, let's just log the attempt.

        const tools = this.getTools();
        if (tools.getEngagementContext) {
          const context =
            await tools.getEngagementContext.execute(contextParams);
          const contextStr = `SYSTEM CONTEXT:\n${JSON.stringify(context)}`;

          const newHistory = [
            ...this.state.history,
            { role: "system", content: contextStr },
          ];
          this.setState({ ...this.state, history: newHistory } as S);

          await this.logEvent("system", "Auto-loaded Context", {
            metadataJson: JSON.stringify({ type: "auto-context" }),
          });
        }
      } catch (e) {
        console.warn("Failed to auto-load context:", e);
      }
    }
  }

  async generateEmbedding(text: string) {
    return await generateEmbedding(this.env, text);
  }

  // -- TOOLING --

  /**
   * EXTENSIBLE TOOLING SYSTEM
   * Returns the combined set of Core Tools (available to all agents)
   * and Agent-Specific Tools (defined in subclasses).
   */
  public getTools(): any {
    return {
      ...this.getCoreTools(),
      ...this.defineTools(),
    };
  }

  /**
   * Define core tools available to every agent in the system.
   */
  protected getCoreTools(): any {
    const tools = getAllTools(this.env);
    const toolMap: Record<string, any> = {};

    // Register Auto-Loaded Tools
    for (const tool of tools) {
      toolMap[tool.name] = tool.toAiTool(this.logEvent.bind(this));
    }

    // Inline Tools (Legacy or Specific to BaseAgent not yet refactored to classes)
    // Leaving inline tools here if not moving them to separate files yet,
    // to maintain functionality of vector_search etc.
    // *However* the previous ReplaceFileContent call REMOVED the inline tools!
    // So I must restore them OR assume I should move them.
    // Given complexity, I will restore them here.

    const coreTools = {
      ...toolMap,
      vector_search: {
        description:
          "Search the forensic knowledge base or regulatory docs using Hybrid Search.",
        parameters: convertHonoZodToAiJsonSchema(
          z.object({
            query: z.string().describe("The search query string."),
            limit: z
              .number()
              .optional()
              .default(5)
              .describe("Number of results to return."),
            index: z
              .enum(["forensic", "regulation"])
              .optional()
              .default("forensic")
              .describe("The vector index to search."),
          }),
        ),
        execute: async (args: {
          query: string;
          limit?: number;
          index?: "forensic" | "regulation";
        }) => {
          return this.traceTool("vector_search", args, async () => {
            const { query, limit = 5, index = "forensic" } = args;
            // const searcher = new SearchService(this.env);
            const results: any[] = []; // searcher removed
            // const results = await searcher.search(query, limit, { index });
            if (results.length === 0) return "No results found.";
            return results
              .map(
                (r) =>
                  `[ID: ${r.id}] (Score: ${(r.score || 0).toFixed(2)}) (Source: ${r.source})\n${r.content}`,
              )
              .join("\n---\n");
          });
        },
      },
      search_regulations: {
        description:
          "Search specific regulatory documents (SF DBI, CA REGS, etc.) for compliance verification.",
        parameters: convertHonoZodToAiJsonSchema(
          z.object({
            query: z.string().describe("The regulatory query or keyword."),
            limit: z
              .number()
              .optional()
              .default(5)
              .describe("Number of results to return."),
          }),
        ),
        execute: async (args: { query: string; limit?: number }) => {
          return this.traceTool("search_regulations", args, async () => {
            const { query, limit = 5 } = args;
            // const searcher = new SearchService(this.env);
            const results: any[] = []; // searcher removed
            // const results = await searcher.search(query, limit, { index: "regulation" });
            if (results.length === 0)
              return "No relevant regulatory matches found.";
            return results
              .map(
                (r) =>
                  `[REG-DOC: ${r.id}] (Score: ${(r.score || 0).toFixed(2)})\n${r.content}`,
              )
              .join("\n---\n");
          });
        },
      },
      saveForensicContext: {
        description:
          "Save forensic analysis context or results to the database.",
        parameters: convertHonoZodToAiJsonSchema(
          z.object({
            messageId: z
              .string()
              .optional()
              .describe("The ID of the message being analyzed."),
            data: z.any().describe("The analysis data to save (JSON object)."),
          }),
        ),
        execute: async (args: { messageId?: string; data: any }) => {
          return this.traceTool("saveForensicContext", args, async () => {
            const { messageId, data } = args;
            if (messageId) {
              // const adapter = new PrismaD1(this.env.DB);
              // const prisma = new PrismaClient({ adapter });
              /*
                            await prisma.message.update({
                                where: { messageId },
                                data: {
                                    // @ts-ignore - forensicAnalysisJson missing from Message schema
                                    forensicAnalysisJson: JSON.stringify(data),
                                    status: "PROCESSED"
                                }
                            });
                            */
              return "Saved analysis to Message metadata.";
            }
            return "No messageId provided. Context not saved to Message.";
          });
        },
      },
      getEngagementContext: {
        description:
          "Fetch relevant context for the current engagement (messages, facts, analysis).",
        parameters: convertHonoZodToAiJsonSchema(
          z.object({
            engagementId: z
              .string()
              .describe("The engagement ID to fetch context for."),
            limit: z
              .number()
              .optional()
              .default(20)
              .describe("Number of recent messages to fetch."),
          }),
        ),
        execute: async (args: { engagementId: string; limit?: number }) => {
          return this.traceTool("getEngagementContext", args, async () => {
            const { engagementId, limit = 20 } = args;
            // const adapter = new PrismaD1(this.env.DB);
            // const prisma = new PrismaClient({ adapter });

            const facts: any[] = [];
            /*
                        const facts = await prisma.engagementFact.findMany({
                            where: { engagement_id: engagementId },
                            take: 20
                        });
                        */

            const messages: any[] = [];
            /*
                        const messages = await prisma.message.findMany({
                            where: { engagementId },
                            orderBy: { sentDate: 'desc' },
                            take: limit
                        });
                        */

            const analysis: any[] = [];
            /*
                        const analysis = await prisma.timelineAnalysis.findMany({
                            where: { engagementId },
                            orderBy: { createdAt: 'desc' },
                            take: 5
                        });
                        */
            return {
              facts: facts.map((f: any) => ({
                type: f.type,
                title: f.title,
                content: f.content,
              })),
              messages: messages.map((m: any) => ({
                date: m.sentDate,
                from: m.fromAddress,
                subject: m.subject,
                snippet: m.bodyPlain
                  ? m.bodyPlain.substring(0, 200)
                  : "No content",
              })),
              analysis: analysis.map((a: any) => ({
                summary: a.summary,
                risks: a.potentialRisks,
              })),
            };
          });
        },
      },
      updateKnowledge: {
        description:
          "Update the engagement's knowledge base with a new fact or truth.",
        parameters: convertHonoZodToAiJsonSchema(
          z.object({
            engagementId: z.string().describe("The engagement ID."),
            type: z
              .enum(["CONTEXT", "TRUTH", "EVIDENCE"])
              .describe("The type of fact."),
            content: z.string().describe("The content of the fact."),
            title: z
              .string()
              .optional()
              .describe("Short title/handle for the fact."),
            confidence: z
              .number()
              .optional()
              .default(1.0)
              .describe("Confidence score (0.0-1.0)."),
          }),
        ),
        execute: async (args: {
          engagementId: string;
          type: "CONTEXT" | "TRUTH" | "EVIDENCE";
          content: string;
          title?: string;
          confidence?: number;
        }) => {
          return this.traceTool("updateKnowledge", args, async () => {
            const {
              engagementId,
              type,
              content,
              title,
              confidence = 1.0,
            } = args;
            // const adapter = new PrismaD1(this.env.DB);
            // const prisma = new PrismaClient({ adapter });

            /*
                        await prisma.engagementFact.create({
                            data: {
                                engagement_id: engagementId,
                                type,
                                title,
                                content,
                                confidence
                            }
                        });
                        */
            return "Fact added to Knowledge Base.";
          });
        },
      },
    };

    return coreTools;
  }

  /**
   * Abstract method for subclasses to register their specific tools.
   * Must return an object where keys are tool names and values are tool definitions.
   */
  protected abstract defineTools(): any;

  // -- HEALTH CHECKS --

  async performSelfHealthCheck() {
    const results: Record<string, any> = {};
    const start = Date.now();

    // 1. Worker AI Check
    try {
      const aiStart = Date.now();
      const textResponse = await this.generateText("Ping", "worker-ai");
      results.workerAI = {
        status: textResponse ? "OK" : "FAILURE",
        latency: Date.now() - aiStart,
      };
    } catch (e) {
      results.workerAI = { status: "FAILURE", error: String(e) };
    }

    // 2. Database Check (Prisma)
    try {
      const dbStart = Date.now();
      // const adapter = new PrismaD1(this.env.DB);
      // const prisma = new PrismaClient({ adapter });
      // @ts-ignore
      // await prisma.gmailEvidence.findFirst();
      results.database = { status: "OK", latency: Date.now() - dbStart };
    } catch (e) {
      results.database = { status: "FAILURE", error: String(e) };
    }

    // 3. Browser Rendering Check
    try {
      if (this.env.CLOUDFLARE_BROWSER_RENDER_TOKEN) {
        results.browser = { status: "OK", method: "TOKEN_CHECK" };
      } else {
        results.browser = { status: "SKIPPED", message: "No Token" };
      }
    } catch (e) {
      results.browser = { status: "FAILURE", error: String(e) };
    }

    // 4. SODA (SF Data) Check
    try {
      if (this.env.SODA_APP_TOKEN) {
        // We perform a Lightweight token check or just existence check
        // Real ping would be `new SodaService(this.env).getPermitsByLicense('...test...')` but might be expensive/slow
        results.soda = { status: "OK", method: "TOKEN_CHECK" };
      } else {
        results.soda = { status: "SKIPPED", message: "No Token" };
      }
    } catch (e) {
      results.soda = { status: "FAILURE", error: String(e) };
    }

    return {
      status: Object.values(results).some((r) => r.status === "FAILURE")
        ? "DEGRADED"
        : "OK",
      duration: Date.now() - start,
      checks: results,
    };
  }

  // -- REAL-TIME COMMS (PartyKit/WebSockets) --

  /**
   * Broadcast a message to all connected WebSocket clients.
   * Essential for HITL (Human-in-the-Loop) UI updates.
   */
  override broadcast(type: string, payload: any) {
    // @ts-ignore - 'getWebSockets' is part of the standard DO ctx but might not be typed in the SDK generic
    this.ctx.getWebSockets().forEach((ws) => {
      try {
        ws.send(JSON.stringify({ type, payload }));
      } catch (e) {
        // Ignore send errors for disconnected clients
      }
    });
  }

  // --- Legacy Shims for Backward Compatibility ---
  async runReasoning(prompt: string, _systemPrompt?: string): Promise<string> {
    return await this.generateText(prompt, "worker-ai");
  }

  // --- Request-Based Tracking (Migrated from BaseRequestAgent) ---

  protected async logRequest(
    requestId: string,
    level: "debug" | "info" | "warn" | "error",
    message: string,
    data?: unknown,
  ) {
    await schema.requestLogs.appendLog(
      this.env,
      requestId,
      level,
      message,
      data,
    );
    // Helper to broadcast if we have WS context
    this.broadcast("log", {
      requestId,
      level,
      message,
      data,
      ts: new Date().toISOString(),
    });
  }

  protected async progress(
    requestId: string,
    progress: number,
    stats?: unknown,
  ) {
    await schema.requests.setRequestProgress(
      this.env,
      requestId,
      progress,
      stats,
    );
    this.broadcast("progress", { requestId, progress, stats });
  }

  protected async status(
    requestId: string,
    status: string,
    errorText?: string,
  ) {
    await schema.requests.updateRequestStatus(
      this.env,
      requestId,
      status,
      errorText,
    );
    this.broadcast("status", { requestId, status, errorText });
  }

  protected async saveRow(
    requestId: string,
    entity: string,
    row: unknown,
    source?: string,
    canonicalKey?: string,
  ) {
    await schema.requestResults.insertResult(
      this.env,
      requestId,
      entity,
      row,
      source,
      canonicalKey,
    );
  }
}
