/**
 * Linha Horizontal de Indicadores da Aba em Documentos (/documentos)
 * Substitui o antigo painel lateral "Resumo da aba" posicionando-se logo abaixo das abas.
 *
 * Design System:
 * - Cards com rounded-[16px] (radius 16px)
 * - Espaçamento múltiplo de 8px (p-4, gap-3/gap-4)
 * - No máximo 1 nível de sombra: shadow-[0_2px_8px_rgba(0,0,0,0.06)] ou shadow-xs
 * - Status sempre cor + ícone + texto
 * - Zero "—" na interface (usar pill "Não aplicável" ou estado pendente amigável)
 * - Atualiza reativamente por aba ativa
 *
 * Interação (v0.0.288):
 * - Os 4 primeiros cards funcionam como FILTRO ao clique (Ativos, Em renovação,
 *   Encerrados/Críticos e Total limpa). Clicar de novo no card ativo limpa o filtro.
 * - Estado selecionado visível com anel na cor de marca (ring-emerald-700).
 * - Layout sem corte em 1280–1920px: grid responsivo com min-w-0 e truncamento elegante;
 *   os cards de status mantêm largura mínima com rolagem horizontal quando necessário.
 */

import React, { useMemo } from 'react'
import { CheckCircle2, Clock, AlertTriangle, FileText, Calendar, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { calcularPrazoValidade } from './documentos-design-tokens'

export interface DocumentosIndicadoresProps {
  tipoAba: string
  dados: any[]
  totalGeral: number
  onAbrirDocumento: (item: any) => void
  onExportar: () => void
  /** Filtro de status atualmente ativo na tabela (para marcar o card selecionado) */
  filtroAtivo?: 'todos' | 'regulares' | 'vencendo' | 'vencidos'
  /** Ao clicar em um card: aplica o filtro; clicar de novo (ou no card Total) limpa ('todos') */
  onSelecionarFiltro?: (filtro: 'todos' | 'regulares' | 'vencendo' | 'vencidos') => void
}

/** Anel de seleção do card ativo (cor de marca) */
const ANEL_ATIVO = 'ring-2 ring-emerald-700 ring-offset-2 ring-offset-gray-50 shadow-md'

export function DocumentosIndicadores({
  tipoAba,
  dados,
  totalGeral,
  onAbrirDocumento,
  onExportar,
  filtroAtivo = 'todos',
  onSelecionarFiltro,
}: DocumentosIndicadoresProps) {
  // Contadores por categoria de status
  const contadores = useMemo(() => {
    let regulares = 0
    let vencendo = 0
    let vencidos = 0

    dados.forEach((d) => {
      if (tipoAba === 'alvaras') {
        const prazo = calcularPrazoValidade(d.validade)
        if (prazo.categoria === 'vencido') vencidos++
        else if (prazo.categoria === 'vencendo' || prazo.categoria === 'urgente') vencendo++
        else regulares++
      } else {
        const st = String(d.status || '').toLowerCase()
        if (st.includes('vencid') || st.includes('encerrad')) vencidos++
        else if (
          st.includes('vencendo') ||
          st.includes('suspens') ||
          st.includes('rascunho') ||
          st.includes('renov')
        )
          vencendo++
        else regulares++
      }
    })

    return { regulares, vencendo, vencidos }
  }, [dados, tipoAba])

  // Próximos vencimentos / prazos (2 mais próximos no tempo)
  const proximosVencimentos = useMemo(() => {
    const comData = dados
      .filter((d) => d.validade || d.fim || d.proxima_audiencia)
      .map((d) => {
        const dataStr = d.validade || d.fim || d.proxima_audiencia
        const dataObj = new Date(dataStr)
        const titulo = d.titulo || d.tipo || d.numero || d.numero_processo || 'Documento'
        const empresa = d.empresa || d.cliente_principal || ''
        return {
          item: d,
          dataStr,
          dataObj,
          titulo,
          empresa,
        }
      })
      .filter((d) => !isNaN(d.dataObj.getTime()))
      .sort((a, b) => a.dataObj.getTime() - b.dataObj.getTime())

    return comData.slice(0, 2)
  }, [dados])

  const labelRegulares = tipoAba === 'alvaras' ? 'Regulares' : 'Ativos'
  const labelVencendo = tipoAba === 'alvaras' ? 'Vencendo em 60d' : 'Em renovação / Atenção'
  const labelVencidos = tipoAba === 'alvaras' ? 'Vencidos' : 'Encerrados / Críticos'

  // Clique em card: aplica ou limpa o filtro correspondente
  const alternarFiltro = (alvo: 'todos' | 'regulares' | 'vencendo' | 'vencidos') => {
    if (!onSelecionarFiltro) return
    onSelecionarFiltro(filtroAtivo === alvo ? 'todos' : alvo)
  }

  return (
    <div className="w-full overflow-x-auto pb-1 -mb-1">
      <div className="min-w-[1100px] 2xl:min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3">
        {/* 1. Total Geral da Aba — clique limpa o filtro */}
        <button
          type="button"
          onClick={() => alternarFiltro('todos')}
          title="Mostrar todos os registros da aba"
          className={`bg-white rounded-[16px] border border-gray-200/80 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-between min-w-0 text-left transition-all hover:border-gray-300 hover:shadow-md focus:outline-none ${
            filtroAtivo === 'todos' && onSelecionarFiltro ? ANEL_ATIVO : ''
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block truncate">
                Total Registrado
              </span>
              <span className="text-xl font-bold text-gray-900 font-mono leading-tight">
                {totalGeral}
              </span>
            </div>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] font-medium text-gray-600 bg-gray-50 border-gray-200 shrink-0 ml-2"
          >
            Geral
          </Badge>
        </button>

        {/* 2. Regulares / Ativos — filtro ao clique */}
        <button
          type="button"
          onClick={() => alternarFiltro('regulares')}
          title={`Filtrar tabela: ${labelRegulares}`}
          className={`bg-white rounded-[16px] border border-emerald-200/80 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-between min-w-0 text-left transition-all hover:border-emerald-300 hover:shadow-md focus:outline-none ${
            filtroAtivo === 'regulares' ? ANEL_ATIVO : ''
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block truncate">
                {labelRegulares}
              </span>
              <span className="text-xl font-bold text-emerald-800 font-mono leading-tight">
                {contadores.regulares}
              </span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0 ml-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            Em dia
          </span>
        </button>

        {/* 3. Vencendo / Atenção — filtro ao clique */}
        <button
          type="button"
          onClick={() => alternarFiltro('vencendo')}
          title={`Filtrar tabela: ${labelVencendo}`}
          className={`bg-white rounded-[16px] border border-amber-200/80 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-between min-w-0 text-left transition-all hover:border-amber-300 hover:shadow-md focus:outline-none ${
            filtroAtivo === 'vencendo' ? ANEL_ATIVO : ''
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span
                className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block truncate"
                title={labelVencendo}
              >
                {labelVencendo}
              </span>
              <span className="text-xl font-bold text-amber-800 font-mono leading-tight">
                {contadores.vencendo}
              </span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shrink-0 ml-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Atenção
          </span>
        </button>

        {/* 4. Vencidos / Críticos — filtro ao clique */}
        <button
          type="button"
          onClick={() => alternarFiltro('vencidos')}
          title={`Filtrar tabela: ${labelVencidos}`}
          className={`bg-white rounded-[16px] border border-rose-200/80 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-between min-w-0 text-left transition-all hover:border-rose-300 hover:shadow-md focus:outline-none ${
            filtroAtivo === 'vencidos' ? ANEL_ATIVO : ''
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span
                className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider block truncate"
                title={labelVencidos}
              >
                {labelVencidos}
              </span>
              <span className="text-xl font-bold text-rose-800 font-mono leading-tight">
                {contadores.vencidos}
              </span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 shrink-0 ml-2">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
            Crítico
          </span>
        </button>

        {/* 5. Próximo Vencimento & Ação Exportar (não é filtro) */}
        <div className="bg-white rounded-[16px] border border-gray-200/80 p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex flex-col justify-between min-w-0 sm:col-span-2 lg:col-span-1 2xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider min-w-0">
              <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span className="truncate">Próximo Prazo</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onExportar}
              className="h-6 px-2 text-[10px] font-semibold text-emerald-800 hover:text-emerald-900 hover:bg-emerald-50 gap-1 rounded-md shrink-0"
              title="Exportar dados da aba atual para planilha CSV"
            >
              <Download className="h-3 w-3" />
              Exportar
            </Button>
          </div>

          <div className="mt-1 min-w-0">
            {proximosVencimentos.length === 0 ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-500">
                Não aplicável
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onAbrirDocumento(proximosVencimentos[0].item)}
                className="text-left w-full group focus:outline-none min-w-0"
                title="Clique para abrir e editar documento"
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span>{proximosVencimentos[0].dataObj.toLocaleDateString('pt-BR')}</span>
                </div>
                <p className="text-[11px] text-gray-700 truncate group-hover:text-emerald-800 font-medium mt-0.5">
                  {proximosVencimentos[0].titulo}
                  {proximosVencimentos[0].empresa ? ` · ${proximosVencimentos[0].empresa}` : ''}
                </p>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
