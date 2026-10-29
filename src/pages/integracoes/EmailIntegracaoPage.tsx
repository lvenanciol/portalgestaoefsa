import { useEffect, useState } from 'react'
import { Mail, Loader2, RefreshCw, Inbox, LogOut, Plug, X, Paperclip } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// TAREFA MAIL + T0 (20/10) — Tela E-mail dentro de INTEGRAÇÕES:
// a) abas Gmail / Outlook com conexão OAuth + "Sincronizar caixa" por aba
// b) clicar no e-mail sincronizado abre o conteúdo (preview) em dialog
// c) assinaturas por conta (upload na própria tela, usadas no compositor)

const URI_CALLBACK =
  'https://portal-de-gestao-executivo-b4d94.shrd01.internal.goskip.dev/backend/v1/email/oauth/callback'

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

export default function EmailIntegracaoPage() {
  const [oauth, setOauth] = useState<Record<string, { conectado: boolean; conta?: string }>>({
    google: { conectado: false },
    microsoft: { conectado: false },
  })
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState('')
  const [inbox, setInbox] = useState<InboxMsg[]>([])
  const [aberta, setAberta] = useState<InboxMsg | null>(null)
  const [assinaturas, setAssinaturas] = useState<Record<string, string>>({
    google: '',
    microsoft: '',
  })

  const carregarOauth = async () => {
    try {
      const r = (await pb.send('/backend/v1/email/oauth/status', { method: 'GET' })) as any
      setOauth({
        google: r.google || { conectado: false },
        microsoft: r.microsoft || { conectado: false },
      })
    } catch (_e) {
      /* sem tokens ainda — segue desconectado */
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

  const carregarAssinaturas = async () => {
    try {
      const r = await pb.collection('email_assinaturas').getFullList()
      const m: Record<string, string> = { google: '', microsoft: '' }
      for (const a of r as any[]) {
        if (a.provedor && a.arquivo) m[a.provedor] = pb.files.getURL(a, a.arquivo)
      }
      setAssinaturas(m)
    } catch (_e) {
      /* coleção ainda sem registros — segue vazio */
    }
  }

  useEffect(() => {
    carregarOauth()
    carregarInbox()
    carregarAssinaturas()
    const p = new URLSearchParams(window.location.search)
    if (p.get('oauth') === 'ok') {
      setMsg('Conectado com sucesso (' + (p.get('provedor') || '') + ').')
      window.history.replaceState({}, '', '/integracoes/email')
    } else if (p.get('oauth') === 'erro') {
      setMsg('Falha na conexão: ' + (p.get('det') || 'erro desconhecido'))
      window.history.replaceState({}, '', '/integracoes/email')
    }
  }, [])

  const conectar = async (provedor: string) => {
    setLoading(provedor)
    setMsg('')
    try {
      const r = (await pb.send('/backend/v1/email/oauth/iniciar', {
        method: 'POST',
        body: JSON.stringify({ provedor }),
      })) as any
      if (r.ok && r.url) {
        window.location.href = r.url
        return
      }
      setMsg(r.erro || 'Falha ao iniciar OAuth.')
    } catch (e) {
      setMsg('Erro: ' + String(e))
    } finally {
      setLoading('')
    }
  }

  const sincronizar = async (provedor: string) => {
    setLoading('sync-' + provedor)
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
      setLoading('')
      setTimeout(() => setMsg(''), 10000)
    }
  }

  const desconectar = async (provedor: string) => {
    setLoading('desc-' + provedor)
    try {
      await pb.send('/backend/v1/email/oauth/desconectar', {
        method: 'POST',
        body: JSON.stringify({ provedor }),
      })
      setMsg('Desconectado (' + provedor + ').')
      await carregarOauth()
    } catch (e) {
      setMsg('Erro: ' + String(e))
    } finally {
      setLoading('')
    }
  }

  const uploadAssinatura = async (provedor: string, f: File) => {
    setMsg('')
    try {
      // upsert: 1 assinatura por provedor
      const existentes = (await pb.collection('email_assinaturas').getFullList({
        filter: 'provedor="' + provedor + '"',
      })) as any[]
      const fd = new FormData()
      fd.append('provedor', provedor)
      fd.append('arquivo', f)
      if (existentes.length) await pb.collection('email_assinaturas').update(existentes[0].id, fd)
      else await pb.collection('email_assinaturas').create(fd)
      setMsg('Assinatura ' + (provedor === 'google' ? 'Gmail' : 'Outlook') + ' salva.')
      await carregarAssinaturas()
    } catch (e: any) {
      setMsg('Falha ao salvar assinatura: ' + (e?.response?.data?.erro || e?.message || String(e)))
    }
    setTimeout(() => setMsg(''), 8000)
  }

  const aba = (prov: 'google' | 'microsoft', nome: string) => {
    const st = oauth[prov] || { conectado: false }
    const lista = inbox.filter((m) => m.provedor === prov)
    return (
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-gray-100 bg-gray-50/50">
          <div>
            <div className="text-[13px] font-bold text-gray-900 flex items-center gap-2">
              {nome}
              {st.conectado ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Conectado
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                  Desconectado
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-500">
              {st.conectado ? st.conta || 'conta conectada' : 'OAuth 2.0 — leitura + envio'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {st.conectado ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => sincronizar(prov)}
                  disabled={loading === 'sync-' + prov}
                >
                  {loading === 'sync-' + prov ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Sincronizar caixa
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => desconectar(prov)}
                  disabled={loading === 'desc-' + prov}
                >
                  <LogOut className="h-4 w-4 mr-1" /> Desconectar
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="h-8 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                onClick={() => conectar(prov)}
                disabled={loading === prov}
              >
                <Plug className="h-4 w-4 mr-1" /> Conectar {prov === 'google' ? 'Gmail' : 'Outlook'}
              </Button>
            )}
          </div>
        </div>
        {/* assinatura por conta (T0c) */}
        <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-100 bg-emerald-50/40">
          <span className="text-[12px] font-semibold text-gray-700">Assinatura do e-mail:</span>
          {assinaturas[prov] ? (
            <img src={assinaturas[prov]} alt="assinatura" className="h-10 object-contain" />
          ) : (
            <span className="text-[11px] text-gray-400">nenhuma — envie PNG/JPG/PDF/SVG</span>
          )}
          <label className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-[11px] font-semibold text-gray-700 cursor-pointer">
            <Paperclip className="h-3 w-3" /> Enviar assinatura
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadAssinatura(prov, f)
              }}
            />
          </label>
        </div>
        {/* caixa sincronizada (T0b: clique abre o conteúdo) */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
            <Inbox className="h-3.5 w-3.5" /> Caixa sincronizada ({lista.length})
          </div>
          <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
            {lista.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setAberta(m)}
                className="block w-full text-left px-4 py-2.5 hover:bg-gray-50/70"
              >
                <div className="text-[13px] font-semibold text-gray-800 truncate">{m.assunto}</div>
                <div className="text-[11px] text-gray-500 truncate">
                  {m.de} · {String(m.recebido_em).slice(0, 16).replace('T', ' ')}
                </div>
                <div className="text-[11px] text-gray-400 line-clamp-1">{m.preview}</div>
              </button>
            ))}
            {lista.length === 0 && (
              <p className="text-center text-[12px] text-gray-400 py-8">
                Nenhum e-mail sincronizado — conecte a conta e clique em "Sincronizar caixa".
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Mail className="h-6 w-6 text-[#1B5E20]" /> E-mail
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Conexão real (OAuth), sincronização da caixa e assinaturas por conta
          </p>
        </div>
      </div>

      <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200">
        <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700 mb-1">
          URI de redirecionamento autorizado — registrar no Google Cloud e no Azure Entra
        </div>
        <code className="text-[11px] text-sky-900 break-all select-all">{URI_CALLBACK}</code>
      </div>

      {msg && (
        <div
          className={cn(
            'p-2.5 rounded-lg text-[12px] font-semibold',
            msg.startsWith('Falha') || msg.startsWith('Erro')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
          )}
        >
          {msg}
        </div>
      )}

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
          {aba('google', 'Gmail (Google)')}
        </TabsContent>
        <TabsContent value="outlook" className="mt-3">
          {aba('microsoft', 'Outlook (Microsoft 365)')}
        </TabsContent>
      </Tabs>

      {/* T0b: dialog do e-mail aberto */}
      <Dialog open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="bg-white w-full max-w-[95vw] sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-start justify-between gap-3">
              <span className="text-[15px]">{aberta?.assunto}</span>
              <button onClick={() => setAberta(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          <div className="text-[12px] text-gray-500 border-b border-gray-100 pb-2">
            De: <strong>{aberta?.de}</strong> ·{' '}
            {aberta ? String(aberta.recebido_em).slice(0, 16).replace('T', ' ') : ''}
          </div>
          <p className="text-[13px] text-gray-800 whitespace-pre-wrap leading-relaxed">
            {aberta?.preview}
          </p>
          <p className="text-[11px] text-gray-400">
            Anexos e corpo completo dependem do provedor (preview = trecho sincronizado).
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
