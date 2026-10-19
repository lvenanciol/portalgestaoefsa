import { useEffect, useState } from 'react'
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { ParecerIaCard } from '@/components/ParecerIaCard'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// Fase 11 — IA Gemini Flash: playground do gateway $ai — o usuário escreve
// o contexto e o prompt e recebe o parecer na tela (mesmo hook ia_parecer).

const EXEMPLOS = [
  {
    titulo: 'Análise de inadimplência',
    contexto:
      'A/R aberto R$ 106,5M, vencido R$ 8,2M, top devedor Atacado Frutas Centro (R$ 3,1M, 21 dias).',
    prompt: 'Monte um plano de cobrança em 3 passos para reduzir o vencido em 50% em 60 dias.',
  },
  {
    titulo: 'Resumo para diretoria',
    contexto:
      'Faturamento 12m R$ 1,9B; A/P aberto R$ 234,5M (vencido R$ 116,3M); margem operacional 4,2%.',
    prompt: 'Escreva um resumo executivo de 5 linhas para a reunião de resultados.',
  },
  {
    titulo: 'Riscos de contratos',
    contexto:
      'Contrato de logística vence em 45 dias (R$ 42 mil/mês); locação FoldBox indeterminada com reajuste anual.',
    prompt: 'Liste riscos e ações recomendadas para a renegociação.',
  },
]

export default function IaPage() {
  const [contexto, setContexto] = useState('')
  const [prompt, setPrompt] = useState('')
  const [resposta, setResposta] = useState('')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')

  const gerar = async () => {
    if (!contexto.trim() || !prompt.trim()) return
    setGerando(true)
    setErro('')
    setResposta('')
    try {
      const r = (await pb.send('/backend/v1/ia/parecer', {
        method: 'POST',
        body: JSON.stringify({ contexto, prompt }),
      })) as { texto?: string }
      setResposta(r.texto || 'IA não retornou conteúdo.')
    } catch (e) {
      setErro(String(e))
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Sparkles className="h-6 w-6 text-[#1B5E20]" />
            IA Gemini Flash
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Analises sob demanda com o mesmo motor dos pareceres das telas (gateway $ai)
          </p>
        </div>
      </div>

      {/* Exemplos rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {EXEMPLOS.map((ex) => (
          <button
            key={ex.titulo}
            type="button"
            onClick={() => {
              setContexto(ex.contexto)
              setPrompt(ex.prompt)
            }}
            className="text-left bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs hover:shadow-md hover:-translate-y-[2px] transition-all"
          >
            <div className="text-[13px] font-bold text-gray-900">{ex.titulo}</div>
            <div className="text-[11px] text-gray-500 mt-1 line-clamp-2">{ex.prompt}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Contexto (dados)
          </Label>
          <Textarea
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            rows={6}
            placeholder="Cole aqui os números, textos ou dados que a IA deve analisar..."
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            O que a IA deve fazer
          </Label>
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex.: analise os riscos e dê 3 recomendações..."
            className="h-10 bg-gray-50"
          />
          <Button
            onClick={gerar}
            disabled={gerando || !contexto.trim() || !prompt.trim()}
            className="h-10 mt-1 bg-[#1B5E20] hover:bg-[#0F3D13] text-white self-start"
          >
            {gerando ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5" />
            )}
            {gerando ? 'Analisando...' : 'Gerar análise'}
          </Button>
        </div>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      {resposta && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
          <div className="text-sm font-bold text-gray-900 mb-2">Resultado</div>
          <div className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-lg p-4 border border-gray-100">
            {resposta}
          </div>
        </div>
      )}

      {!resposta && !gerando && !erro && (
        <ParecerIaCard
          titulo="Como funciona"
          contexto="Explique em 2 frases como o portal usa IA."
          prompt="Responda em português, em no máximo 3 frases curtas: o que esta tela faz e como as empresas do grupo podem usá-la no dia a dia."
        />
      )}
    </div>
  )
}
