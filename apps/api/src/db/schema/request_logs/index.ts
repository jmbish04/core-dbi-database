import { jsonStringifySafe } from "../../../utils";
import { getPrisma } from "../../index";

export async function appendLog(
  env: Env,
  requestId: string,
  level: "debug" | "info" | "warn" | "error",
  message: string,
  data?: unknown,
) {
  const prisma = getPrisma(env);
  await prisma.requestLog.create({
    data: {
      requestId,
      level,
      message,
      dataJson: data ? jsonStringifySafe(data) : null,
    },
  });
}

export async function getLogs(
  env: Env,
  requestId: string,
  limit: number = 200,
) {
  const prisma = getPrisma(env);
  return await prisma.requestLog.findMany({
    where: { requestId },
    orderBy: { id: "asc" },
    take: limit,
    select: {
      createdAt: true, // mapped to 'ts' in API usually, need to check format
      level: true,
      message: true,
      dataJson: true,
    },
  });
}
