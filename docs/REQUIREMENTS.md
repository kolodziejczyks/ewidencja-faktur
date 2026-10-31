# Product requirements

## Context

- **User:** the owner of a small grocery shop (sole proprietorship) who records every **cost
  invoice** by hand in a paper notebook. Not technical; grew up mostly without computers.
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
| A1 | Add PDF, JPG/PNG/WEBP/BMP and DOCX files by drag & drop or a file picker; several at once | ✅ 0.1 |
| A2 | Imported files are copied into the app's own folder, so the originals can be deleted | ✅ 0.1 |
| A3 | Document preview next to the form (PDF pages, photo with zoom/rotate, DOCX as text) | ✅ 0.1 |
| A4 | Pre-fill number, supplier, NIP, issue date, due date, gross and net amount from the document (PDF text layer, otherwise offline OCR) | ✅ 0.1 |
| A5 | Highlight every pre-filled field until the user has checked it | ✅ 0.1 |
| A6 | Remember suppliers: fill the name from a known NIP and suggest the last-used category | ✅ 0.1 |
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
| B3 | Filters: all / unpaid / overdue, and by year | ✅ 0.1 |
| B4 | Payment status (paid / to pay / overdue) shown with words and icons, not colour alone | ✅ 0.1 |
| B5 | Categories (preset for a grocery shop, editable) | ✅ 0.1 |

### Insights ("highlighting differences")
| ID | Requirement | Status |
|---|---|---|
| C1 | Month total compared with the previous month in the ledger | ✅ 0.1 |
| C2 | Summary: chosen month vs previous month vs same month a year ago | ✅ 0.1 |
| C3 | Chart of the last 12 months against the 12 months before | ✅ 0.1 |
| C4 | Breakdown by supplier and by category | ✅ 0.1 |
| C5 | Per-supplier differences between two consecutive months | ✅ 0.1 |
| C6 | Duplicate warning (same supplier + number, or the same file) while entering and in the ledger | ✅ 0.1 |
| C7 | Unusual amount warning (≥ 1.5× the median of the supplier's last 6 invoices) | ✅ 0.1 |
| C8 | Overdue / due-in-3-days reminders | ✅ 0.1 |

### Export
| ID | Requirement | Status |
|---|---|---|
| D1 | Excel export for a chosen period: invoice list + monthly, supplier and category totals | ✅ 0.1 |
| D2 | ZIP package for the accountant (Excel + all files of the period) | 🔜 planned |
| D3 | Printable summary / PDF | 🔜 planned |

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
