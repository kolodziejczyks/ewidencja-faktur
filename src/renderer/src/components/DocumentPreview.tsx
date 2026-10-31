/** Shows a stored PDF, photo or Word document with simple zoom and rotate buttons. */

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { StoredFile } from '@shared/types'
import { isDocx, isImage, isPdf } from '../lib/extract'
import { loadPdf, renderPage } from '../lib/pdf'
import { Spinner } from './Common'

const MAX_PDF_PAGES = 10
const ZOOM_STEPS = [0.6, 0.8, 1, 1.25, 1.5, 2, 2.5]

export function DocumentPreview({ files }: { files: StoredFile[] }) {
  const [index, setIndex] = useState(0)
  const [zoomStep, setZoomStep] = useState(2)
  const [rotation, setRotation] = useState(0)
  const file = files[Math.min(index, files.length - 1)]

  useEffect(() => {
    setIndex(0)
  }, [files])
  useEffect(() => {
    setRotation(0)
  }, [file?.id])

  if (!file) {
    return (
      <div className="preview">
        <div className="preview-empty">
          <div style={{ fontSize: '3rem' }}>📝</div>
          Ten wpis nie ma dołączonego pliku.
        </div>
      </div>
    )
  }

  const zoom = ZOOM_STEPS[zoomStep]
  return (
    <div className="preview">
      <div className="preview-toolbar">
        <span className="file-name" title={file.originalName}>
          📄 {file.originalName}
        </span>
        {files.length > 1 && (
          <span className="segmented">
            {files.map((f, i) => (
              <button key={f.id} className={i === index ? 'active' : ''} onClick={() => setIndex(i)}>
                Plik {i + 1}
              </button>
            ))}
          </span>
        )}
        <button className="btn btn-small" onClick={() => setZoomStep((z) => Math.max(0, z - 1))} disabled={zoomStep === 0}>
          ➖ Pomniejsz
        </button>
        <button
          className="btn btn-small"
          onClick={() => setZoomStep((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}
          disabled={zoomStep === ZOOM_STEPS.length - 1}
        >
          ➕ Powiększ
        </button>
        {isImage(file) && (
          <button className="btn btn-small" onClick={() => setRotation((r) => (r + 90) % 360)}>
            ↻ Obróć
          </button>
        )}
        <button className="btn btn-small" onClick={() => void window.api.openFileExternally(file.id)}>
          ↗ Otwórz osobno
        </button>
      </div>
      <div className="preview-body">
        {isPdf(file) && <PdfView fileId={file.id} zoom={zoom} />}
        {isImage(file) && <ImageView file={file} zoom={zoom} rotation={rotation} />}
        {isDocx(file) && <DocxView fileId={file.id} zoom={zoom} />}
      </div>
    </div>
  )
}

function useFileBytes(fileId: number): Uint8Array | null {
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  useEffect(() => {
    let cancelled = false
    setBytes(null)
    void window.api.readFile(fileId).then((b) => !cancelled && setBytes(b))
    return () => {
      cancelled = true
    }
  }, [fileId])
  return bytes
}

function PdfView({ fileId, zoom }: { fileId: number; zoom: number }) {
  const bytes = useFileBytes(fileId)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!bytes) return
    let doc: PDFDocumentProxy | null = null
    setError(false)
    loadPdf(bytes)
      .then((d) => {
        doc = d
        setPdf(d)
      })
      .catch(() => setError(true))
    return () => {
      setPdf(null)
      void doc?.loadingTask.destroy()
    }
  }, [bytes])

  if (error) return <div className="preview-empty">Nie udało się wyświetlić tego pliku PDF. Kliknij „Otwórz osobno”.</div>
  if (!pdf) return <Loading />
  return (
    <>
      {Array.from({ length: Math.min(pdf.numPages, MAX_PDF_PAGES) }, (_, i) => (
        <PdfPage key={i} pdf={pdf} pageNumber={i + 1} zoom={zoom} />
      ))}
      {pdf.numPages > MAX_PDF_PAGES && <p className="muted">Pokazano {MAX_PDF_PAGES} pierwszych stron.</p>}
    </>
  )
}

function PdfPage({ pdf, pageNumber, zoom }: { pdf: PDFDocumentProxy; pageNumber: number; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    // Render at device resolution for sharp text, display at the zoomed CSS size.
    const ratio = window.devicePixelRatio || 1
    void renderPage(pdf, pageNumber, canvas, 1.3 * zoom * ratio).then(() => {
      canvas.style.width = `${canvas.width / ratio}px`
    })
  }, [pdf, pageNumber, zoom])
  return <canvas ref={ref} />
}

function ImageView({ file, zoom, rotation }: { file: StoredFile; zoom: number; rotation: number }) {
  const bytes = useFileBytes(file.id)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!bytes) return
    const u = URL.createObjectURL(new Blob([bytes.slice()], { type: file.mime }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [bytes, file.mime])

  if (!url) return <Loading />
  const sideways = rotation % 180 !== 0
  return (
    <img
      src={url}
      alt={file.originalName}
      style={{
        width: `${95 * zoom}%`,
        transform: `rotate(${rotation}deg)`,
        margin: sideways ? '15% 0' : undefined
      }}
    />
  )
}

function DocxView({ fileId, zoom }: { fileId: number; zoom: number }) {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    setHtml(null)
    void window.api.readDocx(fileId).then((c) => setHtml(c.html))
  }, [fileId])
  if (html == null) return <Loading />
  // mammoth builds this HTML from the document structure and escapes all text.
  return <div className="preview-docx" style={{ fontSize: `${zoom}rem` }} dangerouslySetInnerHTML={{ __html: html }} />
}

function Loading() {
  return (
    <div className="preview-empty btn-row">
      <Spinner /> Wczytuję…
    </div>
  )
}
