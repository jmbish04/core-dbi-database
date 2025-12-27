import type { DurableObjectState } from "@cloudflare/workers-types";
import { BaseAgent, type AgentState } from "./core/base";

// Define a minimal state for the Sandbox Agent
export interface SandboxAgentState extends AgentState {
  lastActivity?: number;
}

export class SandboxAgent extends BaseAgent<Env, SandboxAgentState> {
  agentName = "SandboxAgent";

  constructor(state: DurableObjectState, env: Env) {
    super(state as any, env);
  }

  protected defineTools() {
    return {};
  }
}
