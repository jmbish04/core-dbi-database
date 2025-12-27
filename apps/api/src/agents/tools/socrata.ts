import { BaseTool, z } from "./base";

/**
 * @module Socrata_Client_Core
 * @description
 * Core low-level interface for the Socrata Open Data API (SODA).
 * Handles SoQL query construction, dataset constants, and HTTP transport.
 *
 * @system_context
 * Used by higher-level agents to fetch raw rows from SFGov Open Data.
 * Authentication is handled via `SODA_APP_TOKEN` in the environment.
 */

/**
 * Allowlist of valid dataset keys available in this system.
 * Each key maps to a specific Socrata resource ID (4x4) via the `DATASETS` constant.
 */
export type SodaDatasetKey =
  | "building_permits"
  | "contacts"
  | "plumbing_permits"
  | "electrical_permits"
  | "complaints"
  | "addenda";

/**
 * Registry of Socrata dataset configurations.
 *
 * @constant
 * @type {Record<SodaDatasetKey, Object>}
 * @property {string} id - The 4x4 Socrata Resource Identifier (e.g., 'p4e4-a5a7').
 * @property {string} entity - Internal entity type name for downstream processing.
 * @property {string[]} contractorFields - List of column names in this dataset that contain contractor info.
 * @property {string} [dateField] - The primary temporal column (usually 'status_date' or 'date_opened').
 * @property {string} [permitIdField] - The primary key or unique identifier column (e.g., 'permit_number').
 *
 * @example
 * // Accessing building permits config
 * const config = DATASETS.building_permits;
 * // config.id => 'p4e4-a5a7'
 */
export const DATASETS: Record<
  SodaDatasetKey,
  {
    id: string;
    entity: string;
    contractorFields: string[];
    dateField?: string;
    permitIdField?: string;
  }
> = {
  building_permits: {
    id: "p4e4-a5a7",
    entity: "permit_building",
    contractorFields: ["contractor_name", "contractor_license"],
    dateField: "status_date",
    permitIdField: "permit_number",
  },
  contacts: {
    id: "3pee-9qhc",
    entity: "contractor",
    contractorFields: ["company_name", "contact_name"],
    permitIdField: "application_number",
  },
  plumbing_permits: {
    id: "k2ra-p3nq",
    entity: "permit_plumbing",
    contractorFields: [
      "plumbing_contractor_name",
      "plumbing_contractor_license",
    ],
    dateField: "status_date",
    permitIdField: "permit_number",
  },
  electrical_permits: {
    id: "ftty-kx6y",
    entity: "permit_electrical",
    contractorFields: [
      "electrical_contractor_name",
      "electrical_contractor_license",
    ],
    dateField: "status_date",
    permitIdField: "permit_number",
  },
  complaints: {
    id: "gm2e-bten",
    entity: "complaint",
    contractorFields: [],
    dateField: "date_opened",
  },
  addenda: {
    id: "vckc-dh2h",
    entity: "permit_addenda",
    contractorFields: [],
    dateField: "routing_date",
    permitIdField: "parent_permit_number",
  },
};

/**
 * Structural representation of a Socrata Query Language (SoQL) query.
 *
 * @property {string[]} [select] - List of columns to retrieve. Corresponds to `$select`.
 * @property {string[]} [where] - List of filter conditions. Joined by ' AND '. Corresponds to `$where`.
 * @property {string} [order] - Sorting instructions (e.g., 'date DESC'). Corresponds to `$order`.
 * @property {number} [limit] - Max rows to return. Corresponds to `$limit`.
 * @property {number} [offset] - Pagination offset. Corresponds to `$offset`.
 */
export type Soql = {
  select?: string[];
  where?: string[];
  order?: string;
  limit?: number;
  offset?: number;
};

/**
 * Serializes a Soql object into a URL-encoded query string compatible with Socrata APIs.
 *
 * @param {Soql} soql - The query object to encode.
 * @returns {string} The encoded query string (e.g., "$select=id,name&$where=id>5").
 */
function encodeSoql(soql: Soql): string {
  const p = new URLSearchParams();
  if (soql.select?.length) p.set("$select", soql.select.join(","));
  if (soql.where?.length) p.set("$where", soql.where.join(" AND "));
  if (soql.order) p.set("$order", soql.order);
  if (typeof soql.limit === "number") p.set("$limit", String(soql.limit));
  if (typeof soql.offset === "number") p.set("$offset", String(soql.offset));
  return p.toString();
}

/**
 * Client for executing HTTP requests against the Socrata SODA API.
 *
 * @requires Env - Must contain `SODA_APP_TOKEN` (optional but recommended to avoid throttling) and `SODA_BASE`.
 */
export class SocrataClient {
  constructor(private env: Env) {}

  /**
   * Constructs the full URL for a dataset query.
   *
   * @param {string} datasetId - The 4x4 resource ID.
   * @param {Soql} soql - The query parameters.
   */
  buildUrl(datasetId: string, soql: Soql): string {
    const base = this.env.SODA_BASE ?? "https://data.sfgov.org/resource";
    const u = new URL(`${base}/${datasetId}.json`);
    const qs = encodeSoql(soql);
    if (qs) u.search = qs;
    return u.toString();
  }

  /**
   * Fetches data from Socrata.
   *
   * @template T - The expected return type (usually an array of objects).
   * @param {string} datasetId - The 4x4 resource ID.
   * @param {Soql} soql - The query parameters.
   * @throws {Error} If the HTTP response is not OK (200).
   */
  async queryDataset<T = unknown>(datasetId: string, soql: Soql): Promise<T> {
    const url = this.buildUrl(datasetId, soql);
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-App-Token": this.env.SODA_APP_TOKEN || "",
      },
    });
    if (!res.ok)
      throw new Error(
        `SODA ${res.status}: ${(await res.text()).slice(0, 500)}`,
      );
    return (await res.json()) as T;
  }
}

/**
 * Escapes single quotes in strings to prevent SoQL injection/syntax errors.
 *
 * @param {string} s - Raw input string.
 * @returns {string} Escaped string (e.g., "Bob's" -> "Bob''s").
 */
export function escapeSoql(s: string): string {
  return s.replace(/'/g, "''");
}

/**
 * Helper to generate a SQL `LIKE` clause for multiple patterns (OR logic).
 *
 * @example
 * soqlLikeAny('name', ['Bob', 'Alice']) // returns "(name LIKE 'Bob' OR name LIKE 'Alice')"
 */
export function soqlLikeAny(field: string, patterns: string[]): string {
  const ors = patterns
    .map((p) => `${field} LIKE '${escapeSoql(p)}'`)
    .join(" OR ");
  return patterns.length > 1 ? `(${ors})` : ors;
}

/**
 * Helper to generate a Socrata geospatial `within_circle` filter.
 *
 * @param {string} field - The name of the Location column (usually 'location').
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 * @param {number} radiusMeters - Radius in meters.
 */
export function withinCircle(
  field: string,
  lat: number,
  lon: number,
  radiusMeters: number,
): string {
  return `within_circle(${field}, ${lat}, ${lon}, ${radiusMeters})`;
}

/**
 * Safely parses a JSON string, returning a fallback object if parsing fails.
 *
 * @param {string} s - The JSON string to parse.
 * @returns {any} - The parsed JSON object or a fallback object containing the raw string.
 */
export function safeSocrataJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return { raw: s };
  }
}

// -- Socrata Tool --

/**
 * @class SocrataQueryTool
 * @extends BaseTool
 * @description
 * Agent-callable tool for executing arbitrary SoQL queries against pre-defined datasets.
 * Use this when specific data points (columns, filters) are needed that aren't covered by higher-level abstractions.
 *
 * @example
 * // Agent usage example:
 * await tool.execute({
 * dataset: 'building_permits',
 * soql: {
 * where: ["status_date > '2024-01-01'"],
 * limit: 5
 * }
 * });
 */
export class SocrataQueryTool extends BaseTool<
  { dataset: SodaDatasetKey; soql: Soql },
  any
> {
  name = "socrata_query";
  description = "Query Socrata Open Data datasets using SoQL.";

  /**
   * Zod schema for tool validation.
   * Ensures only valid dataset keys and structured SoQL components are passed.
   */
  schema = z.object({
    dataset: z.enum([
      "building_permits",
      "contacts",
      "plumbing_permits",
      "electrical_permits",
      "complaints",
      "addenda",
    ] as [SodaDatasetKey, ...SodaDatasetKey[]]),
    soql: z.object({
      select: z.array(z.string()).optional(),
      where: z.array(z.string()).optional(),
      order: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }),
  });

  constructor(private env: Env) {
    super();
  }

  public async execute(args: { dataset: SodaDatasetKey; soql: Soql }) {
    const { dataset, soql } = args;
    const client = new SocrataClient(this.env);
    const dsInfo = DATASETS[dataset];
    if (!dsInfo) throw new Error(`Unknown dataset: ${dataset}`);

    return await client.queryDataset(dsInfo.id, soql);
  }
}
