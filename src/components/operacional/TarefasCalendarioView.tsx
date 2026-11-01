import React, { useState, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertTriangle,
  Repeat,
  Paperclip,
  CheckCircle2,
  Clock,
  HelpCircle,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmpresaIcon } from '@/components/common/EmpresaIcon'
import { cn } from '@/lib/utils'

export interface TarefasCalendarioViewProps {
  itens: any[] // tarefas filtradas
  hoje: string // YYYY-MM-DD
  onAbrirDetalhe: (t: any) => void
  onAbrirNova?: (status?: string, dataPrazo?: string) => void
  mesRef: string
  setMesRef: React.Dispatch<React.SetStateAction<string>>
  diasMes: (string | null)[]
}

const DIAS_SEMANA_NOMES = [
  { curto: 'SEG', indice: 0 },
  { curto: 'TER', indice: 1 },
  { curto: 'QUA', indice: 2 },
  { curto: 'QUI', indice: 3 },
  { curto: 'SEX', indice: 4 },
  { curto: 'SÁB', indice: 5 },
  { curto: 'DOM', indice: 6 },
]

const PRIO_BADGE: Record<string, string> = {
  P1: 'bg-red-50 text-red-700 border border-red-200/80',
  P2: 'bg-amber-50 text-amber-800 border border-amber-200/80',
  P3: 'bg-blue-50 text-blue-700 border border-blue-200/80',
}

const PRIO_BORDER: Record<string, string> = {
  P1: 'border-l-red-500',
  P2: 'border-l-amber-500',
  P3: 'border-l-blue-500',
}

const MESES_ABREV = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]

// Gera cores distintas para avatar
const AVATAR_COLORS = [
  'bg-emerald-700 text-white',
  'bg-blue-700 text-white',
  'bg-purple-700 text-white',
  'bg-amber-700 text-white',
  'bg-rose-700 text-white',
  'bg-teal-700 text-white',
  'bg-indigo-700 text-white',
]

function getAvatarColor(name: string): string {
  if (!name) return 'bg-gray-400 text-white'
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

function getIniciais(nome?: string): string {
  if (!nome) return '?'
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function formatarDataBR(iso?: string): string {
  if (!iso) return ''
  const partes = String(iso).slice(0, 10).split('-')
  if (partes.length !== 3) return iso
  return `${partes[2]}/${partes[1]}/${partes[0]}`
}

function parseISODate(isoStr: string): Date {
  const [y, m, d] = isoStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

export function TarefasCalendarioView({
  itens,
  hoje,
  onAbrirDetalhe,
  mesRef,
  setMesRef,
  diasMes,
}: TarefasCalendarioViewProps) {
  // Modo de visualização: 'semana' (padrão) ou 'mes'
  const [modo, setModo] = useState<'semana' | 'mes'>('semana')

  // Data de referência da semana: inicia com hoje
  const [dataRefSemana, setDataRefSemana] = useState<string>(() => hoje)

  // Filtro opcional por pessoa no painel de carga
  const [filtroResponsavel, setFiltroResponsavel] = useState<string | null>(null)

  // Cálculo da semana (Segunda a Domingo) contendo dataRefSemana
  const diasDaSemana = useMemo(() => {
    const curDate = parseISODate(dataRefSemana)
    const dayOfWeek = curDate.getDay() // 0 = Domingo, 1 = Segunda, ...
    const diffToSegunda = (dayOfWeek + 6) % 7 // Segunda = 0, Terça = 1, ... Domingo = 6
    const seg = new Date(curDate)
    seg.setDate(curDate.getDate() - diffToSegunda)

    const dias = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(seg)
      d.setDate(seg.getDate() + i)
      const iso = toISODate(d)
      dias.push({
        iso,
        numero: d.getDate(),
        diaSemana: DIAS_SEMANA_NOMES[i].curto,
        isFimDeSemana: i >= 5, // Sábado ou Domingo
        isHoje: iso === hoje,
        dateObj: d,
      })
    }
    return dias
  }, [dataRefSemana, hoje])

  // Intervalo por extenso para o navegador: "27 out — 02 nov 2026"
  const intervaloPorExtenso = useMemo(() => {
    if (diasDaSemana.length === 0) return ''
    const prim = diasDaSemana[0].dateObj
    const ult = diasDaSemana[6].dateObj

    const diaPrim = String(prim.getDate()).padStart(2, '0')
    const mesPrim = MESES_ABREV[prim.getMonth()]
    const anoPrim = prim.getFullYear()

    const diaUlt = String(ult.getDate()).padStart(2, '0')
    const mesUlt = MESES_ABREV[ult.getMonth()]
    const anoUlt = ult.getFullYear()

    if (anoPrim === anoUlt) {
      if (mesPrim === mesUlt) {
        return `${diaPrim} — ${diaUlt} ${mesPrim} ${anoPrim}`
      }
      return `${diaPrim} ${mesPrim} — ${diaUlt} ${mesUlt} ${anoPrim}`
    }
    return `${diaPrim} ${mesPrim} ${anoPrim} — ${diaUlt} ${mesUlt} ${anoUlt}`
  }, [diasDaSemana])

  // Navegação de semana
  const avancarSemana = () => {
    const d = parseISODate(dataRefSemana)
    d.setDate(d.getDate() + 7)
    setDataRefSemana(toISODate(d))
  }

  const voltarSemana = () => {
    const d = parseISODate(dataRefSemana)
    d.setDate(d.getDate() - 7)
    setDataRefSemana(toISODate(d))
  }

  const irParaHoje = () => {
    setDataRefSemana(hoje)
    setMesRef(hoje.slice(0, 7))
  }

  // Conjunto de datas da semana para filtros e totais da semana
  const isoSemanaSet = useMemo(() => new Set(diasDaSemana.map((d) => d.iso)), [diasDaSemana])
  const [dataInicioSemana, dataFimSemana] = useMemo(() => {
    if (diasDaSemana.length === 0) return ['', '']
    return [diasDaSemana[0].iso, diasDaSemana[6].iso]
  }, [diasDaSemana])

  // Tarefas da semana atual (com prazo na semana ou sem prazo no escopo)
  const tarefasDaSemana = useMemo(() => {
    return itens.filter((t) => {
      const prazo = t.prazo ? String(t.prazo).slice(0, 10) : ''
      return prazo >= dataInicioSemana && prazo <= dataFimSemana
    })
  }, [itens, dataInicioSemana, dataFimSemana])

  // Totais da semana para a faixa lateral direita:
  // - "Sem prazo" (tarefas gerais do filtro que não têm prazo)
  // - "Atrasadas" (tarefas com prazo vencido até hoje que não foram concluídas)
  // - "Concluídas" (tarefas da semana com status concluído)
  const totaisSemana = useMemo(() => {
    const semPrazo = itens.filter((t) => !t.prazo || !String(t.prazo).trim()).length
    const atrasadas = itens.filter(
      (t) => t.status_kanban !== 'concluido' && t.prazo && String(t.prazo).slice(0, 10) < hoje,
    ).length
    const concluidasSemana = tarefasDaSemana.filter((t) => t.status_kanban === 'concluido').length

    return { semPrazo, atrasadas, concluidas: concluidasSemana }
  }, [itens, tarefasDaSemana, hoje])

  // Carga por pessoa na semana:
  // Agrupa responsáveis presentes nas tarefas da semana (e todas se necessário)
  const cargaPorPessoa = useMemo(() => {
    const mapa = new Map<string, number>()
    tarefasDaSemana.forEach((t) => {
      const resp = (t.responsavel || '').trim() || 'Sem responsável'
      mapa.set(resp, (mapa.get(resp) || 0) + 1)
    })

    const lista = Array.from(mapa.entries()).map(([nome, qtd]) => ({
      nome,
      qtd,
    }))

    // Ordena do maior para o menor volume
    lista.sort((a, b) => b.qtd - a.qtd)

    const totalTarefasSemana = tarefasDaSemana.length || 1
    const maiorVolume = lista.length > 0 ? lista[0].qtd : 1

    return lista.map((item) => {
      // Porcentagem relativa ao total da semana ou normalizada para a barra
      const pct = Math.min(100, Math.round((item.qtd / totalTarefasSemana) * 100))
      // Carga alta: se concentra mais de 35% do volume ou tem >= 4 tarefas na semana
      const isAltaCarga =
        item.qtd >= 4 || (lista.length > 1 && item.qtd === maiorVolume && item.qtd >= 3)
      return {
        ...item,
        pct,
        isAltaCarga,
      }
    })
  }, [tarefasDaSemana])

  // Lista de avatares com resumo no topo do navegador
  const responsaveisAtivos = useMemo(() => {
    const nomes = Array.from(
      new Set(tarefasDaSemana.map((t) => (t.responsavel || '').trim()).filter(Boolean)),
    )
    return nomes.slice(0, 5)
  }, [tarefasDaSemana])

  // Tarefas por dia na semana (aplica filtroResponsavel se ativo)
  const tarefasPorDiaSemana = (diaIso: string) => {
    return itens.filter((t) => {
      const prazoIso = t.prazo ? String(t.prazo).slice(0, 10) : ''
      if (prazoIso !== diaIso) return false
      if (filtroResponsavel) {
        const resp = (t.responsavel || '').trim() || 'Sem responsável'
        if (resp !== filtroResponsavel) return false
      }
      return true
    })
  }

  // Tarefas por dia no mês
  const tarefasPorDiaMes = (diaIso: string) => {
    return itens.filter((t) => {
      const prazoIso = t.prazo ? String(t.prazo).slice(0, 10) : ''
      return prazoIso === diaIso
    })
  }

  return (
    <div className="space-y-4">
      {/* Navegador do Calendário: Setas, Intervalo por extenso, Botão "Hoje", Avatares e Alternância Semana / Mês */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Setas de navegação */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={
                modo === 'semana'
                  ? voltarSemana
                  : () => {
                      const [y, m] = mesRef.split('-').map(Number)
                      const d = new Date(y, m - 2, 1)
                      setMesRef(toISODate(d).slice(0, 7))
                    }
              }
              className="h-8 w-8 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 flex items-center justify-center transition-colors cursor-pointer"
              title={modo === 'semana' ? 'Semana anterior' : 'Mês anterior'}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Intervalo de datas por extenso */}
            <div className="min-w-[170px] sm:min-w-[210px] text-center font-bold text-xs sm:text-sm text-gray-900 tracking-tight">
              {modo === 'semana' ? (
                intervaloPorExtenso
              ) : (
                <span className="capitalize">
                  {new Date(
                    Number(mesRef.split('-')[0]),
                    Number(mesRef.split('-')[1]) - 1,
                    1,
                  ).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={
                modo === 'semana'
                  ? avancarSemana
                  : () => {
                      const [y, m] = mesRef.split('-').map(Number)
                      const d = new Date(y, m, 1)
                      setMesRef(toISODate(d).slice(0, 7))
                    }
              }
              className="h-8 w-8 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 flex items-center justify-center transition-colors cursor-pointer"
              title={modo === 'semana' ? 'Próxima semana' : 'Próximo mês'}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Botão "Hoje" */}
          <Button
            variant="outline"
            size="sm"
            onClick={irParaHoje}
            className="h-8 px-3 rounded-lg text-xs font-semibold text-gray-700 border-gray-200 hover:bg-gray-50 cursor-pointer"
          >
            Hoje
          </Button>
        </div>

        {/* Lado direito do navegador: Avatares rápidos + Alternador Semana/Mês */}
        <div className="flex items-center gap-3 ml-auto">
          {/* Avatares dos responsáveis ativos na semana */}
          {modo === 'semana' && responsaveisAtivos.length > 0 && (
            <div
              className="hidden md:flex items-center -space-x-1.5"
              title="Responsáveis com tarefas nesta semana"
            >
              {responsaveisAtivos.map((nome) => {
                const iniciais = getIniciais(nome)
                const isSelected = filtroResponsavel === nome
                return (
                  <button
                    key={nome}
                    type="button"
                    onClick={() => setFiltroResponsavel((cur) => (cur === nome ? null : nome))}
                    className={cn(
                      'w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-2xs transition-transform hover:scale-110 cursor-pointer',
                      getAvatarColor(nome),
                      isSelected && 'ring-2 ring-[#1B5E20] scale-110',
                    )}
                    title={
                      isSelected
                        ? `Filtrando por ${nome} (clique para limpar)`
                        : `Filtrar por ${nome}`
                    }
                  >
                    {iniciais}
                  </button>
                )
              })}
              {filtroResponsavel && (
                <button
                  type="button"
                  onClick={() => setFiltroResponsavel(null)}
                  className="ml-2 text-[11px] font-semibold text-emerald-800 hover:text-red-600 underline cursor-pointer"
                  title="Limpar filtro de responsável"
                >
                  Limpar
                </button>
              )}
            </div>
          )}

          {/* Alternância Semana / Mês */}
          <div className="p-0.5 rounded-lg bg-gray-100/90 border border-gray-200/80 flex items-center gap-0.5 text-xs">
            <button
              type="button"
              onClick={() => setModo('semana')}
              className={cn(
                'px-3 py-1 rounded-md font-semibold transition-all cursor-pointer',
                modo === 'semana'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900',
              )}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setModo('mes')}
              className={cn(
                'px-3 py-1 rounded-md font-semibold transition-all cursor-pointer',
                modo === 'mes'
                  ? 'bg-[#1B5E20] text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900',
              )}
            >
              Mês
            </button>
          </div>
        </div>
      </div>

      {/* Visão SEMANAL (Padrão) */}
      {modo === 'semana' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Grade de 7 Colunas da Semana (SEG a DOM) */}
          <div className="xl:col-span-9 bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-4 shadow-2xs overflow-x-auto">
            <div className="grid grid-cols-7 gap-2.5 min-w-[760px]">
              {diasDaSemana.map((dia) => {
                const cards = tarefasPorDiaSemana(dia.iso)

                return (
                  <div
                    key={dia.iso}
                    className={cn(
                      'flex flex-col rounded-xl border transition-all min-h-[460px]',
                      dia.isHoje
                        ? 'bg-emerald-50/40 border-emerald-300 shadow-xs'
                        : dia.isFimDeSemana
                          ? 'bg-gray-50/50 border-gray-100 opacity-90'
                          : 'bg-white border-gray-200/80',
                    )}
                  >
                    {/* Cabeçalho da coluna do dia */}
                    <div
                      className={cn(
                        'p-2.5 border-b flex flex-col items-start gap-1 rounded-t-xl',
                        dia.isHoje
                          ? 'bg-emerald-100/40 border-emerald-200'
                          : 'border-gray-100 bg-gray-50/30',
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={cn(
                            'text-[10px] font-bold tracking-wider uppercase',
                            dia.isHoje
                              ? 'text-[#1B5E20]'
                              : dia.isFimDeSemana
                                ? 'text-gray-400'
                                : 'text-gray-500',
                          )}
                        >
                          {dia.diaSemana}
                        </span>

                        {/* Marca visual "Hoje" */}
                        {dia.isHoje && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-[#1B5E20] text-white shadow-2xs">
                            Hoje
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline justify-between w-full">
                        <span
                          className={cn(
                            'text-lg font-black tabular-nums tracking-tight',
                            dia.isHoje
                              ? 'text-[#1B5E20]'
                              : dia.isFimDeSemana
                                ? 'text-gray-500'
                                : 'text-gray-900',
                          )}
                        >
                          {dia.numero}
                        </span>

                        {/* Contador do dia */}
                        {cards.length > 0 && (
                          <span
                            className={cn(
                              'text-[10px] font-bold px-1.5 py-0.2 rounded-full',
                              dia.isHoje
                                ? 'bg-emerald-200/70 text-emerald-900'
                                : 'bg-gray-100 text-gray-600',
                            )}
                          >
                            {cards.length}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Lista de cartões de tarefas do dia */}
                    <div className="p-1.5 sm:p-2 space-y-2 flex-1 flex flex-col">
                      {cards.map((t) => {
                        const prio = t.prioridade_p || 'P3'
                        const isConcluida = t.status_kanban === 'concluido'
                        const isAtrasada =
                          !isConcluida && t.prazo && String(t.prazo).slice(0, 10) < hoje
                        const temRecorrencia = t.recorrencia && t.recorrencia !== 'Nenhuma'
                        const anexosCount = Array.isArray(t.anexos)
                          ? t.anexos.length
                          : t.anexos
                            ? 1
                            : 0
                        const iniciais = getIniciais(t.responsavel)
                        const corAvatar = getAvatarColor(t.responsavel)

                        return (
                          <div
                            key={t.id}
                            onClick={() => onAbrirDetalhe(t)}
                            className={cn(
                              'group rounded-xl border border-l-4 p-2 sm:p-2.5 shadow-2xs hover:shadow-md transition-all cursor-pointer select-none text-left flex flex-col justify-between gap-1.5',
                              PRIO_BORDER[prio] || 'border-l-blue-500',
                              isAtrasada
                                ? 'bg-red-50/70 border-red-200 hover:border-red-300'
                                : isConcluida
                                  ? 'bg-gray-50/80 border-gray-200 opacity-70'
                                  : 'bg-white border-gray-200/90 hover:border-gray-300',
                            )}
                          >
                            {/* 1ª Linha: Etiqueta Prioridade (P1/P2/P3) + Nome da Empresa COM Ícone */}
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1 min-w-0">
                                <span
                                  className={cn(
                                    'text-[9px] font-extrabold px-1.5 py-0.2 rounded',
                                    PRIO_BADGE[prio] || PRIO_BADGE.P3,
                                  )}
                                >
                                  {prio}
                                </span>

                                {t.empresa ? (
                                  <div
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-600 truncate max-w-[80px]"
                                    title={t.empresa}
                                  >
                                    <EmpresaIcon nome={t.empresa} className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{t.empresa}</span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-gray-400 italic">Geral</span>
                                )}
                              </div>

                              {/* Indicador de status/concluído */}
                              {isConcluida && (
                                <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                              )}
                            </div>

                            {/* Badge especial "Atrasado" para tarefas vencidas */}
                            {isAtrasada && (
                              <div className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100/80 px-1.5 py-0.2 rounded w-fit">
                                <AlertTriangle className="h-2.5 w-2.5 text-red-600 shrink-0" />
                                <span>Atrasado</span>
                              </div>
                            )}

                            {/* Título: em até 2 linhas */}
                            <h4
                              className={cn(
                                'text-xs font-semibold leading-snug line-clamp-2',
                                isConcluida
                                  ? 'text-gray-500 line-through'
                                  : isAtrasada
                                    ? 'text-red-900'
                                    : 'text-gray-900',
                              )}
                              title={t.titulo}
                            >
                              {t.titulo}
                            </h4>

                            {/* Data de vencimento com ícone (em vermelho se atrasada) */}
                            {t.prazo && (
                              <div
                                className={cn(
                                  'flex items-center gap-1 text-[10px] tabular-nums font-medium',
                                  isAtrasada ? 'text-red-600 font-bold' : 'text-gray-400',
                                )}
                              >
                                <Calendar className="h-2.5 w-2.5 shrink-0" />
                                <span>{formatarDataBR(t.prazo)}</span>
                              </div>
                            )}

                            {/* Base do cartão: Responsável com Avatar + Recorrência + Anexos */}
                            <div className="flex items-center justify-between gap-1 pt-1 border-t border-gray-100/80 mt-0.5">
                              {/* Responsável com avatar */}
                              {t.responsavel ? (
                                <div
                                  className="inline-flex items-center gap-1 min-w-0"
                                  title={`Responsável: ${t.responsavel}`}
                                >
                                  <div
                                    className={cn(
                                      'w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center shrink-0 shadow-2xs',
                                      corAvatar,
                                    )}
                                  >
                                    {iniciais}
                                  </div>
                                  <span className="text-[10px] font-medium text-gray-700 truncate max-w-[65px]">
                                    {t.responsavel.split(' ')[0]}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-amber-700 font-medium italic">
                                  Sem resp.
                                </span>
                              )}

                              {/* Badges de Recorrência / Anexos */}
                              <div className="flex items-center gap-1 shrink-0 ml-auto">
                                {temRecorrencia && (
                                  <span
                                    className="p-0.5 rounded bg-emerald-50 text-emerald-800"
                                    title={`Recorrente: ${t.recorrencia}`}
                                  >
                                    <Repeat className="h-2.5 w-2.5" />
                                  </span>
                                )}
                                {anexosCount > 0 && (
                                  <span
                                    className="inline-flex items-center text-[9px] text-gray-400"
                                    title={`${anexosCount} anexo(s)`}
                                  >
                                    <Paperclip className="h-2.5 w-2.5" />
                                    <span>{anexosCount}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {/* Espaço vazio se não houver tarefas */}
                      {cards.length === 0 && (
                        <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-gray-300">
                          <Clock className="h-4 w-4 mb-1 opacity-50" />
                          <span className="text-[10px]">Sem tarefas</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Faixa Lateral Direita: Totais da Semana + Carga por Pessoa */}
          <div className="xl:col-span-3 space-y-4">
            {/* Bloco: Totais da Semana */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Semana</h3>
                <span className="text-[11px] font-medium text-gray-400">
                  {tarefasDaSemana.length} tarefa(s)
                </span>
              </div>

              <div className="space-y-2">
                {/* Sem prazo */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50/50 border border-amber-200/60 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
                      <HelpCircle className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-medium text-gray-700">Sem prazo</span>
                  </div>
                  <span className="text-sm font-bold text-amber-700 tabular-nums">
                    {totaisSemana.semPrazo}
                  </span>
                </div>

                {/* Atrasadas */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-red-50/50 border border-red-200/60 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-red-500/15 text-red-700 flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-medium text-gray-700">Atrasadas</span>
                  </div>
                  <span className="text-sm font-bold text-red-600 tabular-nums">
                    {totaisSemana.atrasadas}
                  </span>
                </div>

                {/* Concluídas */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/50 border border-emerald-200/60 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-700 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-medium text-gray-700">Concluídas</span>
                  </div>
                  <span className="text-sm font-bold text-[#1B5E20] tabular-nums">
                    {totaisSemana.concluidas}
                  </span>
                </div>
              </div>
            </div>

            {/* Bloco: Carga por pessoa */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-[#1B5E20]" />
                  <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Carga por pessoa
                  </h3>
                </div>
                {filtroResponsavel && (
                  <button
                    type="button"
                    onClick={() => setFiltroResponsavel(null)}
                    className="text-[10px] text-emerald-800 hover:text-red-600 font-semibold cursor-pointer"
                  >
                    Ver todos
                  </button>
                )}
              </div>

              {cargaPorPessoa.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-400">
                  Nenhuma tarefa na semana
                </div>
              ) : (
                <div className="space-y-3">
                  {cargaPorPessoa.map((p) => {
                    const iniciais = getIniciais(p.nome)
                    const corAvatar = getAvatarColor(p.nome)
                    const isFiltro = filtroResponsavel === p.nome

                    return (
                      <div
                        key={p.nome}
                        onClick={() =>
                          setFiltroResponsavel((cur) => (cur === p.nome ? null : p.nome))
                        }
                        className={cn(
                          'p-2 rounded-xl transition-all cursor-pointer border',
                          isFiltro
                            ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-300'
                            : 'bg-gray-50/50 hover:bg-gray-50 border-transparent hover:border-gray-200',
                        )}
                        title="Clique para filtrar as tarefas desta pessoa na semana"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={cn(
                                'w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 shadow-2xs',
                                corAvatar,
                              )}
                            >
                              {iniciais}
                            </div>
                            <span className="text-xs font-semibold text-gray-800 truncate">
                              {p.nome}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[11px] font-bold text-gray-900 tabular-nums">
                              {p.qtd}
                            </span>
                            <span className="text-[10px] text-gray-400">({p.pct}%)</span>
                          </div>
                        </div>

                        {/* Barra proporcional de volume */}
                        <div className="w-full h-1.5 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-300',
                              p.isAltaCarga
                                ? 'bg-amber-500' // Carga alta destacada em âmbar/laranja
                                : 'bg-[#1B5E20]', // Carga normal verde escuro
                            )}
                            style={{ width: `${Math.max(8, p.pct)}%` }}
                          />
                        </div>

                        {p.isAltaCarga && (
                          <div className="text-[10px] text-amber-800 font-semibold mt-1 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            <span>Carga alta nesta semana</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Visão MENSAL (Mantendo estrutura do calendário com clique) */}
      {modo === 'mes' && (
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 shadow-2xs">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
              <div
                key={d}
                className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center py-1.5"
              >
                {d}
              </div>
            ))}
            {diasMes.map((dia, i) => {
              const cards = dia ? tarefasPorDiaMes(dia) : []
              const isHoje = dia === hoje

              return (
                <div
                  key={i}
                  className={cn(
                    'min-h-[82px] sm:min-h-[96px] rounded-xl border p-1.5 sm:p-2 flex flex-col justify-between transition-all',
                    dia
                      ? isHoje
                        ? 'border-emerald-300 bg-emerald-50/30 shadow-2xs'
                        : 'border-gray-100 bg-white hover:border-gray-200'
                      : 'border-transparent bg-transparent',
                  )}
                >
                  {dia && (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={cn(
                            'text-[11px] font-black tabular-nums',
                            isHoje ? 'text-[#1B5E20]' : 'text-gray-500',
                          )}
                        >
                          {parseInt(dia.slice(8), 10)}
                        </span>
                        {isHoje && (
                          <span className="text-[9px] font-extrabold px-1 rounded bg-[#1B5E20] text-white">
                            Hoje
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 flex-1">
                        {cards.slice(0, 2).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => onAbrirDetalhe(t)}
                            className={cn(
                              'w-full text-left text-[9px] font-semibold px-1.5 py-0.5 rounded truncate flex items-center gap-1 transition-colors cursor-pointer',
                              t.status_kanban === 'concluido'
                                ? 'bg-gray-100 text-gray-500'
                                : String(t.prazo).slice(0, 10) < hoje
                                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
                            )}
                            title={`${t.titulo} (${t.empresa || 'Sem empresa'})`}
                          >
                            {t.empresa && (
                              <EmpresaIcon nome={t.empresa} className="h-2.5 w-2.5 shrink-0" />
                            )}
                            <span className="truncate">{t.titulo}</span>
                          </button>
                        ))}
                        {cards.length > 2 && (
                          <div className="text-[9px] font-bold text-gray-400 pl-1">
                            +{cards.length - 2} mais
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
