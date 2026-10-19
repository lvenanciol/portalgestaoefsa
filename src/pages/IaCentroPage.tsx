import { useEffect, useState } from 'react'
import { Sparkles, Loader2, History, X, Bot } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// Fase 9 (prompt-mestre) — IA Gemini Flash: biblioteca dos 8 prompts
// (editável), execução com saída estruturada (sumário, achados, riscos,
// recomendações, score 0-10, disclaimer), histórico com status
// rascunho/revisado/aprovado + observação do revisor + comparação lado a lado.

const parse = (v: any) => {
  try {
    if (Array.isArray(v)) return v
    return JSON.parse(v || 'null')
  } catch (_) {
    return null
  }
}

export default function IaCentroPage() {
  const { user } = useAuth()
  const [prompts, setPrompts] = useState<any[]>([])
  const [selecionado, setSelecionado] = useState<any>(null)
  const [contexto, setContexto] = useState('')
  const [instrucoes, setInstrucoes] = useState('')
  const [resultado, setResultado] = useState<any>(null)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [historico, setHistorico] = useState<any[]>([])
  const [histAberto, setHistAberto] = useState(false)
  const [comparar, setComparar] = useState<any | null>(null)
  const [observacao, setObservacao] = useState('')
  const [salvandoStatus, setSalvandoStatus] = useState(false)

  const carregar = async () => {
    try {
      const ps = await pb.collection('ia_prompts').getFullList({ sort: 'ordem' })
      setPrompts(ps as any[])
      if (ps.length) {
        setSelecionado((s: any) => s || ps[0])
        setInstrucoes((i: string) => i || ps[0].instrucoes)
      }
    } catch (e) {
      setErro(String(e))
    }
    try {
      const r = (await pb.send('/backend/v1/ia/pareceres', { method: 'GET' })) as any
      setHistorico(r.itens || [])
    } catch (_) {
      setHistorico([])
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const gerar = async () => {
    if (!contexto.trim()) return
    setGerando(true)
    setResultado(null)
    setErro('')
    try {
      const r = (await pb.send('/backend/v1/ia/estruturado', {
        method: 'POST',
        body: JSON.stringify({
          modulo: 'ia-centro',
          ref: selecionado?.chave || '',
          prompt: instrucoes,
          contexto,
        }),
      })) as any
      setResultado(r.estrutura)
      await carregar()
    } catch (e) {
      setErro(String(e))
    } finally {
      setGerando(false)
    }
  }

  const salvarPrompt = async () => {
    if (!selecionado) return
    try {
      await pb.collection('ia_prompts').update(selecionado.id, { instrucoes })
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
  }

  const mudarStatus = async (p: any, status: string) => {
    setSalvandoStatus(true)
    try {
      await pb.send('/backend/v1/ia/pareceres/' + p.id, {
        method: 'PATCH',
        body: JSON.stringify({ status, observacao }),
      })
      await carregar()
    } catch (e) {
      setErro(String(e))
    } finally {
      setSalvandoStatus(false)
    }
  }

  const STATUS_COR: Record<string, string> = {
    rascunho: 'bg-gray-100 text-gray-600',
    revisado: 'bg-amber-50 text-amber-700',
    aprovado: 'bg-emerald-50 text-emerald-700',
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Bot className="h-6 w-6 text-[#1B5E20]" /> IA — Gemini Flash
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Biblioteca de prompts editáveis + pareceres estruturados com histórico versionado
          </p>
        </div>
        <Button variant="outline" onClick={() => setHistAberto(true)} className="h-9">
          <History className="h-4 w-4 mr-1.5" /> Histórico ({historico.length})
        </Button>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Biblioteca de prompts */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Biblioteca de prompts
          </div>
          {prompts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setSelecionado(p)
                setInstrucoes(p.instrucoes)
              }}
              className={cn(
                'block w-full text-left bg-white rounded-lg border p-3 transition-all',
                selecionado?.id === p.id
                  ? 'border-[#1B5E20] ring-1 ring-[#1B5E20]/30'
                  : 'border-[#E5E7EB] hover:border-gray-300',
              )}
            >
              <div className="text-[13px] font-bold text-gray-900">{p.titulo}</div>
              <div className="text-[11px] text-gray-500 line-clamp-1">{p.instrucoes}</div>
            </button>
          ))}
        </div>

        {/* Execução */}
        <div className="lg:col-span-2 space-y-3">
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Prompt — {selecionado?.titulo || '—'}
                </Label>
                {selecionado && (
                  <button
                    type="button"
                    onClick={salvarPrompt}
                    className="text-[11px] font-bold text-[#1B5E20] hover:underline"
                  >
                    salvar edição
                  </button>
                )}
              </div>
              <Textarea
                value={instrucoes}
                onChange={(e) => setInstrucoes(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Contexto (dados)
              </Label>
              <Textarea
                value={contexto}
                onChange={(e) => setContexto(e.target.value)}
                rows={5}
                placeholder="Cole aqui os dados: números do mês, linhas do balancete, cláusulas do contrato, ata, KPIs..."
              />
            </div>
            <Button
              onClick={gerar}
              disabled={gerando || !contexto.trim()}
              className="h-10 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {gerando ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1.5" />
              )}
              {gerando ? 'Analisando...' : 'Gerar parecer estruturado'}
            </Button>
          </div>

          {/* Resultado estruturado */}
          {resultado && (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs space-y-3">
              {typeof resultado.score_saude === 'number' && (
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg',
                      resultado.score_saude >= 7
                        ? 'bg-emerald-600'
                        : resultado.score_saude >= 5
                          ? 'bg-amber-500'
                          : 'bg-red-600',
                    )}
                  >
                    {resultado.score_saude}
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Score de saúde
                    </div>
                    <div className="text-[13px] text-gray-700">0-10</div>
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Sumário executivo
                </div>
                <p className="text-[13px] text-gray-800 leading-relaxed">
                  {resultado.sumario_executivo}
                </p>
              </div>
              {resultado.principais_achados?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Principais achados
                  </div>
                  <ul className="space-y-1">
                    {resultado.principais_achados.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-gray-700">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {resultado.riscos_alertas?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Riscos e alertas
                  </div>
                  <ul className="space-y-1">
                    {resultado.riscos_alertas.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-red-700">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {resultado.recomendacoes?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Recomendações priorizadas
                  </div>
                  <ol className="space-y-1">
                    {resultado.recomendacoes.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-gray-700">
                        {i + 1}. {a}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <p className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">
                {resultado.disclaimer ||
                  'Análise assistida por IA — não substitui contador/auditor.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Histórico */}
      <Dialog open={histAberto} onOpenChange={setHistAberto}>
        <DialogContent className="bg-white max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4 text-[#1B5E20]" /> Histórico de pareceres
              </span>
              <button
                onClick={() => setHistAberto(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {historico.map((p) => {
              const res = parse(p.resultado)
              return (
                <div key={p.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-[13px] font-bold text-gray-900 truncate">
                      {p.ref || p.modulo}
                    </div>
                    <span
                      className={cn(
                        'text-[9px] font-bold px-2 py-0.5 rounded-full',
                        STATUS_COR[p.status || 'rascunho'],
                      )}
                    >
                      {p.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 mb-1">
                    {p.criado_por} · {String(p.created).slice(0, 16).replace('T', ' ')}
                  </div>
                  <div className="text-[12px] text-gray-700 line-clamp-2">
                    {res?.sumario_executivo || '—'}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setComparar(p)}
                      className="text-[11px] font-bold text-[#1B5E20] hover:underline"
                    >
                      comparar versões
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setObservacao('')
                        mudarStatus(p, p.status === 'rascunho' ? 'revisado' : 'aprovado')
                      }}
                      disabled={salvandoStatus}
                      className="text-[11px] font-bold text-amber-700 hover:underline"
                    >
                      {p.status === 'rascunho' ? 'marcar revisado' : 'aprovar'}
                    </button>
                  </div>
                  {p.observacao && (
                    <div className="text-[11px] text-gray-500 mt-1 italic">
                      Obs.: {p.observacao}
                    </div>
                  )}
                </div>
              )
            })}
            {historico.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">Nenhum parecer gerado ainda.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Comparação lado a lado */}
      <Dialog open={!!comparar} onOpenChange={(o) => !o && setComparar(null)}>
        <DialogContent className="bg-white max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Parecer — versão atual</span>
              <button
                onClick={() => setComparar(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          {comparar &&
            (() => {
              const res = parse(comparar.resultado)
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-gray-100 rounded-lg p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                        Prompt
                      </div>
                      <p className="text-[11px] text-gray-700">{comparar.prompt}</p>
                    </div>
                    <div className="border border-gray-100 rounded-lg p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                        Contexto (início)
                      </div>
                      <p className="text-[11px] text-gray-700 line-clamp-4">{comparar.contexto}</p>
                    </div>
                  </div>
                  <div className="border border-gray-100 rounded-lg p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                      Resultado
                    </div>
                    <p className="text-[12px] text-gray-800 whitespace-pre-wrap">
                      {res?.sumario_executivo}
                    </p>
                    {res?.recomendacoes?.length > 0 && (
                      <ol className="mt-2 space-y-1">
                        {res.recomendacoes.map((a: string, i: number) => (
                          <li key={i} className="text-[11px] text-gray-700">
                            {i + 1}. {a}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Observação do revisor
                    </Label>
                    <Textarea
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      rows={2}
                      placeholder={comparar.observacao || 'Registrar observação...'}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => mudarStatus(comparar, 'revisado')}
                        disabled={salvandoStatus}
                        className="h-8"
                      >
                        Marcar revisado
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => mudarStatus(comparar, 'aprovado')}
                        disabled={salvandoStatus}
                        className="h-8 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                      >
                        Aprovar
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
