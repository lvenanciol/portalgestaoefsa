import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Mail,
  Plus,
  Loader2,
  Send,
  FileText,
  RefreshCw,
  Inbox,
  Paperclip,
  Reply,
  Share2,
  Trash2,
  FilePlus2,
  ArrowUpDown,
  ChevronDown,
  Plug,
} from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { fmtDataBRT } from '@/lib/brt'
import { cn } from '@/lib/utils'
// TAREFA MAIL b + T0 (21/10) — E-mails: abas Gmail / Outlook com
// "Sincronizar caixa" POR ABA, lista sincronizada por provedor, clique abre
// DETALHE (corpo completo + anexos via /backend/v1/email/oauth/detalhe) e
// compositor com assinatura da conta conectada (T0c).
// Lote 22/10 (tarde): T0c altura MEMORIZADA · T0g conteúdo na CAIXA INFERIOR ·
// T0h/k ordenação Outlook · T0i Conectar sempre · T0j ENTRADA default.
// Rodada 3 (22/10): T0-l1 caixa "ENVIADOS PELO PORTAL" REMOVIDA · T0-l2 botões
// duplicados abaixo da caixa REMOVIDOS (só os de cima da caixa).

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
  cids_inline?: { cid: string; dataUrl: string }[]
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
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [oauth, setOauth] = useState<Record<string, { conectado: boolean; conta?: string }>>({
    google: { conectado: false },
    microsoft: { conectado: false },
  })
  const [inbox, setInbox] = useState<InboxMsg[]>([])
  const [syncando, setSyncando] = useState('')
  const [msg, setMsg] = useState('')
  // detalhe do e-mail (T0b) — T0g: abre NA CAIXA INFERIOR (não dialog)
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const [detalheId, setDetalheId] = useState('')
  const [detalheCarregando, setDetalheCarregando] = useState(false)
  // compositor
  const [dialog, setDialog] = useState(false)
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [modeloSel, setModeloSel] = useState('livro')
  const [para, setPara] = useState('')
  const [assunto, setAssunto] = useState('')
  const [corpo, setCorpo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [assinaturaUrl, setAssinaturaUrl] = useState('')
  // T0f+T0j (22/10): pasta por aba — 'entrada' (default), enviados, excluídos, rascunhos
  const [pastaPorAba, setPastaPorAba] = useState<Record<string, string>>({
    google: 'entrada',
    microsoft: 'entrada',
  })
  // T0h/T0k (22/10): ordenação estilo Outlook — campo + direção
  const [ordemCampo, setOrdemCampo] = useState<'data' | 'de' | 'assunto'>('data')
  const [ordemDesc, setOrdemDesc] = useState(true)
  // T0c (22/10): altura da caixa redimensionável — MEMORIZADA
  const [alturaCaixa, setAlturaCaixa] = useState(() => {
    try {
      const v = Number(localStorage.getItem('pge_emails_altura_caixa'))
      return v >= 160 && v <= 900 ? v : 420
    } catch (_e) {
      return 420
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('pge_emails_altura_caixa', String(alturaCaixa))
    } catch (_e) {
      /* storage indisponível — segue sem memorizar */
    }
  }, [alturaCaixa])

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
    ;(async () => {
      setLoading(true)
      await Promise.all([carregarOauth(), carregarInbox()])
      try {
        const r = (await pb.send('/backend/v1/emails/modelos', { method: 'GET' })) as any
        setModelos(r.modelos || [])
      } catch (_) {
        setModelos([])
      }
      setLoading(false)
    })()
  }, [])

  // T0i (22/10): conectar conta igual à tela Integrações → E-mail (OAuth redirect)
  const conectar = async (provedor: string) => {
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
    }
  }

  const sincronizar = async (provedor: string, pastaForcar?: string) => {
    setSyncando(provedor)
    setMsg('')
    try {
      const pastaSel = pastaForcar || pastaPorAba[provedor] || 'caixa'
      // T0j: 'entrada' é o rótulo da UI — o sync continua usando 'caixa'
      const pastaSync = pastaSel === 'entrada' ? 'caixa' : pastaSel
      const r = (await pb.send('/backend/v1/email/oauth/sync', {
        method: 'POST',
        body: JSON.stringify({ provedor, pasta: pastaSync }),
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
    // T0g: conteúdo abre na caixa inferior (abaixo da lista) — sem dialog
    setDetalheId(m.id)
    setDetalhe(null)
    setDetalheCarregando(true)
    try {
      const r = (await pb.send('/backend/v1/email/oauth/detalhe?id=' + encodeURIComponent(m.id), {
        method: 'GET',
      })) as any
      setDetalhe(r)
    } catch (e: any) {
      const det =
        e?.response?.data?.erro ||
        e?.response?.data?.message ||
        (String(e?.message || e).includes('502')
          ? 'Este e-mail não está mais na caixa sincronizada (movido/excluído). Sincronize a caixa e abra novamente.'
          : e?.message || String(e))
      setDetalhe({ ok: false, erro: det })
    } finally {
      setDetalheCarregando(false)
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
      let oauthProvider = ''
      try {
        const st = (await pb.send('/backend/v1/email/oauth/status', { method: 'GET' })) as any
        if (st.google?.conectado) oauthProvider = 'google'
        else if (st.microsoft?.conectado) oauthProvider = 'microsoft'
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
    } catch (e: any) {
      setMsg('Falha: ' + (e?.response?.data?.erro || e?.message || String(e)))
    } finally {
      setEnviando(false)
      setTimeout(() => setMsg(''), 6000)
    }
  }

  // T0e v10 (22/10): substitui cid:<id> do HTML pelas imagens inline que o
  // hook devolveu em cids_inline (dataUrl pronto) — rápido no browser
  const resolverCids = (d: Detalhe): string => {
    let html = d.corpo_html || ''
    for (const ci of d.cids_inline || []) {
      if (!ci?.cid || !ci?.dataUrl) continue
      const prefixo = ci.cid.split('@')[0].toLowerCase()
      const re = new RegExp('src=(["\'])cid:' + prefixo + '[^"\']*\\1', 'gi')
      html = html.replace(re, 'src="' + ci.dataUrl + '"')
    }
    return html
  }

  const TITULO_PASTA: Record<string, string> = {
    entrada: 'Entrada — caixa de entrada',
    caixa: 'Entrada — caixa de entrada',
    sent: 'E-mails enviados',
    trash: 'Excluídos',
    drafts: 'Rascunhos',
  }
  const ICONE_PASTA: Record<string, any> = {
    entrada: <Inbox className="h-3.5 w-3.5" />,
    caixa: <Inbox className="h-3.5 w-3.5" />,
    sent: <Send className="h-3.5 w-3.5" />,
    trash: <Trash2 className="h-3.5 w-3.5" />,
    drafts: <FilePlus2 className="h-3.5 w-3.5" />,
  }
  // T0c (22/10): drag no rodapé da caixa (resize manual, memorizado)
  const dragRef = { atual: false }
  const iniciarDrag = (ev: ReactMouseEvent) => {
    ev.preventDefault()
    dragRef.atual = true
    const yInicial = ev.clientY
    const hInicial = alturaCaixa
    const mover = (mv: MouseEvent) => {
      if (!dragRef.atual) return
      const delta = mv.clientY - yInicial
      setAlturaCaixa(Math.max(160, Math.min(900, hInicial + delta)))
    }
    const soltar = () => {
      dragRef.atual = false
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
    }
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
  }
  const abaCaixa = (prov: 'google' | 'microsoft', nome: string) => {
    const st = oauth[prov] || { conectado: false }
    const pastaSel = pastaPorAba[prov] || 'entrada'
    const val = (m: InboxMsg, campo: string) => {
      if (campo === 'data') return new Date(m.recebido_em).getTime() || 0
      if (campo === 'de') return String(m.de || '').toLowerCase()
      return String(m.assunto || '').toLowerCase()
    }
    const lista = inbox
      .filter((m) => {
        const p = (m as any).pasta || 'caixa'
        if (pastaSel === 'entrada') return m.provedor === prov && (p === 'entrada' || p === 'caixa')
        return m.provedor === prov && p === pastaSel
      })
      .sort((a, b) => {
        const va = val(a, ordemCampo)
        const vb = val(b, ordemCampo)
        if (va === vb) return 0
        const cmp = va > vb ? 1 : -1
        return ordemDesc ? -cmp : cmp
      })
    return (
      <div className="space-y-3">
        {/* T0d (22/10): botões ACIMA da caixa, alinhados à ESQUERDA — ÚNICOS
            (T0-l2: os duplicados abaixo da caixa foram REMOVIDOS) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* T0i (22/10): conectar conta SEMPRE visível — quando conectado vira "Reconectar" */}
          <Button variant="outline" className="h-9" onClick={() => conectar(prov)}>
            <Plug className="h-4 w-4 mr-1" />{' '}
            {st.conectado ? 'Reconectar ' + nome : 'Conectar ' + nome}
          </Button>
          {/* T0g (22/10): "Novo e-mail" = dropdown (ENTRADA default + enviados/excluídos/rascunhos) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white">
                <Plus className="h-4 w-4 mr-1" /> Novo e-mail
                <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {/* T0j: ENTRADA é a opção DEFAULT da tela */}
              <DropdownMenuItem
                onClick={() => {
                  setPastaPorAba((p) => ({ ...p, [prov]: 'entrada' }))
                  sincronizar(prov, 'caixa')
                }}
              >
                <Inbox className="h-4 w-4 mr-2" /> Entrada (caixa de entrada)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setPastaPorAba((p) => ({ ...p, [prov]: 'sent' }))
                  sincronizar(prov, 'sent')
                }}
              >
                <Send className="h-4 w-4 mr-2" /> E-mails enviados
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setPastaPorAba((p) => ({ ...p, [prov]: 'trash' }))
                  sincronizar(prov, 'trash')
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Excluídos
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setPastaPorAba((p) => ({ ...p, [prov]: 'drafts' }))
                  sincronizar(prov, 'drafts')
                }}
              >
                <FilePlus2 className="h-4 w-4 mr-2" /> Rascunhos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
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
          {/* T0k: texto "N e-mail(s) nesta pasta" REMOVIDO — contagem no título da caixa */}
          {!st.conectado && (
            <div className="text-[12px] text-gray-600 ml-1">
              <strong>{nome}</strong> desconectado — conecte na tela{' '}
              <a href="/integracoes/email" className="text-[#1B5E20] font-semibold hover:underline">
                E-mail (Integrações)
              </a>
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
            {ICONE_PASTA[pastaSel] || <Inbox className="h-3.5 w-3.5" />}{' '}
            {TITULO_PASTA[pastaSel] || 'Caixa sincronizada'} ({lista.length})
            {/* T0h/T0k (22/10): MENU de ordenação estilo Outlook */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-gray-600 focus:outline-none"
                  title="Ordenar e-mails"
                >
                  <ArrowUpDown className="h-3 w-3" />
                  {ordemCampo === 'data' ? 'Data' : ordemCampo === 'de' ? 'De' : 'Assunto'}
                  <ChevronDown className="h-2.5 w-2.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-[12px]">
                <DropdownMenuItem
                  onClick={() => {
                    setOrdemCampo('data')
                    setOrdemDesc(true)
                  }}
                >
                  Data (recentes no topo) {ordemCampo === 'data' && ordemDesc ? '✓' : ''}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setOrdemCampo('data')
                    setOrdemDesc(false)
                  }}
                >
                  Data (antigos no topo) {ordemCampo === 'data' && !ordemDesc ? '✓' : ''}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setOrdemCampo('de')
                    setOrdemDesc(false)
                  }}
                >
                  De (A on Top) {ordemCampo === 'de' && !ordemDesc ? '✓' : ''}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setOrdemCampo('de')
                    setOrdemDesc(true)
                  }}
                >
                  De (Z on Top) {ordemCampo === 'de' && ordemDesc ? '✓' : ''}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setOrdemCampo('assunto')
                    setOrdemDesc(false)
                  }}
                >
                  Assunto (A on Top) {ordemCampo === 'assunto' && !ordemDesc ? '✓' : ''}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setOrdemCampo('assunto')
                    setOrdemDesc(true)
                  }}
                >
                  Assunto (Z on Top) {ordemCampo === 'assunto' && ordemDesc ? '✓' : ''}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {/* T0c (22/10): caixa REDIMENSIONÁVEL (drag no rodapé + resize-y, memorizada) */}
          <div
            className="divide-y divide-gray-50 overflow-y-auto resize-y"
            style={{ height: alturaCaixa, minHeight: 160, maxHeight: 900 }}
          >
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
                  ? pastaSel === 'entrada' || pastaSel === 'caixa'
                    ? 'Nenhum e-mail sincronizado — clique em "Sincronizar caixa".'
                    : 'Nenhum e-mail nesta pasta — clique em "Sincronizar caixa".'
                  : 'Conta não conectada.'}
              </p>
            )}
          </div>
          {/* rodapé do drag (T0c) */}
          <div
            onMouseDown={iniciarDrag}
            className="h-2.5 cursor-ns-resize bg-gray-50 hover:bg-[#1B5E20]/20 border-t border-gray-100 flex items-center justify-center"
            title="Arraste para redimensionar"
          >
            <div className="w-10 h-0.5 rounded-full bg-gray-300" />
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

      {/* T0g (22/10): conteúdo do e-mail aberto — CAIXA INFERIOR com título
          dinâmico conforme o e-mail/pasta selecionada */}
      {detalheId && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-[#1B5E20]" />{' '}
            {detalheCarregando
              ? 'Carregando e-mail…'
              : detalhe?.ok
                ? detalhe.assunto || '(sem assunto)'
                : detalhe?.erro
                  ? 'Não foi possível abrir o e-mail'
                  : 'Carregando…'}
            <button
              type="button"
              onClick={() => {
                setDetalheId('')
                setDetalhe(null)
              }}
              className="ml-auto text-gray-400 hover:text-gray-600 focus:outline-none"
              title="Fechar"
            >
              ✕
            </button>
          </div>
          {detalheCarregando && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[#1B5E20]" />
            </div>
          )}
          {detalhe && !detalhe.ok && (
            <div className="p-3 m-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
              {detalhe.erro || 'Falha ao carregar o e-mail.'}
            </div>
          )}
          {detalhe && detalhe.ok && (
            <div className="p-4 space-y-3">
              <div className="text-[12px] text-gray-500 border-b border-gray-100 pb-2 flex items-center justify-between gap-2">
                <span>
                  De: <strong>{detalhe.de}</strong> · {fmtDataBRT(detalhe.data)}
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => {
                      const extra = String(detalhe.corpo_texto || '').slice(0, 2000)
                      setPara(
                        String(detalhe.de || '')
                          .replace(/^[^<]*<|>.*$/g, '')
                          .trim() ||
                          detalhe.de ||
                          '',
                      )
                      setAssunto('Re: ' + (detalhe.assunto || ''))
                      setCorpo(
                        '\n\n---------- Mensagem original ----------\nDe: ' +
                          detalhe.de +
                          '\nData: ' +
                          fmtDataBRT(detalhe.data) +
                          '\n\n' +
                          extra,
                      )
                      setDetalheId('')
                      setDialog(true)
                    }}
                  >
                    <Reply className="h-3 w-3 mr-1" /> Responder
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => {
                      const extra = String(detalhe.corpo_texto || '').slice(0, 2000)
                      setPara('')
                      setAssunto('Enc: ' + (detalhe.assunto || ''))
                      setCorpo(
                        '\n\n---------- Mensagem encaminhada ----------\nDe: ' +
                          detalhe.de +
                          '\nData: ' +
                          fmtDataBRT(detalhe.data) +
                          '\n\n' +
                          extra,
                      )
                      setDetalheId('')
                      setDialog(true)
                    }}
                  >
                    <Share2 className="h-3 w-3 mr-1" /> Encaminhar
                  </Button>
                </span>
              </div>
              {detalhe.corpo_html ? (
                <iframe
                  title="corpo"
                  sandbox=""
                  className="w-full h-[420px] border border-gray-100 rounded-lg bg-white"
                  srcDoc={resolverCids(detalhe)}
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
            </div>
          )}
        </div>
      )}

      {/* Dialog compositor */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="bg-white w-full max-w-[95vw] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-[#1B5E20]" /> Novo e-mail
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
