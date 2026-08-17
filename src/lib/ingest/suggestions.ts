import 'server-only'

import { createHash } from 'node:crypto'

import type { MatchConfidence, SuggestionKind, Supabase } from '@/lib/ingest'

/**
 * Suggestions are proposed writes.
 *
 * `subject_id` set means "patch that row"; null means "insert one". `payload`
 * is column -> value either way. That is the whole model, and it is why a fifth
 * kind costs nothing: `kind` groups and words the review screen rather than
 * forking the code.
 *
 * Accepting a patch goes through apply_gap_fill() — the Phase 5b function — so
 * a night of accepted suggestions is one import_batches row with the Undo
 * button that already exists at the bottom of /admin/import. Nothing new is
 * built for undo.
 */

export type Proposal = {
  kind: SuggestionKind
  confidence: MatchConfidence
  subjectTable: 'activities' | 'contacts' | 'accounts' | 'buildings' | 'opportunities' | 'next_steps'
  /** Null for an insert. */
  subjectId: string | null
  payload: Record<string, unknown>
  rationale: string
  quote?: string | null
  quoteStart?: number | null
  quoteEnd?: number | null
  ingestedItemId?: string | null
  expiresAt?: string | null
}

/**
 * What makes "no" stick.
 *
 * The key is unique across every status, rejected included, so the nightly job
 * cannot re-propose something already turned down — otherwise the same
 * proposals arrive again every night forever and the screen becomes unusable
 * within a month. The payload is hashed into the key rather than compared, so a
 * genuinely *different* proposal about the same record still gets through.
 *
 * Keys are sorted before hashing: JSON.stringify preserves insertion order, and
 * without sorting the same proposal built by two code paths would hash
 * differently and slip past the constraint.
 */
export function dedupeKey(proposal: Pick<Proposal, 'kind' | 'subjectTable' | 'subjectId' | 'payload'>): string {
  const canonical = JSON.stringify(
    Object.keys(proposal.payload)
      .sort()
      .map((key) => [key, proposal.payload[key]]),
  )
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 16)
  return `${proposal.kind}|${proposal.subjectTable}|${proposal.subjectId ?? 'new'}|${hash}`
}

/**
 * Write proposals, skipping any that have been seen before.
 *
 * `ignoreDuplicates` is doing the real work: a conflict on dedupe_key means
 * this exact proposal already exists — open, accepted, or explicitly rejected —
 * and in all three cases the right thing is to say nothing.
 */
export async function propose(
  supabase: Supabase,
  proposals: Proposal[],
): Promise<{ written: number; error?: string }> {
  if (proposals.length === 0) return { written: 0 }

  const rows = proposals.map((p) => ({
    kind: p.kind,
    confidence: p.confidence,
    subject_table: p.subjectTable,
    subject_id: p.subjectId,
    payload: p.payload as never,
    rationale: p.rationale,
    quote: p.quote ?? null,
    quote_start: p.quoteStart ?? null,
    quote_end: p.quoteEnd ?? null,
    ingested_item_id: p.ingestedItemId ?? null,
    dedupe_key: dedupeKey(p),
    expires_at: p.expiresAt ?? null,
  }))

  const { data, error } = await supabase
    .from('ingest_suggestions')
    .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('id')

  if (error) return { written: 0, error: error.message }
  return { written: data?.length ?? 0 }
}

export type AcceptResult = {
  ok: boolean
  error?: string
  batchId?: string
  patched: number
  inserted: number
  failed: { id: string; message: string }[]
}

/**
 * Accept a set of suggestions, as one undoable batch.
 *
 * Every patch goes through apply_gap_fill(), which refuses any column outside
 * gap_fill_allows(), journals the before and after of each field, and writes
 * one audit row per record. Every insert is stamped with the batch id, which is
 * how rollbackImport finds it. Both halves end up under the same
 * import_batches row, so one Undo button takes back the whole night.
 */
export async function acceptSuggestions(
  supabase: Supabase,
  ids: string[],
  decidedBy: string,
): Promise<AcceptResult> {
  const empty: AcceptResult = { ok: true, patched: 0, inserted: 0, failed: [] }
  if (ids.length === 0) return empty

  const { data: suggestions, error: readError } = await supabase
    .from('ingest_suggestions')
    .select('*')
    .in('id', ids)
    .eq('status', 'open')

  if (readError) return { ...empty, ok: false, error: readError.message }
  if (!suggestions || suggestions.length === 0) return empty

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      source_tab: `Ingest suggestions · ${new Date().toISOString().slice(0, 10)}`,
      file_name: null,
      row_count: suggestions.length,
      status: 'committed',
      imported_by: decidedBy,
      committed_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    return { ...empty, ok: false, error: batchError?.message ?? 'Could not open an import batch.' }
  }

  const result: AcceptResult = { ok: true, batchId: batch.id, patched: 0, inserted: 0, failed: [] }
  const accepted: string[] = []

  for (const suggestion of suggestions) {
    const payload = suggestion.payload as Record<string, unknown>

    try {
      if (suggestion.subject_id) {
        const { error } = await supabase.rpc('apply_gap_fill', {
          p_table: suggestion.subject_table,
          p_record_id: suggestion.subject_id,
          p_values: payload as never,
          p_batch_id: batch.id,
        })
        if (error) throw new Error(error.message)
        result.patched += 1
      } else {
        const table = suggestion.subject_table as 'contacts' | 'next_steps'
        const { error } = await supabase
          .from(table)
          .insert({ ...payload, import_batch_id: batch.id } as never)
        if (error) throw new Error(error.message)
        result.inserted += 1
      }
      accepted.push(suggestion.id)
    } catch (caught) {
      result.failed.push({
        id: suggestion.id,
        message: caught instanceof Error ? caught.message : String(caught),
      })
    }
  }

  if (accepted.length > 0) {
    await supabase
      .from('ingest_suggestions')
      .update({
        status: 'accepted',
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
        applied_batch_id: batch.id,
      })
      .in('id', accepted)
  }

  // A batch that wrote nothing would sit in the import list offering an Undo
  // for changes that never happened.
  if (accepted.length === 0) {
    await supabase.from('import_batches').delete().eq('id', batch.id)
    result.batchId = undefined
  } else {
    await supabase.from('import_batches').update({ row_count: accepted.length }).eq('id', batch.id)
  }

  return result
}

/** Rejecting writes nothing but the decision — which the dedupe key then makes
 *  permanent, so the same proposal never comes back. */
export async function rejectSuggestions(
  supabase: Supabase,
  ids: string[],
  decidedBy: string,
): Promise<{ ok: boolean; error?: string; rejected: number }> {
  if (ids.length === 0) return { ok: true, rejected: 0 }

  const { data, error } = await supabase
    .from('ingest_suggestions')
    .update({ status: 'rejected', decided_by: decidedBy, decided_at: new Date().toISOString() })
    .in('id', ids)
    .eq('status', 'open')
    .select('id')

  if (error) return { ok: false, error: error.message, rejected: 0 }
  return { ok: true, rejected: data?.length ?? 0 }
}
