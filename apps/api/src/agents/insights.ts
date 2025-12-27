import { BaseAgent, type AgentState, type SearchRequest } from "./core/base";

export class DBIInsightsAgent extends BaseAgent<Env, AgentState> {
  agentName = "DBIInsightsAgent";

  protected defineTools() {
    return {};
  }

  override async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  }

  async run(requestId: string, payload: SearchRequest): Promise<void> {
    if (!payload.includeInsights && !payload.includeAnomalies) return;

    await this.logRequest(requestId, "info", "insights started");

    await this.saveRow(
      requestId,
      "insight",
      {
        title: "Insights pipeline stub",
        note: "Wire insights/*.py + anomalies/*.py through Sandbox SDK and store results in request_results.",
        includeAnomalies: payload.includeAnomalies,
      },
      "insights_agent",
    );

    await this.logRequest(requestId, "info", "insights complete");
  }
}
