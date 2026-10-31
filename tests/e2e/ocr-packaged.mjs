/** Quick check that OCR starts inside the packaged app: EWF_EXE=<path to exe> node tests/e2e/ocr-packaged.mjs <image> */
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const app = await electron.launch({
  executablePath: process.env.EWF_EXE,
  env: { ...process.env, EWF_USER_DATA: mkdtempSync(join(tmpdir(), 'ewf-ocr-')) }
})
const page = await app.firstWindow()
const image = [...readFileSync(process.argv[2])]
const result = await page.evaluate(async (bytes) => {
  try {
    return { text: await window.api.ocrImage(new Uint8Array(bytes)) }
  } catch (e) {
    return { error: String(e) }
  }
}, image)
console.log(result.error ? `OCR FAILED: ${result.error}` : `OCR OK:\n${result.text.slice(0, 300)}`)
await app.close()
process.exit(result.error ? 1 : 0)
