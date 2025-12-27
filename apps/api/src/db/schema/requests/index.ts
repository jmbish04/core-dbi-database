import { jsonStringifySafe } from "../../../utils";
import { getPrisma, type RequestKind } from "../../index";

export async function createRequest(
  env: Env,
  reqId: string,
  kind: RequestKind,
  request: Request,
  bodyText?: string,
) {
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => (headers[k] = v));
  const url = new URL(request.url);
  const cf = (request as any).cf ?? null;

  const prisma = getPrisma(env);

  await prisma.request.create({
    data: {
      id: reqId,
      kind,
      method: request.method,
      path: url.pathname,
      query: url.search,
      headersJson: jsonStringifySafe(headers),
      bodyText: bodyText ?? null,
      cfJson: jsonStringifySafe(cf),
      status: "received",
    },
  });

  await prisma.requestMeta.create({
    data: {
      requestId: reqId,
      progress: 0,
    },
  });
}

export async function updateRequestStatus(
  env: Env,
  requestId: string,
  status: string,
  errorText?: string,
) {
  const prisma = getPrisma(env);
  await prisma.request.update({
    where: { id: requestId },
    data: { status, errorText: errorText ?? null },
  });
}

export async function setRequestProgress(
  env: Env,
  requestId: string,
  progress: number,
  stats?: unknown,
) {
  const prisma = getPrisma(env);
  await prisma.requestMeta.upsert({
    where: { requestId },
    create: {
      requestId,
      progress,
      statsJson: stats ? jsonStringifySafe(stats) : null,
    },
    update: {
      updatedAt: new Date(),
      progress,
      statsJson: stats ? jsonStringifySafe(stats) : null,
    },
  });
}

export async function getRequestStatusWithMeta(env: Env, requestId: string) {
  const prisma = getPrisma(env);

  // Efficient fetch using Relation
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { meta: true },
  });

  if (!req) return null;

  return {
    status: req.status,
    error_text: req.errorText,
    progress: req.meta?.progress,
    stats_json: req.meta?.statsJson,
  };
}

export async function queueRequest(env: Env, requestId: string) {
  const prisma = getPrisma(env);
  await prisma.request.update({
    where: { id: requestId },
    data: { status: "queued" },
  });
}
