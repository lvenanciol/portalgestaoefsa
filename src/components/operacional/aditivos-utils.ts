import { cn } from '@/lib/utils'

// COR-3 F8 — util dos aditivos: fmtDataBR reutilizado pelo dialog e pela
// coluna "Vigência efetiva" da grade de contratos.
export { cn }

export const fmtDataBR = (iso?: string | null): string => {
  if (!iso) return '—'
  const d = String(iso).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : String(iso)
}
