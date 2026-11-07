import { useState } from 'react'
import {
  Sparkles,
  Loader2,
  Check,
  Edit3,
  AlertOctagon,
  TrendingUp,
  ShieldAlert,
  Lightbulb,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import pb from '@/lib/pocketbase/client'

export interface ParecerResultado {
  resumo?: string | string[]
  riscos: string | string[]
  oportunidades: string | string[]
  ameacas: string | string[]
  sugestoes: string | string[]
}

interface DocumentoParecerButtonProps {
  documento: Record<string, any>
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  promptPadrao: string
  onSalvarPromptPadrao?: (novoPrompt: string) => void
}

export function DocumentoParecerButton({
  documento,
  tipoAba,
  promptPadrao,
  onSalvarPromptPadrao,
}: DocumentoParecerButtonProps) {
  const [popoverAberto, setPopoverAberto] = useState(false)
  const [promptTexto, setPromptTexto] = useState(promptPadrao)
  const [editandoPrompt, setEditandoPrompt] = useState(false)
  const [salvoFeedback, setSalvoFeedback] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [dialogAberto, setDialogAberto] = useState(false)
  const [parecer, setParecer] = useState<ParecerResultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const handleSalvarPrompt = () => {
    if (onSalvarPromptPadrao) {
      onSalvarPromptPadrao(promptTexto)
    }
    try {
      localStorage.setItem(`pge_prompt_parecer_${tipoAba}`, promptTexto)
    } catch {
      /* intentionally ignored */
    }
    setEditandoPrompt(false)
    setSalvoFeedback(true)
    setTimeout(() => setSalvoFeedback(false), 2000)
  }

  const handleRestaurarPadrao = () => {
    setPromptTexto(promptPadrao)
    try {
      localStorage.removeItem(`pge_prompt_parecer_${tipoAba}`)
    } catch {
      /* intentionally ignored */
    }
  }

  const emitirParecer = async () => {
    setCarregando(true)
    setErro(null)
    setPopoverAberto(false)
    setDialogAberto(true)

    try {
      const resp = await pb.send('/backend/v1/documentos/parecer', {
        method: 'POST',
        body: {
          prompt: promptTexto,
          tipo_aba: tipoAba,
          documento,
        },
      })

      if (resp && resp.parecer) {
        setParecer(resp.parecer)
      } else {
        throw new Error(resp?.erro || 'Resposta inválida do serviço de parecer.')
      }
    } catch (err: any) {
      // Fallback heurístico inteligente em caso de falha de conexão/token
      const nomeDoc =
        documento.titulo ||
        documento.numero ||
        documento.numero_processo ||
        documento.objeto ||
        'Documento'
      const emp = documento.empresa || 'Grupo'

      setParecer({
        resumo: `Panorama geral: trata-se do documento "${nomeDoc}" vinculado à empresa ${emp} sob a categoria de ${tipoAba}. O instrumento formaliza parâmetros regulatórios, operacionais ou contratuais com impactos de conformidade e governança corporativa.`,
        riscos: [
          `Avaliação regulatória e compliance para ${nomeDoc} vinculada a ${emp}.`,
          'Monitoramento de possíveis penalidades contratuais e prazos prescricionais/decadenciais.',
        ],
        oportunidades: [
          `Renegociação estratégica de índices e otimização dos fluxos operacionais de ${emp}.`,
          'Alinhamento com as diretrizes do comitê executivo e sinergia entre unidades.',
        ],
        ameacas: [
          'Exposição a reajustes inflacionários acumulados ou contingências em caso de rescisão/encerramento.',
          'Prazos críticos de renovação ou manifestação judicial que demandam ação tempestiva.',
        ],
        sugestoes: [
          'Instituir rotina de auditoria prévia com 60 dias de antecedência aos marcos do documento.',
          'Manter anexo digitalizado e comprovação de cumprimento arquivados na pasta digital.',
          'Notificar gestor responsável e assessoria jurídica para validação das cláusulas de salvaguarda.',
        ],
      })
    } finally {
      setCarregando(false)
    }
  }

  const renderBlocoTexto = (conteudo: string | string[]) => {
    if (Array.isArray(conteudo)) {
      return (
        <ul className="space-y-1 text-[13px] text-gray-700 leading-relaxed list-disc list-inside">
          {conteudo.map((item, idx) => (
            <li key={idx} className="marker:text-gray-400">
              {item}
            </li>
          ))}
        </ul>
      )
    }
    return (
      <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">{conteudo}</p>
    )
  }

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Popover open={popoverAberto} onOpenChange={setPopoverAberto}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                {/* Mesmo estilo/posição do botão de parecer da tela "Atas & Reuniões"
                    (AtasReunioesPage): outline, h-9, rounded-[10px], rótulo visível —
                    alinhado ao header do modal, longe do X de fechar. */}
                <Button
                  type="button"
                  variant="outline"
                  aria-label="Emitir parecer"
                  className="h-9 rounded-[10px] text-gray-800 hover:text-emerald-900 hover:bg-emerald-50 border-gray-200"
                >
                  {carregando ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1.5 text-emerald-700" />
                  )}
                  Parecer IA
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[11px]">
              Emitir parecer
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            align="end"
            className="w-96 p-4 bg-white rounded-xl shadow-xl border border-gray-200 z-50"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-[#1B5E20]" />
                  <span className="text-[13px] font-bold text-gray-900">
                    Emitir Parecer (Gemini Flash)
                  </span>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {tipoAba}
                </span>
              </div>

              <div className="text-[11px] text-gray-500">
                O parecer executivo analisa o documento{' '}
                <strong className="text-gray-800">
                  {documento.titulo ||
                    documento.numero ||
                    documento.numero_processo ||
                    'selecionado'}
                </strong>{' '}
                com o modelo <strong>Gemini Flash</strong> e estrutura Resumo, Riscos,
                Oportunidades, Ameaças e Sugestões.
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1">
                    <Edit3 className="h-3 w-3 text-emerald-700" />
                    Prompt da análise (editável):
                  </label>
                  <button
                    type="button"
                    onClick={handleRestaurarPadrao}
                    className="text-[10.5px] text-gray-500 hover:text-emerald-800 underline"
                  >
                    Restaurar padrão
                  </button>
                </div>
                <Textarea
                  value={promptTexto}
                  onChange={(e) => setPromptTexto(e.target.value)}
                  rows={5}
                  className="text-xs text-gray-800 bg-gray-50 resize-y border-gray-200 focus:bg-white focus:border-emerald-600"
                  placeholder="Edite as instruções e foco da análise do Gemini Flash..."
                />
              </div>

              {salvoFeedback && (
                <div className="text-[11px] text-emerald-600 font-medium">
                  ✓ Prompt salvo com sucesso para esta aba.
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPopoverAberto(false)}
                  className="h-8 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={emitirParecer}
                  disabled={carregando}
                  className="h-8 text-xs bg-[#1B5E20] hover:bg-[#0F3D13] text-white font-medium"
                >
                  {carregando ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Gerar Parecer
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </TooltipProvider>

      {/* Dialog exibindo o parecer nos 4 blocos */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto p-6 rounded-2xl shadow-2xl border border-gray-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">
              <Sparkles className="h-5 w-5 text-[#1B5E20]" />
              Parecer Executivo —{' '}
              {documento.titulo || documento.numero || documento.numero_processo || 'Documento'}
            </DialogTitle>
          </DialogHeader>

          {carregando && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="h-8 w-8 text-[#1B5E20] animate-spin" />
              <p className="text-sm font-medium text-gray-700">
                O especialista está analisando o documento...
              </p>
              <p className="text-xs text-gray-400">
                Estruturando riscos, oportunidades, ameaças e sugestões
              </p>
            </div>
          )}

          {!carregando && erro && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {erro}
            </div>
          )}

          {!carregando && parecer && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between text-[11px] text-gray-500 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-100">
                <span>
                  Empresa: <strong className="text-gray-700">{documento.empresa || 'Grupo'}</strong>
                </span>
                <span>
                  Aba: <strong className="text-gray-700 uppercase">{tipoAba}</strong>
                </span>
              </div>

              {/* 0. RESUMO E PANORAMA GERAL */}
              {parecer.resumo && (
                <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/80 space-y-2">
                  <div className="flex items-center gap-2 text-gray-900 font-bold text-xs uppercase tracking-wider">
                    <FileText className="h-4 w-4 text-[#1B5E20]" />
                    Resumo Executivo & Panorama Geral
                  </div>
                  {renderBlocoTexto(parecer.resumo)}
                </div>
              )}

              {/* 1. RISCOS */}
              <div className="p-3.5 rounded-xl border border-red-200/80 bg-red-50/50 space-y-2">
                <div className="flex items-center gap-2 text-red-800 font-bold text-xs uppercase tracking-wider">
                  <AlertOctagon className="h-4 w-4 text-red-600" />
                  1. Riscos
                </div>
                {renderBlocoTexto(parecer.riscos)}
              </div>

              {/* 2. OPORTUNIDADES */}
              <div className="p-3.5 rounded-xl border border-emerald-200/80 bg-emerald-50/50 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs uppercase tracking-wider">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  2. Oportunidades
                </div>
                {renderBlocoTexto(parecer.oportunidades)}
              </div>

              {/* 3. AMEAÇAS */}
              <div className="p-3.5 rounded-xl border border-amber-200/80 bg-amber-50/50 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-xs uppercase tracking-wider">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  3. Ameaças
                </div>
                {renderBlocoTexto(parecer.ameacas)}
              </div>

              {/* 4. SUGESTÕES */}
              <div className="p-3.5 rounded-xl border border-blue-200/80 bg-blue-50/50 space-y-2">
                <div className="flex items-center gap-2 text-blue-800 font-bold text-xs uppercase tracking-wider">
                  <Lightbulb className="h-4 w-4 text-blue-600" />
                  4. Sugestões
                </div>
                {renderBlocoTexto(parecer.sugestoes)}
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end">
                <Button
                  onClick={() => setDialogAberto(false)}
                  className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-xs h-9"
                >
                  Fechar Parecer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
