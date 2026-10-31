import { DatabaseSync } from 'node:sqlite'
import { databasePath } from './paths'

/**
 * Schema migrations. Each entry upgrades the database by one version (tracked in PRAGMA user_version).
 * Never edit a migration that has been released — append a new one instead.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE suppliers (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    nip         TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
  );
  CREATE UNIQUE INDEX suppliers_nip ON suppliers(nip) WHERE nip <> '';

  CREATE TABLE categories (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    sort_order  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE invoices (
    id            INTEGER PRIMARY KEY,
    kind          TEXT NOT NULL DEFAULT 'invoice',
    number        TEXT NOT NULL DEFAULT '',
    supplier_id   INTEGER REFERENCES suppliers(id),
    issue_date    TEXT NOT NULL,
    due_date      TEXT,
    gross_amount  INTEGER,
    net_amount    INTEGER,
    category_id   INTEGER REFERENCES categories(id),
    paid          INTEGER NOT NULL DEFAULT 0,
    paid_date     TEXT,
    note          TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    deleted_at    TEXT
  );
  CREATE INDEX invoices_issue_date ON invoices(issue_date);

  CREATE TABLE files (
    id             INTEGER PRIMARY KEY,
    invoice_id     INTEGER REFERENCES invoices(id),
    stored_path    TEXT NOT NULL,
    original_name  TEXT NOT NULL,
    mime           TEXT NOT NULL,
    size           INTEGER NOT NULL,
    sha256         TEXT NOT NULL,
    created_at     TEXT NOT NULL
  );
  CREATE INDEX files_invoice ON files(invoice_id);
  CREATE INDEX files_sha256 ON files(sha256);

  CREATE TABLE settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  );

  INSERT INTO categories (name, sort_order) VALUES
    ('Towar do sklepu', 1),
    ('Prąd, woda, gaz', 2),
    ('Czynsz', 3),
    ('Usługi (księgowa, ochrona, internet)', 4),
    ('Wyposażenie i naprawy', 5),
    ('Opłaty i podatki', 6),
    ('Inne', 7);
  `,
  // 0.2: entries are only recorded once paid, so "paid" is always true; the payment method is new.
  `
  ALTER TABLE invoices ADD COLUMN payment_method TEXT;
  UPDATE invoices SET paid = 1, paid_date = COALESCE(paid_date, issue_date);
  `
]

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (!db) db = openDatabase(databasePath())
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

export function openDatabase(path: string): DatabaseSync {
  const database = new DatabaseSync(path)
  database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  migrate(database)
  return database
}

function migrate(database: DatabaseSync): void {
  const { user_version: version } = database.prepare('PRAGMA user_version').get() as { user_version: number }
  for (let v = version; v < MIGRATIONS.length; v++) {
    database.exec('BEGIN')
    try {
      database.exec(MIGRATIONS[v])
      database.exec(`PRAGMA user_version = ${v + 1}`)
      database.exec('COMMIT')
    } catch (e) {
      database.exec('ROLLBACK')
      throw e
    }
  }
}

export function getSetting(key: string, fallback = ''): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? fallback
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

export function nowIso(): string {
  return new Date().toISOString()
}
