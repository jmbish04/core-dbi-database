import { BaseTool, z } from "./base";

export class ContractorWildcardsTool extends BaseTool<
  { input: string },
  string[]
> {
  name = "contractor_wildcards";
  description =
    "Generate 5 Socrata SoQL LIKE patterns using % wildcards for a contractor name.";
  schema = z.object({
    input: z.string().describe("Contractor name input"),
  });

  constructor(private env: Env) {
    super();
  }

  public async execute(args: { input: string }) {
    const { input } = args;
    const prompt = `Generate 5 Socrata SoQL LIKE patterns using % wildcards for contractor "${input}" (abbrev, punctuation, INC/LLC). Return JSON object with 'wildcards' array of strings.`;

    try {
      const result = await this.generateStructured<{ wildcards: string[] }>(
        this.env,
        prompt,
        z.object({ wildcards: z.array(z.string()) }) as any, // casting z object to any/object because generateStructured expects plain object or similar
        { reasoningEffort: "medium" },
      );

      const out = (result.wildcards || []).map((s) => s.trim()).filter(Boolean);
      if (!out.length) out.push(`%${input.replace(/\s+/g, "%")}%`);
      return Array.from(new Set(out)).slice(0, 10);
    } catch (e) {
      // Fallback
      return [`%${input.replace(/\s+/g, "%")}%`];
    }
  }
}

export async function generateContractorWildcards(
  env: Env,
  input: string,
): Promise<string[]> {
  return new ContractorWildcardsTool(env).execute({ input });
}

export class ClassifyIntentTool extends BaseTool<
  { query: string },
  "data_pull" | "bulk_analysis" | "nl_analyst"
> {
  name = "classify_intent";
  description =
    "Classify user query into data_pull, bulk_analysis, or nl_analyst.";
  schema = z.object({
    query: z.string().describe("The user request or query."),
  });

  constructor(private env: Env) {
    super();
  }

  public async execute(args: { query: string }) {
    const { query } = args;
    const prompt = `Classify into data_pull, bulk_analysis, or nl_analyst. Request: ${query}`;

    try {
      const result = await this.generateStructured<{
        mode: "data_pull" | "bulk_analysis" | "nl_analyst";
      }>(
        this.env,
        prompt,
        z.object({
          mode: z.enum(["data_pull", "bulk_analysis", "nl_analyst"]),
        }) as any,
        { reasoningEffort: "low" },
      );
      return result.mode;
    } catch (e) {
      return "data_pull";
    }
  }
}

export async function classifyIntent(
  env: Env,
  query: string,
): Promise<"data_pull" | "bulk_analysis" | "nl_analyst"> {
  return new ClassifyIntentTool(env).execute({ query });
}
