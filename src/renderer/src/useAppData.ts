import { useCallback, useEffect, useState } from 'react'
import type { Category, Invoice, Settings, Supplier } from '@shared/types'

export interface AppData {
  invoices: Invoice[]
  suppliers: Supplier[]
  categories: Category[]
  settings: Settings | null
  loaded: boolean
  refresh: () => Promise<void>
}

/** Everything the screens need, loaded once and refreshed after each change. ~20 invoices a month keeps this tiny. */
export function useAppData(): AppData {
  const [state, setState] = useState<Omit<AppData, 'refresh'>>({
    invoices: [],
    suppliers: [],
    categories: [],
    settings: null,
    loaded: false
  })

  const refresh = useCallback(async () => {
    const [invoices, suppliers, categories, settings] = await Promise.all([
      window.api.listInvoices(),
      window.api.listSuppliers(),
      window.api.listCategories(),
      window.api.getSettings()
    ])
    setState({ invoices, suppliers, categories, settings, loaded: true })
  }, [])

  useEffect(() => {
    void refresh()
    // Picks up changes made elsewhere (e.g. payment due dates passing overnight) when the window is reopened.
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return { ...state, refresh }
}
