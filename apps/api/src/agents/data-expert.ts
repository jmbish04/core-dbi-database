import {
  BaseAgent,
  type AgentState,
  type SearchRequest,
  type SodaDatasetKey,
} from "./core/base";

export class DBIDataExpertAgent extends BaseAgent<Env, AgentState> {
  agentName = "DBIDataExpertAgent";

  protected defineTools() {
    return {};
  }

  override async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  }

  async run(requestId: string, payload: SearchRequest): Promise<void> {
    await this.logRequest(requestId, "info", "data expert started");
    const soda = new this.SocrataClient(this.env);

    if (payload.mode === "bulk_analysis") {
      await this.runViaSandbox(requestId, payload);
      return;
    }

    const commonWhere: string[] = [];
    const limit = Math.min(payload.pageSize ?? 100, 500);

    if (payload.location?.block)
      commonWhere.push(`block='${this.escapeSoql(payload.location.block)}'`);
    if (payload.location?.lot)
      commonWhere.push(`lot='${this.escapeSoql(payload.location.lot)}'`);
    if (payload.location?.streetNumber)
      commonWhere.push(
        `street_number='${this.escapeSoql(payload.location.streetNumber)}'`,
      );
    if (payload.location?.streetName)
      commonWhere.push(
        `street_name LIKE '${this.escapeSoql(payload.location.streetName)}%'`,
      );
    if (payload.location?.zip)
      commonWhere.push(`zipcode='${this.escapeSoql(payload.location.zip)}'`);

    const geo = payload.location?.geoCircle;

    const contractorWildcards: string[] = payload.contractors?.length
      ? (
          await Promise.all(
            payload.contractors.map((c) =>
              this.generateContractorWildcards(
                this.env,
                c.license ? `${c.q} ${c.license}` : c.q,
              ),
            ),
          )
        ).flat()
      : [];

    const selected = this.pickDatasets(
      payload.permitTypes,
      this.SocrataDatasets,
    );

    for (let i = 0; i < selected.length; i++) {
      for (const k of Object.keys(this.SocrataDatasets) as SodaDatasetKey[]) {
        const ds = this.SocrataDatasets[k];
        const where: string[] = [...commonWhere];

        if (ds.dateField && payload.dateRange)
          where.push(
            `${ds.dateField} BETWEEN '${this.escapeSoql(payload.dateRange.start)}' AND '${this.escapeSoql(payload.dateRange.end)}'`,
          );
        if (geo)
          where.push(
            this.withinCircle("location", geo.lat, geo.lon, geo.radiusMeters),
          );
        if (payload.keywords?.length)
          where.push(
            this.soqlLikeAny(
              "description",
              payload.keywords.map((kw) => `%${kw}%`),
            ),
          );

        if (contractorWildcards.length && ds.contractorFields.length) {
          const orGroups = ds.contractorFields.map((f: string) =>
            this.soqlLikeAny(f, contractorWildcards),
          );
          where.push(
            orGroups.length > 1 ? `(${orGroups.join(" OR ")})` : orGroups[0],
          );
        }

        const order = ds.permitIdField
          ? `${ds.permitIdField} ASC`
          : ds.dateField
            ? `${ds.dateField} ASC`
            : undefined;

        await this.logRequest(requestId, "info", `querying ${String(k)}`, {
          datasetId: ds.id,
        });
        await this.progress(
          requestId,
          Math.min(0.9, (i / selected.length) * 0.9),
          { phase: "fetch", dataset: k },
        );

        let offset = 0;
        while (true) {
          const rows = await soda.queryDataset<any[]>(ds.id, {
            where,
            order,
            limit,
            offset,
          });
          if (!Array.isArray(rows) || rows.length === 0) break;
          for (const r of rows)
            await this.saveRow(requestId, ds.entity, r, ds.id);
          offset += rows.length;
          if (rows.length < limit) break;
          if (offset > 20_000) {
            await this.logRequest(requestId, "warn", "cap reached (20k rows)", {
              dataset: k,
            });
            break;
          }
        }
      }
    }

    await this.progress(requestId, 0.95, { phase: "indexed" });
    await this.logRequest(requestId, "info", "data expert complete");
  }

  private async runViaSandbox(requestId: string, payload: SearchRequest) {
    await this.logRequest(requestId, "info", "bulk_analysis -> sandbox");
    const sandbox = this.getSandbox(
      this.env.SANDBOX as any,
      `dbi-${requestId}`,
    );
    await sandbox.writeFile(
      "/workspace/input.json",
      JSON.stringify({ requestId, payload }),
    );
    const result = await sandbox.exec(
      "python /workspace/scripts/run_bulk_analysis.py /workspace/input.json",
    );
    await this.logRequest(requestId, "info", "sandbox exec done", {
      exitCode: result.exitCode,
    });
    if (result.exitCode != 0)
      throw new Error(
        `Sandbox failed: ${(result.stderr || "").slice(0, 1000)}`,
      );

    const out = this.safeSocrataJson(result.stdout);
    if (out?.rows?.length)
      for (const row of out.rows)
        await this.saveRow(requestId, "insight", row, "sandbox");
    else await this.saveRow(requestId, "insight", out, "sandbox");

    await this.progress(requestId, 0.95, { phase: "sandbox_indexed" });
  }

  private pickDatasets(
    types: SearchRequest["permitTypes"],
    datasets: any,
  ): SodaDatasetKey[] {
    const set = new Set(types);
    const out: SodaDatasetKey[] = [];
    if (set.has("building")) out.push("building_permits");
    if (set.has("plumbing")) out.push("plumbing_permits");
    if (set.has("electrical")) out.push("electrical_permits");
    if (set.has("complaint")) out.push("complaints");
    if (set.has("addenda")) out.push("addenda");
    return out;
  }
}
