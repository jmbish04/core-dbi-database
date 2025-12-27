import type { DurableObjectState } from "@cloudflare/workers-types";
import { BaseAgent, type AgentState } from "./core/base";

/**
 * TerminalAgent Stub
 *
 * This class is required by the Durable Object migrations (v5)
 * for terminal sessions.
 */
export class TerminalAgent extends BaseAgent<Env, AgentState> {
  agentName = "TerminalAgent";

  constructor(state: DurableObjectState, env: Env) {
    super(state as any, env);
  }

  protected defineTools() {
    return {};
  }

  override async fetch(_request: Request): Promise<Response> {
    return new Response("TerminalAgent active");
  }
}
