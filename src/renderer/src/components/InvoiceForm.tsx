/**
 * The invoice form. Fields filled in automatically from the document are highlighted in yellow
 * until the user touches them, so it is always clear what still needs checking.
 */

import { useEffect, useMemo, useState } from 'react'
import { formatDate, isValidIsoDate, today } from '@shared/dates'
import { formatMoney, moneyToInput, parseMoney } from '@shared/money'
import { formatNip, isValidNip, normalizeNip } from '@shared/nip'
import { PAYMENT_METHOD_LABELS } from '@shared/summary'
import type { Category, EntryKind, ImportResult, Invoice, InvoiceInput, PaymentMethod, StoredFile, Supplier } from '@shared/types'
import { Notice, Spinner } from './Common'

export interface FormValues {
  kind: EntryKind
  number: string
  supplierName: string
  supplierNip: string
  issueDate: string
  dueDate: string
  gross: string
  net: string
  categoryId: string
  paymentMethod: PaymentMethod | ''
  note: string
}

export type ReadingState = { status: 'idle' } | { status: 'reading' } | { status: 'done'; found: number } | { status: 'failed' }

export function emptyForm(): FormValues {
  return {
    kind: 'invoice',
    number: '',
    supplierName: '',
    supplierNip: '',
    issueDate: today(),
    dueDate: '',
    gross: '',
    net: '',
    categoryId: '',
    paymentMethod: '',
    note: ''
  }
}

export function formFromInvoice(inv: Invoice): FormValues {
  return {
    kind: inv.kind,
    number: inv.number,
    supplierName: inv.supplierName,
    supplierNip: inv.supplierNip ? formatNip(inv.supplierNip) : '',
    issueDate: inv.issueDate,
    dueDate: inv.dueDate ?? '',
    gross: moneyToInput(inv.grossAmount),
    net: moneyToInput(inv.netAmount),
    categoryId: inv.categoryId ? String(inv.categoryId) : '',
    paymentMethod: inv.paymentMethod ?? '',
    note: inv.note
  }
}

type Errors = Partial<Record<keyof FormValues, string>>

function validate(v: FormValues): Errors {
  const e: Errors = {}
  if (!isValidIsoDate(v.issueDate)) e.issueDate = 'Wpisz datę wystawienia.'
  if (v.dueDate && !isValidIsoDate(v.dueDate)) e.dueDate = 'Ta data jest niepełna.'
  if (v.kind === 'invoice') {
    if (!v.supplierName.trim()) e.supplierName = 'Wpisz, od kogo jest faktura.'
    if (parseMoney(v.gross) == null) e.gross = 'Wpisz kwotę do zapłaty, np. 625,80'
  } else if (v.gross && parseMoney(v.gross) == null) {
    e.gross = 'To nie wygląda na kwotę, np. 625,80'
  }
  if (v.net && parseMoney(v.net) == null) e.net = 'To nie wygląda na kwotę.'
  if (v.supplierNip && !isValidNip(v.supplierNip)) e.supplierNip = 'NIP ma błąd — sprawdź cyfry albo zostaw puste.'
  return e
}

interface Props {
  invoiceId?: number
  initial: FormValues
  /** Values read from the document; applied only to fields the user has not edited yet. */
  suggestion?: Partial<FormValues> | null
  reading?: ReadingState
  files: StoredFile[]
  alreadyAttachedTo?: ImportResult['alreadyAttachedTo']
  invoices: Invoice[]
  suppliers: Supplier[]
  categories: Category[]
  saveLabel: string
  onSaved: (invoice: Invoice) => void
  onOpenInvoice: (id: number) => void
  children?: React.ReactNode
}

export function InvoiceForm(props: Props) {
  const { initial, suggestion, reading = { status: 'idle' }, suppliers, categories, invoices } = props
  const [values, setValues] = useState<FormValues>(initial)
  const [touched, setTouched] = useState<Set<keyof FormValues>>(new Set())
  const [autoFilled, setAutoFilled] = useState<Set<keyof FormValues>>(new Set())
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<Invoice | null>(null)

  useEffect(() => {
    setValues(initial)
    setTouched(new Set())
    setAutoFilled(new Set())
    setShowErrors(false)
    setSaveError(null)
  }, [initial])

  useEffect(() => {
    if (!suggestion) return
    const filled = new Set<keyof FormValues>()
    setValues((prev) => {
      const next = { ...prev }
      for (const [key, value] of Object.entries(suggestion) as [keyof FormValues, never][]) {
        if (value == null || value === '' || touched.has(key)) continue
        next[key] = value
        filled.add(key)
      }
      return next
    })
    setAutoFilled(filled)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-apply only when a new suggestion arrives
  }, [suggestion])

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setTouched((prev) => new Set(prev).add(key))
    setAutoFilled((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  // Known supplier typed by NIP -> fill in the name (and the other way round).
  const supplierByNip = useMemo(() => new Map(suppliers.filter((s) => s.nip).map((s) => [s.nip, s])), [suppliers])
  const supplierByName = useMemo(() => new Map(suppliers.map((s) => [s.name.toLowerCase(), s])), [suppliers])
  useEffect(() => {
    const known = supplierByNip.get(normalizeNip(values.supplierNip))
    if (known && !touched.has('supplierName') && values.supplierName !== known.name) {
      setValues((prev) => ({ ...prev, supplierName: known.name }))
    }
  }, [values.supplierNip, supplierByNip, touched, values.supplierName])

  const onSupplierNameChange = (name: string) => {
    set('supplierName', name)
    const known = supplierByName.get(name.trim().toLowerCase())
    if (known?.nip && !values.supplierNip) setValues((prev) => ({ ...prev, supplierName: name, supplierNip: formatNip(known.nip) }))
  }

  // Suggest the category and payment method used last time for this supplier.
  useEffect(() => {
    const name = values.supplierName.trim().toLowerCase()
    if (!name) return
    const previous = invoices.filter((i) => i.supplierName.toLowerCase() === name && i.id !== props.invoiceId)
    const lastCategory = previous.find((i) => i.categoryId)?.categoryId
    const lastMethod = previous.find((i) => i.paymentMethod)?.paymentMethod
    setValues((prev) => ({
      ...prev,
      categoryId: !touched.has('categoryId') && !prev.categoryId && lastCategory ? String(lastCategory) : prev.categoryId,
      paymentMethod: !touched.has('paymentMethod') && !prev.paymentMethod && lastMethod ? lastMethod : prev.paymentMethod
    }))
  }, [values.supplierName, invoices, touched, props.invoiceId])

  // Warn about an invoice with the same number from the same supplier.
  useEffect(() => {
    if (!values.number.trim()) {
      setDuplicate(null)
      return
    }
    const t = setTimeout(() => {
      void window.api
        .findDuplicate({ id: props.invoiceId, number: values.number, supplierName: values.supplierName, supplierNip: values.supplierNip })
        .then(setDuplicate)
    }, 400)
    return () => clearTimeout(t)
  }, [values.number, values.supplierName, values.supplierNip, props.invoiceId])

  const errors = validate(values)
  const visibleErrors = showErrors ? errors : {}

  const save = async () => {
    if (Object.keys(errors).length) {
      setShowErrors(true)
      return
    }
    setSaving(true)
    setSaveError(null)
    const input: InvoiceInput = {
      id: props.invoiceId,
      kind: values.kind,
      number: values.number,
      supplierName: values.supplierName,
      supplierNip: normalizeNip(values.supplierNip),
      issueDate: values.issueDate,
      dueDate: values.dueDate || null,
      grossAmount: parseMoney(values.gross),
      netAmount: parseMoney(values.net),
      categoryId: values.categoryId ? Number(values.categoryId) : null,
      paymentMethod: values.paymentMethod || null,
      note: values.note,
      fileIds: props.files.map((f) => f.id)
    }
    try {
      props.onSaved(await window.api.saveInvoice(input))
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const cls = (key: keyof FormValues, extra = '') =>
    ['input', extra, autoFilled.has(key) ? 'autofilled' : '', visibleErrors[key] ? 'invalid' : ''].filter(Boolean).join(' ')
  const isInvoice = values.kind === 'invoice'

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      {reading.status === 'reading' && (
        <Notice tone="info" icon="🔎">
          <div className="btn-row">
            <Spinner /> <strong>Czytam dokument…</strong> To potrwa kilka sekund. Możesz w tym czasie wpisywać dane.
          </div>
        </Notice>
      )}
      {reading.status === 'done' && reading.found > 0 && (
        <Notice tone="warn" icon="✏️">
          <strong>Program odczytał część danych.</strong> Sprawdź pola zaznaczone na żółto i popraw, jeśli coś się nie zgadza.
        </Notice>
      )}
      {(reading.status === 'failed' || (reading.status === 'done' && reading.found === 0)) && (
        <Notice tone="info" icon="⌨️">
          Nie udało się odczytać danych z tego dokumentu. Przepisz je, patrząc na podgląd po lewej.
        </Notice>
      )}
      {props.alreadyAttachedTo && (
        <Notice tone="warn" icon="⧉">
          <p>
            <strong>Ten plik był już dodany</strong> ({props.alreadyAttachedTo.label}).
          </p>
          <button type="button" className="btn btn-small" onClick={() => props.onOpenInvoice(props.alreadyAttachedTo!.invoiceId)}>
            Pokaż tamten wpis
          </button>
        </Notice>
      )}

      <div className="field">
        <span className="label">Co to jest?</span>
        <div className="choice-group" role="radiogroup">
          {(
            [
              ['invoice', '🧾 Faktura'],
              ['note', '📝 Notatka lub inny dokument']
            ] as const
          ).map(([kind, label]) => (
            <label key={kind} className={`choice ${values.kind === kind ? 'selected' : ''}`}>
              <input type="radio" name="kind" checked={values.kind === kind} onChange={() => set('kind', kind)} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="supplierName">{isInvoice ? 'Od kogo (dostawca)' : 'Od kogo / czego dotyczy'}</label>
        <input
          id="supplierName"
          className={cls('supplierName')}
          list="supplier-list"
          value={values.supplierName}
          onChange={(e) => onSupplierNameChange(e.target.value)}
          placeholder="np. Hurtownia SMAK"
          autoComplete="off"
        />
        <datalist id="supplier-list">
          {suppliers.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
        {visibleErrors.supplierName && <span className="error-text">{visibleErrors.supplierName}</span>}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="number">Numer faktury</label>
          <input id="number" className={cls('number')} value={values.number} onChange={(e) => set('number', e.target.value)} placeholder="np. FV/2026/10/15" />
        </div>
        <div className="field">
          <label htmlFor="nip">NIP dostawcy</label>
          <input
            id="nip"
            className={cls('supplierNip')}
            value={values.supplierNip}
            onChange={(e) => set('supplierNip', e.target.value)}
            onBlur={() => isValidNip(values.supplierNip) && setValues((p) => ({ ...p, supplierNip: formatNip(p.supplierNip) }))}
            placeholder="nieobowiązkowe"
            inputMode="numeric"
          />
          {visibleErrors.supplierNip && <span className="error-text">{visibleErrors.supplierNip}</span>}
        </div>
      </div>

      {duplicate && (
        <Notice tone="warn" icon="⧉">
          <p>
            <strong>Uwaga, możliwy duplikat:</strong> faktura o tym numerze od tego dostawcy jest już w zeszycie (
            {formatDate(duplicate.issueDate)}, {formatMoney(duplicate.grossAmount)}).
          </p>
          <button type="button" className="btn btn-small" onClick={() => props.onOpenInvoice(duplicate.id)}>
            Pokaż tamtą fakturę
          </button>
        </Notice>
      )}

      <div className="field-row">
        <div className="field">
          <label htmlFor="gross">{isInvoice ? 'Kwota do zapłaty (brutto)' : 'Kwota (jeśli jest)'}</label>
          <input
            id="gross"
            className={cls('gross', 'input-money')}
            value={values.gross}
            onChange={(e) => set('gross', e.target.value)}
            onBlur={() => {
              const v = parseMoney(values.gross)
              if (v != null) setValues((p) => ({ ...p, gross: moneyToInput(v) }))
            }}
            placeholder="0,00"
            inputMode="decimal"
          />
          {visibleErrors.gross && <span className="error-text">{visibleErrors.gross}</span>}
        </div>
        <div className="field">
          <label htmlFor="net">Kwota netto</label>
          <input
            id="net"
            className={cls('net')}
            value={values.net}
            onChange={(e) => set('net', e.target.value)}
            placeholder="nieobowiązkowe"
            inputMode="decimal"
          />
          {visibleErrors.net && <span className="error-text">{visibleErrors.net}</span>}
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="issueDate">Data wystawienia</label>
          <input id="issueDate" type="date" className={cls('issueDate')} value={values.issueDate} onChange={(e) => set('issueDate', e.target.value)} />
          {visibleErrors.issueDate && <span className="error-text">{visibleErrors.issueDate}</span>}
        </div>
        {isInvoice && (
          <div className="field">
            <label htmlFor="dueDate">Termin płatności</label>
            <input id="dueDate" type="date" className={cls('dueDate')} value={values.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            {visibleErrors.dueDate && <span className="error-text">{visibleErrors.dueDate}</span>}
          </div>
        )}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="category">Kategoria</label>
          <select id="category" className={cls('categoryId')} value={values.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">— wybierz —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="paymentMethod">Forma płatności</label>
          <select
            id="paymentMethod"
            className={cls('paymentMethod')}
            value={values.paymentMethod}
            onChange={(e) => set('paymentMethod', e.target.value as FormValues['paymentMethod'])}
          >
            <option value="">— wybierz —</option>
            {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="note">Notatka</label>
        <textarea id="note" className="input" value={values.note} onChange={(e) => set('note', e.target.value)} placeholder="np. zapłacone gotówką kierowcy" />
      </div>

      {showErrors && Object.keys(errors).length > 0 && (
        <Notice tone="bad" icon="⚠️">
          Nie można jeszcze zapisać — popraw pola zaznaczone na czerwono.
        </Notice>
      )}
      {saveError && (
        <Notice tone="bad" icon="⚠️">
          Nie udało się zapisać: {saveError}
        </Notice>
      )}

      <div className="form-actions btn-row">
        <button type="submit" className="btn btn-good btn-large" disabled={saving}>
          {saving ? <Spinner /> : '💾'} {props.saveLabel}
        </button>
        {props.children}
      </div>
    </form>
  )
}
