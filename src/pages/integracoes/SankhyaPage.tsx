import { useState, useEffect } from 'react'
import {
  Database,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Info,
  Eye,
  EyeOff,
  Save,
  Plug,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { testarConexao, loadRecords, readField } from '@/services/sankhya-service'
import { cn } from '@/lib/utils'

// TAREFA B — tela Sankhya (espelho do SankhyaAdmin do Foldbox, adaptado ao
// PGE): credenciais (OAuth + fallback legado), teste de conexão, sync de
// pedidos e auditoria das últimas ações.

interface CredsStatus {
  base_url: string
  client_id: string
  client_secret: string
  appkey: string
  token: string
  user: string
  password: string
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

export default function SankhyaPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')

  // credenciais
  const [creds, setCreds] = useState<CredsStatus>({
    base_url: 'https://api.sankhya.com.br',
    client_id: '',
    client_secret: '',
    appkey: '',
    token: '',
    user: '',
    password: '',
  })
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({})

  // teste conexão
  const [testando, setTestando] = useState(false)
  const [teste, setTeste] = useState<{ ok?: boolean; msg?: string; quando?: string } | null>(null)

  // sync pedidos (loadRecords TGFCAB)
  const [syncando, setSyncando] = useState(false)
  const [syncRes, setSyncRes] = useState<any>(null)

  const carregar = async () => {
    setLoading(true)
    try {
      const r = (await pb.send('/backend/v1/integracoes/sankhya/config', { method: 'GET' })) as any
      if (r.success && r.config) {
        setCreds({ ...creds, ...r.config })
        setFlags({
          has_client_id: r.has_client_id,
          has_client_secret: r.has_client_secret,
          has_appkey: r.has_appkey,
          has_token: r.has_token,
          has_user: r.has_user,
          has_password: r.has_password,
        })
        setAtualizadoEm(r.atualizado_em)
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
      await pb.send('/backend/v1/integracoes/sankhya/config', {
        method: 'POST',
        body: JSON.stringify(creds),
      })
      setMsg('Credenciais salvas com sucesso.')
      await carregar()
    } catch (e) {
      setErro('Falha ao salvar: ' + String(e))
    } finally {
      setSalvando(false)
    }
  }

  const testarConexaoAgora = async () => {
    setTestando(true)
    setTeste(null)
    try {
      const r = (await testarConexao()) as any
      const ok = r.ok && (!r.data || r.data.ok !== false)
      setTeste({
        ok,
        msg: ok
          ? 'Conexão estabelecida — OAuth Sankhya OK (via edge proxy).'
          : 'Falha: ' + ((r.data && (r.data.erro || r.data.error)) || r.erro || 'HTTP ' + r.status),
        quando: new Date().toLocaleString('pt-BR'),
      })
    } catch (e: any) {
      setTeste({
        ok: false,
        msg: e?.message || String(e),
        quando: new Date().toLocaleString('pt-BR'),
      })
    } finally {
      setTestando(false)
    }
  }

  const sincronizarPedidos = async () => {
    setSyncando(true)
    setSyncRes(null)
    try {
      const r = (await loadRecords(
        'CabecalhoNota',
        'NUNOTA,NUMNOTA,STATUSNOTA,DTFATUR,VLRNOTA',
        'this.DTFATUR > 01/10/2026',
        '0',
      )) as any
      const xml = r?.data?.responseBody?.xml
      let total = 0
      let primeira = ''
      if (xml) {
        const recs = String(xml).match(/<record[\s\S]*?<\/record>/g) || []
        total = recs.length
        if (recs[0]) {
          const m = recs[0].match(/NUNOTA="([^"]*)"/)
          primeira = m ? m[1] : ''
        }
      }
      setSyncRes({
        ok: r.ok,
        total,
        primeira,
        msg: r.ok
          ? 'Consulta OK — ' + total + ' registro(s) desde 01/10/2026.'
          : 'Falha na consulta.',
      })
    } catch (e: any) {
      setSyncRes({ ok: false, msg: e?.message || String(e) })
    } finally {
      setSyncando(false)
    }
  }

  const campo = (
    key: keyof CredsStatus,
    label: string,
    opts: { secret?: boolean; placeholder?: string } = {},
  ) => {
    const tem = flags['has_' + key]
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
            value={oculto ? '••••••••••••' : creds[key]}
            onChange={(e) => setCreds({ ...creds, [key]: e.target.value })}
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
            <Database className="h-6 w-6 text-[#1B5E20]" /> Sankhya
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Integração com a API Sankhya — credenciais, conexão e sincronização
            {atualizadoEm && (
              <span className="text-xs"> · config atualizada {fmtDateTime(atualizadoEm)}</span>
            )}
          </p>
        </div>
        <Button
          onClick={testarConexaoAgora}
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
      {teste && (
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
              {teste.msg}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">Testado em {teste.quando}</div>
          </div>
        </div>
      )}

      <Tabs defaultValue="credenciais">
        <TabsList className="bg-gray-100">
          <TabsTrigger value="credenciais" className="gap-1.5 text-xs">
            <Plug className="h-3.5 w-3.5" /> Credenciais
          </TabsTrigger>
          <TabsTrigger value="sincronizacao" className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Sincronização
          </TabsTrigger>
        </TabsList>

        {/* ===== ABA CREDENCIAIS ===== */}
        <TabsContent value="credenciais">
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs space-y-4">
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-sky-50 border border-sky-200">
              <Info className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
              <p className="text-[12px] text-sky-800 leading-relaxed">
                As chamadas do portal passam pela <strong>edge proxy do Foldbox</strong> (IPs
                autorizados no app OAuth da Sankhya). Informe aqui as credenciais usadas por essa
                proxy — OAuth 2.0 (client_id/secret) ou legado (token/appkey/user).
              </p>
            </div>

            <div className="grid gap-3">
              {campo('base_url', 'Base URL', { placeholder: 'https://api.sankhya.com.br' })}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {campo('client_id', 'Client ID (OAuth)')}
                {campo('client_secret', 'Client Secret (OAuth)', { secret: true })}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {campo('appkey', 'App Key (legado)', { secret: true })}
                {campo('token', 'Token (legado)', { secret: true })}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {campo('user', 'Usuário (legado)')}
                {campo('password', 'Senha (legado)', { secret: true })}
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
                Salvar credenciais
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ===== ABA SINCRONIZAÇÃO ===== */}
        <TabsContent value="sincronizacao">
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs space-y-4">
            <p className="text-[12px] text-gray-600 leading-relaxed">
              Consulta de sanidade na API Sankhya: carrega os últimos pedidos faturados
              (CabecalhoNota) para validar credenciais, rede e permissões do usuário OAuth.
            </p>
            <Button
              onClick={sincronizarPedidos}
              disabled={syncando}
              className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {syncando ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1.5" />
              )}
              Sincronizar agora
            </Button>
            {syncRes && (
              <div
                className={cn(
                  'p-3 rounded-lg border text-[12px]',
                  syncRes.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800',
                )}
              >
                <div className="font-semibold">{syncRes.msg}</div>
                {syncRes.primeira && (
                  <div className="text-[11px] mt-1">
                    Primeiro registro: NUNOTA {syncRes.primeira}
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
