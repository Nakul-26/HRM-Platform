import { stringify } from "csv-stringify/sync";

export interface CsvColumn<T> {
  key: keyof T & string;
  header: string;
}

/** CSV-encodes `rows` with a header row, escaping/quoting per RFC 4180 via csv-stringify. */
export function toCsv<T extends object>(rows: T[], columns: CsvColumn<T>[]): string {
  return stringify(rows, {
    header: true,
    columns: columns.map((c) => ({ key: c.key, header: c.header })),
  });
}
