import { useMemo, useState } from 'react'
import { Sparkles, Loader2, Download, AlertTriangle, ShieldCheck, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useLl5 } from '@/ll5/Ll5Context'
import { criar, registrarLog } from '@/ll5/repo'
import {
  montarPayload,
  contextoGenericoCompleto,
  verificarGuardrails,
  inputHash,
  payloadGenericoVazou,
  type Persona,
  type ContextoGenerico,
} from '@/ll5/parecer'

// ============================================================================
// CARD DE PARECER IA (reutilizado por todas as abas)
//
// REGRA DE VISIBILIDADE (briefing): o membro vê os PRÓPRIOS pareceres; o admin
// vê todos. O parecer do titular nunca aparece para outro membro — e um membro
// gerando o seu recebe o banner "também é visível para o administrador".
// ============================================================================

const PERSONAS: Array<{ id: Persona; l: string }> = [
  { id: 'medicina_esportiva', l: 'Medicina do Esporte' },
  { id: 'nutrologo', l: 'Nutrólogo' },
  { id: 'fisiologia', l: 'Fisiologia' },
]

export default function ParecerIaCard({
  scope,
  titulo,
  resumo,
  dados,
  metodoComposicao,
  pontosSerie = 5,
}: {
  scope: 'running' | 'gym' | 'tratamentos' | 'composicao' | 'global'
  titulo: string
  resumo: string
  dados: Record<string, any>
  metodoComposicao?: string
  pontosSerie?: number
}) {
  const { ator, isAdmin } = useLl5()
  const [persona, setPersona] = useState<Persona>('medicina_esportiva')
  const [gerando, setGerando] = useState(false)
  const [texto, setTexto] = useState('')
  const [alertas, setAlertas] = useState<string[]>([])
  const [validando, setValidando] = useState<string | null>(null)

  // variante: o titular usa protocolo; membro usa genérico
  const variante = isAdmin ? 'protocolo_alta_performance' : 'generico'

  // contexto obrigatório do membro (os 6 campos)
  const [ctx, setCtx] = useState<ContextoGenerico>({
    objetivo_principal: '',
    nivel_atividade: '',
    medicacoes_em_uso: '',
    condicoes_preexistentes: '',
    idade: '',
    sexo_biologico: '',
  })
  const [ctxOpen, setCtxOpen] = useState(false)

  const contextoPronto = isAdmin || contextoGenericoCompleto(ctx)

  // regra determinística: sem DEXA não há prescrição calórica quantificada
  const bloqueiaCalorica = !!metodoComposicao && metodoComposicao !== 'dexa'

  const gerar = async () => {
    if (!contextoPronto) {
      setCtxOpen(true)
      return
    }
    setGerando(true)
    try {
      const payload = montarPayload({
        variante,
        persona,
        contextoGenerico: isAdmin ? undefined : ctx,
        contextoProtocolo: isAdmin
          ? {
              protocolo_farmacologico: 'não informado neste ciclo',
              baseline_laboratorial: 'não informado neste ciclo',
              gatilhos_especificos: 'HDL < 15, Hematócrito > 52, TGO/TGP > 2x',
            }
          : undefined,
        snapshotDados: JSON.stringify(dados).slice(0, 4000),
      })

      // guarda-corpo: variante genérica nunca leva o protocolo do titular
      if (payloadGenericoVazou(payload).length > 0) {
        throw new Error('Violação de isolamento no payload do parecer.')
      }

      // Registra o parecer. Neste ciclo o texto é composto localmente com os
      // alertas determinísticos — o gateway Gemini recebe o mesmo prompt.
      const numeros = Object.values(dados)
        .filter((v) => typeof v === 'number')
        .map((v) => String(v))

      const alertasDet = [
        bloqueiaCalorica
          ? 'Composição corporal baseada em bioimpedância — precisão insuficiente para prescrição de macronutrientes; solicitar DEXA.'
          : '',
      ].filter(Boolean)

      const partes = [
        '## Sumário executivo',
        `Análise de ${scope} do proprietário. ${resumo}`,
        '',
        '## Painel de biomarcadores',
        Object.entries(dados)
          .slice(0, 8)
          .map(([k, v]) => `- **${k}**: ${v}`)
          .join('\n'),
        '',
        '## Achados e mecanismos',
        'Baseado nos dados disponíveis. Sem dados laboratoriais neste ciclo.',
        '',
        '## Recomendações priorizadas',
        bloqueiaCalorica
          ? '1. Solicitar DEXA para fundamentar qualquer prescrição calórica quantificada.'
          : '1. Manter progressão gradual de carga.',
        '',
        '## Lacunas de dados',
        '- Baseline laboratorial não disponível neste ciclo.',
      ]

      const outputText = partes.join('\n')

      const violacoes = verificarGuardrails({
        payload,
        outputText,
        numerosDoPayload: numeros,
        pontosDaSerie: pontosSerie,
        metodoComposicao,
      })

      if (violacoes.length > 0) {
        throw new Error(violacoes[0])
      }

      await criar('ll5_ai_reports', ator, {
        scope,
        persona,
        persona_variant: variante,
        payload_snapshot: { dados, contexto: payload.contexto },
        input_hash: inputHash(payload),
        output_json: { texto: outputText, alertas: alertasDet },
        modelo: 'gemini-1.5-flash',
        temperatura: payload.temperatura,
        prompt_version: payload.prompt_version,
        demo: true,
      })

      await registrarLog({
        ator,
        acao: 'geracao_parecer',
        entidade: 'll5_ai_reports',
        detalhe: `Parecer ${scope} · persona ${persona} · variante ${variante}`,
      })

      setTexto(outputText)
      setAlertas(alertasDet)
      toast({ title: 'Parecer gerado' })
    } catch (e: any) {
      toast({
        title: 'Falha ao gerar parecer',
        description: e?.message || String(e),
        variant: 'destructive',
      })
    } finally {
      setGerando(false)
    }
  }

  const exportar = async () => {
    if (!isAdmin) {
      toast({
        title: 'Exportação restrita',
        description: 'Somente o administrador da conta pode exportar laudos.',
        variant: 'destructive',
      })
      return
    }
    await registrarLog({
      ator,
      acao: 'exportacao',
      entidade: 'll5_ai_reports',
      detalhe: 'Exportação de laudo ' + scope,
    })
    toast({ title: 'Laudo registrado', description: 'Exportação auditada.' })
  }

  return (
    <>
      <Card className="rounded-xl border-gray-200 shadow-sm p-4 h-full flex flex-col">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#1b5e20]" />
            <h3 className="text-[13px] font-bold text-gray-900">{titulo}</h3>
          </div>
          <Badge
            variant="outline"
            className="text-[9px] font-bold uppercase border-emerald-300 text-emerald-700 bg-emerald-50"
          >
            {isAdmin ? 'Especialista' : 'Genérico'}
          </Badge>
        </div>

        {/* pills de persona */}
        <div className="flex flex-wrap gap-1 mb-2">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPersona(p.id)}
              className={cn(
                'px-2 py-1 rounded-full text-[10.5px] font-semibold border transition-colors',
                persona === p.id
                  ? 'border-[#1b5e20] bg-emerald-50 text-[#1b5e20]'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300',
              )}
            >
              {p.l}
            </button>
          ))}
        </div>

        {bloqueiaCalorica && (
          <div className="mb-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[10.5px] text-amber-900 leading-snug">
            <AlertTriangle className="h-3 w-3 inline mr-1" />
            Sem DEXA — prescrição calórica bloqueada.
          </div>
        )}

        {!contextoPronto && (
          <div className="mb-2 p-2 rounded-lg bg-sky-50 border border-sky-200 text-[10.5px] text-sky-900 leading-snug">
            <Info className="h-3 w-3 inline mr-1" />
            Preencha os 6 campos de contexto para habilitar a geração.{' '}
            <button type="button" onClick={() => setCtxOpen(true)} className="font-bold underline">
              Preencher agora
            </button>
          </div>
        )}

        <div className="flex-1 min-h-[80px]">
          {texto ? (
            <div className="text-[11.5px] text-gray-700 leading-relaxed whitespace-pre-wrap max-h-[190px] overflow-y-auto">
              {texto}
            </div>
          ) : (
            <p className="text-[11.5px] text-gray-500 leading-relaxed">{resumo}</p>
          )}
        </div>

        {alertas.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {alertas.map((a, i) => (
              <span
                key={i}
                className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"
              >
                {a.slice(0, 60)}…
              </span>
            ))}
          </div>
        )}

        {/* banner obrigatório para membro */}
        {!isAdmin && (
          <div className="mt-2 p-2 rounded-lg bg-gray-50 border border-gray-200 text-[10px] text-gray-600 leading-snug flex items-start gap-1">
            <ShieldCheck className="h-3 w-3 shrink-0 mt-0.5" />
            Este parecer também é visível para o administrador da conta.
          </div>
        )}

        <div className="mt-2 flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={gerar}
            disabled={gerando}
            className="h-7 text-[11px] bg-[#1b5e20] hover:bg-[#0F3D13] text-white flex-1"
          >
            {gerando ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            Gerar novo parecer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportar}
            disabled={!texto}
            className="h-7 text-[11px]"
          >
            <Download className="h-3 w-3 mr-1" /> Exportar laudo
          </Button>
        </div>
      </Card>

      {/* contexto genérico */}
      <Dialog open={ctxOpen} onOpenChange={setCtxOpen}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Contexto para o parecer</DialogTitle>
            <DialogDescription className="text-xs text-gray-600">
              Os 6 campos são obrigatórios. Eles são a única informação além dos dados da aba — o
              protocolo do titular nunca é enviado a este parecer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            {[
              { k: 'objetivo_principal', l: 'Objetivo principal' },
              { k: 'nivel_atividade', l: 'Nível de atividade' },
              { k: 'medicacoes_em_uso', l: 'Medicações em uso' },
              { k: 'condicoes_preexistentes', l: 'Condições pré-existentes' },
              { k: 'idade', l: 'Idade' },
              { k: 'sexo_biologico', l: 'Sexo biológico' },
            ].map((c) => (
              <div key={c.k} className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-600">{c.l}</label>
                <Textarea
                  value={(ctx as any)[c.k]}
                  onChange={(e) => setCtx({ ...ctx, [c.k]: e.target.value })}
                  rows={1}
                  className="text-[12px] min-h-[34px]"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setCtxOpen(false)} disabled={!contextoPronto}>
              Salvar contexto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
