import type { PrismaClient } from "@prisma/client";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";

/**
 * Context object passed to all tRPC procedures.
 *
 * @remarks
 * This context is created for each incoming request and provides access to:
 * - Request-specific data (headers, etc.)
 * - Shared resources (prisma)
 * - Environment configuration
 */
export type TRPCContext = {
  /** The incoming HTTP request object */
  req: Request;

  /** tRPC request metadata (headers, connection info) */
  info: CreateHTTPContextOptions["info"];

  /** Prisma ORM instance */
  prisma: PrismaClient;

  /** Request-scoped cache for storing computed values during request lifecycle */
  cache: Map<string | symbol, unknown>;

  /** Optional HTTP response object (available in Hono middleware) */
  res?: Response;

  /** Optional response headers (for setting cookies, CORS headers, etc.) */
  resHeaders?: Headers;

  /** Environment variables and secrets */
  env: Env;
};

/**
 * Hono application context.
 */
export type AppContext = {
  Bindings: Env;
  Variables: {
    prisma: PrismaClient;
  };
};
