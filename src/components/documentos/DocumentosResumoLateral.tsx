/**
 * Painel Lateral de Resumo da Aba ("Resumo da aba")
 * Conforme Imagem 2 e Bloco 2 da Especificação:
 * - Contagem por status com cards visuais:
 *    - Regulares (ícone verde, contagem e label)
 *    - Vencendo em 60 dias (ícone âmbar, contagem e label)
 *    - Vencidos (ícone vermelho, contagem e label)
 * - Próximos vencimentos (2 mais próximos, com data formatada e nome do documento com link para abrir)
 * - Botão "Exportar aba"
 */

import React from 'react'
import { CheckCircle2, Clock, AlertTriangle, Download, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { calcularPrazoValidade } from './documentos-design-tokens'

export interface DocumentosResumoLateralProps {
  tipoAba: string
  dados: any[]
  totalGeral: number
  onAbrirDocumento: (item: any) => void
  onExportar: () => void
}

export function DocumentosResumoLateral({
  tipoAba,
  dados,
  totalGeral,
  onAbrirDocumento,
  onExportar,
}: DocumentosResumoLateralProps) {
  // Contadores por categoria de status
  const contadores = React.useMemo(() => {
    let regulares = 0
    let vencendo = 0
    let vencidos = 0

    dados.forEach((d) => {
      // Se for alvará, calcula pela validade ou pelo status
      if (tipoAba === 'alvaras') {
        const prazo = calcularPrazoValidade(d.validade)
        if (prazo.categoria === 'vencido') vencidos++
        else if (prazo.categoria === 'vencendo' || prazo.categoria === 'urgente') vencendo++
        else regulares++
      } else {
        const st = String(d.status || '').toLowerCase()
        if (st === 'vencido' || st === 'encerrado') vencidos++
        else if (st === 'vencendo' || st === 'suspenso' || st === 'rascunho') vencendo++
        else regulares++
      }
    })

    return { regulares, vencendo, vencidos }
  }, [dados, tipoAba])

  // Próximos vencimentos (2 mais próximos no tempo)
  const proximosVencimentos = React.useMemo(() => {
    const comData = dados
      .filter((d) => d.validade || d.fim || d.proxima_audiencia)
      .map((d) => {
        const dataStr = d.validade || d.fim || d.proxima_audiencia
        const dataObj = new Date(dataStr)
        const titulo = d.titulo || d.tipo || d.numero || d.numero_processo || 'Documento'
        const empresa = d.empresa || ''
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

  const labelRegulares = tipoAba === 'alvaras' ? 'regulares' : 'ativos'
  const labelVencendo = tipoAba === 'alvaras' ? 'vencendo em 60 dias' : 'em renovação'
  const labelVencidos = tipoAba === 'alvaras' ? 'vencido' : 'encerrados'

  return (
    <aside
      aria-label="Resumo da aba"
      className="w-full xl:w-[280px] shrink-0 bg-white rounded-2xl border border-gray-200/80 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex flex-col gap-5 self-start"
    >
      <div>
        <h3 className="text-sm font-bold text-gray-900">Resumo da aba</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">Indicadores chave em tempo real</p>
      </div>

      {/* Cards de Status */}
      <div className="space-y-2.5">
        {/* Regulares */}
        <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-emerald-100/90 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs text-gray-700 font-medium block">{labelRegulares}</span>
            </div>
          </div>
          <span className="text-lg font-bold text-emerald-800 font-mono">
            {contadores.regulares}
          </span>
        </div>

        {/* Vencendo */}
        <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-amber-100/90 text-amber-700 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs text-gray-700 font-medium block">{labelVencendo}</span>
            </div>
          </div>
          <span className="text-lg font-bold text-amber-800 font-mono">{contadores.vencendo}</span>
        </div>

        {/* Vencidos */}
        <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-rose-100/90 text-rose-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs text-gray-700 font-medium block">{labelVencidos}</span>
            </div>
          </div>
          <span className="text-lg font-bold text-rose-800 font-mono">{contadores.vencidos}</span>
        </div>
      </div>

      {/* Próximos vencimentos */}
      <div className="space-y-3 pt-1 border-t border-gray-100">
        <h4 className="text-xs font-bold uppercase tracking-[0.04em] text-gray-700">
          Próximos vencimentos
        </h4>

        {proximosVencimentos.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Nenhum vencimento previsto.</p>
        ) : (
          <div className="space-y-2.5">
            {proximosVencimentos.map((venc, idx) => {
              const dataFormatada = venc.dataObj.toLocaleDateString('pt-BR')
              return (
                <div
                  key={`prox-${idx}`}
                  onClick={() => onAbrirDocumento(venc.item)}
                  className="group cursor-pointer p-2.5 rounded-xl hover:bg-emerald-50/40 border border-transparent hover:border-emerald-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                    <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                    <span>{dataFormatada}</span>
                  </div>
                  <p className="text-xs text-gray-800 font-medium mt-1 truncate group-hover:text-emerald-800">
                    {venc.titulo}
                    {venc.empresa ? ` — ${venc.empresa}` : ''}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Botão Exportar aba */}
      <div className="pt-2">
        <Button
          onClick={onExportar}
          className="w-full rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold h-10 gap-2 shadow-none"
        >
          <Download className="h-4 w-4" />
          Exportar aba
        </Button>
      </div>
    </aside>
  )
}
