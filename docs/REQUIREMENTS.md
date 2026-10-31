# Product requirements

## Context

- **User:** the owner of a small grocery shop (sole proprietorship) who records every **cost
  invoice** by hand in a paper notebook. Not technical; grew up mostly without computers.
- **Only paid invoices are recorded**, so the app tracks no payment status — just how an invoice
  was paid (bank transfer or cash) and, for reference, its due date.
- **Prefers typing invoices in by hand**; reading files is a convenience, not the main path.
- **Volume:** about 20 invoices a month (~250 a year).
- **Sources:** PDF invoices (e-mail, wholesalers' portals), paper invoices photographed with an
  Android phone, occasional Word documents and photos of handwritten notes.
- **Maintainer:** a family member who cannot visit to install new versions, so updates must
  reach the app on their own.

## Goals

1. Replace the paper notebook with something at least as simple to use.
2. Make invoices easy to find, and costs easy to understand at a glance.
3. Never lose data.
4. Ship improvements remotely, with the user always understanding what is happening.

## Functional requirements

### Adding documents
| ID | Requirement | Status |
|---|---|---|
| A0 | The add screen opens on a manual entry form; after saving it is ready for the next invoice | ✅ 0.2 |
| A1 | Add PDF, JPG/PNG/WEBP/BMP and DOCX files from a separate side panel or by drag & drop; several at once | ✅ 0.1 (side panel 0.2) |
| A2 | Imported files are copied into the app's own folder, so the originals can be deleted | ✅ 0.1 |
| A3 | Document preview next to the form (PDF pages, photo with zoom/rotate, DOCX as text) | ✅ 0.1 |
| A4 | Pre-fill number, supplier, NIP, issue date, due date, gross and net amount from the document (PDF text layer, otherwise offline OCR) | ✅ 0.1 |
| A5 | Highlight every pre-filled field until the user has checked it | ✅ 0.1 |
| A6 | Remember suppliers: fill the name from a known NIP and suggest the last-used category and payment method | ✅ 0.1 |
| A12 | Payment method (bank transfer / cash) as its own dropdown, also read from "Sposób płatności" | ✅ 0.2 |
| A13 | Bulk import from CSV with preview, duplicate detection, a backup right before saving and undo ([IMPORT.md](IMPORT.md)) | ✅ 0.3 |
| A7 | Entries without an invoice ("note or other document") and without a file | ✅ 0.1 |
| A8 | Easy way to get photos from an Android phone into the app | 🔜 planned (see below) |
| A9 | Attach more than one file to an invoice (e.g. invoice + payment confirmation) | 🔜 planned |
| A10 | Import of KSeF structured invoices (FA XML) | 💡 idea |
| A11 | Optional AI reading (Claude API) for difficult photos and handwriting | 💡 idea, needs an API key |

### Browsing
| ID | Requirement | Status |
|---|---|---|
| B1 | Ledger grouped by month, newest first, with monthly totals | ✅ 0.1 |
| B2 | One search box: supplier, number, amount, NIP, note, date | ✅ 0.1 |
| B3 | Filters: all / transfer / cash, and by year | ✅ 0.2 |
| B4 | Payment method shown on every entry with a word and an icon | ✅ 0.2 |
| B5 | Categories (preset for a grocery shop, editable) | ✅ 0.1 |

### Insights ("highlighting differences")
| ID | Requirement | Status |
|---|---|---|
| C1 | Month total compared with the previous month in the ledger | ✅ 0.1 |
| C2 | Summary: chosen month, quarter or year vs the previous period and the same period a year ago | ✅ 0.1 (quarter/year 0.5) |
| C3 | Chart of the last 12 months against the 12 months before | ✅ 0.1 |
| C4 | Breakdown by supplier and by category | ✅ 0.1 |
| C5 | Per-supplier differences between two consecutive months | ✅ 0.1 |
| C6 | Duplicate warning (same supplier + number, or the same file) while entering and in the ledger | ✅ 0.1 |
| C7 | ~~Unusual amount warning (≥ 1.5× the supplier's median)~~ | removed in 0.4.1 — on real data it flagged every sixth invoice, almost all ordinary larger deliveries |
| C8 | ~~Overdue / due-in-3-days reminders~~ | removed in 0.2 — only paid invoices are recorded |
| C9 | Transfer vs. cash totals for the chosen month | ✅ 0.2 |

### Printing
| ID | Requirement | Status |
|---|---|---|
| D1 | Printable A4 list for: last 10 calendar days (default), this month, last month, last full quarter, this year | ✅ 0.2 |
| D2 | Totals on the printout: overall, by transfer, by cash | ✅ 0.2 |
| D5 | One-page summary printout (per day or month, per category, top 10 suppliers); default for a quarter or a year; page estimate for the full list; always portrait A4 | ✅ 0.4 |
| D3 | ~~Excel export~~ | replaced by printing in 0.2 |
| D4 | ZIP package for the accountant (list + all files of the period) | 💡 idea |

### Data safety
| ID | Requirement | Status |
|---|---|---|
| E1 | Every change saved immediately (no "save file" step) | ✅ 0.1 |
| E2 | Deleting moves to a recycle bin, restorable for 30 days; undo right after deleting | ✅ 0.1 |
| E3 | Automatic daily backup (database snapshot + document mirror), default folder inside OneDrive | ✅ 0.1 |
| E4 | Restore from a backup, which itself snapshots the current state first | ✅ 0.1 |
| E5 | Visible warning when backups fail or are older than 7 days | ✅ 0.1 |

### Updates
| ID | Requirement | Status |
|---|---|---|
| F1 | Check GitHub Releases on start and every 4 hours; download in the background | ✅ 0.1 |
| F2 | Calm banner "new version ready" with release notes and *Update now* / *Later* | ✅ 0.1 |
| F3 | If ignored, install on next quit; installs silently and restarts the app | ✅ 0.1 |
| F4 | "What's new" dialog after an update; full changelog in Settings, Polish/English toggle | ✅ 0.1 |
| F5 | Update errors never interrupt the user (shown only in Settings) | ✅ 0.1 |

## Non-functional requirements

- **Offline first.** Works without internet; only the update check uses the network.
- **Privacy.** Invoices never leave the computer except into the user's own backup folder.
- **Accessibility.** 19 px base font, high contrast, ≥ 48 px targets, labelled icons, plain Polish,
  confirmation + undo for anything destructive.
- **Install without admin rights**, desktop shortcut, single instance.
- **Windows 11**, x64.

## Planned: getting photos from the phone

The most promising option is **"Dodaj z telefonu"**: the app shows a QR code, the phone (same
Wi-Fi) opens a tiny upload page served by the app, takes the photo and it appears in the app,
ready to fill in. No accounts, no cloud, one scan. It needs a one-time Windows Firewall approval
during setup. Alternatives considered: syncing the camera folder via Google Drive / OneDrive and
watching it (more setup, photos of everything end up in the app), or e-mailing photos to oneself
(too many steps).

## Known limitations

- The app is **not code-signed**. The first installation shows Windows SmartScreen
  ("Windows protected your PC" → *More info* → *Run anyway*); updates do not. Signing
  (e.g. Azure Trusted Signing) can be added later without changing the update mechanism.
- HEIC photos are not supported (Android cameras save JPG by default).
- OCR quality depends on the photo; blurry or angled photos may need manual entry.
