/**
 * Types shared between the main process, the preload bridge and the UI.
 * Money is always stored as integer grosze (1 zł = 100 gr) to avoid float rounding.
 * Dates are ISO strings: `YYYY-MM-DD` for calendar dates, full ISO for timestamps.
 */

export type EntryKind = 'invoice' | 'note'

export interface StoredFile {
  id: number
  invoiceId: number | null
  originalName: string
  mime: string
  size: number
  sha256: string
  createdAt: string
}

export interface Supplier {
  id: number
  name: string
  nip: string
}

export interface Category {
  id: number
  name: string
  sortOrder: number
}

/** How the invoice was paid. Every entry is recorded after payment, so there is no "unpaid" state. */
export type PaymentMethod = 'transfer' | 'cash'

export type InvoiceFlag = { type: 'duplicate'; otherId: number }

export interface Invoice {
  id: number
  kind: EntryKind
  number: string
  supplierId: number | null
  supplierName: string
  supplierNip: string
  issueDate: string
  dueDate: string | null
  grossAmount: number | null
  netAmount: number | null
  categoryId: number | null
  categoryName: string
  paymentMethod: PaymentMethod | null
  note: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  files: StoredFile[]
  flags: InvoiceFlag[]
}

/** What the form sends when creating or editing an entry. */
export interface InvoiceInput {
  id?: number
  kind: EntryKind
  number: string
  supplierName: string
  supplierNip: string
  issueDate: string
  dueDate: string | null
  grossAmount: number | null
  netAmount: number | null
  categoryId: number | null
  paymentMethod: PaymentMethod | null
  note: string
  fileIds: number[]
}

export interface ImportResult {
  file: StoredFile
  /** Set when exactly the same file is already attached to an invoice. */
  alreadyAttachedTo: { invoiceId: number; label: string } | null
}

export interface DocxContent {
  html: string
  text: string
}

export interface BackupStatus {
  folder: string
  lastBackupAt: string | null
  lastError: string | null
  snapshots: { fileName: string; createdAt: string }[]
}

export interface Settings {
  /** The shop's own NIP — used to tell the seller's NIP apart from the buyer's when reading invoices. */
  ownNip: string
  backupFolder: string
  lastSeenVersion: string
}

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string; releaseNotes: string }
  | { status: 'upToDate' }
  | { status: 'error'; message: string }

export interface AppInfo {
  version: string
  isPackaged: boolean
  dataFolder: string
}

/** The API exposed to the UI as `window.api` by the preload script. */
export interface Api {
  getAppInfo(): Promise<AppInfo>

  listInvoices(): Promise<Invoice[]>
  listDeletedInvoices(): Promise<Invoice[]>
  getInvoice(id: number): Promise<Invoice | null>
  saveInvoice(input: InvoiceInput): Promise<Invoice>
  deleteInvoice(id: number): Promise<void>
  restoreInvoice(id: number): Promise<void>
  /** Bulk import: takes a backup first, adds everything in one transaction, returns the new ids. */
  importInvoices(inputs: InvoiceInput[]): Promise<{ ids: number[]; backupError: string | null }>
  deleteInvoices(ids: number[]): Promise<void>
  pickImportFile(): Promise<{ fileName: string; bytes: Uint8Array } | null>
  saveImportTemplate(): Promise<string | null>
  findDuplicate(input: { id?: number; supplierNip: string; supplierName: string; number: string }): Promise<Invoice | null>

  listSuppliers(): Promise<Supplier[]>
  listCategories(): Promise<Category[]>
  addCategory(name: string): Promise<Category>
  renameCategory(id: number, name: string): Promise<void>

  pickFiles(): Promise<ImportResult[]>
  importFiles(paths: string[]): Promise<ImportResult[]>
  pathForDroppedFile(file: File): string
  readFile(fileId: number): Promise<Uint8Array>
  openFileExternally(fileId: number): Promise<void>
  readDocx(fileId: number): Promise<DocxContent>
  ocrFile(fileId: number): Promise<string>
  ocrImage(png: Uint8Array): Promise<string>

  openPath(path: string): Promise<void>

  getSettings(): Promise<Settings>
  setOwnNip(nip: string): Promise<void>
  setLastSeenVersion(version: string): Promise<void>
  chooseBackupFolder(): Promise<string | null>
  getBackupStatus(): Promise<BackupStatus>
  backupNow(): Promise<BackupStatus>
  restoreBackup(fileName: string): Promise<void>

  getUpdateState(): Promise<UpdateState>
  checkForUpdates(): Promise<void>
  installUpdate(): Promise<void>
  onUpdateState(callback: (state: UpdateState) => void): () => void
}
