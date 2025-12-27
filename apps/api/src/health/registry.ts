export interface HealthCheckResult {
  status: "PASS" | "FAIL" | "WARN";
  latencyMs: number;
  metadata?: any;
  error?: string;
}

export interface HealthCheck {
  id: string; // Unique identifier for the check
  name: string; // Human readable name
  description: string;
  fn: (env: Env) => Promise<HealthCheckResult>;
}

export const HEALTH_CHECKS: HealthCheck[] = [
  {
    id: "system-self",
    name: "System Self Check",
    description: "Verifies the health service itself is operational",
    fn: async (env) => {
      const start = Date.now();
      return {
        status: "PASS",
        latencyMs: Date.now() - start,
        metadata: {
          timestamp: new Date().toISOString(),
          region: (env as any).CF_REGION || "unknown",
        },
      };
    },
  },
];
