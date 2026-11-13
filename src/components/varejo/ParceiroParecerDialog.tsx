import { useEffect, useState } from 'react'
import { Sparkles, Loader2, RefreshCw, Save, RotateCcw } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// TAREFA VAREJO (13/11/2026) — Parecer de varejo com Gemini Flash.
//
// Dois modos:
//   - ABA:    analisa o desempenho consolidado da aba filtrada.
//   - LOJA:   analisa um registro específico (linha da tabela).
//
// O PROMPT É EDITÁVEL e fica salvo no navegador (pge_varejo_prompt). Isso segue
// o padrão da casa: a pessoa ajusta o enquadramento da análise sem depender de
// deploy. O prompt padrão posiciona a IA como especialista em varejo de
// alimentos e gestão de negócios.

const CHAVE_PROMPT = 'pge_varejo_prompt'

const PROMPT_PADRAO_ABA = `Você é especialista em varejo de alimentos e gestão de negócios. Analise o desempenho CONSOLIDADO desta aba e emita um parecer executivo.

Estruture em 4 blocos curtos, com títulos:
1) LEITURA DO PERÍODO — o que os números mostram (faturamento, volume, ticket, cupons, preço médio).
2) PONTOS DE ATENÇÃO — riscos concretos, com o número que sustenta cada um.
3) OPORTUNIDADES — onde há espaço claro de ganho, priorizado por impacto.
4) RECOMENDAÇÕES — 3 ações práticas, com o indicador que deve ser acompanhado.

Regras: use os números do contexto; não invente dado que não esteja lá; sinalize explicitamente o que falta (CMV e quebra) como lacuna de gestão, não como resultado. Seja direto e evite obviedades.`

const PROMPT_PADRAO_LOJA = `Você é especialista em varejo de alimentos e gestão de negócios. Analise o desempenho de UMA loja específica e emita um parecer técnico.

Estruture em 3 blocos curtos, com títulos:
1) DIAGNÓSTICO — leitura do faturamento, cupons e ticket médio da loja.
2) POSIÇÃO COMPETITIVA — compare com a média da rede informada no contexto, quando houver.
3) AÇÃO — 2 a 3 medidas práticas e priorizadas para esta loja.

Regras: use apenas os números do contexto; diga o que falta em vez de estimar; sem generalidades.`

interface Props {
  aberto: boolean
  onFechar: () => void
  abaLabel: string
  contexto: string
  loja: any | null
  contextoLoja: string
}

export function ParceiroParecerDialog({
  aberto,
  onFechar,
  abaLabel,
  contexto,
  loja,
  contextoLoja,
}: Props) {
  const modoLoja = Boolean(loja)
  const [prompt, setPrompt] = useState('')
  const [editandoPrompt, setEditandoPrompt] = useState(false)
  const [texto, setTexto] = useState('')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)

  // Carrega o prompt salvo quando o diálogo abre no modo correspondente
  useEffect(() => {
    if (!aberto) return
    const chave = modoLoja ? CHAVE_PROMPT + '_loja' : CHAVE_PROMPT + '_aba'
    const salvoLocal = localStorage.getItem(chave)
    setPrompt(salvoLocal || (modoLoja ? PROMPT_PADRAO_LOJA : PROMPT_PADRAO_ABA))
    setTexto('')
    setErro('')
    setEditandoPrompt(false)
    setSalvo(false)
  }, [aberto, modoLoja])

  const salvarPrompt = () => {
    const chave = modoLoja ? CHAVE_PROMPT + '_loja' : CHAVE_PROMPT + '_aba'
    localStorage.setItem(chave, prompt)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  const restaurarPrompt = () => {
    setPrompt(modoLoja ? PROMPT_PADRAO_LOJA : PROMPT_PADRAO_ABA)
  }

  const gerar = async () => {
    setGerando(true)
    setErro('')
    setTexto('')
    try {
      const ctx = modoLoja ? contextoLoja : contexto
      const r = await pb.send('/backend/v1/ia/parecer', {
        method: 'POST',
        // perfil: 'varejo' → o hook ia_parecer usa a persona de especialista em
        // varejo de alimentos e gestão de negócios (em vez do analista financeiro).
        body: JSON.stringify({ prompt, contexto: ctx, perfil: 'varejo' }),
      })
      const resp = r as { texto?: string }
      setTexto(resp.texto || 'A IA não retornou conteúdo.')
    } catch (e) {
      setErro(String(e))
    } finally {
      setGerando(false)
    }
  }

  const titulo = modoLoja
    ? `Parecer — ${loja?.LOJA || 'loja'}`
    : `Parecer — ${abaLabel || 'aba filtrada'}`

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <span className="h-7 w-7 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-[#1B5E20] shrink-0">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            {titulo}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Avaliação com Gemini Flash no papel de especialista em varejo de alimentos e gestão de
            negócios.
          </DialogDescription>
        </DialogHeader>

        {/* Dados que serão avaliados */}
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-[11px] text-gray-600 leading-relaxed max-h-28 overflow-y-auto">
          <span className="font-semibold text-gray-700">Contexto enviado: </span>
          {modoLoja ? contextoLoja : contexto || 'sem dados para esta aba'}
        </div>

        {/* Prompt editável */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Prompt (editável)
            </span>
            <div className="flex items-center gap-1">
              {editandoPrompt ? (
                <>
                  <button
                    type="button"
                    onClick={restaurarPrompt}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                  >
                    <RotateCcw className="h-3 w-3" /> Padrão
                  </button>
                  <button
                    type="button"
                    onClick={salvarPrompt}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B5E20] hover:text-[#0F3D13] px-2 py-1 rounded hover:bg-emerald-50"
                  >
                    <Save className="h-3 w-3" /> {salvo ? 'Salvo!' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoPrompt(false)}
                    className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                  >
                    Fechar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditandoPrompt(true)}
                  className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                >
                  Editar
                </button>
              )}
            </div>
          </div>
          {editandoPrompt ? (
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-gray-200 p-3 text-[12px] leading-relaxed font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/30"
            />
          ) : (
            <div className="rounded-lg border border-gray-100 bg-white p-3 text-[11px] text-gray-500 leading-relaxed line-clamp-3">
              {prompt.slice(0, 220)}
              {prompt.length > 220 ? '…' : ''}
            </div>
          )}
        </div>

        {erro && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700 font-medium">
            Erro ao gerar o parecer: {erro}
          </div>
        )}

        {gerando && !texto && (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-11/12" />
            <div className="h-3 bg-gray-100 rounded w-9/12" />
          </div>
        )}

        {texto && (
          <div className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap bg-emerald-50/40 rounded-lg p-4 border border-emerald-100">
            {texto}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          {texto && (
            <button
              type="button"
              onClick={gerar}
              disabled={gerando}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', gerando && 'animate-spin')} /> Novo parecer
            </button>
          )}
          <Button
            onClick={gerar}
            disabled={gerando || !prompt.trim()}
            className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-[12px] h-9"
          >
            {gerando ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            )}
            {gerando ? 'Analisando…' : texto ? 'Gerar novamente' : 'Gerar parecer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
