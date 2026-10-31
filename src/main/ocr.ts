/**
 * Offline text recognition (Tesseract) with the Polish language model bundled in the installer.
 * The worker is started on first use and kept alive, because loading the model takes a few seconds.
 */

import { dirname, join } from 'node:path'
import { createWorker, OEM, type Worker } from 'tesseract.js'
import { unpacked } from './paths'

let workerPromise: Promise<Worker> | null = null

function polishModelDir(): string {
  // "best_int" is the smaller, LSTM-only model — accurate enough for printed invoices and ~2.5 MB.
  return unpacked(join(dirname(require.resolve('@tesseract.js-data/pol/package.json')), '4.0.0_best_int'))
}

function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker('pol', OEM.LSTM_ONLY, {
    langPath: polishModelDir(),
    workerPath: unpacked(join(dirname(require.resolve('tesseract.js/package.json')), 'src', 'worker-script', 'node', 'index.js')),
    cacheMethod: 'none',
    gzip: true
  }).catch((e) => {
    workerPromise = null
    throw e
  })
  return workerPromise
}

export async function recognizeText(image: Buffer | Uint8Array): Promise<string> {
  const worker = await getWorker()
  const { data } = await worker.recognize(Buffer.from(image), {}, { text: true, blocks: true })
  const words = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)))
  return words.length ? layoutText(words) : data.text
}

interface Box {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

/**
 * Rebuilds lines from word positions. Tesseract joins words that sit side by side on the page
 * with a single space — so "Seller | Buyer" columns would merge into one name. Here a wide gap
 * becomes two spaces, the same column marker the PDF reader produces.
 */
export function layoutText(words: Box[]): string {
  const height = (w: Box) => w.bbox.y1 - w.bbox.y0
  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0)
  const rows: Box[][] = []
  for (const word of sorted) {
    const center = (word.bbox.y0 + word.bbox.y1) / 2
    const row = rows.find((r) => Math.abs((r[0].bbox.y0 + r[0].bbox.y1) / 2 - center) < height(r[0]) / 2)
    if (row) row.push(word)
    else rows.push([word])
  }
  return rows
    .map((row) => {
      row.sort((a, b) => a.bbox.x0 - b.bbox.x0)
      const typicalHeight = row.map(height).sort((a, b) => a - b)[Math.floor(row.length / 2)]
      return row
        .map((w, i) => (i === 0 ? '' : w.bbox.x0 - row[i - 1].bbox.x1 > typicalHeight * 1.5 ? '  ' : ' ') + w.text)
        .join('')
    })
    .join('\n')
}

export async function stopOcr(): Promise<void> {
  if (!workerPromise) return
  const worker = await workerPromise.catch(() => null)
  workerPromise = null
  await worker?.terminate()
}
