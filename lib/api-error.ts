import { NextResponse } from "next/server";

/**
 * Consistent, typed JSON errors for route handlers. Every API surface returns
 * the same shape — `{ error: { code, message } }` — with the right HTTP status,
 * and internal failures never leak their details to clients.
 *
 * Usage:
 *   export const POST = handleRoute(async (req) => {
 *     const body = await req.json();
 *     if (!body.email) throw new ApiError("bad_request", "email is required");
 *     ...
 *     return NextResponse.json({ ok: true });
 *   });
 */

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

/** Build a typed JSON error response directly. */
export function apiError(code: ApiErrorCode, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status: STATUS_BY_CODE[code] },
  );
}

/**
 * Wrap a route handler so thrown `ApiError`s become typed JSON responses and
 * any other thrown error becomes a generic 500 — clients never see internals.
 */
export function handleRoute<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response> | Response,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return apiError(err.code, err.message);
      }
      console.error("Unhandled route error:", err);
      return apiError("internal", "Something went wrong.");
    }
  };
}
