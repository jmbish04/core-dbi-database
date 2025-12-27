import { z } from "@hono/zod-openapi";
import { convertHonoZodToAiJsonSchema } from "../../ai/utils";
import type { LogOptions } from "../core/types";

/**
 * Function signature for the standardized logger provided by BaseAgent.
 */
export type ToolLogger = (
  role: string,
  content: string,
  options?: LogOptions,
) => Promise<void>;

/**
 * Context passed to the tool during execution.
 * Can be expanded to include Env if we want to pass it dynamically,
 * but usually tools are instantiated with Env.
 */
export interface ToolContext {
  logger: ToolLogger;
}

/**
 * Exported types for use in tools.
 */
export { z };

/**
 * Base abstract class for all Agent Tools.
 * Enforces standardized logging, schema definition, and AI SDK compatibility.
 */
export abstract class BaseTool<TArgs = any, TResult = any> {
  abstract name: string;
  abstract description: string;
  abstract schema: z.ZodType<TArgs>;

  /**
   * Optional logger for granular tracing within the tool execution.
   * Injected by the Agent or Caller if available.
   */
  traceTool?: ToolLogger;

  /**
   * Converts the tool into the format expected by the AI SDK (Vercel AI SDK).
   * Wraps the execute method with standardized observability logging.
   *
   * @param logger The logging function from the Agent instance (logEvent).
   */
  toAiTool(logger: ToolLogger) {
    return {
      description: this.description,
      parameters: convertHonoZodToAiJsonSchema(this.schema),
      execute: async (args: TArgs): Promise<TResult> => {
        const start = Date.now();

        // 1. Log the Tool Call
        await logger("assistant", `Invoking tool: ${this.name}`, {
          actionType: "TOOL_CALL",
          toolName: this.name,
          toolArgs: args,
          status: "SUCCESS", // Preliminary status
        });

        try {
          // 2. Execute the Tool Logic
          const result = await this.execute(args);

          // 3. Log the Result
          // Handle potentially large objects safely for logging if needed,
          // but for now we assume BaseAgent/Prisma handles sizing or truncation.
          const resultStr =
            typeof result === "string" ? result : JSON.stringify(result);

          await logger("tool", resultStr, {
            actionType: "TOOL_RESULT",
            toolName: this.name,
            latencyMs: Date.now() - start,
            status: "SUCCESS",
          });

          return result;
        } catch (e: any) {
          // 4. Log Failure
          await logger("tool", `Tool Failed: ${String(e)}`, {
            actionType: "ERROR",
            toolName: this.name,
            status: "FAILURE",
            error: String(e),
            latencyMs: Date.now() - start,
          });

          // Re-throw so the Agent/LLM sees the error
          throw e;
        }
      },
    };
  }

  /**
   * valid implementation logic for the tool.
   */
  public abstract execute(args: TArgs): Promise<TResult>;

  // --- Standardized AI Methods ---
  // These wrappers ensure tools use the same AI logic/providers as Agents.
  // Tools must pass their local 'env' since BaseTool doesn't enforce it in constructor.

  /**
   * Generate unstructured text (Reasoning).
   */
  protected async generateText(
    env: Env,
    prompt: string,
    options?: import("../../ai/providers/worker-ai").ReasoningOptions,
  ) {
    const { generateText } = await import("../../ai/providers/worker-ai");
    return generateText(env.AI, prompt, undefined, options);
  }

  /**
   * Generate structured JSON (Extraction/Classification).
   * Automatically converts Zod schema to JSON Schema for the model.
   */
  protected async generateStructured<T>(
    env: Env,
    prompt: string,
    schema: z.ZodType<T>,
    options?: import("../../ai/providers/worker-ai").StructuredOptions,
  ) {
    const { generateStructured } = await import("../../ai/providers/worker-ai");
    const { default: zodToJsonSchema } = await import("zod-to-json-schema");
    const jsonSchema = zodToJsonSchema(schema as any);
    return generateStructured<T>(env.AI, prompt, jsonSchema as any, options);
  }

  /**
   * Generate text from an image (Vision).
   */
  protected async generateVision(
    env: Env,
    image: import("../core/types").VisionInput,
    prompt: string,
  ) {
    const { generateVision } = await import("../../ai/providers/worker-ai");
    return generateVision(env, image, prompt);
  }
}
