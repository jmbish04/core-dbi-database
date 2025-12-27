import { WorkerEntrypoint } from "cloudflare:workers";
import type { SearchRequest } from "./zod-schema";
import { buildMonitorUrl } from "./utils";

export class CoreDbiDatabaseRpc extends WorkerEntrypoint<Env> {
  async startSearch(request: SearchRequest) {
    const requestId = crypto.randomUUID();

    await this.env.DB.prepare(
      `INSERT INTO requests (id, kind, method, path, query, headers_json, body_text, cf_json, status)
                               VALUES (?, 'rpc', 'RPC', 'CoreDbiDatabaseRpc.startSearch', '', '{}', ?, '{}', 'queued')`,
    )
      .bind(requestId, JSON.stringify(request))
      .run();
    await this.env.DB.prepare(
      `INSERT OR IGNORE INTO request_meta (request_id, progress, stats_json) VALUES (?, 0, NULL)`,
    )
      .bind(requestId)
      .run();

    const stub = this.env.ORCHESTRATOR.get(
      this.env.ORCHESTRATOR.idFromName(requestId),
    );
    await (stub as any).start(requestId, request);

    return {
      requestId,
      monitorUrl: buildMonitorUrl(this.env.FRONTEND_BASE_URL, requestId),
    };
  }

  async getStatus(requestId: string) {
    const row = await this.env.DB.prepare(
      `SELECT r.id, r.status, r.error_text, m.progress, m.stats_json
       FROM requests r LEFT JOIN request_meta m ON r.id=m.request_id
       WHERE r.id=?`,
    )
      .bind(requestId)
      .first();
    return row ?? null;
  }
}
