// TAREFA TIME (20/10) — exibição de data/hora em BRT (America/Sao_Paulo)
// para TODAS as telas, auditoria e logs. O banco grava UTC; a conversão é
// só na EXIBIÇÃO (Intl com timeZone fixo).

const TZ = 'America/Sao_Paulo'

/** ISO/Date → 'dd/mm/yyyy hh:mm' em BRT */
export function fmtDataBRT(v: any, comHora = true): string {
  if (!v) return '—'
  try {
    const d =
      typeof v === 'string'
        ? new Date(v.includes('T') || v.includes('Z') ? v : v.replace(' ', 'T') + 'Z')
        : v
    if (isNaN(d.getTime())) return String(v)
    const f = new Intl.DateTimeFormat('pt-BR', {
      timeZone: TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      ...(comHora ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    })
    return f.format(d)
  } catch (_) {
    return String(v)
  }
}

/** ISO/Date → 'yyyy-mm-dd hh:mm' em BRT (ordenável) */
export function isoBRT(v: any): string {
  if (!v) return ''
  try {
    const d =
      typeof v === 'string'
        ? new Date(v.includes('T') || v.includes('Z') ? v : v.replace(' ', 'T') + 'Z')
        : v
    if (isNaN(d.getTime())) return String(v)
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const g = (t: string) => p.find((x) => x.type === t)?.value || ''
    return g('year') + '-' + g('month') + '-' + g('day') + ' ' + g('hour') + ':' + g('minute')
  } catch (_) {
    return String(v)
  }
}
