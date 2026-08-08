import { z } from "zod";

/** Envelope shapes from docs/architecture/05-api-design.md — every response carries requestId. */
export interface ApiSuccess<T> {
  data: T;
  requestId: string;
}

export interface ApiListSuccess<T> {
  data: T[];
  pagination:
    | { type: "cursor"; nextCursor: string | null }
    | { type: "offset"; page: number; perPage: number; total: number };
  requestId: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  requestId: z.string(),
});
