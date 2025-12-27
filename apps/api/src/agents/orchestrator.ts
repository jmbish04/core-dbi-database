import { BaseAgent, type AgentState, type SearchRequest } from "./core/base";

export class OrchestratorAgent extends BaseAgent<Env, AgentState> {
  agentName = "OrchestratorAgent";

  protected defineTools() {
    return {};
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket")
        return new Response("Expected websocket", { status: 400 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: "hello", msg: "connected" }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("Not found", { status: 404 });
  }

  async start(
    requestId: string,
    payload: SearchRequest,
  ): Promise<{ status: string }> {
    await this.status(requestId, "queued");
    await this.logRequest(requestId, "info", "queued", {
      mode: payload.mode,
      permitTypes: payload.permitTypes,
    });

    let mode = payload.mode;
    if (
      payload.query &&
      payload.mode === "data_pull" &&
      /analy|insight/i.test(payload.query)
    ) {
      // 1. Classify Intent
      const intent = await this.classifyIntent(this.env, payload.query);
      await this.logEvent("assistant", `Classified Intent: ${intent}`, {
        actionType: "MESSAGE",
        metadataJson: JSON.stringify({ subtype: "thought" }),
      });
      mode = intent; // Assuming intent should update mode
    }

    this.ctx.waitUntil(this.run(requestId, { ...payload, mode }));
    return { status: "queued" };
  }

  private async run(requestId: string, payload: SearchRequest) {
    await this.status(requestId, "running");
    await this.progress(requestId, 0.01, { phase: "dispatch" });

    try {
      if (payload.mode === "nl_analyst") {
        const stub = this.env.ANALYST.get(
          this.env.ANALYST.idFromName(requestId),
        );
        await (stub as any).run(requestId, payload);
      } else if (
        payload.includeInsights ||
        payload.includeAnomalies ||
        payload.mode === "bulk_analysis"
      ) {
        const dataStub = this.env.DATA_EXPERT.get(
          this.env.DATA_EXPERT.idFromName(requestId),
        );
        await (dataStub as any).run(requestId, payload);
        const insightsStub = this.env.INSIGHTS.get(
          this.env.INSIGHTS.idFromName(requestId),
        );
        await (insightsStub as any).run(requestId, payload);
      } else {
        const stub = this.env.DATA_EXPERT.get(
          this.env.DATA_EXPERT.idFromName(requestId),
        );
        await (stub as any).run(requestId, payload);
      }

      await this.progress(requestId, 1, { phase: "done" });
      await this.status(requestId, "complete");
      await this.logRequest(requestId, "info", "complete");
    } catch (err: any) {
      await this.status(requestId, "error", String(err?.message ?? err));
      await this.logRequest(requestId, "error", "error", {
        message: String(err?.message ?? err),
        stack: err?.stack,
      });
    }
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ) {
    try {
      const text =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message);
      const obj = JSON.parse(text);
      if (obj?.type === "ping")
        ws.send(JSON.stringify({ type: "pong", ts: new Date().toISOString() }));
    } catch {
      ws.send(JSON.stringify({ type: "ack" }));
    }
  }
}
