/** PDF rendering and text extraction with pdf.js (runs in the UI, which has a real canvas). */

import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export function loadPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  // pdf.js takes ownership of the buffer, so give it a copy.
  return pdfjs.getDocument({ data: bytes.slice() }).promise
}

export async function renderPage(pdf: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, scale: number): Promise<void> {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvas, viewport }).promise
}

interface PositionedText {
  str: string
  x: number
  y: number
  width: number
}

/**
 * Rebuilds the text of the first pages line by line. Items on the same baseline are joined;
 * a wide horizontal gap (e.g. between the seller and buyer columns) becomes two spaces,
 * which the invoice parser understands as a column break.
 */
export async function extractPdfText(pdf: PDFDocumentProxy, maxPages = 2): Promise<string> {
  const pages: string[] = []
  for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    const items: PositionedText[] = []
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      items.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width })
    }
    items.sort((a, b) => b.y - a.y || a.x - b.x)

    const lines: PositionedText[][] = []
    for (const item of items) {
      const line = lines[lines.length - 1]
      if (line && Math.abs(line[0].y - item.y) < 3) line.push(item)
      else lines.push([item])
    }
    pages.push(
      lines
        .map((line) => {
          line.sort((a, b) => a.x - b.x)
          let text = ''
          let end = -Infinity
          for (const item of line) {
            const gap = item.x - end
            if (text) text += gap > 25 ? '  ' : gap > 1.5 ? ' ' : ''
            text += item.str
            end = item.x + item.width
          }
          return text
        })
        .join('\n')
    )
  }
  return pages.join('\n')
}

/** Renders the first page as a PNG for OCR — used for scanned PDFs without a text layer. */
export async function firstPageAsPng(pdf: PDFDocumentProxy): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  await renderPage(pdf, 1, canvas, 2.5)
  return canvasToPng(canvas)
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Nie udało się przygotować obrazu'))), 'image/png')
  )
  return new Uint8Array(await blob.arrayBuffer())
}
