import { getPrisma } from "../db";
import { HEALTH_CHECKS, type HealthCheckResult } from "./registry";

export class HealthService {
  constructor(private env: Env) {}

  async runAllChecks(): Promise<Record<string, HealthCheckResult>> {
    const prisma = getPrisma(this.env);
    const results: Record<string, HealthCheckResult> = {};

    // 1. Run Registry Checks
    for (const check of HEALTH_CHECKS) {
      const start = Date.now();
      let result: HealthCheckResult;
      try {
        result = await check.fn(this.env);
      } catch (err: any) {
        result = {
          status: "FAIL",
          latencyMs: Date.now() - start,
          error: err.message || String(err),
        };
      }

      await this.recordResult(null, check.id, result);
      await this.handleIncident(null, check.id, result);
      results[check.id] = result;
    }

    // 2. Run Database Definitions
    // Note: Wrapping in try-catch to allow running even if table is empty or error occurs fetching definitions
    try {
      const dbTests = await prisma.healthTestDefinition.findMany({
        where: { enabled: true },
      });
      for (const test of dbTests) {
        if (test.method === "GET") {
          const start = Date.now();
          let result: HealthCheckResult;
          try {
            const res = await fetch(test.target, { method: "GET" });
            const latency = Date.now() - start;
            if (res.status === test.expectedStatus) {
              result = { status: "PASS", latencyMs: latency };
            } else {
              result = {
                status: "FAIL",
                latencyMs: latency,
                error: `Expected status ${test.expectedStatus}, got ${res.status}`,
              };
            }
          } catch (err: any) {
            result = {
              status: "FAIL",
              latencyMs: Date.now() - start,
              error: err.message || String(err),
            };
          }
          await this.recordResult(test.id, test.name, result);
          await this.handleIncident(test.id, test.name, result);
          results[test.name] = result;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch/run DB health definitions", e);
    }

    return results;
  }

  private async recordResult(
    definitionId: string | null,
    name: string,
    result: HealthCheckResult,
  ) {
    const prisma = getPrisma(this.env);
    try {
      await prisma.healthTestResult.create({
        data: {
          definitionId: definitionId,
          name: name,
          ok: result.status === "PASS",
          latencyMs: result.latencyMs,
          error: result.error,
          statusCode: result.status === "PASS" ? 200 : 500, // Simplified
        },
      });
    } catch (e) {
      console.error("Failed to record health result", e);
    }
  }

  private async handleIncident(
    definitionId: string | null,
    name: string,
    result: HealthCheckResult,
  ) {
    const prisma = getPrisma(this.env);
    try {
      if (result.status === "FAIL") {
        // Check if active incident exists
        const activeIncident = await prisma.healthIncident.findFirst({
          where: {
            OR: [{ definitionId: definitionId ?? undefined }, { name: name }],
            active: true,
          },
        });

        if (activeIncident) {
          await prisma.healthIncident.update({
            where: { id: activeIncident.id },
            data: { count: { increment: 1 }, lastError: result.error },
          });
        } else {
          await prisma.healthIncident.create({
            data: {
              definitionId: definitionId,
              name: name,
              lastError: result.error,
              active: true,
            },
          });
        }
      } else {
        // Close active incident if passed
        const activeIncident = await prisma.healthIncident.findFirst({
          where: {
            OR: [{ definitionId: definitionId ?? undefined }, { name: name }],
            active: true,
          },
        });
        if (activeIncident) {
          await prisma.healthIncident.update({
            where: { id: activeIncident.id },
            data: { active: false, resolvedAt: new Date() },
          });
        }
      }
    } catch (e) {
      console.error("Failed to handle incident", e);
    }
  }

  async getHistory(limit = 50) {
    const prisma = getPrisma(this.env);
    return prisma.healthTestResult.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { definition: true },
    });
  }

  async getIncidents(activeOnly = true) {
    const prisma = getPrisma(this.env);
    return prisma.healthIncident.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { openedAt: "desc" },
      include: { definition: true },
    });
  }
}
