import { z } from "@hono/zod-openapi";

/**
 * @module SFDBI_Socrata_Interface
 * @description
 * Interface definitions for interacting with the San Francisco Department of Building Inspection (SF DBI)
 * Socrata Open Data API. This module handles:
 * 1. Complex search queries (Permits, Complaints, Addenda) with geospatial and keyword filtering.
 * 2. Asynchronous job management (Start, Monitor, Retrieve).
 * 3. Dynamic "Fact" management for agentic context (RAG/Knowledge Base).
 *
 * @system_context
 * Data Source: https://data.sfgov.org/
 * Primary Entities: Building Permits, Electrical Permits, Plumbing Permits, Complaints.
 * Agent Usage: Use `SearchRequestSchema` to construct queries. Use `FactChatRequestSchema` to manage domain knowledge.
 */

/**
 * Defines a specific time window for temporal filtering.
 * @property {string} start - ISO 8601 Datetime. Inclusive start bound.
 * @property {string} end - ISO 8601 Datetime. Inclusive end bound.
 */
export const DateRangeSchema = z.object({
  start: z.string().datetime().openapi({ example: "2024-01-01T00:00:00Z" }),
  end: z.string().datetime().openapi({ example: "2024-12-31T23:59:59Z" }),
});

/**
 * geospatial circular filter defined by a central point and radius.
 * Used for "Near Me" or radius-based queries against Socrata `location` columns.
 *
 * @property {number} lat - Latitude in decimal degrees.
 * @property {number} lon - Longitude in decimal degrees.
 * @property {number} radiusMeters - Radius in meters.
 */
export const GeoCircleSchema = z.object({
  lat: z.number().openapi({ example: 37.7599 }),
  lon: z.number().openapi({ example: -122.4148 }),
  radiusMeters: z.number().openapi({ example: 750 }),
});

/**
 * Composite filter for location-based constraints.
 * Fields are generally additive (AND logic), though `geoCircle` acts as a spatial bound
 * applied on top of address/block text matching.
 *
 * @remarks
 * - `block` and `lot` correspond to the Assessor Parcel Number (APN) components.
 * - `neighborhood` matches against SF Planning Neighborhoods definitions.
 */
export const LocationFilterSchema = z.object({
  address: z.string().optional().openapi({ example: "123 Market St" }),
  streetNumber: z.string().optional().openapi({ example: "123" }),
  streetName: z.string().optional().openapi({ example: "Market" }),
  block: z.string().optional().openapi({ example: "3712" }),
  lot: z.string().optional().openapi({ example: "008" }),
  zip: z.string().optional().openapi({ example: "94110" }),
  neighborhood: z.string().optional().openapi({ example: "Mission" }),
  geoCircle: GeoCircleSchema.optional(),
});

/**
 * Search criteria for identifying contractors involved in permits.
 *
 * @property {string} q - Free text search for company name or personal name.
 * @property {string} license - California State License Board (CSLB) number.
 */
export const ContractorSearchSchema = z.object({
  q: z.string().min(1).openapi({ example: "Bob's Plumbing" }),
  license: z.string().optional().openapi({ example: "123456" }),
  email: z
    .string()
    .email()
    .optional()
    .openapi({ example: "info@bobsplumbing.com" }),
  phone: z.string().optional().openapi({ example: "+1-415-555-1234" }),
  address: z.string().optional().openapi({ example: "500 Howard St" }),
});

/**
 * Enumeration of valid SF DBI data types available in this ecosystem.
 * - `building`: Form 1/2/3/8 building permits.
 * - `addenda`: Revisions to existing permits.
 * - `complaint`: DBI Code Enforcement complaints.
 */
export const PermitTypeSchema = z.enum([
  "building",
  "plumbing",
  "electrical",
  "addenda",
  "complaint",
]);

/**
 * Primary input schema for the /search endpoint.
 *
 * @description
 * Defines a request to pull data or perform analysis on SF DBI records.
 * The `mode` property dictates the depth of processing:
 * - `data_pull`: Raw JSON records from Socrata (fastest).
 * - `bulk_analysis`: Aggregated statistics and trends.
 * - `nl_analyst`: LLM-driven interpretation of the data (slowest, requires `query`).
 *
 * @example
 * {
 * "mode": "data_pull",
 * "permitTypes": ["building"],
 * "location": { "zip": "94103" },
 * "dateRange": { "start": "2024-01-01T00:00:00Z", "end": "2024-02-01T00:00:00Z" }
 * }
 */
export const SearchRequestSchema = z.object({
  query: z
    .string()
    .optional()
    .openapi({
      example:
        "All permits for 123 Market St since 2022, include addenda and complaints",
    }),
  permitTypes: z
    .array(PermitTypeSchema)
    .default(["building", "plumbing", "electrical", "addenda", "complaint"]),
  dateRange: DateRangeSchema.optional(),
  location: LocationFilterSchema.optional(),
  contractors: z.array(ContractorSearchSchema).optional(),
  inspectors: z
    .array(z.string())
    .optional()
    .openapi({ example: ["Smith", "JDOE"] }),
  keywords: z
    .array(z.string())
    .optional()
    .openapi({ example: ["kitchen", "seismic", "ADA"] }),
  includeInsights: z.boolean().default(false),
  includeAnomalies: z.boolean().default(false),
  mode: z
    .enum(["data_pull", "bulk_analysis", "nl_analyst"])
    .default("data_pull"),
  pageSize: z.number().int().min(1).max(500).default(100),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

/**
 * Response returned immediately after initiating a search job.
 * Used for polling pattern implementation.
 */
export const StartSearchResponseSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["queued", "running", "complete", "error"]),
  monitorUrl: z.string().url(),
  websocketUrl: z.string().url(),
  statusUrl: z.string().url(),
  logsUrl: z.string().url(),
  resultsUrl: z.string().url(),
});

/**
 * Status payload for polling the `statusUrl`.
 * @property {number} progress - Float between 0 and 1 indicating completion percentage.
 */
export const RequestStatusSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["received", "queued", "running", "complete", "error"]),
  progress: z.number().min(0).max(1),
  stats: z.any().optional(),
  monitorUrl: z.string().url(),
});

/**
 * Final output wrapper for search results.
 * @property {string} entity - The primary Socrata entity type returned (e.g., 'building_permit').
 * @property {object} page - Cursor-based pagination metadata.
 */
export const PaginatedResultsSchema = z.object({
  requestId: z.string().uuid(),
  entity: z.string(),
  page: z.object({
    limit: z.number().int(),
    cursor: z.string().nullable(),
    nextCursor: z.string().nullable(),
  }),
  rows: z.array(z.any()),
});

/**
 * Represents a discrete unit of domain knowledge or context.
 * Used by the agent to store "learned" facts about the SF DBI dataset quirks
 * (e.g., "Contractor names in 2023 data are often uppercase").
 */
export const FactSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const UpsertFactSchema = z.object({
  text: z.string().min(1),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Interface for Natural Language interaction with the Knowledge Base (Facts).
 *
 * @property {string} instruction - Natural language command to modify the fact database.
 * @property {boolean} dryRun - If true, returns proposed changes without applying them.
 *
 * @example
 * {
 * "instruction": "Tag all facts about 'seismic upgrades' with 'priority_high'",
 * "dryRun": true
 * }
 */
export const FactChatRequestSchema = z.object({
  instruction: z
    .string()
    .min(1)
    .openapi({
      example:
        "Add a fact about contractors sometimes being listed under contact_name instead of company_name, tag it contractor,name",
    }),
  dryRun: z.boolean().default(false),
});

export const FactChatResponseSchema = z.object({
  dryRun: z.boolean(),
  operations: z.array(z.any()),
  applied: z.array(z.any()),
});
