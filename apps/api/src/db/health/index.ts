import { getPrisma } from "../index";

export async function checkDatabaseHealth(env: Env) {
  const prisma = getPrisma(env);
  // Simple query to verify connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "OK" };
  } catch (e) {
    return { status: "FAILURE", error: String(e) };
  }
}
