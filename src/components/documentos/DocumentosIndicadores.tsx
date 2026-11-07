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
}

export function DocumentosIndicadores({
  tipoAba,
  dados,
  totalGeral,
  onAbrirDocumento,
  onExportar,
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

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {/* 1. Total Geral da Aba */}
      <div className="bg-white rounded-[16px] border border-gray-200/80 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
              Total Registrado
            </span>
            <span className="text-xl font-bold text-gray-900 font-mono leading-tight">
              {totalGeral}
            </span>
          </div>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] font-medium text-gray-600 bg-gray-50 border-gray-200"
        >
          Geral
        </Badge>
      </div>

      {/* 2. Regulares / Ativos */}
      <div className="bg-white rounded-[16px] border border-emerald-200/80 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">
              {labelRegulares}
            </span>
            <span className="text-xl font-bold text-emerald-800 font-mono leading-tight">
              {contadores.regulares}
            </span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          Em dia
        </span>
      </div>

      {/* 3. Vencendo / Atenção */}
      <div className="bg-white rounded-[16px] border border-amber-200/80 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <span
              className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block truncate max-w-[130px]"
              title={labelVencendo}
            >
              {labelVencendo}
            </span>
            <span className="text-xl font-bold text-amber-800 font-mono leading-tight">
              {contadores.vencendo}
            </span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Atenção
        </span>
      </div>

      {/* 4. Vencidos / Críticos */}
      <div className="bg-white rounded-[16px] border border-rose-200/80 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider block">
              {labelVencidos}
            </span>
            <span className="text-xl font-bold text-rose-800 font-mono leading-tight">
              {contadores.vencidos}
            </span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
          Crítico
        </span>
      </div>

      {/* 5. Próximo Vencimento & Ação Exportar */}
      <div className="bg-white rounded-[16px] border border-gray-200/80 p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex flex-col justify-between sm:col-span-2 lg:col-span-4 xl:col-span-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
            <Calendar className="h-3.5 w-3.5 text-gray-400" />
            <span>Próximo Prazo</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onExportar}
            className="h-6 px-2 text-[10px] font-semibold text-emerald-800 hover:text-emerald-900 hover:bg-emerald-50 gap-1 rounded-md"
            title="Exportar dados da aba atual para planilha CSV"
          >
            <Download className="h-3 w-3" />
            Exportar
          </Button>
        </div>

        <div className="mt-1">
          {proximosVencimentos.length === 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-500">
              Não aplicável
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onAbrirDocumento(proximosVencimentos[0].item)}
              className="text-left w-full group focus:outline-none"
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
  )
}
