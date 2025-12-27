import type { SearchRequest } from "./zod-schema";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
};
type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: { code: number; message: string; data?: any };
};

const TOOLS = [
  {
    name: "dbi.search",
    title: "Start DBI search job",
    description: "Start a long-running DBI pull/normalize job.",
    inputSchema: {
      type: "object",
      properties: { request: { type: "object" } },
      required: ["request"],
    },
  },
  {
    name: "dbi.request_status",
    title: "Request status",
    description: "Get status/progress for a requestId.",
    inputSchema: {
      type: "object",
      properties: { requestId: { type: "string" } },
      required: ["requestId"],
    },
  },
  {
    name: "dbi.request_logs",
    title: "Request logs",
    description: "Fetch recent logs for a requestId.",
    inputSchema: {
      type: "object",
      properties: { requestId: { type: "string" }, limit: { type: "number" } },
      required: ["requestId"],
    },
  },
  {
    name: "dbi.facts_list",
    title: "List agent-learned facts",
    description: "List facts from shared KV (filters soft deletes by default).",
    inputSchema: {
      type: "object",
      properties: { includeInactive: { type: "boolean" } },
    },
  },
];

export async function handleMcp(
  env: Env,
  origin: string,
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const id = req.id ?? null;
  try {
    if (req.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          serverInfo: { name: "core-dbi-database", version: "0.1.0" },
          capabilities: { tools: { listChanged: false } },
        },
      };
    }
    if (req.method === "tools/list")
      return { jsonrpc: "2.0", id, result: { tools: TOOLS, nextCursor: null } };
    if (req.method === "tools/call") {
      const name = req.params?.name as string;
      const args = req.params?.arguments ?? {};
      const structured = await callTool(env, origin, name, args);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(structured) }],
          structuredContent: structured,
          isError: false,
        },
      };
    }
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Unknown method: ${req.method}` },
    };
  } catch (err: any) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: String(err?.message ?? err),
        data: { stack: err?.stack },
      },
    };
  }
}

async function callTool(
  env: Env,
  origin: string,
  name: string,
  args: any,
): Promise<any> {
  switch (name) {
    case "dbi.search": {
      const request = args.request as SearchRequest;
      const requestId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO requests (id, kind, method, path, query, headers_json, body_text, cf_json, status)
                            VALUES (?, 'mcp', 'POST', '/mcp', '', '{}', ?, '{}', 'queued')`,
      )
        .bind(requestId, JSON.stringify({ tool: "dbi.search", args }))
        .run();
      await env.DB.prepare(
        `INSERT OR IGNORE INTO request_meta (request_id, progress, stats_json) VALUES (?, 0, NULL)`,
      )
        .bind(requestId)
        .run();

      const stub = env.ORCHESTRATOR.get(env.ORCHESTRATOR.idFromName(requestId));
      await (stub as any).start(requestId, request);

      return {
        requestId,
        statusUrl: `${origin}/v1/requests/${requestId}`,
        websocketUrl: `${origin.replace(/^http/, "ws")}/v1/ws/${requestId}`,
        resultsUrl: `${origin}/v1/requests/${requestId}/results`,
      };
    }
    case "dbi.request_status": {
      const requestId = args.requestId as string;
      const row = await env.DB.prepare(
        `SELECT r.id, r.status, m.progress, m.stats_json FROM requests r LEFT JOIN request_meta m ON r.id=m.request_id WHERE r.id=?`,
      )
        .bind(requestId)
        .first();
      return row ?? null;
    }
    case "dbi.request_logs": {
      const requestId = args.requestId as string;
      const limit = Math.min(Number(args.limit ?? 200), 1000);
      const { results } = await env.DB.prepare(
        `SELECT ts, level, message, data_json FROM request_logs WHERE request_id=? ORDER BY id DESC LIMIT ?`,
      )
        .bind(requestId, limit)
        .all();
      return results;
    }
    case "dbi.facts_list": {
      const includeInactive = Boolean(args.includeInactive);
      const list = await env.KV_AGENT_FACTS.list({ prefix: "fact:" });
      const out = [];
      for (const k of list.keys) {
        const v = await env.KV_AGENT_FACTS.get(k.name, "json");
        if (!v) continue;
        if (!includeInactive && (v as any).isActive === false) continue;
        out.push(v);
      }
      return out;
    }
  }
  throw new Error(`Unknown tool: ${name}`);
}
