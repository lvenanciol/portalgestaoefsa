import { useState } from 'react'
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { cn } from '@/lib/utils'

// Fase 7 — Componente compartilhado de Parecer IA (Gemini Flash via gateway).
// Usado em todas as telas: recebe o contexto da tela e gera a análise.
// Props: titulo (opcional), contexto (dados da tela), prompt (tarefa da IA).

interface ParecerIaCardProps {
  contexto: string
  prompt?: string
  titulo?: string
  compacto?: boolean
}

export function ParecerIaCard({ contexto, prompt, titulo, compacto }: ParecerIaCardProps) {
  const [parecer, setParecer] = useState('')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')

  const gerar = async () => {
    setGerando(true)
    setErro('')
    setParecer('')
    try {
      const r = await pb.send('/backend/v1/ia/parecer', {
        method: 'POST',
        body: JSON.stringify({
          prompt:
            prompt ||
            'Analise os dados desta tela. Destaque o que chama atenção (riscos, oportunidades, desvios) e dê 2-3 recomendações práticas.',
          contexto: contexto,
        }),
      })
      const resp = r as { texto?: string }
      setParecer(resp.texto || 'IA não retornou conteúdo.')
    } catch (e) {
      setErro(String(e))
    } finally {
      setGerando(false)
    }
  }

  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-[#E5E7EB] shadow-xs hover:shadow-md transition-all duration-200',
        compacto ? 'p-4' : 'p-5 hover:-translate-y-[3px]',
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-[#1B5E20] shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-bold text-gray-900">
            {titulo || 'Parecer IA — Gemini Flash'}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {parecer && (
            <button
              type="button"
              onClick={gerar}
              disabled={gerando}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none"
              aria-label="Regenerar parecer"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', gerando && 'animate-spin')} />
            </button>
          )}
          <button
            type="button"
            onClick={gerar}
            disabled={gerando}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-[12px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/40 disabled:opacity-60"
          >
            {gerando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {gerando ? 'Analisando...' : parecer ? 'Novo parecer' : 'Gerar parecer'}
          </button>
        </div>
      </div>

      {gerando && !parecer && (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-gray-100 rounded w-full" />
          <div className="h-3 bg-gray-100 rounded w-11/12" />
          <div className="h-3 bg-gray-100 rounded w-9/12" />
        </div>
      )}

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700 font-medium">
          Erro ao gerar parecer: {erro}
        </div>
      )}

      {parecer && (
        <div className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-lg p-4 border border-gray-100">
          {parecer}
        </div>
      )}

      {!parecer && !gerando && !erro && (
        <p className="text-[12px] text-gray-400 leading-relaxed">
          Gera análise dos dados exibidos nesta tela com IA (Gemini Flash), com riscos e
          recomendações.
        </p>
      )}
    </div>
  )
}
