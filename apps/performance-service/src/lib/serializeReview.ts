import type { schema } from "@hrm/db";

type ReviewRow = (typeof schema)["reviews"]["$inferSelect"];

/** `rating` is a Postgres `numeric` column — the driver returns it as a string. */
export function serializeReview(row: ReviewRow) {
  return { ...row, rating: row.rating === null ? null : Number(row.rating) };
}
