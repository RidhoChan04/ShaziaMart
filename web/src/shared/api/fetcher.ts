import { ErrorCode } from "./gen/shaziaMartAPI.schemas";

export type ApiErrorCode = ErrorCode | "NETWORK";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly detail?: string;
  readonly body?: unknown;

  constructor(init: {
    status: number;
    code: ApiErrorCode;
    message?: string;
    detail?: string;
    body?: unknown;
  }) {
    super(init.message ?? init.detail ?? init.code);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    if (init.detail !== undefined) this.detail = init.detail;
    if (init.body !== undefined) this.body = init.body;
  }
}

const knownCodes: readonly string[] = Object.values(ErrorCode);

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && knownCodes.includes(value);
}

async function readBody(res: Response, contentType: string): Promise<unknown> {
  const text = await res.text();
  if (text === "") return undefined;
  if (contentType.includes("json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

function toApiError(
  status: number,
  contentType: string,
  body: unknown,
): ApiError {
  if (
    contentType.includes("application/problem+json") &&
    typeof body === "object" &&
    body !== null
  ) {
    const p = body as { code?: unknown; detail?: unknown; title?: unknown };
    return new ApiError({
      status,
      code: isErrorCode(p.code) ? p.code : "INTERNAL",
      ...(typeof p.title === "string" ? { message: p.title } : {}),
      ...(typeof p.detail === "string" ? { detail: p.detail } : {}),
      body,
    });
  }
  return new ApiError({ status, code: "INTERNAL", body });
}

/**
 * Mutator orval (httpClient: fetch). Sukses (2xx) mengembalikan body hasil parse
 * (`undefined` bila kosong, mis. 204); respons non-2xx dilempar sebagai ApiError.
 */
export const customFetch = async <T>(
  url: string,
  init: RequestInit,
): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (cause) {
    throw new ApiError({
      status: 0,
      code: "NETWORK",
      message:
        cause instanceof Error ? cause.message : "Gagal terhubung ke server",
    });
  }

  const contentType = res.headers.get("content-type") ?? "";
  const body = await readBody(res, contentType);
  if (!res.ok) throw toApiError(res.status, contentType, body);
  return body as T;
};

/** Dibaca orval: tipe error default hook yang dihasilkan. */
export type ErrorType<_E> = ApiError;
