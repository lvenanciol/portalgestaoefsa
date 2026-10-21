import { useEffect, useState } from 'react'
import { Mail, Plus, Loader2, X, Send, FileText, RefreshCw, Inbox, Paperclip } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fmtDataBRT } from '@/lib/brt'
import { cn } from '@/lib/utils'

// TAREFA MAIL b + T0 (21/10) — E-mails: abas Gmail / Outlook com
// "Sincronizar caixa" POR ABA (espelho das conexões da tela E-mail em
// Integrações), lista sincronizada por provedor, clique abre DETALHE
// (corpo completo + anexos via /backend/v1/email/oauth/detalhe) e
// compositor com assinatura da conta conectada (T0c).

interface Modelo {
  chave: string
  titulo: string
  assunto: string
  corpo: string
}

interface InboxMsg {
  id: string
  provedor: string
  message_id: string
  de: string
  assunto: string
  preview: string
  recebido_em: string
  lido: boolean
}

interface Detalhe {
  ok: boolean
  assunto?: string
  de?: string
  data?: string
  corpo_html?: string
  corpo_texto?: string
  anexos?: {
    nome: string
    mime?: string
    tamanho?: number
    base64?: string
    attachment_id?: string
  }[]
  erro?: string
}

export default function EmailsPage() {
  const { user } = useAuth()
  const [regs, setRegs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  // abas por provedor (TAREFA MAIL b)
  const [oauth, setOauth] = useState<Record<string, { conectado: boolean; conta?: string }>>({
    google: { conectado: false },
    microsoft: { conectado: false },
  })
  const [inbox, setInbox] = useState<InboxMsg[]>([])
  const [syncando, setSyncando] = useState('')
  const [msg, setMsg] = useState('')
  // detalhe do e-mail (T0b)
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const [detalheId, setDetalheId] = useState('')
  // compositor
  const [dialog, setDialog] = useState(false)
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [modeloSel, setModeloSel] = useState('livro')
  const [para, setPara] = useState('')
  const [assunto, setAssunto] = useState('')
  const [corpo, setCorpo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [assinaturaUrl, setAssinaturaUrl] = useState('')

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.collection('emails').getFullList({ sort: '-created' })
      setRegs(r as any[])
      setErro('')
    } catch (e) {
      setErro(String(e))
    } finally {
      setLoading(false)
    }
  }

  const carregarOauth = async () => {
    try {
      const r = (await pb.send('/backend/v1/email/oauth/status', { method: 'GET' })) as any
      setOauth({
        google: r.google || { conectado: false },
        microsoft: r.microsoft || { conectado: false },
      })
    } catch (_) {
      /* sem conexão */
    }
  }

  const carregarInbox = async () => {
    try {
      const r = await pb.collection('emails_inbox').getFullList({ sort: '-recebido_em' })
      setInbox(r as any[])
    } catch (_) {
      setInbox([])
    }
  }

  useEffect(() => {
    carregar()
    carregarOauth()
    carregarInbox()
    ;(async () => {
      try {
        const r = (await pb.send('/backend/v1/emails/modelos', { method: 'GET' })) as any
        setModelos(r.modelos || [])
      } catch (_) {
        setModelos([])
      }
    })()
  }, [])

  const sincronizar = async (provedor: string) => {
    setSyncando(provedor)
    setMsg('')
    try {
      const r = (await pb.send('/backend/v1/email/oauth/sync', {
        method: 'POST',
        body: JSON.stringify({ provedor }),
      })) as any
      if (r.ok) {
        setMsg('Caixa sincronizada — ' + r.novos + ' novo(s) e-mail(s).')
        await carregarInbox()
      } else {
        setMsg('Falha no sync: ' + (r.erro || 'desconhecido'))
      }
    } catch (e) {
      setMsg('Erro no sync: ' + String(e))
    } finally {
      setSyncando('')
      setTimeout(() => setMsg(''), 10000)
    }
  }

  const abrirDetalhe = async (m: InboxMsg) => {
    setDetalheId(m.id)
    setDetalhe(null)
    try {
      const r = (await pb.send('/backend/v1/email/oauth/detalhe?id=' + encodeURIComponent(m.id), {
        method: 'GET',
      })) as any
      setDetalhe(r)
    } catch (e: any) {
      setDetalhe({ ok: false, erro: e?.response?.data?.erro || String(e) })
    }
  }

  const abrirCompositor = () => {
    setPara('')
    setAssunto('')
    setCorpo('')
    setModeloSel('livro')
    setMsg('')
    setDialog(true)
  }

  const aplicarModelo = (chave: string) => {
    setModeloSel(chave)
    const m = modelos.find((x) => x.chave === chave)
    if (m) {
      setAssunto(m.assunto)
      setCorpo(m.corpo)
    }
  }

  const enviar = async () => {
    setEnviando(true)
    setMsg('')
    try {
      // COR-4 F8: conexão real OAuth disponível? envia pela conta conectada
      let oauthProvider = ''
      try {
        const st = (await pb.send('/backend/v1/email/oauth/status', { method: 'GET' })) as any
        if (st.google?.conectado) oauthProvider = 'google'
        else if (st.microsoft?.conectado) oauthProvider = 'microsoft'
        // T0c: assinatura da conta selecionada (se houver)
        if (oauthProvider) {
          const ass = (await pb
            .collection('email_assinaturas')
            .getFullList({ filter: 'provedor="' + oauthProvider + '"' })) as any[]
          if (ass.length && ass[0].arquivo)
            setAssinaturaUrl(pb.files.getURL(ass[0], ass[0].arquivo))
          else setAssinaturaUrl('')
        }
      } catch (_) {
        /* sem conexão — usa relay */
      }
      if (oauthProvider) {
        const r = (await pb.send('/backend/v1/email/oauth/enviar', {
          method: 'POST',
          body: JSON.stringify({
            provedor: oauthProvider,
            para,
            assunto,
            corpo,
            modelo: modeloSel,
          }),
        })) as any
        if (!r.ok) throw new Error(r.erro || 'falha no envio OAuth')
        setMsg(
          'E-mail enviado pela conta ' + (oauthProvider === 'google' ? 'Gmail' : 'Outlook') + '.',
        )
      } else {
        await pb.send('/backend/v1/emails/enviar', {
          method: 'POST',
          body: JSON.stringify({ para, assunto, corpo, modelo: modeloSel }),
        })
        setMsg('E-mail enviado com sucesso.')
      }
      setDialog(false)
      await carregar()
    } catch (e: any) {
      setMsg('Falha: ' + (e?.response?.data?.erro || e?.message || String(e)))
    } finally {
      setEnviando(false)
      setTimeout(() => setMsg(''), 6000)
    }
  }

  const STATUS_COR: Record<string, string> = {
    enviado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    erro: 'bg-red-50 text-red-700 border-red-200',
  }

  const abaCaixa = (prov: 'google' | 'microsoft', nome: string) => {
    const st = oauth[prov] || { conectado: false }
    const lista = inbox.filter((m) => m.provedor === prov)
    return (
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50/50">
          <div className="text-[12px] text-gray-600">
            {st.conectado ? (
              <>
                <strong>{nome}</strong> conectado — {lista.length} e-mail(s) sincronizado(s)
              </>
            ) : (
              <>
                <strong>{nome}</strong> desconectado — conecte na tela{' '}
                <a
                  href="/integracoes/email"
                  className="text-[#1B5E20] font-semibold hover:underline"
                >
                  E-mail (Integrações)
                </a>
              </>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => sincronizar(prov)}
            disabled={!st.conectado || syncando === prov}
          >
            {syncando === prov ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Sincronizar caixa
          </Button>
        </div>
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
            <Inbox className="h-3.5 w-3.5" /> Caixa sincronizada ({lista.length})
          </div>
          <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
            {lista.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => abrirDetalhe(m)}
                className="block w-full text-left px-4 py-2.5 hover:bg-gray-50/70"
              >
                <div className="text-[13px] font-semibold text-gray-800 truncate">{m.assunto}</div>
                <div className="text-[11px] text-gray-500 truncate">
                  {m.de} · {fmtDataBRT(m.recebido_em)}
                </div>
                <div className="text-[11px] text-gray-400 line-clamp-1">{m.preview}</div>
              </button>
            ))}
            {lista.length === 0 && (
              <p className="text-center text-[12px] text-gray-400 py-8">
                {st.conectado
                  ? 'Nenhum e-mail sincronizado — clique em "Sincronizar caixa".'
                  : 'Conta não conectada.'}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#1B5E20]" />
      </div>
    )

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Mail className="h-6 w-6 text-[#1B5E20]" /> E-mails
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Caixas Gmail/Outlook sincronizadas + compositor com modelos e assinatura
          </p>
        </div>
        <Button
          onClick={abrirCompositor}
          className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
        >
          <Plus className="h-4 w-4 mr-1" /> Novo e-mail
        </Button>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}
      {msg && (
        <div
          className={cn(
            'p-3 rounded-lg text-[12px] font-semibold',
            msg.startsWith('Falha')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
          )}
        >
          {msg}
        </div>
      )}

      {/* TAREFA MAIL b: abas Gmail / Outlook com sync por aba */}
      <Tabs defaultValue="gmail">
        <TabsList className="bg-gray-100 p-1 rounded-lg h-10">
          <TabsTrigger value="gmail" className="rounded-md px-4 text-[13px] font-semibold gap-1.5">
            <Mail className="h-3.5 w-3.5" /> Gmail
          </TabsTrigger>
          <TabsTrigger
            value="outlook"
            className="rounded-md px-4 text-[13px] font-semibold gap-1.5"
          >
            <Mail className="h-3.5 w-3.5" /> Outlook
          </TabsTrigger>
        </TabsList>
        <TabsContent value="gmail" className="mt-3">
          {abaCaixa('google', 'Gmail (Google)')}
        </TabsContent>
        <TabsContent value="outlook" className="mt-3">
          {abaCaixa('microsoft', 'Outlook (Microsoft 365)')}
        </TabsContent>
      </Tabs>

      {/* Histórico de envios do portal */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-500">
          Enviados pelo portal
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2.5">Assunto</th>
                <th className="px-4 py-2.5">Para</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Enviado por</th>
                <th className="px-4 py-2.5">Data</th>
              </tr>
            </thead>
            <tbody>
              {regs.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-semibold text-gray-800">{r.assunto}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.para}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                        STATUS_COR[r.status] || 'bg-gray-100 text-gray-600 border-gray-200',
                      )}
                    >
                      {r.status}
                    </span>
                    {r.erro && (
                      <div className="text-[10px] text-red-600 mt-0.5 max-w-[200px] truncate">
                        {r.erro}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{r.criado_por || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 tabular-nums">
                    {fmtDataBRT(r.created)}
                  </td>
                </tr>
              ))}
              {regs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    Nenhum e-mail enviado ainda pelo portal. Use "Novo e-mail" para enviar o
                    primeiro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* T0b: dialog do e-mail — corpo completo + anexos (layout Outlook) */}
      <Dialog open={!!detalheId} onOpenChange={(o) => !o && setDetalheId('')}>
        <DialogContent className="bg-white max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-start justify-between gap-3">
              <span className="text-[15px]">{detalhe?.assunto || 'Carregando…'}</span>
              <button
                onClick={() => setDetalheId('')}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          {!detalhe && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[#1B5E20]" />
            </div>
          )}
          {detalhe && !detalhe.ok && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
              {detalhe.erro || 'Falha ao carregar o e-mail.'}
            </div>
          )}
          {detalhe && detalhe.ok && (
            <>
              <div className="text-[12px] text-gray-500 border-b border-gray-100 pb-2">
                De: <strong>{detalhe.de}</strong> · {fmtDataBRT(detalhe.data)}
              </div>
              {/* corpo: HTML sanitizado pelo navegador em iframe sandbox */}
              {detalhe.corpo_html ? (
                <iframe
                  title="corpo"
                  sandbox=""
                  className="w-full h-[420px] border border-gray-100 rounded-lg bg-white"
                  srcDoc={detalhe.corpo_html}
                />
              ) : (
                <p className="text-[13px] text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {detalhe.corpo_texto || '(sem conteúdo)'}
                </p>
              )}
              {detalhe.anexos && detalhe.anexos.length > 0 && (
                <div className="border-t border-gray-100 pt-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" /> Anexos ({detalhe.anexos.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detalhe.anexos.map((a, i) =>
                      a.base64 ? (
                        <a
                          key={i}
                          href={
                            'data:' + (a.mime || 'application/octet-stream') + ';base64,' + a.base64
                          }
                          download={a.nome}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-[12px] font-semibold text-gray-700"
                        >
                          <Paperclip className="h-3 w-3" /> {a.nome}{' '}
                          {a.tamanho ? '(' + Math.round(a.tamanho / 1024) + ' KB)' : ''}
                        </a>
                      ) : (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-[12px] font-semibold text-gray-500"
                        >
                          <Paperclip className="h-3 w-3" /> {a.nome} (baixar via provedor)
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog compositor */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="bg-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Send className="h-4 w-4 text-[#1B5E20]" /> Novo e-mail
              </span>
              <button
                onClick={() => setDialog(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Modelo
              </Label>
              <Select value={modeloSel} onValueChange={aplicarModelo}>
                <SelectTrigger className="h-10 bg-gray-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="livro">Em branco</SelectItem>
                  {modelos.map((m) => (
                    <SelectItem key={m.chave} value={m.chave}>
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="h-3 w-3" /> {m.titulo}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Para (vírgula p/ vários) *
              </Label>
              <Input
                value={para}
                onChange={(e) => setPara(e.target.value)}
                className="h-10 bg-gray-50"
                placeholder="destino@empresa.com.br"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Assunto *
              </Label>
              <Input
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                className="h-10 bg-gray-50"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Corpo
              </Label>
              <Textarea
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
                rows={8}
                placeholder="Escreva a mensagem..."
              />
            </div>
            {assinaturaUrl && (
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Assinatura (conta conectada)
                </Label>
                <img
                  src={assinaturaUrl}
                  alt="assinatura"
                  className="h-16 object-contain border border-gray-100 rounded-lg p-1 bg-white"
                />
              </div>
            )}
            <p className="text-[11px] text-gray-400">
              Enviado pela conta conectada (OAuth) ou pelo relay do portal. Assinaturas: tela E-mail
              em Integrações.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)} className="h-9">
              Cancelar
            </Button>
            <Button
              onClick={enviar}
              disabled={enviando || !para.trim() || !assunto.trim()}
              className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {enviando ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
