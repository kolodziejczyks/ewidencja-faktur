# Importing invoices from a CSV file

**Ustawienia → Wczytaj faktury z pliku** adds many invoices at once — meant for bringing in
history, e.g. invoices transcribed from the paper notebook. Nothing is saved until the preview has
been checked; duplicates are skipped by default; a backup snapshot is taken right before saving;
and the whole import can be undone (the invoices go to the recycle bin).

The app can also save a template: **Pobierz wzór pliku**.

## File format

- First row: column names. Columns are matched by name (case, Polish letters, spaces and `_`
  don't matter), in any order; unknown columns are ignored.
- Separator: `;` (what Polish Excel uses), `,` or tab — detected automatically.
- Encoding: UTF-8 (with or without BOM) or Windows-1250 (Excel's plain "CSV" on Polish Windows).
- Quoted fields (`"Kowalski; syn"`) are supported.

| Column | Also accepted as | Required | Format |
|---|---|---|---|
| `data` | `data wystawienia`, `data faktury` | **yes** | `03.09.2026`, `3.9.26`, `2026-09-03`, `03/09/2026` |
| `kwota` | `brutto`, `kwota brutto`, `wartość`, `suma` | **yes** | `1 250,40`, `1250.40`, `1.250,40` |
| `dostawca` | `kontrahent`, `sprzedawca`, `firma` | no | text |
| `nip` | `nip dostawcy` | no | any common format; an invalid NIP is dropped with a warning |
| `numer` | `nr`, `nr faktury`, `numer faktury` | no | text |
| `forma_platnosci` | `płatność`, `forma`, `sposób płatności` | no | `przelew` / `gotówka` (first letter is enough) |
| `kategoria` | — | no | must match a category name in the app, otherwise left empty |
| `termin` | `termin płatności` | no | date, as above |
| `uwagi` | `notatka`, `opis` | no | text |

Example:

```csv
data;dostawca;nip;numer;kwota;forma_platnosci;kategoria;termin;uwagi
03.09.2026;Hurtownia Spożywcza SMAK;525-000-12-04;FV/2026/09/0101;1 250,40;przelew;Towar do sklepu;17.09.2026;
05.09.2026;Piekarnia Kłos;;P/811/2026;437,85;gotówka;Towar do sklepu;;zapłacone kierowcy
```

## What the preview checks

- **Skipped rows** — missing or unreadable date or amount. The preview shows the line number, so
  the row is easy to find in Excel.
- **Possible duplicates** — same supplier (ignoring case and Polish letters) with the same date and
  amount, or the same supplier and invoice number, either already in the app or earlier in the
  file (the same notebook page photographed twice). Skipped unless *Dodaj także możliwe
  duplikaty* is ticked.
- **Warnings** — the row is imported, but something was dropped: an invalid NIP, an unknown
  category or payment method, an unreadable due date.

Suppliers are matched by NIP first, then by name, exactly as when typing an invoice in, so
imported invoices join existing suppliers instead of creating copies.

## Transcribing the paper notebook

Photos of the notebook live in `import/` in this repository, which is git-ignored — the repository
is public and the photos contain real business data. They are transcribed into
`import/faktury.csv` in the format above, checked in Excel and then imported on the target
computer.
