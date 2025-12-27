/**
 * @file Database client using D1 managed by Prisma Schema and Prisma Client ORM.
 *
 */

import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";

import * as health from "./health";

import * as requestLogs from "./schema/request_logs";
import * as requestResults from "./schema/request_results";
import * as requests from "./schema/requests";

export const schema = {
  requests,
  requestLogs,
  requestResults,
  health,
};

export const getPrisma = (env: Env) => {
  const adapter = new PrismaD1(env.DB);
  const prisma = new PrismaClient({ adapter });
  return prisma;
};

export type RequestKind = "api" | "ws" | "rpc" | "mcp";
