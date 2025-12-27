/**
 * -----------------------------------------------------------------------------
 * FILE: json-schema.ts
 * MODULE: AI/Utils
 * -----------------------------------------------------------------------------
 * DESCRIPTION:
 * Utility for converting Zod schemas to AI SDK compatible JSON Schemas.
 * -----------------------------------------------------------------------------
 */

import { jsonSchema, type Schema } from "ai";
import { z } from "@hono/zod-openapi";
import zodToJsonSchema from "zod-to-json-schema";

/**
 * Bridge Helper: Converts Hono/Zod-OpenAPI schemas to AI SDK compatible JSON Schemas.
 * This resolves strict type incompatibilities between Zod v3/v4 and the SDK.
 *
 * @param zodSchema The Zod schema to convert
 * @returns A JSON Schema compatible with the Vercel AI SDK
 */
export function convertHonoZodToAiJsonSchema<T>(
  zodSchema: z.ZodType<T>,
): Schema<T> {
  return jsonSchema<T>(zodToJsonSchema(zodSchema as any) as any);
}
