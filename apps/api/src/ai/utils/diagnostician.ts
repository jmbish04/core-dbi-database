import { generateStructured } from "../providers/worker-ai";

export interface HealthFailureAnalysis {
  rootCause: string;
  suggestedFix: string;
  severity: "low" | "medium" | "critical";
  confidence: number;
  providedContext?: {
    stepName: string;
    errorMsg: string;
    details?: any;
  };
  fixPrompt: string;
}

/**
 * Analyzes a health check failure using AI to determine root cause and fix.
 */
export async function analyzeFailure(
  env: Env,
  stepName: string,
  errorMsg: string,
  details?: any,
): Promise<HealthFailureAnalysis | null> {
  if (!env.AI) return null;

  const detailsStr = details ? JSON.stringify(details, null, 2) : "None";

  // Explicitly format the input so the model can echo it back accurately.
  const prompt = `
    You are a Site Reliability Engineer invoking a Health Diagnosis Agent.
    
    === INPUT DATA (MUST ECHO) ===
    Step Name: "${stepName}"
    Error Message: "${errorMsg}"
    ==============================

    === TECHNICAL DETAILS ===
    ${detailsStr}
    =========================
    
    Task:
    1. READ the "TECHNICAL DETAILS". Find the entry with status "FAILURE".
    2. DIAGNOSE the root cause based on that failure (e.g., "Authentication", "Timeout", "Model Refusal").
    3. PROVIDE a fix.
    4. ECHO the Input Data into the 'providedContext' field EXACTLY as shown above.
    5. GENERATE a "Fix Prompt" for a coding agent.
    
    Restrictions:
    - You must NOT return "Unknown" for Step Name or Error Message. Use the values provided in "INPUT DATA".
    - If details contain a specific error, cite it.
    `;

  const schema = {
    type: "object",
    properties: {
      providedContext: {
        type: "object",
        description:
          "Context provided to the AI. You MUST echo back the input data here.",
        properties: {
          stepName: { type: "string" },
          errorMsg: { type: "string" },
          details: { type: "object" },
        },
        required: ["stepName", "errorMsg"],
      },
      rootCause: {
        type: "string",
        description: "Technical explanation of why it failed",
      },
      suggestedFix: {
        type: "string",
        description: "Actionable command or configuration change to fix it",
      },
      severity: {
        type: "string",
        enum: ["low", "medium", "critical"],
        description:
          "Critical = System Down, Medium = Degradation, Low = Minor Warning",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence (0.0 - 1.0) in this diagnosis",
      },
      fixPrompt: {
        type: "string",
        description:
          "A detailed prompt for another AI agent to fix this specific issue",
      },
    },
    required: [
      "rootCause",
      "suggestedFix",
      "severity",
      "confidence",
      "providedContext",
      "fixPrompt",
    ],
  };

  try {
    const analysis = await generateStructured<HealthFailureAnalysis>(
      env.AI,
      prompt,
      schema,
      { reasoningEffort: "high" },
    );
    return analysis;
  } catch (err) {
    console.error(`AI Analysis failed for ${stepName}: `, err);
    // Fallback or return null
    return null;
  }
}
