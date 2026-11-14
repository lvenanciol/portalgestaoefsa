import { useEffect, useState } from 'react'
import {
  Footprints,
  Loader2,
  Save,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Info,
  KeyRound,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

// ============================================================================
// GARMIN CONNECT — PERSONAL API (15/11/2026)
//
// CORREÇÃO IMPORTANTE: a Personal API NÃO entrega client_id nem client_secret.
// A única credencial é a **Personal API Key**, que o servidor troca por um
// access token no endpoint:
//
//   POST https://personal.connectapi.garmin.com/personalapitoken-service/
//        personal-api/personal-api-key/token      (header: ApiKey <chave>)
//
// Os campos antigos (Client ID / Secret / Redirect / Escopos / Consumer Key)
// foram REMOVIDOS desta tela — não existem nesse fluxo e confundiam.
// ============================================================================

interface ConfigGarmin {
  modo: string
  ativo: boolean
  tem_api_key: boolean
  api_key_mascarada: string
  token_validade: string
  tem_token: boolean
  ultimo_teste: any
  ultimo_sync: string
}

const vazio: ConfigGarmin = {
  modo: 'personal',
  ativo: false,
  tem_api_key: false,
  api_key_mascarada: '',
  token_validade: '',
  tem_token: false,
  ultimo_teste: null,
  ultimo_sync: '',
}

export function GarminConfigSection() {
  const [cfg, setCfg] = useState<ConfigGarmin>(vazio)
  const [status, setStatus] = useState<any>(null)
  const [apiKey, setApiKey] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [obtendoToken, setObtendoToken] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    setCarregando(true)
    try {
      const r: any = await pb.send('/backend/v1/garmin/personal/config', { method: 'GET' })
      setCfg({ ...vazio, ...(r.config || {}) })
      setErro('')
    } catch (e: any) {
      setErro(e?.message || String(e))
    } finally {
      setCarregando(false)
    }
  }

  const carregarStatus = async () => {
    try {
      const r: any = await pb.send('/backend/v1/garmin/personal/status', { method: 'GET' })
      setStatus(r.status || null)
    } catch (_) {
      setStatus(null)
    }
  }

  useEffect(() => {
    carregar().then(carregarStatus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Salva a API key (grava no servidor, nunca volta). */
  const salvarApiKey = async () => {
    const k = apiKey.trim()
    if (!k) {
      toast({ title: 'Cole a API key', variant: 'destructive' })
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const r: any = await pb.send('/backend/v1/garmin/personal/config', {
        method: 'POST',
        body: JSON.stringify({ api_key: k, ativo: true }),
      })
      if (r?.success === false) {
        throw new Error(r.erro || 'O servidor recusou a chave.')
      }
      toast({ title: 'API key salva', description: 'Agora clique em "Obter token".' })
      setApiKey('')
      await carregar()
    } catch (e: any) {
      const detalhe =
        e?.response?.data?.erro || e?.response?.data?.message || e?.message || String(e)
      setErro('Falha ao salvar: ' + detalhe)
      toast({ title: 'Falha ao salvar', description: detalhe, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  /** Troca a API key por um token no servidor. */
  const obterToken = async () => {
    setObtendoToken(true)
    setErro('')
    try {
      const r: any = await pb.send('/backend/v1/garmin/personal/token', {
        method: 'POST',
        body: '{}',
      })
      if (r?.success) {
        toast({
          title: 'Token obtido',
          description: r.validade
            ? 'Válido até ' + String(r.validade).slice(0, 16).replace('T', ' ')
            : 'Conexão com o Garmin estabelecida.',
        })
      } else {
        const msg = r?.erro || 'O Garmin não autorizou a chave.'
        setErro(msg + (r?.corpo ? ' · resposta: ' + String(r.corpo).slice(0, 200) : ''))
        toast({ title: 'O Garmin não autorizou', description: msg, variant: 'destructive' })
      }
      await carregar()
      await carregarStatus()
    } catch (e: any) {
      const detalhe =
        e?.response?.data?.erro || e?.response?.data?.message || e?.message || String(e)
      setErro('Falha ao obter token: ' + detalhe)
      toast({ title: 'Falha ao obter token', description: detalhe, variant: 'destructive' })
    } finally {
      setObtendoToken(false)
    }
  }

  const testar = async () => {
    await carregarStatus()
    const ok = status?.conexao_ok
    toast({
      title: ok ? 'Conexão validada' : 'Conexão não estabelecida',
      description: status?.detalhe || status?.erro || '—',
      variant: ok ? 'default' : 'destructive',
    })
  }

  const ativar = async (v: boolean) => {
    setCfg({ ...cfg, ativo: v })
    try {
      await pb.send('/backend/v1/garmin/personal/config', {
        method: 'POST',
        body: JSON.stringify({ api_key: cfg.tem_api_key ? '__manter__' : undefined, ativo: v }),
      })
    } catch (_) {
      // silencioso: o toggle é secundário
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-[#1B5E20]" />
      </div>
    )
  }

  const pronto = status?.conexao_ok
  const validade = cfg.token_validade
    ? String(cfg.token_validade).slice(0, 16).replace('T', ' ')
    : ''

  return (
    <section className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Footprints className="h-4 w-4 text-[#1B5E20]" />
          <div>
            <h2 className="text-sm font-bold text-gray-900">Garmin Connect</h2>
            <p className="text-[11px] text-gray-500">Personal API — API key → token de acesso</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] font-bold shrink-0',
            pronto
              ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
              : cfg.tem_api_key
                ? 'border-amber-300 text-amber-700 bg-amber-50'
                : 'border-gray-300 text-gray-600 bg-gray-50',
          )}
        >
          {pronto ? 'Conectado' : cfg.tem_api_key ? 'Chave salva' : 'Não configurado'}
        </Badge>
      </div>

      {erro && (
        <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[11.5px] text-red-700 flex items-start gap-1.5">
          <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="break-words">{erro}</span>
        </div>
      )}

      {/* como conectar */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
        <p className="text-[11px] font-bold text-sky-900 flex items-center gap-1.5 mb-1">
          <Info className="h-3.5 w-3.5" /> Como conectar
        </p>
        <ol className="text-[11px] text-sky-900 leading-relaxed list-decimal pl-4 space-y-0.5">
          <li>
            Gere a Personal API Key no{' '}
            <a
              href="https://developer.garmin.com/gc-developer-program/"
              target="_blank"
              rel="noreferrer"
              className="underline font-semibold inline-flex items-center gap-0.5"
            >
              Garmin Connect Developer Program
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </li>
          <li>
            Cole a chave abaixo e clique em <strong>Salvar API key</strong>.
          </li>
          <li>
            Clique em <strong>Obter token</strong> — o servidor troca a chave por um token e testa a
            conexão.
          </li>
        </ol>
        <p className="text-[10.5px] text-sky-800 mt-1.5 leading-snug">
          A Personal API autentica <strong>só pela API key</strong> — não há client_id nem secret. A
          chave fica no servidor e nunca volta ao navegador.
        </p>
      </div>

      {/* API key */}
      <div className="space-y-1.5 p-3 rounded-lg border border-emerald-200 bg-emerald-50/40">
        <Label className="text-[11px] font-bold text-gray-800 flex items-center gap-1.5">
          <KeyRound className="h-3 w-3" />
          Personal API Key
          {cfg.tem_api_key && (
            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 rounded px-1">
              salva{cfg.api_key_mascarada ? ' · ' + cfg.api_key_mascarada : ''}
            </span>
          )}
        </Label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            cfg.tem_api_key
              ? 'Cole uma nova chave para substituir'
              : 'Cole a API key gerada no portal'
          }
          className="h-9 text-[12px] font-mono"
        />
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <Button
            size="sm"
            onClick={salvarApiKey}
            disabled={salvando || !apiKey.trim()}
            className="h-8 text-[11.5px] bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
          >
            {salvando ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            Salvar API key
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={obterToken}
            disabled={obtendoToken || !cfg.tem_api_key}
            className="h-8 text-[11.5px]"
          >
            {obtendoToken ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <KeyRound className="h-3 w-3 mr-1" />
            )}
            Obter token
          </Button>
          <Button variant="outline" size="sm" onClick={testar} className="h-8 text-[11.5px]">
            <RefreshCw className="h-3 w-3 mr-1" /> Testar conexão
          </Button>
        </div>
      </div>

      {/* estado */}
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
        <p className="text-[10.5px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">
          Estado da integração
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-500">API key</span>
            <span
              className={cn(
                'font-semibold',
                cfg.tem_api_key ? 'text-emerald-700' : 'text-gray-400',
              )}
            >
              {cfg.tem_api_key ? 'configurada' : 'ausente'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-500">Token de acesso</span>
            <span
              className={cn(
                'font-semibold',
                cfg.tem_token || status?.tem_token ? 'text-emerald-700' : 'text-gray-400',
              )}
            >
              {cfg.tem_token || status?.tem_token
                ? 'obtido' + (validade ? ' até ' + validade : '')
                : 'não obtido'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-500">Activity API</span>
            <span
              className={cn(
                'font-semibold',
                status?.recursos?.activities ? 'text-emerald-700' : 'text-gray-400',
              )}
            >
              {status?.recursos?.activities ? 'disponível' : 'não validada'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-500">Training API</span>
            <span
              className={cn(
                'font-semibold',
                status?.recursos?.workouts ? 'text-emerald-700' : 'text-gray-400',
              )}
            >
              {status?.recursos?.workouts ? 'disponível' : 'não validada'}
            </span>
          </div>
        </div>
        {status?.detalhe && (
          <p className="text-[10.5px] text-gray-600 mt-2 leading-snug">{status.detalhe}</p>
        )}
      </div>

      {/* último teste */}
      {cfg.ultimo_teste?.detalhe && (
        <div
          className={cn(
            'rounded-lg p-2.5 border text-[11px] flex items-start gap-2',
            cfg.ultimo_teste.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900',
          )}
        >
          {cfg.ultimo_teste.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className="font-semibold">Último teste</p>
            <p className="break-words">{cfg.ultimo_teste.detalhe}</p>
            {cfg.ultimo_teste.quando && (
              <span className="block text-[10px] opacity-70 mt-0.5">
                {String(cfg.ultimo_teste.quando).slice(0, 16).replace('T', ' ')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* toggle */}
      <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-gray-800">Integração ativa</p>
          <p className="text-[10.5px] text-gray-500">
            Permite usar a API do Garmin para atividades e treinos.
          </p>
        </div>
        <Switch checked={cfg.ativo} onCheckedChange={ativar} />
      </div>
    </section>
  )
}

export default GarminConfigSection
