// ============================================================================
// FASE 0 — TOKENS DO MÓDULO /pen
//
// Fonte ÚNICA das cores, raio e tipografia. Tudo que aparece nas telas do
// plano estratégico vem daqui — nenhum componente escreve hex solto.
//
// Os mesmos valores são publicados como CSS variables no root do shell
// (ver PenShell), para quem preferir usar var(--pen-accent) em CSS.
// ============================================================================

export const PEN = {
  // estrutura
  sidebar: '#0F1E2E',
  sidebarTexto: '#C7D2DD',
  sidebarTextoAtivo: '#FFFFFF',
  sidebarAtivo: '#1F6F78',
  topbar: '#FFFFFF',
  conteudo: '#F7F8FA',
  borda: '#E3E7EC',
  cartao: '#FFFFFF',

  // semânticas
  acento: '#1F6F78',
  acentoClaro: '#E8F2F3',
  sucesso: '#2E7D5B',
  sucessoClaro: '#E8F4EE',
  atencao: '#C98A14',
  atencaoClaro: '#FBF3E2',
  critico: '#B3392E',
  criticoClaro: '#F8EAE8',

  // texto
  texto: '#111827',
  textoSecundario: '#5B6673',
  textoFraco: '#8A949F',

  // forma
  raio: 10,
  fonte: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const

/** Nível do semáforo — usado por SemaforoDot, KpiCard e StatusCard. */
export type Semaforo = 'verde' | 'ambar' | 'vermelho' | 'cinza'

/** Cores por nível de semáforo. */
export const SEMAFORO_CORES: Record<Semaforo, { cor: string; fundo: string; rotulo: string }> = {
  verde: { cor: PEN.sucesso, fundo: PEN.sucessoClaro, rotulo: 'No alvo' },
  ambar: { cor: PEN.atencao, fundo: PEN.atencaoClaro, rotulo: 'Atenção' },
  vermelho: { cor: PEN.critico, fundo: PEN.criticoClaro, rotulo: 'Crítico' },
  cinza: { cor: PEN.textoFraco, fundo: '#F1F3F5', rotulo: 'Sem dado' },
}

/**
 * Deriva o semáforo a partir do atingimento da meta.
 * Regra única para todo o módulo: >= 100% verde, >= 90% âmbar, abaixo vermelho.
 * `null` (sem dado) devolve cinza — nunca inventa um nível.
 */
export function semaforoPorAtingimento(pct: number | null | undefined): Semaforo {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return 'cinza'
  const n = Number(pct)
  if (n >= 100) return 'verde'
  if (n >= 90) return 'ambar'
  return 'vermelho'
}

/** Formata número em padrão brasileiro; ausência vira "—" (nunca zero falso). */
export function fmtNumero(v: number | null | undefined, casas = 0): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

/** Formata percentual com sinal; ausência vira "—". */
export function fmtPct(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`
}
