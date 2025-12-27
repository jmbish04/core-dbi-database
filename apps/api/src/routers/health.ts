import { zValidator } from "@hono/zod-validator";
import { getPrisma } from "../db";
import { Hono } from "hono";
import { z } from "zod";
import { HealthService } from "../health/service";

export const healthRouter = new Hono<{ Bindings: Env }>();

healthRouter.post("/run", async (c) => {
  const service = new HealthService(c.env);
  const results = await service.runAllChecks();
  return c.json({ results });
});

healthRouter.get("/history", async (c) => {
  const service = new HealthService(c.env);
  const limit = Number(c.req.query("limit")) || 20;
  const history = await service.getHistory(limit);
  return c.json({ history });
});

healthRouter.get("/incidents", async (c) => {
  const service = new HealthService(c.env);
  const activeOnly = c.req.query("active") !== "false";
  const incidents = await service.getIncidents(activeOnly);
  return c.json({ incidents });
});

const testDefinitionSchema = z.object({
  name: z.string(),
  target: z.string().url(),
  method: z.enum(["GET", "POST"]).default("GET"),
  expectedStatus: z.number().default(200),
  frequencySeconds: z.number().default(60),
  criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

healthRouter.post(
  "/tests",
  zValidator("json", testDefinitionSchema),
  async (c) => {
    const data = c.req.valid("json");
    const prisma = getPrisma(c.env);

    try {
      const test = await prisma.healthTestDefinition.create({
        data: {
          name: data.name,
          target: data.target,
          method: data.method,
          expectedStatus: data.expectedStatus,
          frequencySeconds: data.frequencySeconds,
          criticality: data.criticality,
          enabled: true,
        },
      });
      return c.json({ test }, 201);
    } catch (e: any) {
      return c.json({ error: e.message }, 400);
    }
  },
);

healthRouter.get("/tests", async (c) => {
  const prisma = getPrisma(c.env);
  const tests = await prisma.healthTestDefinition.findMany();
  return c.json({ tests });
});
