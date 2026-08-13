import 'server-only'

import ExcelJS from 'exceljs'

export type SheetData = {
  name: string
  /** 1-based row that holds the column headers. */
  headerRow: number
  headers: string[]
  /** Data rows, each aligned to `headers` by index. */
  rows: (string | null)[][]
  /** Spreadsheet row number for each entry in `rows`, for error messages. */
  rowNumbers: number[]
}

/**
 * ExcelJS hands back plain values, dates, formula results and rich text objects.
 * Flatten all of it to a trimmed string, or null when the cell is empty.
 */
function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (typeof value === 'object') {
    const v = value as Record<string, unknown>
    if ('text' in v) return cellText(v.text)
    if ('result' in v) return cellText(v.result)
    if ('hyperlink' in v) return cellText(v.hyperlink)
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((part) => (part as { text?: string }).text ?? '').join('').trim() || null
    }
    if ('error' in v) return null
  }

  const text = String(value).trim()
  return text === '' ? null : text
}

/**
 * Ryan's workbook puts a title banner on rows 1–3 and the real headers on row 4.
 * Rather than hard-coding that, take the row with the most text cells from the
 * first few — it survives someone adding or removing a banner line.
 */
function detectHeaderRow(sheet: ExcelJS.Worksheet): number {
  let best = 1
  let bestScore = -1

  for (let r = 1; r <= Math.min(8, sheet.rowCount); r++) {
    const values = (sheet.getRow(r).values as unknown[]) ?? []
    const texts = values
      .slice(1)
      .map((v) => cellText(v))
      .filter((t): t is string => typeof t === 'string' && t.length > 0)

    // Count DISTINCT values, not cells. A merged title banner reports the same
    // string across every column it spans, which would otherwise tie with — and
    // beat — the real header row below it.
    const score = new Set(texts).size

    // >= so that on a tie the later row wins: headers sit below banners.
    if (score >= bestScore) {
      bestScore = score
      best = r
    }
  }
  return best
}

export async function readWorkbook(buffer: ArrayBuffer, fileName: string): Promise<SheetData[]> {
  const workbook = new ExcelJS.Workbook()

  if (fileName.toLowerCase().endsWith('.csv')) {
    const text = new TextDecoder().decode(buffer)
    // ExcelJS's csv reader wants a stream; parsing a small CSV directly is
    // simpler and avoids a Node stream dependency in a server action.
    return [csvToSheet(text, 'CSV')]
  }

  await workbook.xlsx.load(buffer)

  return workbook.worksheets.map((sheet) => {
    const headerRow = detectHeaderRow(sheet)
    const headerValues = (sheet.getRow(headerRow).values as unknown[]) ?? []
    const headers = headerValues.slice(1).map((v) => cellText(v) ?? '')

    // Trim trailing unnamed columns so the mapping screen isn't full of blanks.
    while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop()

    const rows: (string | null)[][] = []
    const rowNumbers: number[] = []

    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      const values = (sheet.getRow(r).values as unknown[]) ?? []
      const cells = headers.map((_, i) => cellText(values[i + 1]))
      if (cells.every((c) => c === null)) continue
      rows.push(cells)
      rowNumbers.push(r)
    }

    return { name: sheet.name, headerRow, headers, rows, rowNumbers }
  })
}

/** Minimal RFC-4180 CSV reader: handles quotes, escaped quotes and newlines. */
function csvToSheet(text: string, name: string): SheetData {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') inQuotes = true
    else if (char === ',') {
      record.push(field)
      field = ''
    } else if (char === '\n') {
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }

  // Same header heuristic as the spreadsheet path.
  let headerIndex = 0
  let bestCount = -1
  for (let i = 0; i < Math.min(8, records.length); i++) {
    const count = records[i].filter((c) => c.trim() !== '').length
    if (count > bestCount) {
      bestCount = count
      headerIndex = i
    }
  }

  const headers = records[headerIndex]?.map((h) => h.trim()) ?? []
  while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop()

  const rows: (string | null)[][] = []
  const rowNumbers: number[] = []
  for (let i = headerIndex + 1; i < records.length; i++) {
    const cells = headers.map((_, c) => {
      const value = records[i][c]?.trim()
      return value === undefined || value === '' ? null : value
    })
    if (cells.every((c) => c === null)) continue
    rows.push(cells)
    rowNumbers.push(i + 1)
  }

  return { name, headerRow: headerIndex + 1, headers, rows, rowNumbers }
}
