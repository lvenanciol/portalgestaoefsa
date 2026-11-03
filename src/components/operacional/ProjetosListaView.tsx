import React, { useState, useMemo } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  PlusCircle,
  AlertTriangle,
  Inbox,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { extrairNomeSemTag, obterIniciaisResponsavel } from '@/lib/responsavel-utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

export interface ProjetoItem {
  id: string
  nome?: string
  descricao?: string
  empresa?: string
  status?: string // 'planejamento' | 'em_andamento' | 'pausado' | 'concluido' | 'em_risco'
  progresso?: number
  responsavel?: string
  prazo?: string
  orcamento?: number
  realizado?: number
  marcos?: any
  riscos?: any
  raci?: any
  origem?: string // 'de projeto' | 'interno' | 'de contrato'
  created?: string
  updated?: string
  [key: string]: any
}

export interface ProjetosListaViewProps {
  itens: ProjetoItem[]
  onAbrirDetalhe: (p: ProjetoItem) => void
  onAbrirNovo: () => void
  onMudarStatus: (p: ProjetoItem, novoStatus: string) => Promise<void> | void
  onExcluir?: (p: ProjetoItem) => Promise<void> | void
}

type SortColumn = 'nome' | 'prazo' | 'progresso' | null
type SortDirection = 'asc' | 'desc'

interface GrupoStatusDef {
  key: string
  label: string
  corText: string
  corChevron: string
  corDot: string
}

const GRUPOS_STATUS: GrupoStatusDef[] = [
  {
    key: 'em_andamento',
    label: 'EM ANDAMENTO',
    corText: 'text-amber-700',
    corChevron: 'text-amber-600',
    corDot: 'bg-amber-500',
  },
  {
    key: 'em_risco',
    label: 'EM RISCO',
    corText: 'text-red-700',
    corChevron: 'text-red-600',
    corDot: 'bg-red-500',
  },
  {
    key: 'planejamento',
    label: 'PLANEJAMENTO',
    corText: 'text-blue-700',
    corChevron: 'text-blue-600',
    corDot: 'bg-blue-500',
  },
  {
    key: 'concluido',
    label: 'CONCLUÍDO',
    corText: 'text-emerald-700',
    corChevron: 'text-emerald-600',
    corDot: 'bg-emerald-500',
  },
]

const STATUS_OPCOES = [
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'em_risco', label: 'Em risco' },
  { key: 'planejamento', label: 'Planejamento' },
  { key: 'concluido', label: 'Concluído' },
]

const STATUS_BADGE_STYLE: Record<string, string> = {
  em_andamento: 'bg-amber-50 text-amber-700 border-amber-200/80',
  em_risco: 'bg-red-50 text-red-700 border-red-200/80',
  planejamento: 'bg-gray-100 text-gray-700 border-gray-200/80',
  concluido: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  pausado: 'bg-orange-50 text-orange-700 border-orange-200/80',
}

const fmtBRLCurto = (v?: number) => {
  if (typeof v !== 'number' || isNaN(v) || v === 0) return 'R$ 0'
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

const fmtDataPrazo = (s?: string) => {
  if (!s) return '—'
  const d = String(s).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s
}

const parseJson = (v: any) => {
  if (Array.isArray(v)) return v
  try {
    return JSON.parse(v || '[]')
  } catch {
    return []
  }
}

// Verifica se o projeto está com prazo vencido
const isPrazoVencido = (prazo?: string, status?: string) => {
  if (!prazo) return false
  if (status === 'concluido') return false
  const iso = String(prazo).slice(0, 10)
  const hoje = new Date().toISOString().slice(0, 10)
  return iso < hoje
}

// Obtém status efetivo do projeto (considerando riscos mapeados se marcados como em risco)
const getStatusEfetivo = (p: ProjetoItem): string => {
  const st = String(p.status || '').toLowerCase()
  if (st === 'em_risco') return 'em_risco'
  if (st === 'em_andamento') return 'em_andamento'
  if (st === 'planejamento') return 'planejamento'
  if (st === 'concluido') return 'concluido'
  // se tiver riscos mapeados e não concluído, pode ser em_risco
  const riscos = parseJson(p.riscos)
  if (riscos.length > 0 && st !== 'concluido') return 'em_risco'
  return st || 'planejamento'
}

// Determina badge de origem do projeto
const getOrigemBadge = (p: ProjetoItem): { label: string; style: string } => {
  if (p.origem) {
    const orig = String(p.origem).toLowerCase()
    if (orig.includes('contrato')) {
      return { label: 'de contrato', style: 'bg-purple-50 text-purple-700 border-purple-200' }
    }
    if (orig.includes('interno')) {
      return { label: 'interno', style: 'bg-gray-100 text-gray-700 border-gray-200' }
    }
    if (orig.includes('projeto')) {
      return { label: 'de projeto', style: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
    }
    return { label: p.origem, style: 'bg-blue-50 text-blue-700 border-blue-200' }
  }

  // Heurística baseada no nome/empresa se não fornecido
  const nomeNorm = String(p.nome || '').toLowerCase()
  if (
    nomeNorm.includes('infraestrutura') ||
    nomeNorm.includes('processos') ||
    nomeNorm.includes('interno')
  ) {
    return { label: 'interno', style: 'bg-gray-100 text-gray-700 border-gray-200' }
  }
  if (
    nomeNorm.includes('marketing') ||
    nomeNorm.includes('fornecedor') ||
    nomeNorm.includes('contrato')
  ) {
    return { label: 'de contrato', style: 'bg-purple-50 text-purple-700 border-purple-200' }
  }
  return { label: 'de projeto', style: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
}

// Cores de avatar de iniciais consistentes
const AVATAR_CORES = [
  'bg-emerald-600 text-white',
  'bg-blue-600 text-white',
  'bg-amber-600 text-white',
  'bg-purple-600 text-white',
  'bg-teal-600 text-white',
  'bg-slate-700 text-white',
]

const getAvatarCor = (nome?: string) => {
  if (!nome) return 'bg-gray-400 text-white'
  let h = 0
  for (let i = 0; i < nome.length; i++) {
    h = (h << 5) - h + nome.charCodeAt(i)
  }
  return AVATAR_CORES[Math.abs(h) % AVATAR_CORES.length]
}

export function ProjetosListaView({
  itens,
  onAbrirDetalhe,
  onAbrirNovo,
  onMudarStatus,
  onExcluir,
}: ProjetosListaViewProps) {
  // 1. GRUPOS (accordion): Primeiro grupo expandido por padrão ('em_andamento')
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({
    em_andamento: true,
    em_risco: false,
    planejamento: false,
    concluido: false,
  })

  const toggleGrupo = (key: string) => {
    setGruposAbertos((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  // 3. ORDENAÇÃO: headers PROJETO, PRAZO, PROGRESSO
  const [sortCol, setSortCol] = useState<SortColumn>(null)
  const [sortDir, setSortDir] = useState<SortDirection>('asc')

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      if (sortDir === 'asc') {
        setSortDir('desc')
      } else {
        setSortCol(null)
        setSortDir('asc')
      }
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  // Agrupamento dos itens filtrados por status
  const itensPorStatus = useMemo(() => {
    const acc: Record<string, ProjetoItem[]> = {
      em_andamento: [],
      em_risco: [],
      planejamento: [],
      concluido: [],
    }

    itens.forEach((p) => {
      const st = getStatusEfetivo(p)
      if (acc[st]) {
        acc[st].push(p)
      } else {
        // Fallback: se status for pausado ou desconhecido, agrupa em planejamento
        acc.planejamento.push(p)
      }
    })

    // Aplica ordenação em cada grupo se houver coluna selecionada
    if (sortCol) {
      Object.keys(acc).forEach((k) => {
        acc[k].sort((a, b) => {
          let valA: any
          let valB: any

          if (sortCol === 'nome') {
            valA = (a.nome || '').toLowerCase()
            valB = (b.nome || '').toLowerCase()
            const cmp = valA.localeCompare(valB, 'pt-BR')
            return sortDir === 'asc' ? cmp : -cmp
          }

          if (sortCol === 'prazo') {
            valA = a.prazo ? String(a.prazo).slice(0, 10) : '9999-99-99'
            valB = b.prazo ? String(b.prazo).slice(0, 10) : '9999-99-99'
            const cmp = valA.localeCompare(valB)
            return sortDir === 'asc' ? cmp : -cmp
          }

          if (sortCol === 'progresso') {
            valA = Number(a.progresso) || 0
            valB = Number(b.progresso) || 0
            return sortDir === 'asc' ? valA - valB : valB - valA
          }

          return 0
        })
      })
    }

    return acc
  }, [itens, sortCol, sortDir])

  const renderSortIndicator = (col: SortColumn) => {
    if (sortCol !== col) {
      return <ArrowUpDown className="h-3 w-3 text-gray-400 opacity-60 group-hover:opacity-100" />
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-[#1B5E20] font-bold" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[#1B5E20] font-bold" />
    )
  }

  return (
    <div className="space-y-4">
      {/* 8 COLUNAS CABEÇALHO GLOBAL */}
      <div className="bg-white rounded-xl border border-gray-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-[10px] font-bold text-gray-500 uppercase tracking-wider select-none">
                {/* 1. PROJETO (ordenável) */}
                <th
                  onClick={() => handleSort('nome')}
                  className="py-3 px-4 cursor-pointer hover:bg-gray-100/80 transition-colors group min-w-[220px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Projeto</span>
                    {renderSortIndicator('nome')}
                  </div>
                </th>

                {/* 2. STATUS */}
                <th className="py-3 px-4 min-w-[120px]">Status</th>

                {/* 3. RESPONSÁVEL */}
                <th className="py-3 px-4 min-w-[160px]">Responsável</th>

                {/* 4. EMPRESA */}
                <th className="py-3 px-4 min-w-[140px]">Empresa</th>

                {/* 5. PROGRESSO (ordenável) */}
                <th
                  onClick={() => handleSort('progresso')}
                  className="py-3 px-4 cursor-pointer hover:bg-gray-100/80 transition-colors group min-w-[130px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Progresso</span>
                    {renderSortIndicator('progresso')}
                  </div>
                </th>

                {/* 6. ORÇAMENTO */}
                <th className="py-3 px-4 min-w-[170px]">Orçamento (R$/Real.)</th>

                {/* 7. PRAZO (ordenável) */}
                <th
                  onClick={() => handleSort('prazo')}
                  className="py-3 px-4 cursor-pointer hover:bg-gray-100/80 transition-colors group min-w-[120px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Prazo</span>
                    {renderSortIndicator('prazo')}
                  </div>
                </th>

                {/* 8. AÇÕES */}
                <th className="py-3 px-4 text-right min-w-[130px]">Ações</th>
              </tr>
            </thead>

            {/* Renderização de cada Grupo em accordion */}
            {GRUPOS_STATUS.map((grupo) => {
              const itensDoGrupo = itensPorStatus[grupo.key] || []
              const aberto = gruposAbertos[grupo.key] ?? false
              const count = itensDoGrupo.length

              return (
                <tbody key={grupo.key} className="border-b border-gray-200 last:border-b-0">
                  {/* Linha de Cabeçalho do Grupo (Accordion) */}
                  <tr
                    onClick={() => toggleGrupo(grupo.key)}
                    className="bg-gray-50/70 hover:bg-gray-100/70 cursor-pointer border-t border-gray-200 transition-colors select-none"
                  >
                    <td colSpan={8} className="py-2.5 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'p-0.5 rounded transition-transform duration-200',
                              grupo.corChevron,
                            )}
                          >
                            {aberto ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </span>
                          <span
                            className={cn(
                              'text-xs font-bold uppercase tracking-wider flex items-center gap-1.5',
                              grupo.corText,
                            )}
                          >
                            <span
                              className={cn('w-2 h-2 rounded-full inline-block', grupo.corDot)}
                            />
                            <span>
                              {grupo.label} ({count})
                            </span>
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-400 font-medium">
                          {count} {count === 1 ? 'projeto' : 'projetos'} ·{' '}
                          {aberto ? 'recolher' : 'expandir'}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Linhas de projetos do grupo quando aberto */}
                  {aberto && (
                    <>
                      {count === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-6 px-4 text-center bg-white">
                            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                              <Inbox className="h-4 w-4 text-gray-300" />
                              <span>
                                Nenhum projeto {grupo.label.toLowerCase()} com os filtros atuais
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        itensDoGrupo.map((p) => {
                          const statusEfetivo = getStatusEfetivo(p)
                          const vencido = isPrazoVencido(p.prazo, statusEfetivo)
                          const ehEmRisco = statusEfetivo === 'em_risco'
                          const destaqueAtencao = ehEmRisco || vencido

                          const progresso = Number(p.progresso) || 0
                          const orc = Number(p.orcamento) || 0
                          const rea = Number(p.realizado) || 0
                          const pctOrc = orc > 0 ? Math.min(100, Math.round((rea / orc) * 100)) : 0

                          const origem = getOrigemBadge(p)
                          const nomeSemTag =
                            extrairNomeSemTag(p.responsavel) || p.responsavel || '—'
                          const iniciais = obterIniciaisResponsavel(p.responsavel)
                          const corAvatar = getAvatarCor(nomeSemTag)

                          const statusBadgeClass =
                            STATUS_BADGE_STYLE[statusEfetivo] || STATUS_BADGE_STYLE.planejamento

                          const labelStatus =
                            STATUS_OPCOES.find((s) => s.key === statusEfetivo)?.label ||
                            statusEfetivo.replace('_', ' ')

                          return (
                            <tr
                              key={p.id}
                              onClick={() => onAbrirDetalhe(p)}
                              className={cn(
                                'bg-white hover:bg-gray-50/80 transition-colors cursor-pointer border-t border-gray-100',
                                // 5. LINHAS DE ATENÇÃO: borda-esquerda vermelha de 3px quando 'em risco' ou prazo vencido
                                destaqueAtencao &&
                                  'border-l-[3px] border-l-red-500 bg-red-50/[0.02]',
                              )}
                            >
                              {/* 1. PROJETO: título + badge pequeno de origem ('de projeto' / 'interno' / 'de contrato') */}
                              <td className="py-3 px-4 font-semibold text-gray-900 max-w-[260px]">
                                <div className="space-y-1">
                                  <div
                                    className="font-bold text-gray-900 leading-snug truncate"
                                    title={p.nome}
                                  >
                                    {p.nome}
                                  </div>
                                  <div>
                                    <span
                                      className={cn(
                                        'inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold border',
                                        origem.style,
                                      )}
                                    >
                                      {origem.label}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* 2. STATUS */}
                              <td className="py-3 px-4">
                                <span
                                  className={cn(
                                    'text-[10px] font-bold px-2 py-0.5 rounded-full inline-block border capitalize',
                                    statusBadgeClass,
                                  )}
                                >
                                  {labelStatus}
                                </span>
                              </td>

                              {/* 3. RESPONSÁVEL: avatar com iniciais + nome */}
                              <td className="py-3 px-4 text-gray-700">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div
                                    className={cn(
                                      'h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 shadow-2xs',
                                      corAvatar,
                                    )}
                                  >
                                    {iniciais}
                                  </div>
                                  <span
                                    className="font-medium text-gray-800 truncate"
                                    title={nomeSemTag}
                                  >
                                    {nomeSemTag}
                                  </span>
                                </div>
                              </td>

                              {/* 4. EMPRESA */}
                              <td className="py-3 px-4 text-gray-700">
                                <span
                                  className="font-medium text-gray-800 truncate block"
                                  title={p.empresa || 'Grupo'}
                                >
                                  {p.empresa || 'Grupo'}
                                </span>
                              </td>

                              {/* 5. PROGRESSO: barra compacta + percentual */}
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2 min-w-[110px]">
                                  <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-[#1B5E20]"
                                      style={{ width: `${Math.min(100, progresso)}%` }}
                                    />
                                  </div>
                                  <span className="font-bold text-gray-800 tabular-nums shrink-0 text-[11px]">
                                    {progresso}%
                                  </span>
                                </div>
                              </td>

                              {/* 6. ORÇAMENTO: 'R$ X / R$ Y' + mini-barra de execução */}
                              <td className="py-3 px-4 tabular-nums text-gray-700">
                                {orc > 0 ? (
                                  <div className="space-y-1 min-w-[140px]">
                                    <div className="text-[11px] font-semibold text-gray-800">
                                      {fmtBRLCurto(rea)} / {fmtBRLCurto(orc)}
                                    </div>
                                    <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                                      <div
                                        className={cn(
                                          'h-full rounded-full',
                                          pctOrc > 100 ? 'bg-red-500' : 'bg-amber-500',
                                        )}
                                        style={{ width: `${pctOrc}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-[11px]">Não orçado</span>
                                )}
                              </td>

                              {/* 7. PRAZO: data + micro-tag vermelha 'atrasado' quando vencido */}
                              <td className="py-3 px-4 tabular-nums">
                                <div className="space-y-0.5">
                                  <div className="text-gray-700 text-[11px]">
                                    {fmtDataPrazo(p.prazo)}
                                  </div>
                                  {vencido && (
                                    <div>
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-50 text-red-600 border border-red-200">
                                        <AlertTriangle className="h-2.5 w-2.5" /> atrasado
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* 8. AÇÕES: select de status + menu '...' */}
                              <td
                                className="py-3 px-4 text-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  {/* Select de status */}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className="h-7 px-2 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-medium text-gray-700 inline-flex items-center gap-1 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#1B5E20]"
                                        title="Alterar status do projeto"
                                      >
                                        <span className="truncate max-w-[85px] capitalize">
                                          {labelStatus}
                                        </span>
                                        <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-40 bg-white">
                                      {STATUS_OPCOES.map((op) => {
                                        const ativo = statusEfetivo === op.key
                                        return (
                                          <DropdownMenuItem
                                            key={op.key}
                                            onClick={() => onMudarStatus(p, op.key)}
                                            className={cn(
                                              'flex items-center justify-between text-xs font-medium cursor-pointer',
                                              ativo && 'bg-emerald-50 text-[#1B5E20] font-bold',
                                            )}
                                          >
                                            <span>{op.label}</span>
                                            {ativo && (
                                              <Check className="h-3.5 w-3.5 text-[#1B5E20]" />
                                            )}
                                          </DropdownMenuItem>
                                        )
                                      })}
                                    </DropdownMenuContent>
                                  </DropdownMenu>

                                  {/* Menu '...' */}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className="h-7 w-7 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
                                        title="Mais opções"
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-36 bg-white">
                                      <DropdownMenuItem
                                        onClick={() => onAbrirDetalhe(p)}
                                        className="flex items-center gap-2 text-xs font-medium cursor-pointer"
                                      >
                                        <Pencil className="h-3.5 w-3.5 text-gray-500" />
                                        <span>Detalhes</span>
                                      </DropdownMenuItem>
                                      {onExcluir && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            onClick={() => onExcluir(p)}
                                            className="flex items-center gap-2 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                                          >
                                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                            <span>Excluir</span>
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </>
                  )}
                </tbody>
              )
            })}
          </table>
        </div>

        {/* 4. RODAPÉ DA TABELA: Link '+ Adicionar projeto' (abre o modal existente) */}
        <div className="p-3.5 bg-gray-50/60 border-t border-gray-200 flex items-center justify-start">
          <button
            type="button"
            onClick={onAbrirNovo}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1B5E20] hover:text-[#0F3D13] hover:underline cursor-pointer transition-colors"
          >
            <PlusCircle className="h-4 w-4 text-[#1B5E20]" />
            <span>Adicionar projeto</span>
          </button>
        </div>
      </div>
    </div>
  )
}
