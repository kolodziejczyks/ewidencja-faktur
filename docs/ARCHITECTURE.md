# Architecture

```
┌──────────────────────────── Electron ────────────────────────────┐
│  Main process (Node)                    Renderer (React UI)      │
│  ─────────────────────                  ───────────────────      │
│  db.ts          SQLite + migrations     App.tsx  screens/*       │
│  repository.ts  invoices, suppliers…    InvoiceForm, Preview     │
│  documents.ts   file import, DOCX       lib/pdf.ts  (pdf.js)     │
│  ocr.ts         Tesseract worker        lib/extract.ts           │
│  backup.ts      snapshots + mirror      ▲                        │
│  updater.ts     electron-updater        │ window.api (preload)   │
│  ipc.ts  ◄──────────────────────────────┘                        │
│                                                                  │
│  src/shared: types, invoice parser, money/NIP/date helpers,      │
│              warnings (insights.ts), aggregations (summary.ts)   │
└──────────────────────────────────────────────────────────────────┘
```

## Processes and security

- The renderer is sandboxed with context isolation; it can only call the functions in
  `src/preload/index.ts`, typed by the `Api` interface in `src/shared/types.ts`.
- Content Security Policy allows only local scripts; navigation and new windows are blocked.
- `src/shared` is pure TypeScript with no Electron/DOM dependencies, so it is unit-tested directly.

## Data

Everything lives in `%APPDATA%\Ewidencja Faktur`:

| Path | Content |
|---|---|
| `ewidencja.db` | SQLite database (WAL mode) |
| `dokumenty\YYYY-MM\<sha8>-<name>` | copies of imported files, grouped by import month |

The database uses Node's built-in `node:sqlite` (available in Electron's Node 24), so there are
no native modules to rebuild. Schema changes are append-only migrations tracked with
`PRAGMA user_version` (see `src/main/db.ts`).

Only paid invoices are recorded, so `invoices.paid` / `paid_date` are legacy columns that are
always filled in; `payment_method` (`transfer` / `cash`) says how it was paid.

Tables: `invoices`, `suppliers` (unique by NIP), `categories`, `files` (with SHA-256 for duplicate
detection), `settings` (key/value). Money is stored as integer grosze; dates as `YYYY-MM-DD`.

Deleting sets `invoices.deleted_at`; a housekeeping task on start removes entries older than 30
days together with their files, and files that were imported but never saved.

## Reading invoices

1. **PDF** — `lib/pdf.ts` rebuilds lines from pdf.js text items. Wide horizontal gaps become two
   spaces, which the parser treats as a column break (seller and buyer are usually side by side).
2. **Scanned PDF / photo** — if a PDF has fewer than 40 letters of text, page 1 is rendered to PNG.
   Photos are decoded (respecting phone rotation) and scaled so the longer side is ~2400 px. The
   image goes to `ocr.ts`, which runs Tesseract in a worker thread with the bundled Polish
   LSTM model and rebuilds lines from word bounding boxes (again marking column gaps).
3. **DOCX** — mammoth extracts raw text (and HTML for the preview).
4. `shared/invoiceParser.ts` turns text into fields with label-driven heuristics: NIP candidates
   validated by checksum (the shop's own NIP excluded), dates after "Data wystawienia" /
   "Termin płatności" (or "14 dni"), the amount after "Do zapłaty" or from the "Razem" row where
   net + VAT = gross, and the supplier name after "Sprzedawca".

The form applies parsed values only to fields the user has not touched and highlights them.
Reading is capped at 90 s, after which the form is left for manual entry.

### Packaging note

Worker threads cannot load code from inside `app.asar`, so `electron-builder.yml` unpacks
Tesseract, its runtime dependencies and the Polish model. `ocr.ts` points the worker at the
unpacked paths. `tests/e2e/ocr-packaged.mjs` checks this against a built app.

## Updates

`updater.ts` wraps `electron-updater` with the GitHub provider (configured in
`electron-builder.yml`). It checks 10 s after start and every 4 hours, downloads automatically,
and broadcasts an `UpdateState` to the UI. The UI shows a banner only when an update is fully
downloaded. `quitAndInstall(silent, forceRunAfter)` installs and restarts; with
`autoInstallOnAppQuit` an ignored update installs on the next quit.

Release notes come from `changelog.json` (one entry per version, `pl` and `en`):
`scripts/release-notes.mjs` writes them into the GitHub release body, and the same file is
bundled into the app for the "what's new" dialog and the changelog in Settings.

## Backups

`backup.ts` runs on start (if the last backup is older than 24 h) and every 6 hours thereafter:
`VACUUM INTO` writes a consistent DB snapshot to `<backup>\baza\` (30 kept), and new files are
mirrored to `<backup>\dokumenty\`. The default folder is in OneDrive when it exists, otherwise in
Documents.

## Tests

- `tests/*.test.ts` (Vitest) — parser on realistic invoice texts, money/NIP helpers, warnings,
  aggregations.
- `tests/e2e/smoke.mjs` (Playwright for Electron) — generates a sample PDF and PNG invoice,
  imports both through the UI, asserts every parsed field (including OCR), seeds a year of data,
  checks the print view (also in print media) and takes screenshots of each screen. Set `EWF_EXE` to run it against a
  packaged build. Runs use a throwaway data folder via `EWF_USER_DATA`.
