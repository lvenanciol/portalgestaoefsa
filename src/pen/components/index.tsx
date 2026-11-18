import { useMemo, useState } from 'react'
import { PEN, SEMAFORO_CORES, type Semaforo, fmtNumero, fmtPct } from '@/pen/tokens'
import { cn } from '@/lib/utils'

// ============================================================================
// FASE 0.2 — COMPONENTES BASE DO /pen
//
// Todos os sete vivem neste arquivo de propósito: é uma biblioteca pequena e
// coesa, e manter junto evita que cada tela importe de um caminho diferente e
// acabe com uma cópia divergente.
// ============================================================================

/** Ponto do semáforo, com rótulo opcional. */
export function SemaforoDot({
  nivel,
  rotulo,
  tamanho = 8,
}: {
  nivel: Semaforo
  rotulo?: string
  tamanho?: number
}) {
  const c = SEMAFORO_CORES[nivel] || SEMAFORO_CORES.cinza
  return (
    <span className="inline-flex items-center gap-1.5" title={rotulo || c.rotulo}>
      <span
        className="inline-block shrink-0 rounded-full"
        style={{ width: tamanho, height: tamanho, background: c.cor }}
      />
      {rotulo && (
        <span className="text-[11px] font-semibold" style={{ color: c.cor }}>
          {rotulo}
        </span>
      )}
    </span>
  )
}

/** Barra de progresso com total configurável. */
export function ProgressBar({
  valor,
  max = 100,
  cor,
  altura = 6,
  rotuloDireita,
}: {
  valor: number | null | undefined
  max?: number
  cor?: string
  altura?: number
  rotuloDireita?: string
}) {
  const semDado = valor === null || valor === undefined || Number.isNaN(Number(valor))
  const pct = semDado ? 0 : Math.max(0, Math.min(100, (Number(valor) / (max || 100)) * 100))
  return (
    <div className="w-full">
      <div
        className="w-full overflow-hidden"
        style={{ height: altura, borderRadius: 999, background: '#EDF0F3' }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            background: semDado ? '#DDE2E7' : cor || PEN.acento,
            borderRadius: 999,
          }}
        />
      </div>
      {rotuloDireita && (
        <p className="mt-1 text-[10px] font-medium" style={{ color: PEN.textoFraco }}>
          {rotuloDireita}
        </p>
      )}
    </div>
  )
}

export type BadgeVariante = 'validated' | 'pending' | 'discarded'

const BADGE: Record<BadgeVariante, { cor: string; fundo: string; rotulo: string }> = {
  validated: { cor: PEN.sucesso, fundo: PEN.sucessoClaro, rotulo: 'Validado' },
  pending: { cor: PEN.atencao, fundo: PEN.atencaoClaro, rotulo: 'Pendente' },
  discarded: { cor: PEN.critico, fundo: PEN.criticoClaro, rotulo: 'Descartado' },
}

/** Selo de estado de validação. */
export function Badge({
  variante,
  rotulo,
  className,
}: {
  variante: BadgeVariante
  rotulo?: string
  className?: string
}) {
  const b = BADGE[variante]
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide',
        className,
      )}
      style={{
        color: b.cor,
        background: b.fundo,
        borderRadius: 6,
        border: `1px solid ${b.cor}22`,
      }}
    >
      {rotulo ?? b.rotulo}
    </span>
  )
}

/** Cabeçalho de seção com ação opcional à direita. */
export function SectionHeader({
  titulo,
  descricao,
  acao,
  className,
}: {
  titulo: string
  descricao?: string
  acao?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[14px] font-bold leading-tight" style={{ color: PEN.texto }}>
          {titulo}
        </h2>
        {descricao && (
          <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: PEN.textoSecundario }}>
            {descricao}
          </p>
        )}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  )
}

/**
 * KPI com valor, variação, meta, semáforo e barra de progresso.
 * `valor`/`variacao`/`meta` aceitam null: sem dado mostra "—" e não calcula.
 */
export function KpiCard({
  label,
  valor,
  variacao,
  meta,
  semaforo,
  formato = 'numero',
  casas = 0,
  sufixo,
  className,
}: {
  label: string
  valor: number | null | undefined
  variacao?: number | null
  meta?: number | null
  semaforo?: Semaforo
  formato?: 'numero' | 'percentual' | 'texto' | 'moeda' | 'meses'
  casas?: number
  sufixo?: string
  className?: string
}) {
  const semDado = valor === null || valor === undefined
  // 'moeda': milhares em "mil", milhões em "mi" — leitura executiva
  const texto =
    formato === 'texto'
      ? String(valor ?? '—')
      : formato === 'percentual'
        ? fmtPct(valor, casas)
        : formato === 'moeda'
          ? semDado
            ? '—'
            : Number(valor) >= 1_000_000
              ? `R$ ${fmtNumero(Number(valor) / 1_000_000, casas || 1)} mi`
              : Number(valor) >= 1_000
                ? `R$ ${fmtNumero(Number(valor) / 1_000, 0)} mil`
                : `R$ ${fmtNumero(valor, 0)}`
          : fmtNumero(valor, casas)

  const atingimento =
    meta !== null && meta !== undefined && meta !== 0 && !semDado
      ? (Number(valor) / Number(meta)) * 100
      : null
  const nivel =
    semaforo ||
    (atingimento !== null
      ? atingimento >= 100
        ? 'verde'
        : atingimento >= 90
          ? 'ambar'
          : 'vermelho'
      : 'cinza')
  const cores = SEMAFORO_CORES[nivel]

  return (
    <div
      className={cn('p-3.5', className)}
      style={{
        background: PEN.cartao,
        borderRadius: PEN.raio,
        border: `1px solid ${PEN.borda}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-[10.5px] font-bold uppercase leading-tight tracking-wide"
          style={{ color: PEN.textoFraco }}
        >
          {label}
        </p>
        <SemaforoDot nivel={nivel} />
      </div>

      <div className="mt-1.5 flex items-baseline gap-1.5 flex-wrap">
        <span
          className="text-[22px] font-extrabold leading-none tabular-nums"
          style={{ color: PEN.texto }}
        >
          {texto}
        </span>
        {sufixo && !semDado && (
          <span className="text-[12px] font-semibold" style={{ color: PEN.textoSecundario }}>
            {sufixo}
          </span>
        )}
        {variacao !== null && variacao !== undefined && (
          <span
            className="text-[11px] font-bold tabular-nums"
            style={{ color: Number(variacao) >= 0 ? PEN.sucesso : PEN.critico }}
            title="Variação contra o período anterior"
          >
            {fmtPct(variacao)}
          </span>
        )}
      </div>

      {meta !== null && meta !== undefined && (
        <div className="mt-2.5">
          <ProgressBar valor={semDado ? null : Number(valor)} max={Number(meta)} cor={cores.cor} />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium" style={{ color: PEN.textoFraco }}>
              {/* 18/11/2026 — meta e atingimento SEM sinal de "+":
                  a tela mostrava "Meta +9,1%" e "Meta +3,0%" porque fmtPct
                  prefixa "+" em qualquer positivo. Meta não é variação. */}
              Meta{' '}
              {formato === 'percentual'
                ? `${fmtNumero(meta, casas)}%`
                : formato === 'moeda'
                  ? Number(meta) >= 1_000_000
                    ? `R$ ${fmtNumero(Number(meta) / 1_000_000, casas || 1)} mi`
                    : `R$ ${fmtNumero(meta, 0)}`
                  : fmtNumero(meta, casas)}
            </span>
            <span className="text-[10px] font-bold tabular-nums" style={{ color: cores.cor }}>
              {semDado || atingimento === null ? '—' : `${fmtNumero(atingimento, 0)}%`}
            </span>
          </div>
        </div>
      )}

      {semDado && (
        <p className="mt-2 text-[10px] font-semibold" style={{ color: PEN.textoFraco }}>
          sem dado
        </p>
      )}
    </div>
  )
}

/** Cartão de status: título, estado com semáforo e descrição. */
export function StatusCard({
  titulo,
  estado,
  descricao,
  acao,
  className,
}: {
  titulo: string
  estado: Semaforo
  descricao?: string
  acao?: React.ReactNode
  className?: string
}) {
  const c = SEMAFORO_CORES[estado] || SEMAFORO_CORES.cinza
  return (
    <div
      className={cn('p-3.5', className)}
      style={{
        background: PEN.cartao,
        borderRadius: PEN.raio,
        border: `1px solid ${PEN.borda}`,
        borderLeft: `3px solid ${c.cor}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-bold" style={{ color: PEN.texto }}>
            {titulo}
          </p>
          {descricao && (
            <p className="mt-0.5 text-[11px] leading-snug" style={{ color: PEN.textoSecundario }}>
              {descricao}
            </p>
          )}
        </div>
        {acao}
      </div>
      <div className="mt-2">
        <SemaforoDot nivel={estado} rotulo={c.rotulo} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DataTable — ordenação por clique, densidade compacta, colunas tipadas
// ---------------------------------------------------------------------------

export interface ColunaTabela<T = any> {
  key: string
  label: string
  /** valor usado para ordenar; default: row[key] */
  valor?: (row: T) => string | number | null | undefined
  /** render da célula */
  render?: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  /** largura mínima em px */
  largura?: number
  /** habilita ordenação (default: true) */
  ordenavel?: boolean
}

function valorPadrao(row: any, key: string) {
  const v = row?.[key]
  if (v === null || v === undefined) return ''
  return typeof v === 'number' ? v : String(v).toLowerCase()
}

export function DataTable<T = any>({
  colunas,
  dados,
  chaveLinha,
  ordemInicial,
  onLinhaClique,
  vazio = 'Nenhum registro.',
  className,
}: {
  colunas: ColunaTabela<T>[]
  dados: T[]
  /** função para chave única da linha */
  chaveLinha: (row: T, i: number) => string
  ordemInicial?: { key: string; dir: 'asc' | 'desc' }
  onLinhaClique?: (row: T) => void
  vazio?: React.ReactNode
  className?: string
}) {
  const [sortKey, setSortKey] = useState<string | null>(ordemInicial?.key ?? null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(ordemInicial?.dir ?? 'asc')

  const ordenados = useMemo(() => {
    if (!sortKey) return dados
    const col = colunas.find((c) => c.key === sortKey)
    if (!col) return dados
    const getter = col.valor || ((r: any) => valorPadrao(r, col.key))
    return [...dados].sort((a, b) => {
      const va = getter(a)
      const vb = getter(b)
      const vaVazio = va === null || va === undefined || va === ''
      const vbVazio = vb === null || vb === undefined || vb === ''
      if (vaVazio && vbVazio) return 0
      if (vaVazio) return 1
      if (vbVazio) return -1
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
      const sa = String(va)
      const sb = String(vb)
      return sortDir === 'asc' ? sa.localeCompare(sb, 'pt-BR') : sb.localeCompare(sa, 'pt-BR')
    })
  }, [dados, colunas, sortKey, sortDir])

  const alternar = (c: ColunaTabela<T>) => {
    if (c.ordenavel === false) return
    if (sortKey === c.key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(c.key)
      setSortDir('asc')
    }
  }

  return (
    <div
      className={cn('overflow-x-auto', className)}
      style={{
        background: PEN.cartao,
        borderRadius: PEN.raio,
        border: `1px solid ${PEN.borda}`,
      }}
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr style={{ background: '#FAFBFC' }}>
            {colunas.map((c) => {
              const ativo = sortKey === c.key
              return (
                <th
                  key={c.key}
                  onClick={() => alternar(c)}
                  className={cn(
                    'select-none whitespace-nowrap px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide',
                    c.ordenavel !== false && 'cursor-pointer hover:bg-black/[0.03]',
                  )}
                  style={{
                    color: ativo ? PEN.acento : PEN.textoFraco,
                    borderBottom: `1px solid ${PEN.borda}`,
                    textAlign: c.align || 'left',
                    minWidth: c.largura,
                  }}
                  title={c.ordenavel === false ? undefined : `Ordenar por ${c.label}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {ativo && <span className="text-[8px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {ordenados.length === 0 ? (
            <tr>
              <td
                colSpan={colunas.length}
                className="px-2.5 py-6 text-center text-[12px]"
                style={{ color: PEN.textoFraco }}
              >
                {vazio}
              </td>
            </tr>
          ) : (
            ordenados.map((row, i) => (
              <tr
                key={chaveLinha(row, i)}
                onClick={onLinhaClique ? () => onLinhaClique(row) : undefined}
                className={cn(
                  'transition-colors',
                  onLinhaClique && 'cursor-pointer',
                  'hover:bg-[#F7F9FA]',
                )}
              >
                {colunas.map((c) => (
                  <td
                    key={c.key}
                    className="whitespace-nowrap px-2.5 py-1.5 text-[11.5px]"
                    style={{
                      color: PEN.texto,
                      borderBottom: `1px solid #F0F2F5`,
                      textAlign: c.align || 'left',
                    }}
                  >
                    {c.render ? c.render(row) : String((row as any)?.[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
