/**
 * CSV export.
 *
 * These files land in Excel on a laptop that has been running the business off
 * a Google Sheet for years, so the output has to be boring and correct:
 * RFC-4180 quoting, no smart formatting, raw numbers rather than "$12,000" so
 * a column can still be summed.
 */

export type Column<T> = {
  header: string
  /** Return a raw value. Numbers stay numbers so Excel can add them up. */
  value: (row: T) => string | number | null | undefined
}

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  // Quote if the value contains a delimiter, a quote or a newline; double any
  // quote inside. Leading/trailing spaces are quoted too, or Excel eats them.
  if (/[",\r\n]/.test(text) || text !== text.trim()) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => cell(c.value(row))).join(','))
  }
  // CRLF, because that is what Excel expects from a .csv on Windows and macOS
  // handles it fine either way.
  return `${lines.join('\r\n')}\r\n`
}

/**
 * A CSV file response. The BOM is there so Excel opens it as UTF-8 rather than
 * mangling the em-dashes and accented names that are all over this data.
 */
export function csvResponse(filename: string, body: string): Response {
  return new Response(`﻿${body}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

/** beales-revenue-2026-08-13.csv */
export function csvFilename(report: string): string {
  return `beales-${report}-${new Date().toISOString().slice(0, 10)}.csv`
}
