import { jsonStringifySafe } from "../../../utils";
import { getPrisma } from "../../index";

export async function insertResult(
  env: Env,
  requestId: string,
  entity: string,
  row: unknown,
  source?: string,
  canonicalKey?: string,
) {
  const prisma = getPrisma(env);
  await prisma.requestResult.create({
    data: {
      requestId,
      entity,
      source: source ?? null,
      canonicalKey: canonicalKey ?? null,
      rowJson: jsonStringifySafe(row),
    },
  });
}

export async function getPaginatedResults(
  env: Env,
  requestId: string,
  entity: string,
  afterId: number,
  limit: number,
) {
  const prisma = getPrisma(env);

  const results = await prisma.requestResult.findMany({
    where: {
      requestId,
      entity,
      id: { gt: afterId },
    },
    orderBy: { id: "asc" },
    take: limit,
    select: {
      id: true,
      rowJson: true,
    },
  });

  return results;
}
