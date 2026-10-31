/** Copying imported files into the app's own folder and reading them back. */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import mammoth from 'mammoth'
import type { DocxContent, ImportResult } from '@shared/types'
import { documentsDir } from './paths'
import { findExpired, deleteRows, getFileRow, insertFile, invoiceLabel, invoiceWithFileHash, isStoredPathUsed } from './repository'

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

export const SUPPORTED_EXTENSIONS = Object.keys(MIME_BY_EXTENSION).map((e) => e.slice(1))

export class UnsupportedFileError extends Error {
  constructor(public readonly fileName: string) {
    super(`Nieobsługiwany rodzaj pliku: ${fileName}`)
  }
}

function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(-120)
}

export function importFile(sourcePath: string): ImportResult {
  const ext = extname(sourcePath).toLowerCase()
  const mime = MIME_BY_EXTENSION[ext]
  if (!mime) throw new UnsupportedFileError(basename(sourcePath))

  const content = readFileSync(sourcePath)
  const sha256 = createHash('sha256').update(content).digest('hex')
  const existing = invoiceWithFileHash(sha256)

  const month = new Date().toISOString().slice(0, 7)
  const targetDir = join(documentsDir(), month)
  mkdirSync(targetDir, { recursive: true })
  const target = join(targetDir, `${sha256.slice(0, 8)}-${safeFileName(basename(sourcePath))}`)
  if (!existsSync(target)) copyFileSync(sourcePath, target)

  const file = insertFile({
    stored_path: relative(documentsDir(), target),
    original_name: basename(sourcePath),
    mime,
    size: statSync(target).size,
    sha256
  })
  return { file, alreadyAttachedTo: existing ? { invoiceId: existing.id, label: invoiceLabel(existing) } : null }
}

export function absolutePathOf(fileId: number): string {
  const row = getFileRow(fileId)
  if (!row) throw new Error(`Nie ma pliku o numerze ${fileId}`)
  return join(documentsDir(), row.stored_path)
}

export function readStoredFile(fileId: number): Uint8Array {
  return new Uint8Array(readFileSync(absolutePathOf(fileId)))
}

export async function readDocx(fileId: number): Promise<DocxContent> {
  const path = absolutePathOf(fileId)
  const [html, text] = await Promise.all([mammoth.convertToHtml({ path }), mammoth.extractRawText({ path })])
  return { html: html.value, text: text.value }
}

/** Permanently removes invoices that sat in the bin for 30 days and files that were never saved. */
export function purgeExpired(): void {
  const { files, invoiceIds } = findExpired(30)
  if (files.length === 0 && invoiceIds.length === 0) return
  deleteRows(
    files.map((f) => f.id),
    invoiceIds
  )
  // The same content imported twice shares one stored copy, so only delete copies nothing points to any more.
  for (const path of new Set(files.map((f) => f.stored_path))) {
    if (!isStoredPathUsed(path)) rmSync(join(documentsDir(), path), { force: true })
  }
}
