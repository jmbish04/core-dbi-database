import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function jsonStringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ _unserializable: true });
  }
}
export function buildMonitorUrl(
  frontendBase: string,
  requestId: string,
): string {
  const u = new URL(frontendBase.replace(/\/$/, "") + "/");
  u.searchParams.set("requestId", requestId);
  return u.toString();
}
export function buildWsUrl(origin: string, requestId: string): string {
  const u = new URL(origin);
  u.protocol = u.protocol === "http:" ? "ws:" : "wss:";
  u.pathname = `/v1/ws/${requestId}`;
  return u.toString();
}
export function encodeCursor(n: number): string {
  return btoa(String(n));
}
export function decodeCursor(cursor: string | null | undefined): number | null {
  if (!cursor) return null;
  try {
    const n = Number(atob(cursor));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
