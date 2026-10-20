import { useState, useEffect } from 'react'
import {
  MessageCircle,
  Loader2,
  Save,
  CheckCircle2,
  XCircle,
  Info,
  Eye,
  EyeOff,
  Plug,
  Download,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// TAREFA C — tela WhatsApp (espelho do WhatsAppSettings do Foldbox, visão
// "whatsapp", adaptado ao PGE): credenciais Meta Cloud API, teste de conexão
// real, mensagem de boas-vindas e ativação.

interface WaConfig {
  phone_number_id: string
  phone_number_display: string
  waba_id: string
  verify_token: string
  notification_phone: string
  is_active: boolean
  welcome_message: string
  access_token: string
  app_secret: string
}

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—'
  try {
    const s = String(iso).replace(' ', 'T')
    return new Date(s.endsWith('Z') ? s : s + 'Z').toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export default function WhatsAppPage() {
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [form, setForm] = useState<WaConfig>({
    phone_number_id: '',
    phone_number_display: '',
    waba_id: '',
    verify_token: '',
    notification_phone: '',
    is_active: false,
    welcome_message: '',
    access_token: '',
    app_secret: '',
  })
  const [hasToken, setHasToken] = useState(false)
  const [hasSecret, setHasSecret] = useState(false)
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({})
  const [testando, setTestando] = useState(false)
  const [teste, setTeste] = useState<{ ok?: boolean; detalhe?: string; quando?: string } | null>(
    null,
  )
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null)

  const carregar = async () => {
    setLoading(true)
    try {
      const r = (await pb.send('/backend/v1/integracoes/whatsapp/config', { method: 'GET' })) as any
      if (r.success && r.config) {
        setForm({ ...form, ...r.config })
        setHasToken(r.has_access_token)
        setHasSecret(r.has_app_secret)
        setAtualizadoEm(r.atualizado_em)
        if (r.config.last_test_result) setTeste(r.config.last_test_result)
      }
    } catch (e) {
      setErro(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const salvar = async () => {
    setSalvando(true)
    setMsg('')
    setErro('')
    try {
      await pb.send('/backend/v1/integracoes/whatsapp/config', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setMsg('Configurações salvas com sucesso.')
      await carregar()
    } catch (e) {
      setErro('Falha ao salvar: ' + String(e))
    } finally {
      setSalvando(false)
    }
  }

  const testar = async () => {
    setTestando(true)
    setTeste(null)
    try {
      const r = (await pb.send('/backend/v1/integracoes/whatsapp/testar', {
        method: 'POST',
        body: '{}',
      })) as any
      setTeste({ ok: r.ok, detalhe: r.detalhe, quando: new Date().toLocaleString('pt-BR') })
    } catch (e: any) {
      setTeste({
        ok: false,
        detalhe: e?.message || String(e),
        quando: new Date().toLocaleString('pt-BR'),
      })
    } finally {
      setTestando(false)
    }
  }

  // Importa credenciais do Foldbox (edge pge-whatsapp-export)
  const [importando, setImportando] = useState(false)
  const importarDoFoldbox = async () => {
    setImportando(true)
    setMsg('')
    setErro('')
    try {
      const r = (await pb.send('/backend/v1/integracoes/whatsapp/importar', {
        method: 'POST',
        body: '{}',
      })) as any
      if (r.ok) {
        setMsg(
          'Credenciais importadas do Foldbox com sucesso' +
            (r.phone_display ? ' — ' + r.phone_display : '') +
            '.',
        )
        await carregar()
      } else {
        setErro('Falha ao importar: ' + (r.erro || 'sem detalhe'))
      }
    } catch (e: any) {
      setErro('Erro ao importar: ' + String(e?.message || e))
    } finally {
      setImportando(false)
    }
  }

  const campo = (
    key: keyof WaConfig,
    label: string,
    opts: { secret?: boolean; placeholder?: string } = {},
  ) => {
    const tem = key === 'access_token' ? hasToken : key === 'app_secret' ? hasSecret : false
    const oculto = opts.secret && !showSecret[key]
    return (
      <div className="grid gap-1.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
          {tem && (
            <Badge
              variant="outline"
              className="ml-2 text-[9px] bg-emerald-50 text-emerald-700 border-emerald-300"
            >
              salvo
            </Badge>
          )}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            value={oculto ? '••••••••••••' : (form[key] as string)}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            placeholder={opts.placeholder || ''}
            type={oculto ? 'password' : 'text'}
            className="h-10 bg-gray-50 text-[13px]"
          />
          {opts.secret && (
            <button
              type="button"
              onClick={() => setShowSecret({ ...showSecret, [key]: !showSecret[key] })}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              {showSecret[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <MessageCircle className="h-6 w-6 text-[#1B5E20]" /> WhatsApp
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Integração com a API WhatsApp (Meta Cloud API) — credenciais, conexão e ativação
            {atualizadoEm && (
              <span className="text-xs"> · config atualizada {fmtDateTime(atualizadoEm)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={importarDoFoldbox}
            disabled={importando}
            variant="outline"
            className="h-9"
            title="Importa Phone Number ID, token e WABA ID já configurados no site Foldbox"
          >
            {importando ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1.5" />
            )}
            Importar do Foldbox
          </Button>
          <Button
            onClick={testar}
            disabled={testando}
            className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
          >
            {testando ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Plug className="h-4 w-4 mr-1.5" />
            )}
            Testar conexão
          </Button>
        </div>
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-700">
          {msg}
        </div>
      )}
      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      {/* Resultado do teste */}
      {teste?.detalhe && (
        <div
          className={cn(
            'flex items-start gap-2.5 p-3 rounded-lg border',
            teste.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200',
          )}
        >
          {teste.ok ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="text-[12px] leading-relaxed">
            <div className={cn('font-semibold', teste.ok ? 'text-emerald-800' : 'text-red-800')}>
              {teste.detalhe}
            </div>
            {teste.quando && (
              <div className="text-[11px] text-gray-500 mt-0.5">Testado em {teste.quando}</div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs space-y-4">
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-sky-50 border border-sky-200">
          <Info className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
          <p className="text-[12px] text-sky-800 leading-relaxed">
            Credenciais da <strong>Meta Cloud API</strong> (developers.facebook.com → WhatsApp → API
            Setup): Phone Number ID, WABA ID e token de acesso permanente. O teste valida o token
            contra a Graph API em tempo real.
          </p>
        </div>

        <div className="grid gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {campo('phone_number_id', 'Phone Number ID')}
            {campo('waba_id', 'WABA ID')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {campo('phone_number_display', 'Número (exibição)', {
              placeholder: '+55 27 99999-0000',
            })}
            {campo('notification_phone', 'Telefone de notificação (alertas)')}
          </div>
          {campo('access_token', 'Access Token (permanente)', { secret: true })}
          {campo('app_secret', 'App Secret', { secret: true })}
          {campo('verify_token', 'Verify Token (webhook)')}

          <div className="grid gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Mensagem de boas-vindas
            </Label>
            <Textarea
              value={form.welcome_message}
              onChange={(e) => setForm({ ...form, welcome_message: e.target.value })}
              rows={2}
              placeholder="Olá! Bem-vindo ao atendimento via WhatsApp."
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
            <div>
              <div className="text-[13px] font-semibold text-gray-800">Integração ativa</div>
              <div className="text-[11px] text-gray-500">
                Liga/desliga o uso do WhatsApp no portal (sem apagar credenciais)
              </div>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
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
            Salvar configurações
          </Button>
        </div>
      </div>
    </div>
  )
}
