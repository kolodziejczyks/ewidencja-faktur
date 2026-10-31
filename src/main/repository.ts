/** All reads and writes of invoices, suppliers, categories and files. */

import { computeFlags, normalizeInvoiceNumber } from '@shared/insights'
import { normalizeNip } from '@shared/nip'
import type { Category, Invoice, InvoiceInput, PaymentMethod, StoredFile, Supplier } from '@shared/types'
import { getDb, nowIso } from './db'

interface InvoiceRow {
  id: number
  kind: 'invoice' | 'note'
  number: string
  supplier_id: number | null
  supplier_name: string | null
  supplier_nip: string | null
  issue_date: string
  due_date: string | null
  gross_amount: number | null
  net_amount: number | null
  category_id: number | null
  category_name: string | null
  payment_method: PaymentMethod | null
  note: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

interface FileRow {
  id: number
  invoice_id: number | null
  stored_path: string
  original_name: string
  mime: string
  size: number
  sha256: string
  created_at: string
}

const SELECT_INVOICES = `
  SELECT i.*, s.name AS supplier_name, s.nip AS supplier_nip, c.name AS category_name
  FROM invoices i
  LEFT JOIN suppliers s ON s.id = i.supplier_id
  LEFT JOIN categories c ON c.id = i.category_id`

export function toStoredFile(row: FileRow): StoredFile {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    originalName: row.original_name,
    mime: row.mime,
    size: row.size,
    sha256: row.sha256,
    createdAt: row.created_at
  }
}

function toInvoice(row: InvoiceRow, files: StoredFile[]): Invoice {
  return {
    id: row.id,
    kind: row.kind,
    number: row.number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name ?? '',
    supplierNip: row.supplier_nip ?? '',
    issueDate: row.issue_date,
    dueDate: row.due_date,
    grossAmount: row.gross_amount,
    netAmount: row.net_amount,
    categoryId: row.category_id,
    categoryName: row.category_name ?? '',
    paymentMethod: row.payment_method,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    files,
    flags: []
  }
}

function loadInvoices(where: string, ...params: (string | number)[]): Invoice[] {
  const db = getDb()
  const rows = db.prepare(`${SELECT_INVOICES} WHERE ${where} ORDER BY i.issue_date DESC, i.id DESC`).all(...params) as unknown as InvoiceRow[]
  const fileRows = db.prepare('SELECT * FROM files WHERE invoice_id IS NOT NULL ORDER BY id').all() as unknown as FileRow[]
  const filesByInvoice = new Map<number, StoredFile[]>()
  for (const f of fileRows) {
    filesByInvoice.set(f.invoice_id!, [...(filesByInvoice.get(f.invoice_id!) ?? []), toStoredFile(f)])
  }
  return rows.map((r) => toInvoice(r, filesByInvoice.get(r.id) ?? []))
}

export function listInvoices(): Invoice[] {
  const invoices = loadInvoices('i.deleted_at IS NULL')
  const flags = computeFlags(invoices)
  for (const inv of invoices) inv.flags = flags.get(inv.id) ?? []
  return invoices
}

export function listDeletedInvoices(): Invoice[] {
  return loadInvoices('i.deleted_at IS NOT NULL')
}

export function getInvoice(id: number): Invoice | null {
  return listInvoices().find((i) => i.id === id) ?? loadInvoices('i.id = ?', id)[0] ?? null
}

/** Finds an existing supplier by NIP (preferred) or exact name, creating one when needed. */
function upsertSupplier(name: string, nipRaw: string): number | null {
  const db = getDb()
  const nip = normalizeNip(nipRaw)
  const cleanName = name.trim()
  if (!cleanName && !nip) return null

  const byNip = nip ? (db.prepare('SELECT id, name FROM suppliers WHERE nip = ?').get(nip) as { id: number; name: string } | undefined) : undefined
  if (byNip) {
    if (cleanName && cleanName !== byNip.name) db.prepare('UPDATE suppliers SET name = ? WHERE id = ?').run(cleanName, byNip.id)
    return byNip.id
  }
  const byName = db.prepare('SELECT id, nip FROM suppliers WHERE lower(name) = lower(?)').get(cleanName) as { id: number; nip: string } | undefined
  if (byName && (!nip || !byName.nip)) {
    if (nip) db.prepare('UPDATE suppliers SET nip = ? WHERE id = ?').run(nip, byName.id)
    return byName.id
  }
  const result = db.prepare('INSERT INTO suppliers (name, nip, created_at) VALUES (?, ?, ?)').run(cleanName || nip, nip, nowIso())
  return Number(result.lastInsertRowid)
}

export function saveInvoice(input: InvoiceInput): Invoice {
  const db = getDb()
  const now = nowIso()
  db.exec('BEGIN')
  try {
    const supplierId = upsertSupplier(input.supplierName, input.supplierNip)
    const values = [
      input.kind,
      input.number.trim(),
      supplierId,
      input.issueDate,
      input.dueDate,
      input.grossAmount,
      input.netAmount,
      input.categoryId,
      input.paymentMethod,
      input.note
    ] as const
    let id = input.id
    if (id) {
      db.prepare(
        `UPDATE invoices SET kind = ?, number = ?, supplier_id = ?, issue_date = ?, due_date = ?, gross_amount = ?,
         net_amount = ?, category_id = ?, payment_method = ?, note = ?, updated_at = ? WHERE id = ?`
      ).run(...values, now, id)
    } else {
      // The legacy paid/paid_date columns stay filled in: every recorded invoice is a paid one.
      const result = db
        .prepare(
          `INSERT INTO invoices (kind, number, supplier_id, issue_date, due_date, gross_amount, net_amount, category_id,
           payment_method, note, paid, paid_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
        )
        .run(...values, input.issueDate, now, now)
      id = Number(result.lastInsertRowid)
    }
    for (const fileId of input.fileIds) {
      db.prepare('UPDATE files SET invoice_id = ? WHERE id = ? AND (invoice_id IS NULL OR invoice_id = ?)').run(id, fileId, id)
    }
    db.exec('COMMIT')
    return getInvoice(id)!
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function softDeleteInvoice(id: number): void {
  getDb().prepare('UPDATE invoices SET deleted_at = ? WHERE id = ?').run(nowIso(), id)
}

export function restoreInvoice(id: number): void {
  getDb().prepare('UPDATE invoices SET deleted_at = NULL WHERE id = ?').run(id)
}

/** Another active invoice from the same supplier with the same number, if any. */
export function findDuplicate(input: { id?: number; supplierNip: string; supplierName: string; number: string }): Invoice | null {
  const number = normalizeInvoiceNumber(input.number)
  if (!number) return null
  const nip = normalizeNip(input.supplierNip)
  const name = input.supplierName.trim().toLowerCase()
  return (
    listInvoices().find(
      (inv) =>
        inv.id !== input.id &&
        normalizeInvoiceNumber(inv.number) === number &&
        ((nip && inv.supplierNip === nip) || (name && inv.supplierName.toLowerCase() === name))
    ) ?? null
  )
}

export function listSuppliers(): Supplier[] {
  return getDb().prepare('SELECT id, name, nip FROM suppliers ORDER BY name COLLATE NOCASE').all() as unknown as Supplier[]
}

export function listCategories(): Category[] {
  return getDb()
    .prepare('SELECT id, name, sort_order AS sortOrder FROM categories ORDER BY sort_order, name')
    .all() as unknown as Category[]
}

export function addCategory(name: string): Category {
  const db = getDb()
  const { maxOrder } = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM categories').get() as { maxOrder: number }
  const result = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)').run(name.trim(), maxOrder + 1)
  return { id: Number(result.lastInsertRowid), name: name.trim(), sortOrder: maxOrder + 1 }
}

export function renameCategory(id: number, name: string): void {
  getDb().prepare('UPDATE categories SET name = ? WHERE id = ?').run(name.trim(), id)
}

// ---------- files ----------

export function insertFile(file: Omit<FileRow, 'id' | 'invoice_id' | 'created_at'>): StoredFile {
  const db = getDb()
  const createdAt = nowIso()
  const result = db
    .prepare('INSERT INTO files (stored_path, original_name, mime, size, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(file.stored_path, file.original_name, file.mime, file.size, file.sha256, createdAt)
  return toStoredFile({ ...file, id: Number(result.lastInsertRowid), invoice_id: null, created_at: createdAt })
}

export function getFileRow(id: number): FileRow | null {
  return (getDb().prepare('SELECT * FROM files WHERE id = ?').get(id) as unknown as FileRow | undefined) ?? null
}

/** An active invoice that already has a file with this content. */
export function invoiceWithFileHash(sha256: string): Invoice | null {
  const row = getDb()
    .prepare(
      `SELECT f.invoice_id AS id FROM files f JOIN invoices i ON i.id = f.invoice_id
       WHERE f.sha256 = ? AND i.deleted_at IS NULL LIMIT 1`
    )
    .get(sha256) as { id: number } | undefined
  return row ? getInvoice(row.id) : null
}

/** Rows to clean up: files never attached to an invoice, and invoices in the bin for longer than `days`. */
export function findExpired(days: number): { files: FileRow[]; invoiceIds: number[] } {
  const db = getDb()
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const invoiceIds = (db.prepare('SELECT id FROM invoices WHERE deleted_at IS NOT NULL AND deleted_at < ?').all(cutoff) as { id: number }[]).map(
    (r) => r.id
  )
  const files = db
    .prepare(
      `SELECT * FROM files WHERE (invoice_id IS NULL AND created_at < ?)
       OR invoice_id IN (SELECT id FROM invoices WHERE deleted_at IS NOT NULL AND deleted_at < ?)`
    )
    .all(dayAgo, cutoff) as unknown as FileRow[]
  return { files, invoiceIds }
}

export function deleteRows(fileIds: number[], invoiceIds: number[]): void {
  const db = getDb()
  db.exec('BEGIN')
  for (const id of fileIds) db.prepare('DELETE FROM files WHERE id = ?').run(id)
  for (const id of invoiceIds) db.prepare('DELETE FROM invoices WHERE id = ?').run(id)
  db.exec('COMMIT')
}

export function isStoredPathUsed(storedPath: string): boolean {
  return getDb().prepare('SELECT 1 FROM files WHERE stored_path = ? LIMIT 1').get(storedPath) != null
}

export function invoiceLabel(inv: Invoice): string {
  return [inv.supplierName, inv.number && `nr ${inv.number}`].filter(Boolean).join(', ') || 'bez nazwy'
}
