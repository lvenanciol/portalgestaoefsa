import { useEffect, useMemo, useState } from 'react'
import {
  Mail,
  Loader2,
  Save,
  CheckCircle2,
  AlertTriangle,
  Bell,
  FileText,
  MessageSquare,
  PlusCircle,
  PencilLine,
  Send,
  Info,
  RefreshCw,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

// ============================================================================
// INTEGRAÇÕES → E-MAIL  (reformulada em 14/11/2026)
//
// ANTES: esta tela duplicava "Relacionamentos → E-mails" (caixa sincronizada,
// OAuth, assinatura). Duas telas mostrando a mesma caixa geravam confusão.
//
// AGORA: é a tela de GESTÃO/CONFIGURAÇÃO de notificações por e-mail nas telas
// do sistema — o que faltava para configurar o envio de tarefas.
//
// O que ela faz:
//  1. Mostra o REMETENTE em uso (lê do backend, não do bundle)
//  2. Matriz de eventos × canais por módulo (Tarefas: criada/alterada/chat)
//  3. Salva em integracoes_config (integracao = "email_notificacoes")
//  4. Testa o envio de um e-mail para o próprio usuário logado
//
// A caixa de entrada continua em Relacionamentos → E-mails (lá é o lugar).
// ============================================================================

const INTEGRACAO_ID = 'email_notificacoes'

type EventoId = 'criada' | 'alterada' | 'chat' | 'concluida' | 'excluida'

interface Modulo {
  id: string
  nome: string
  descricao: string
  eventos: { id: EventoId; label: string; desc: string }[]
}

const MODULOS: Modulo[] = [
  {
    id: 'tarefas',
    nome: 'Tarefas & Agenda',
    descricao: 'Avisos para quem participa da tarefa (responsáveis, parceiros e criador)',
    eventos: [
      { id: 'criada', label: 'Tarefa criada', desc: 'Nova tarefa com responsável definido' },
      {
        id: 'alterada',
        label: 'Tarefa alterada',
        desc: 'Qualquer campo: prazo, prioridade, título…',
      },
      { id: 'concluida', label: 'Tarefa concluída', desc: 'Tarefa marcada como concluída' },
      { id: 'chat', label: 'Nova mensagem no chat', desc: 'Comentário enviado na tarefa' },
    ],
  },
]

interface CfgEvento {
  email: boolean
  sino: boolean
}

type Config = Record<string, Record<EventoId, CfgEvento>>

const PADRAO: Config = {
  tarefas: {
    criada: { email: true, sino: true },
    alterada: { email: true, sino: true },
    concluida: { email: true, sino: true },
    chat: { email: true, sino: true },
    excluida: { email: false, sino: false },
  },
}

interface StatusRemetente {
  ok: boolean
  remetente: string
  nomeRemetente: string
  origem: string
  nomeOrigem?: string
  usaSmtpProprio: boolean
  host: string
  porta: number | null
  aviso?: string
  matriz?: { configurada: boolean; atualizado_por?: string; atualizado_em?: string }
}

// O secret EMAIL_REMETENTE_NOME não aceita acentos — normalizamos no cliente
// com a MESMA regra do backend, para o usuário ver o resultado antes de salvar.
function semAcento(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function EmailIntegracaoPage() {
  const [cfg, setCfg] = useState<Config>(PADRAO)
  const [status, setStatus] = useState<StatusRemetente | null>(null)
  const [carregandoStatus, setCarregandoStatus] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [alterado, setAlterado] = useState(false)
  const [recordId, setRecordId] = useState('')

  // editor do nome do remetente (item a)
  const [editandoNome, setEditandoNome] = useState(false)
  const [nomeInput, setNomeInput] = useState('')
  const [salvandoNome, setSalvandoNome] = useState(false)

  const nomeNormalizado = semAcento(nomeInput)
  const temAcento = nomeInput !== nomeNormalizado && nomeInput.trim() !== ''

  // ---- carrega configuração salva ----
  const carregarConfig = async () => {
    try {
      const r = (await pb.collection('integracoes_config').getFullList({
        filter: 'integracao = "' + INTEGRACAO_ID + '"',
      })) as any[]
      if (r.length) {
        setRecordId(r[0].id)
        const salvo = r[0].config || {}
        // merge defensivo: mantém o padrão para chaves ausentes
        const novo: Config = {}
        for (const mod of MODULOS) {
          novo[mod.id] = {} as Record<EventoId, CfgEvento>
          for (const ev of mod.eventos) {
            const s = salvo?.[mod.id]?.[ev.id]
            novo[mod.id][ev.id] = {
              email: s?.email !== undefined ? !!s.email : PADRAO[mod.id][ev.id].email,
              sino: s?.sino !== undefined ? !!s.sino : PADRAO[mod.id][ev.id].sino,
            }
          }
        }
        setCfg(novo)
      }
    } catch (_e) {
      /* sem registro ainda — usa o padrão */
    }
  }

  // ---- remetente real (vem do backend, não do bundle) ----
  const carregarStatus = async () => {
    setCarregandoStatus(true)
    try {
      const r = (await pb.send('/backend/v1/email/remetente-status', {
        method: 'GET',
      })) as StatusRemetente
      setStatus(r)
    } catch (e) {
      setStatus({
        ok: false,
        remetente: '—',
        nomeRemetente: '—',
        origem: 'indisponível',
        usaSmtpProprio: false,
        host: '',
        porta: null,
        aviso: 'Não foi possível ler a configuração de envio: ' + String(e),
      })
    } finally {
      setCarregandoStatus(false)
    }
  }

  useEffect(() => {
    carregarConfig()
    carregarStatus()
  }, [])

  const salvarNome = async () => {
    const limpo = semAcento(nomeInput)
    if (!limpo) {
      toast({
        title: 'Nome inválido',
        description: 'Use letras, números e hífen.',
        variant: 'destructive',
      })
      return
    }
    setSalvandoNome(true)
    try {
      const r = (await pb.send('/backend/v1/email/remetente-nome', {
        method: 'POST',
        body: JSON.stringify({ nome: nomeInput }),
      })) as any
      setEditandoNome(false)
      await carregarStatus()
      toast({
        title: 'Nome do remetente atualizado',
        description: r.aviso ? r.nome + ' — ' + r.aviso : r.nome,
      })
    } catch (e: any) {
      toast({
        title: 'Falha ao salvar o nome',
        description: e?.response?.data?.message || String(e),
        variant: 'destructive',
      })
    } finally {
      setSalvandoNome(false)
    }
  }

  const alternar = (mod: string, ev: EventoId, canal: 'email' | 'sino') => {
    setCfg((prev) => ({
      ...prev,
      [mod]: {
        ...prev[mod],
        [ev]: { ...prev[mod][ev], [canal]: !prev[mod][ev][canal] },
      },
    }))
    setAlterado(true)
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      const dados = {
        integracao: INTEGRACAO_ID,
        config: cfg,
        atualizado_por: pb.authStore.model?.email || '',
      }
      if (recordId) await pb.collection('integracoes_config').update(recordId, dados)
      else {
        const novo = await pb.collection('integracoes_config').create(dados)
        setRecordId((novo as any).id)
      }
      setAlterado(false)
      toast({
        title: 'Configuração salva',
        description: 'As notificações passam a seguir esta matriz.',
      })
    } catch (e: any) {
      toast({
        title: 'Falha ao salvar',
        description: e?.response?.data?.message || String(e),
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const testar = async () => {
    setTestando(true)
    try {
      const r = (await pb.send('/backend/v1/email/testar-envio', { method: 'POST' })) as any
      if (r.ok) {
        toast({
          title: 'E-mail de teste enviado',
          description: 'Verifique a caixa de ' + (r.para || 'seu e-mail') + '.',
        })
      } else {
        toast({
          title: 'Falha no teste',
          description: r.erro || 'Erro desconhecido no envio.',
          variant: 'destructive',
        })
      }
    } catch (e: any) {
      toast({
        title: 'Falha no teste',
        description: e?.response?.data?.erro || String(e),
        variant: 'destructive',
      })
    } finally {
      setTestando(false)
    }
  }

  const totalAtivo = useMemo(() => {
    let n = 0
    for (const mod of Object.keys(cfg)) {
      for (const ev of Object.keys(cfg[mod]) as EventoId[]) {
        if (cfg[mod][ev].email || cfg[mod][ev].sino) n++
      }
    }
    return n
  }, [cfg])

  return (
    <div className="space-y-5 pb-8">
      {/* cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Mail className="h-6 w-6 text-[#1B5E20]" /> E-mail
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Configuração dos avisos por e-mail nas telas do sistema
          </p>
        </div>
        {alterado && (
          <Button
            onClick={salvar}
            disabled={salvando}
            className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
          >
            {salvando ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Salvar alterações
          </Button>
        )}
      </div>

      {/* aviso de escopo */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-sky-50 border border-sky-200">
        <Info className="h-4 w-4 text-sky-700 shrink-0 mt-0.5" />
        <div className="text-[12px] text-sky-900 leading-relaxed">
          <strong>Esta tela configura os avisos.</strong> A caixa de entrada sincronizada
          (Gmail/Outlook) fica em <strong>Relacionamentos → E-mails</strong> — as duas não se
          sobrepõem mais.
        </div>
      </div>

      {/* remetente */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
            <Send className="h-3.5 w-3.5" /> Remetente em uso
          </span>
          <button
            type="button"
            onClick={carregarStatus}
            className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"
          >
            <RefreshCw className={cn('h-3 w-3', carregandoStatus && 'animate-spin')} /> atualizar
          </button>
        </div>

        {carregandoStatus ? (
          <div className="px-4 py-6 flex items-center gap-2 text-[12px] text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo configuração de envio…
          </div>
        ) : status ? (
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Endereço
                </div>
                <div className="text-[13px] font-semibold text-gray-900">{status.remetente}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Nome exibido
                </div>
                {editandoNome ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      value={nomeInput}
                      onChange={(e) => setNomeInput(e.target.value)}
                      placeholder="Portal de Gestao Executivo - Extrafruti"
                      className="h-7 w-56 rounded border border-gray-300 px-2 text-[12px] outline-none focus:border-[#1B5E20]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={salvarNome}
                      disabled={salvandoNome}
                      className="h-7 px-2 rounded bg-[#1B5E20] text-white text-[11px] font-semibold disabled:opacity-50"
                    >
                      {salvandoNome ? '…' : 'salvar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoNome(false)}
                      className="h-7 px-2 rounded border border-gray-300 text-[11px] font-semibold text-gray-600"
                    >
                      cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-gray-700">{status.nomeRemetente}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setNomeInput(status.nomeRemetente)
                        setEditandoNome(true)
                      }}
                      className="text-[11px] font-semibold text-[#1B5E20] hover:underline"
                    >
                      editar
                    </button>
                  </div>
                )}
                {editandoNome && temAcento && (
                  <div className="mt-1 text-[10.5px] text-amber-700 leading-tight">
                    O secret não aceita acentos — será salvo como <strong>{nomeNormalizado}</strong>
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Origem
                </div>
                <div className="text-[13px] text-gray-700">{status.origem}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Envio
                </div>
                <div className="text-[13px] text-gray-700">
                  {status.usaSmtpProprio
                    ? 'SMTP próprio' +
                      (status.host ? ' · ' + status.host + ':' + (status.porta ?? '') : '')
                    : 'Relay da plataforma'}
                </div>
              </div>
            </div>

            {status.usaSmtpProprio ? (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                <div className="text-[11.5px] text-emerald-900">
                  Enviando pelo servidor próprio — o e-mail sai com o endereço acima no{' '}
                  <strong>De</strong>.
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-[11.5px] text-amber-900 leading-relaxed">
                  <strong>Usando o relay da plataforma.</strong> Nesse modo o <em>De</em> é
                  reescrito para o domínio verificado da plataforma e o endereço acima vai apenas
                  como <em>Responder para</em>. Para enviar com o seu domínio no <em>De</em>, é
                  preciso um servidor SMTP próprio (Microsoft 365:{' '}
                  <code className="bg-amber-100 px-1 rounded">smtp.office365.com:587</code>).
                  {status.aviso ? ' ' + status.aviso : ''}
                </div>
              </div>
            )}

            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={testar}
                disabled={testando}
                className="h-8 text-[12px]"
              >
                {testando ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                )}
                Enviar e-mail de teste para mim
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* matriz de notificações */}
      {MODULOS.map((mod) => {
        const icoPorEvento: Record<string, any> = {
          criada: PlusCircle,
          alterada: PencilLine,
          concluida: CheckCircle2,
          chat: MessageSquare,
          excluida: FileText,
        }
        return (
          <div key={mod.id} className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="text-[13px] font-bold text-gray-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#1B5E20]" /> {mod.nome}
              </div>
              <div className="text-[11.5px] text-gray-500 mt-0.5">{mod.descricao}</div>
            </div>

            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50/70 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  <th className="text-left px-4 py-2">Evento</th>
                  <th className="text-center px-3 py-2 w-[130px]">
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" /> E-mail
                    </span>
                  </th>
                  <th className="text-center px-3 py-2 w-[130px]">
                    <span className="inline-flex items-center gap-1">
                      <Bell className="h-3 w-3" /> Sino
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {mod.eventos.map((ev) => {
                  const Ico = icoPorEvento[ev.id] || FileText
                  const c = cfg[mod.id]?.[ev.id] || { email: false, sino: false }
                  return (
                    <tr key={ev.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-start gap-2">
                          <Ico className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-semibold text-gray-800">{ev.label}</div>
                            <div className="text-[11px] text-gray-500">{ev.desc}</div>
                          </div>
                        </div>
                      </td>
                      {(['email', 'sino'] as const).map((canal) => (
                        <td key={canal} className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={c[canal]}
                            aria-label={ev.label + ' por ' + canal}
                            onClick={() => alternar(mod.id, ev.id, canal)}
                            className={cn(
                              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                              c[canal] ? 'bg-[#1B5E20]' : 'bg-gray-300',
                            )}
                          >
                            <span
                              className={cn(
                                'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                                c[canal] ? 'translate-x-[19px]' : 'translate-x-[3px]',
                              )}
                            />
                          </button>
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="px-4 py-2 bg-gray-50/60 border-t border-gray-100 text-[11px] text-gray-500">
              Envolvidos: responsáveis, parceiros vinculados e criador. Quem executa a ação nunca
              recebe aviso da própria ação.
            </div>
          </div>
        )
      })}

      {/* rodapé de estado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50/60">
        <div className="text-[11.5px] text-gray-600">
          <strong>{totalAtivo}</strong> evento(s) com pelo menos um canal ativo.
          {alterado && (
            <span className="text-amber-700 font-semibold"> Alterações não salvas.</span>
          )}
        </div>
        <Button
          onClick={salvar}
          disabled={salvando || !alterado}
          className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white disabled:opacity-50"
        >
          {salvando ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Salvar alterações
        </Button>
      </div>
    </div>
  )
}
