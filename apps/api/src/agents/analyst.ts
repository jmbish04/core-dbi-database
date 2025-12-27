import { BaseAgent, type AgentState, type SearchRequest } from "./core/base";

export class DBIDataAnalystAgent extends BaseAgent<Env, AgentState> {
  agentName = "DBIDataAnalystAgent";

  protected defineTools() {
    return {};
  }

  override async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  }

  async run(requestId: string, payload: SearchRequest): Promise<void> {
    await this.logRequest(requestId, "info", "analyst started", {
      query: payload.query,
    });

    // Legacy saveRow support via BaseAgent shim
    await this.saveRow(
      requestId,
      "insight",
      {
        title: "Analyst pipeline stub",
        query: payload.query,
        recommendation:
          "Implement sandbox-driven analysis + Workers AI narrative, then save dashboard-ready JSON.",
      },
      "analyst_agent",
    );

    await this.logRequest(requestId, "info", "analyst complete");
  }
}
