import { timingSafeEqual } from "node:crypto";
import type { HttpRequest, HttpResponseInit } from "@azure/functions";

interface JsonResponseOptions {
  cache?: "public-state" | "no-store";
}

export function jsonResponse(
  body: unknown,
  status = 200,
  options: JsonResponseOptions = {},
): HttpResponseInit {
  const cacheControl =
    options.cache === "public-state" ? "public, max-age=60" : "no-store";

  return {
    status,
    jsonBody: body,
    headers: {
      "Cache-Control": cacheControl,
    },
  };
}

export function requireAdminSecret(request: HttpRequest): HttpResponseInit | undefined {
  const configuredSecret = process.env.ADMIN_SECRET;

  if (!configuredSecret) {
    console.error("ADMIN_SECRET is not configured for an organiser endpoint.");
    return jsonResponse({ message: "Valid organiser credentials are required." }, 401);
  }

  const suppliedSecret = request.headers.get("x-admin-secret");

  if (!suppliedSecret || !secretsMatch(suppliedSecret, configuredSecret)) {
    return jsonResponse({ message: "Valid organiser credentials are required." }, 401);
  }

  return undefined;
}

function secretsMatch(suppliedSecret: string, configuredSecret: string): boolean {
  const supplied = Buffer.from(suppliedSecret);
  const configured = Buffer.from(configuredSecret);

  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

export async function parseJsonBody(request: HttpRequest): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return {};
    }

    return body as Record<string, unknown>;
  } catch {
    return {};
  }
}
