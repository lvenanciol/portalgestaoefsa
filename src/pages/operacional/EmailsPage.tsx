import { useEffect, useState } from 'react'
import { Mail, Plus, Loader2, X, Send, FileText } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Fase 8 (prompt-mestre) — E-mails: compositor (para, assunto, corpo, modelo)
// + envio real via /backend/v1/emails/enviar (relay Skip, marca Extrafruti)
// + histórico dos e-mails enviados (status/erro). Modelos: aviso, cobrança,
// reunião (catálogo do hook) — clicar preenche o compositor.

interface Modelo {
  chave: string
  titulo: string
  assunto: string
  corpo: string
}

export default function EmailsPage() {
  const { user } = useAuth()
  const [regs, setRegs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  // compositor
  const [dialog, setDialog] = useState(false)
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [modeloSel, setModeloSel] = useState('livro')
  const [para, setPara] = useState('')
  const [assunto, setAssunto] = useState('')
  const [corpo, setCorpo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState('')

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

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const r = (await pb.send('/backend/v1/emails/modelos', { method: 'GET' })) as any
        setModelos(r.modelos || [])
      } catch (_) {
        setModelos([])
      }
    })()
  }, [])

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

  const filtrados = regs.filter((r) => {
    if (!busca) return true
    const t = (r.para + ' ' + r.assunto + ' ' + (r.criado_por || '')).toLowerCase()
    return t.includes(busca.toLowerCase())
  })

  const STATUS_COR: Record<string, string> = {
    enviado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    erro: 'bg-red-50 text-red-700 border-red-200',
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
            Compositor com modelos + histórico dos e-mails enviados pelo portal
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

      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por destinatário, assunto ou remetente..."
        className="h-10 bg-gray-50 max-w-md"
      />

      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
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
            {filtrados.map((r) => (
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
                  {String(r.created).slice(0, 16).replace('T', ' ')}
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  Nenhum e-mail enviado ainda pelo portal. Use "Novo e-mail" para enviar o primeiro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
            <p className="text-[11px] text-gray-400">
              Enviado pelo relay do portal com a marca "Portal de Gestão Executivo — Extrafruti".
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
