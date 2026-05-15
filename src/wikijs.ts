import { config } from "./config.js";

const GRAPHQL_URL = `${config.wikijs.url}/graphql`;
const AUTH_HEADER = `Bearer ${config.wikijs.apiKey}`;

export interface GraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

export interface WikiJsResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T | null;
  errors: GraphQLError[] | null;
}

/**
 * Low-level GraphQL call against the Wiki.js API. The caller supplies the query
 * (or mutation) and variables; this just attaches the API key, posts JSON, and
 * parses out `data` / `errors`. Network or HTTP errors throw; GraphQL errors
 * surface in the returned `errors` array.
 */
export async function wikijsRequest<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<WikiJsResponse<T>> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: AUTH_HEADER,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });
  const ct = res.headers.get("content-type") ?? "";
  let body: unknown;
  if (ct.includes("application/json")) {
    body = await res.json();
  } else {
    body = { errors: [{ message: `Non-JSON response: HTTP ${res.status} ${await res.text()}` }] };
  }
  const parsed = body as { data?: T; errors?: GraphQLError[] };
  return {
    status: res.status,
    ok: res.ok && !parsed.errors,
    data: parsed.data ?? null,
    errors: parsed.errors ?? null,
  };
}

/** Render a Wiki.js response as a single text payload suitable for an MCP tool result. */
export function renderResponse(r: WikiJsResponse): string {
  if (r.errors && r.errors.length > 0) {
    return `GraphQL errors:\n${JSON.stringify(r.errors, null, 2)}`;
  }
  return JSON.stringify(r.data, null, 2);
}

/**
 * Wiki.js wraps mutations in a ResponseStatus shape:
 *   { responseResult: { succeeded, errorCode, slug, message }, ... }
 * `data` may live a few levels deep, e.g. data.pages.create.responseResult.
 * Returns null if the mutation succeeded; otherwise an error message.
 */
export function extractMutationError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  for (const v of Object.values(payload as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const obj = v as Record<string, unknown>;
    if ("responseResult" in obj && obj.responseResult && typeof obj.responseResult === "object") {
      const rr = obj.responseResult as Record<string, unknown>;
      if (rr.succeeded === false) {
        return `${(rr.message as string) ?? "operation failed"} (${(rr.slug as string) ?? rr.errorCode ?? "unknown"})`;
      }
    }
    const nested = extractMutationError(obj);
    if (nested) return nested;
  }
  return null;
}
