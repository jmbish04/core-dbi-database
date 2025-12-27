import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import YAML from "yaml";

import type { RequestKind } from "./db";
import { schema } from "./db";
import { handleMcp } from "./mcp";
import { healthRouter } from "./routers/health";
import {
  buildMonitorUrl,
  buildWsUrl,
  decodeCursor,
  encodeCursor,
} from "./utils";
import {
  FactChatRequestSchema,
  FactChatResponseSchema,
  FactSchema,
  PaginatedResultsSchema,
  RequestStatusSchema,
  SearchRequestSchema,
  StartSearchResponseSchema,
  UpsertFactSchema,
} from "./zod-schema";

function inferKind(req: Request): RequestKind {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/v1/ws")) return "ws";
  if (url.pathname.startsWith("/rpc")) return "rpc";
  if (url.pathname.startsWith("/mcp")) return "mcp";
  return "api";
}

export function createApp() {
  const app = new OpenAPIHono<{
    Bindings: Env;
    Variables: { requestId: string };
  }>();

  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);

    const clone = c.req.raw.clone();
    const bodyText = await clone.text().catch(() => undefined);

    await schema.requests.createRequest(
      c.env,
      requestId,
      inferKind(c.req.raw),
      c.req.raw,
      bodyText,
    );
    c.res.headers.set("x-request-id", requestId);

    await next();
  });

  app.route("/health", healthRouter);

  app.doc("/openapi.json", {
    openapi: "3.1.0",
    info: { title: "core-dbi-database", version: "0.1.0" },
  });
  app.get("/openapi.yaml", (c) => {
    const doc = app.getOpenAPIDocument({
      openapi: "3.1.0",
      info: { title: "core-dbi-database", version: "0.1.0" },
    });
    return c.text(YAML.stringify(doc), 200, {
      "content-type": "application/yaml",
    });
  });
  app.get("/swagger", swaggerUI({ url: "/openapi.json" }));

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/search",
      operationId: "startSearch",
      request: {
        body: {
          content: { "application/json": { schema: SearchRequestSchema } },
        },
      },
      responses: {
        200: {
          description: "Search queued",
          content: {
            "application/json": { schema: StartSearchResponseSchema },
          },
        },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const requestId = c.get("requestId");

      await schema.requests.queueRequest(c.env, requestId);
      await schema.requestLogs.appendLog(
        c.env,
        requestId,
        "INFO",
        "Search request received",
        JSON.stringify(body),
      );

      const stub = c.env.ORCHESTRATOR.get(
        c.env.ORCHESTRATOR.idFromName(requestId),
      );
      // @ts-ignore - RPC types
      await stub.start(requestId, body);

      const origin = new URL(c.req.url).origin;
      const monitorUrl = buildMonitorUrl(
        c.env.FRONTEND_BASE_URL || origin,
        requestId,
      );

      return c.json(
        {
          requestId,
          status: "queued",
          monitorUrl,
          websocketUrl: buildWsUrl(origin, requestId),
          statusUrl: `${origin}/v1/requests/${requestId}`,
          logsUrl: `${origin}/v1/requests/${requestId}/logs`,
          resultsUrl: `${origin}/v1/requests/${requestId}/results`,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/analyze",
      operationId: "startAnalysis",
      request: {
        body: {
          content: { "application/json": { schema: SearchRequestSchema } },
        },
      },
      responses: {
        200: {
          description: "Analysis queued",
          content: {
            "application/json": { schema: StartSearchResponseSchema },
          },
        },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const requestId = c.get("requestId");

      await schema.requests.queueRequest(c.env, requestId);
      await schema.requestLogs.appendLog(
        c.env,
        requestId,
        "INFO",
        "Analysis request received",
        JSON.stringify(body),
      );

      const stub = c.env.ORCHESTRATOR.get(
        c.env.ORCHESTRATOR.idFromName(requestId),
      );
      // @ts-ignore - RPC types
      await stub.start(requestId, body);

      const origin = new URL(c.req.url).origin;
      const monitorUrl = buildMonitorUrl(
        c.env.FRONTEND_BASE_URL || origin,
        requestId,
      );

      return c.json(
        {
          requestId,
          status: "queued",
          monitorUrl,
          websocketUrl: buildWsUrl(origin, requestId),
          statusUrl: `${origin}/v1/requests/${requestId}`,
          logsUrl: `${origin}/v1/requests/${requestId}/logs`,
          resultsUrl: `${origin}/v1/requests/${requestId}/results`,
        },
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/facts",
      operationId: "getFacts",
      responses: {
        200: {
          description: "List of facts",
          content: { "application/json": { schema: z.array(FactSchema) } },
        },
      },
    }),
    async (c) => {
      // Placeholder: fetch from D1
      return c.json([], 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/requests/{requestId}",
      operationId: "getRequestStatus",
      request: { params: z.object({ requestId: z.string().uuid() }) },
      responses: {
        200: {
          description: "Status",
          content: { "application/json": { schema: RequestStatusSchema } },
        },
      },
    }),
    async (c) => {
      const { requestId } = c.req.valid("param");

      const statusData = await schema.requests.getRequestStatusWithMeta(
        c.env,
        requestId,
      );

      const origin = new URL(c.req.url).origin;
      const monitorUrl = buildMonitorUrl(
        c.env.FRONTEND_BASE_URL || origin,
        requestId,
      );

      if (!statusData)
        return c.json(
          {
            requestId,
            status: "error",
            progress: 0,
            stats: { error: "not_found" },
            monitorUrl,
          },
          200,
        );

      return c.json({
        requestId,
        status: (statusData.status as any) ?? "queued",
        progress: Number(statusData.progress ?? 0),
        stats: statusData.stats_json
          ? JSON.parse(String(statusData.stats_json))
          : undefined,
        monitorUrl,
      });
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/requests/{requestId}/logs",
      operationId: "getRequestLogs",
      request: {
        params: z.object({ requestId: z.string().uuid() }),
        query: z.object({ limit: z.string().optional() }),
      },
      responses: {
        200: {
          description: "Logs",
          content: { "application/json": { schema: z.any() } },
        },
      },
    }),
    async (c) => {
      const { requestId } = c.req.valid("param");
      const limit = Math.min(Number(c.req.query("limit") ?? 200), 1000);

      const logs = await schema.requestLogs.getLogs(c.env, requestId, limit);

      return c.json(
        logs.map((r) => ({
          ts: r.createdAt,
          level: r.level,
          message: r.message,
          data: r.dataJson ? JSON.parse(String(r.dataJson)) : undefined,
        })),
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/requests/{requestId}/results",
      operationId: "getRequestResults",
      request: {
        params: z.object({ requestId: z.string().uuid() }),
        query: z.object({
          entity: z.string().default("permit_building"),
          cursor: z.string().optional(),
          limit: z.string().optional(),
        }),
      },
      responses: {
        200: {
          description: "Results",
          content: { "application/json": { schema: PaginatedResultsSchema } },
        },
      },
    }),
    async (c) => {
      const { requestId } = c.req.valid("param");
      const entity = c.req.query("entity") ?? "permit_building";
      const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
      const cursor = decodeCursor(c.req.query("cursor") ?? null);
      const afterId = cursor ?? 0;

      const results = await schema.requestResults.getPaginatedResults(
        c.env,
        requestId,
        entity,
        afterId,
        limit,
      );

      const rows = results.map((r) => JSON.parse(String(r.rowJson)));
      const lastId = results.length
        ? Number(results[results.length - 1].id)
        : null;
      const nextCursor =
        results.length === limit && lastId ? encodeCursor(lastId) : null;

      return c.json({
        requestId,
        entity,
        page: { limit, cursor: c.req.query("cursor") ?? null, nextCursor },
        rows,
      });
    },
  );

  app.get("/v1/ws/:requestId", async (c) => {
    const requestId = c.req.param("requestId");
    const stub = c.env.ORCHESTRATOR.get(
      c.env.ORCHESTRATOR.idFromName(requestId),
    );
    const url = new URL(c.req.url);
    url.pathname = "/ws";
    return await stub.fetch(url.toString(), c.req.raw);
  });

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/facts",
      operationId: "listFacts",
      request: { query: z.object({ includeInactive: z.string().optional() }) },
      responses: {
        200: {
          description: "Facts",
          content: { "application/json": { schema: z.array(FactSchema) } },
        },
      },
    }),
    async (c) => {
      const includeInactive = c.req.query("includeInactive") === "1";
      const list = await c.env.KV_AGENT_FACTS.list({ prefix: "fact:" });
      const out: any[] = [];
      for (const k of list.keys) {
        const v = await c.env.KV_AGENT_FACTS.get(k.name, "json");
        if (!v) continue;
        if (!includeInactive && (v as any).isActive === false) continue;
        out.push(v);
      }
      out.sort((a, b) =>
        String(a.createdAt).localeCompare(String(b.createdAt)),
      );
      return c.json(out);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/facts",
      operationId: "createFact",
      request: {
        body: { content: { "application/json": { schema: UpsertFactSchema } } },
      },
      responses: {
        200: {
          description: "Fact",
          content: { "application/json": { schema: FactSchema } },
        },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const fact = {
        id,
        text: body.text,
        tags: body.tags ?? [],
        isActive: body.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };
      await c.env.KV_AGENT_FACTS.put(`fact:${id}`, JSON.stringify(fact));
      return c.json(fact);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/v1/facts/{id}",
      operationId: "updateFact",
      request: {
        params: z.object({ id: z.string().uuid() }),
        body: { content: { "application/json": { schema: UpsertFactSchema } } },
      },
      responses: {
        200: {
          description: "Fact",
          content: { "application/json": { schema: FactSchema } },
        },
        404: {
          description: "Not Found",
          content: {
            "application/json": { schema: z.object({ error: z.string() }) },
          },
        },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const key = `fact:${id}`;
      const existing = (await c.env.KV_AGENT_FACTS.get(key, "json")) as any;
      if (!existing) return c.json({ error: "not_found" }, 404);
      const updated = {
        ...existing,
        text: body.text ?? existing.text,
        tags: body.tags ?? existing.tags,
        isActive: body.isActive ?? existing.isActive,
        updatedAt: new Date().toISOString(),
      };
      await c.env.KV_AGENT_FACTS.put(key, JSON.stringify(updated));
      return c.json(updated);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/facts/{id}/soft-delete",
      operationId: "softDeleteFact",
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: {
        200: {
          description: "Fact",
          content: { "application/json": { schema: FactSchema } },
        },
        404: {
          description: "Not Found",
          content: {
            "application/json": { schema: z.object({ error: z.string() }) },
          },
        },
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const key = `fact:${id}`;
      const existing = (await c.env.KV_AGENT_FACTS.get(key, "json")) as any;
      if (!existing) return c.json({ error: "not_found" }, 404);
      const updated = {
        ...existing,
        isActive: false,
        updatedAt: new Date().toISOString(),
      };
      await c.env.KV_AGENT_FACTS.put(key, JSON.stringify(updated));
      return c.json(updated);
    },
  );

  // Agentic fact editing (bulk changes). Uses Workers AI to propose operations, then applies them to KV.
  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/facts/chat",
      operationId: "factsChat",
      request: {
        body: {
          content: { "application/json": { schema: FactChatRequestSchema } },
        },
      },
      responses: {
        200: {
          description: "Plan/apply operations",
          content: { "application/json": { schema: FactChatResponseSchema } },
        },
      },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const list = await c.env.KV_AGENT_FACTS.list({ prefix: "fact:" });
      const facts: any[] = [];
      for (const k of list.keys) {
        const v = await c.env.KV_AGENT_FACTS.get(k.name, "json");
        if (v) facts.push(v);
      }

      const prompt = [
        "You are editing a KV-backed list of facts for agents that query SF DBI data.",
        'Return ONLY valid JSON with an array named "operations". Each operation is one of:',
        '- {"op":"create","text":string,"tags":string[]}',
        '- {"op":"update","id":uuid,"text"?:string,"tags"?:string[],"isActive"?:boolean}',
        '- {"op":"softDelete","id":uuid}',
        "Do NOT hard delete.",
        "Instruction: " + body.instruction,
        "Existing facts (JSON): " + JSON.stringify(facts.slice(0, 200)),
      ].join("\n");

      let operations: any[] = [];
      try {
        const resp = (await c.env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct" as any,
          {
            messages: [
              {
                role: "system",
                content: "Return ONLY valid JSON. No markdown.",
              },
              { role: "user", content: prompt },
            ],
            max_tokens: 1200,
          },
        )) as any;
        const text = (resp?.response ?? resp?.result ?? resp) as string;
        const start = Math.max(text.indexOf("{"), text.indexOf("["));
        const candidate = start >= 0 ? text.slice(start) : text;
        const parsed = JSON.parse(candidate);
        operations = Array.isArray(parsed) ? parsed : (parsed.operations ?? []);
      } catch (e) {
        operations = [];
      }

      const applied: any[] = [];
      if (!body.dryRun) {
        for (const op of operations) {
          if (op.op === "create" && typeof op.text === "string") {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const fact = {
              id,
              text: op.text,
              tags: Array.isArray(op.tags) ? op.tags : [],
              isActive: true,
              createdAt: now,
              updatedAt: now,
            };
            await c.env.KV_AGENT_FACTS.put(`fact:${id}`, JSON.stringify(fact));
            applied.push({ op: "create", id });
          } else if (op.op === "update" && typeof op.id === "string") {
            const key = `fact:${op.id}`;
            const existing = (await c.env.KV_AGENT_FACTS.get(
              key,
              "json",
            )) as any;
            if (!existing) continue;
            const updated = {
              ...existing,
              ...("text" in op ? { text: op.text } : {}),
              ...("tags" in op ? { tags: op.tags } : {}),
              ...("isActive" in op ? { isActive: op.isActive } : {}),
              updatedAt: new Date().toISOString(),
            };
            await c.env.KV_AGENT_FACTS.put(key, JSON.stringify(updated));
            applied.push({ op: "update", id: op.id });
          } else if (op.op === "softDelete" && typeof op.id === "string") {
            const key = `fact:${op.id}`;
            const existing = (await c.env.KV_AGENT_FACTS.get(
              key,
              "json",
            )) as any;
            if (!existing) continue;
            const updated = {
              ...existing,
              isActive: false,
              updatedAt: new Date().toISOString(),
            };
            await c.env.KV_AGENT_FACTS.put(key, JSON.stringify(updated));
            applied.push({ op: "softDelete", id: op.id });
          }
        }
      }

      return c.json({ dryRun: body.dryRun, operations, applied });
    },
  );

  app.delete("/v1/facts/:id", async (c) => {
    // Hard delete: allowed for UI users; block agents (they must soft delete).
    if (c.req.header("x-agent") === "true")
      return c.json({ error: "agents_cannot_hard_delete" }, 403);
    const id = c.req.param("id");
    await c.env.KV_AGENT_FACTS.delete(`fact:${id}`);
    return c.json({ ok: true });
  });

  app.post("/mcp", async (c) => {
    const req = await c.req.json().catch(() => null);
    if (!req) return c.json({ error: "invalid_json" }, 400);
    const origin = new URL(c.req.url).origin;
    const resp = await handleMcp(c.env, origin, req);
    return c.json(resp);
  });

  return app;
}
