import type { Context } from "hono";
import { asc, desc, type AnyColumn, type SQL } from "drizzle-orm";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** Unwraps a `select({ count: ... })` result row — `noUncheckedIndexedAccess` treats array access as possibly-empty even though `count(*)` always returns exactly one row. */
export function countTotal(rows: { count: number }[]): number {
  return rows[0]?.count ?? 0;
}

/** Offset pagination for bounded resources (docs/architecture/05-api-design.md). */
export function parsePagination(c: Context): { page: number; perPage: number; offset: number } {
  const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
  const perPage = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(c.req.query("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  );
  return { page, perPage, offset: (page - 1) * perPage };
}

/**
 * Parses `?sort=-created_at,last_name` against an allow-listed field->column
 * map (never arbitrary column sorting, per docs/architecture/05-api-design.md)
 * and returns drizzle `orderBy` expressions. Unknown fields are silently
 * dropped rather than erroring, so an old bookmarked URL degrades gracefully.
 */
export function parseSort(c: Context, allowed: Record<string, AnyColumn>, fallback: SQL | AnyColumn): SQL[] {
  const raw = c.req.query("sort");
  if (!raw) return [fallback as unknown as SQL];

  const clauses = raw
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean)
    .map((field) => {
      const descending = field.startsWith("-");
      const key = descending ? field.slice(1) : field;
      const column = allowed[key];
      if (!column) return null;
      return descending ? desc(column) : asc(column);
    })
    .filter((clause): clause is SQL => clause !== null);

  return clauses.length > 0 ? clauses : [fallback as unknown as SQL];
}
