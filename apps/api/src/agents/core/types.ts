/**
 * -----------------------------------------------------------------------------
 * FILE: types.ts
 * MODULE: Core
 * -----------------------------------------------------------------------------
 * DESCRIPTION:
 * Centralized type definitions for the agent system, covering state interfaces,
 * logging structures, and specific agent configuration types.
 *
 * PURPOSE:
 * Ensures type safety and consistency across the agent ecosystem. Acts as the
 * single source of truth for shared data structures.
 *
 * KEY COMPONENTS:
 * - AgentState: Base interface for agent persistence.
 * - VerificationState / items: Types for the Verification agent.
 * - OrchestratorState / EngagementStatus: Types for workflow orchestration.
 * - StrategyState / TacticalMode: Types for valid legal/response strategies.
 * - LogOptions: Structure for the centralized logging system.
 * -----------------------------------------------------------------------------
 */

export interface AgentState {
  history: { role: string; content: string }[];
  engagementId?: string;
  // Base state can be extended
}

// Verification Agent Types
export interface VerificationItem {
  id: string;
  type: "DECEPTION" | "FACT" | "CONTRADICTION";
  content: string;
  sourceId?: string;
  confidence?: number;
  submittedAt: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
}

export interface VerificationState extends AgentState {
  items: VerificationItem[];
}

// Orchestrator Agent Types
export type EngagementStatus =
  | "IDLE"
  | "INGESTING"
  | "ANALYZING"
  | "STRATEGY"
  | "COMPLETE";

export interface OrchestratorState extends AgentState {
  status: EngagementStatus;
  engagementId: string;
  progress: {
    current: number;
    total: number;
    stageDescription: string;
  };
  linkedAgents: {
    verificationId?: string;
    strategyId?: string;
  };
}

// Strategy Agent Types
export const TACTICAL_MODES = {
  STANDARD:
    "Draft a professional legal response. Maintain a firm but polite tone.",
  GRAY_ROCK:
    "Use the 'Gray Rock' method. Be uninteresting, brief, and factual. Do not engage with emotional hooks. Max 3 sentences.",
  BIFF: "Use the BIFF method: Brief, Informative, Friendly, and Firm. Avoid advice or admonishment.",
  AGGRESSIVE:
    "Draft a stern litigation hold letter. Demand preservation of evidence. Be extremely formal.",
} as const;

export type TacticalMode = keyof typeof TACTICAL_MODES;

export interface StrategyState extends AgentState {
  strategyMode?: TacticalMode;
  lastAnalysisTimestamp?: number;
  analysisCount?: number;
}

export interface LogOptions {
  engagementId?: string;
  workflowId?: string;
  actionType?:
    | "MESSAGE"
    | "TOOL_CALL"
    | "TOOL_RESULT"
    | "ERROR"
    | "VISION_RESULT"
    | "VISION_STRUCTURED_RESULT";
  toolName?: string;
  toolArgs?: any;
  provider?: string;
  model?: string;
  latencyMs?: number;
  tokens?: { input: number; output: number };
  status?: "SUCCESS" | "FAILURE";
  error?: string;
  metadataJson?: string;
}

export type VisionInput = {
  type: "base64" | "url";
  data: string; // The Base64 string or the URL
  mimeType?: string; // e.g., 'image/jpeg', 'image/png' (Required for Base64)
};
