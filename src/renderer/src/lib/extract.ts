/** Gets plain text out of any supported document so the invoice parser can read it. */

import type { StoredFile } from '@shared/types'
import { canvasToPng, extractPdfText, firstPageAsPng, loadPdf } from './pdf'

export type TextSource = 'pdf' | 'ocr' | 'docx'

/** Below this many letters the PDF is treated as a scan and read with OCR instead. */
const MIN_TEXT_LAYER_LETTERS = 40
/** Target length of the longer side of an image handed to OCR. */
const OCR_MAX_SIDE = 2400

export const isPdf = (f: StoredFile) => f.mime === 'application/pdf'
export const isImage = (f: StoredFile) => f.mime.startsWith('image/')
export const isDocx = (f: StoredFile) => f.mime.includes('wordprocessingml')

/** Reading never blocks the user for long: after this the form is simply left for manual entry. */
const EXTRACT_TIMEOUT_MS = 90_000

export function extractText(file: StoredFile, bytes: Uint8Array): Promise<{ text: string; source: TextSource }> {
  return Promise.race([
    extract(file, bytes),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Odczyt trwał zbyt długo')), EXTRACT_TIMEOUT_MS))
  ])
}

async function extract(file: StoredFile, bytes: Uint8Array): Promise<{ text: string; source: TextSource }> {
  if (isPdf(file)) {
    const pdf = await loadPdf(bytes)
    try {
      const text = await extractPdfText(pdf)
      if ((text.match(/\p{L}/gu) ?? []).length >= MIN_TEXT_LAYER_LETTERS) return { text, source: 'pdf' }
      return { text: await window.api.ocrImage(await firstPageAsPng(pdf)), source: 'ocr' }
    } finally {
      void pdf.loadingTask.destroy()
    }
  }
  if (isImage(file)) {
    return { text: await window.api.ocrImage(await imageForOcr(bytes, file.mime)), source: 'ocr' }
  }
  if (isDocx(file)) {
    return { text: (await window.api.readDocx(file.id)).text, source: 'docx' }
  }
  return { text: '', source: 'pdf' }
}

/**
 * Decodes the photo (respecting its rotation from the phone) and brings it to a size OCR handles well:
 * huge phone photos are scaled down, small screenshots/scans scaled up so small print stays readable.
 */
async function imageForOcr(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: mime }))
  const scale = Math.min(3, OCR_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvasToPng(canvas)
}
