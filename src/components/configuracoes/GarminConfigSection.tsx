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
  Eye,
  EyeOff,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

// ============================================================================
// GARMIN CONNECT — CONFIGURAÇÃO (15/11/2026)
//
// Onde os parâmetros vivem: integracoes_config, registro integracao='garmin'.
// Os segredos nunca voltam ao navegador — o GET devolve só `tem_client_secret`.
//
// HONESTIDADE DA TELA: enquanto não houver aprovação no Garmin Connect
// Developer Program + credenciais, o bloco de estado mostra exatamente o que
// falta. Nenhum "conectado" falso.
// ============================================================================

interface ConfigGarmin {
  ativo: boolean
  ambiente: string
  client_id: string
  tem_client_secret: boolean
  redirect_uri: string
  escopos: string
  aprovado_programa: boolean
  data_aprovacao: string
  consumer_key: string
  tem_consumer_secret: boolean
  ultimo_sync: string
  last_test_result: any
}

const vazio: ConfigGarmin = {
  ativo: false,
  ambiente: 'producao',
  client_id: '',
  tem_client_secret: false,
  redirect_uri: '',
  escopos: 'activity,training',
  aprovado_programa: false,
  data_aprovacao: '',
  consumer_key: '',
  tem_consumer_secret: false,
  ultimo_sync: '',
  last_test_result: null,
}

export function GarminConfigSection() {
  const [cfg, setCfg] = useState<ConfigGarmin>(vazio)
  const [clientSecret, setClientSecret] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [mostrarSecret, setMostrarSecret] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [status, setStatus] = useState<any>(null)
  const [erro, setErro] = useState('')

  const carregar = async () => {
    setCarregando(true)
    try {
      const r: any = await pb.send('/backend/v1/garmin/config', { method: 'GET' })
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
      const r: any = await pb.send('/backend/v1/garmin/status', { method: 'GET' })
      setStatus(r.status || null)
    } catch (_) {
      setStatus(null)
    }
  }

  useEffect(() => {
    carregar().then(carregarStatus)
  }, [])

  const salvar = async () => {
    setSalvando(true)
    try {
      await pb.send('/backend/v1/garmin/config', {
        method: 'POST',
        body: JSON.stringify({
          ativo: cfg.ativo,
          ambiente: cfg.ambiente,
          client_id: cfg.client_id,
          client_secret: clientSecret || undefined,
          redirect_uri: cfg.redirect_uri,
          escopos: cfg.escopos,
          aprovado_programa: cfg.aprovado_programa,
          data_aprovacao: cfg.data_aprovacao,
          consumer_key: cfg.consumer_key,
          consumer_secret: consumerSecret || undefined,
        }),
      })
      toast({ title: 'Configuração Garmin salva' })
      setClientSecret('')
      setConsumerSecret('')
      await carregar()
      await carregarStatus()
    } catch (e: any) {
      toast({
        title: 'Falha ao salvar',
        description: e?.response?.data?.message || e?.message || String(e),
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const testar = async () => {
    setTestando(true)
    try {
      const r: any = await pb.send('/backend/v1/garmin/testar', { method: 'POST', body: '{}' })
      toast({
        title: r.ok ? 'Conexão validada' : 'Conexão não estabelecida',
        description: r.detalhe,
        variant: r.ok ? 'default' : 'destructive',
      })
      await carregar()
      await carregarStatus()
    } catch (e: any) {
      toast({
        title: 'Falha no teste',
        description: e?.response?.data?.message || e?.message || String(e),
        variant: 'destructive',
      })
    } finally {
      setTestando(false)
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

  return (
    <section className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Footprints className="h-4 w-4 text-[#1B5E20]" />
          <div>
            <h2 className="text-sm font-bold text-gray-900">Garmin Connect</h2>
            <p className="text-[11px] text-gray-500">
              Atividades (Activity API) e envio de treinos (Training API)
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] font-bold shrink-0',
            pronto
              ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
              : status?.aprovado_programa
                ? 'border-amber-300 text-amber-700 bg-amber-50'
                : 'border-gray-300 text-gray-600 bg-gray-50',
          )}
        >
          {pronto
            ? 'Conectado'
            : status?.aprovado_programa
              ? 'Aguardando credenciais'
              : 'Não configurado'}
        </Badge>
      </div>

      {erro && (
        <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[11.5px] text-red-700">
          {erro}
        </div>
      )}

      {/* diagnóstico honesto */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
        <p className="text-[11px] font-bold text-sky-900 flex items-center gap-1.5 mb-1">
          <Info className="h-3.5 w-3.5" /> Como habilitar
        </p>
        <ol className="text-[11px] text-sky-900 leading-relaxed list-decimal pl-4 space-y-0.5">
          <li>
            Solicite acesso no{' '}
            <a
              href="https://developer.garmin.com/gc-developer-program/"
              target="_blank"
              rel="noreferrer"
              className="underline font-semibold inline-flex items-center gap-0.5"
            >
              Garmin Connect Developer Program
              <ExternalLink className="h-2.5 w-2.5" />
            </a>{' '}
            (a Garmin aprova a conta antes de liberar as APIs).
          </li>
          <li>Depois da aprovação, crie o app no portal e copie client_id e client_secret.</li>
          <li>Cole as credenciais abaixo, marque a aprovação e ative a integração.</li>
        </ol>
        <p className="text-[10.5px] text-sky-800 mt-1.5">
          Sem esses três passos não existe chamada possível — a tela não simula conexão.
        </p>
      </div>

      {/* parâmetros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-gray-600">Ambiente</Label>
          <Select value={cfg.ambiente} onValueChange={(v) => setCfg({ ...cfg, ambiente: v })}>
            <SelectTrigger className="h-9 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white z-[120]">
              <SelectItem value="producao" className="text-[12px]">
                Produção (apis.garmin.com)
              </SelectItem>
              <SelectItem value="sandbox" className="text-[12px]">
                Sandbox
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-gray-600">Escopos</Label>
          <Input
            value={cfg.escopos}
            onChange={(e) => setCfg({ ...cfg, escopos: e.target.value })}
            placeholder="activity,training"
            className="h-9 text-[12px]"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-gray-600">Client ID</Label>
          <Input
            value={cfg.client_id}
            onChange={(e) => setCfg({ ...cfg, client_id: e.target.value })}
            placeholder="Ex.: fc1a2b3c-..."
            className="h-9 text-[12px] font-mono"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1.5">
            Client Secret
            {cfg.tem_client_secret && (
              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1">
                salvo
              </span>
            )}
          </Label>
          <div className="relative">
            <Input
              type={mostrarSecret ? 'text' : 'password'}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={
                cfg.tem_client_secret ? '•••••••• (deixe vazio p/ manter)' : 'Cole o secret'
              }
              className="h-9 text-[12px] font-mono pr-9"
            />
            <button
              type="button"
              onClick={() => setMostrarSecret((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {mostrarSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-gray-600">Redirect URI</Label>
          <Input
            value={cfg.redirect_uri}
            onChange={(e) => setCfg({ ...cfg, redirect_uri: e.target.value })}
            placeholder="https://seu-dominio/backend/v1/garmin/callback"
            className="h-9 text-[12px] font-mono"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1.5">
            Consumer Key (OAuth 1.0a)
            <span className="text-[9px] font-bold text-gray-500 bg-gray-100 rounded px-1">
              opcional
            </span>
          </Label>
          <Input
            value={cfg.consumer_key}
            onChange={(e) => setCfg({ ...cfg, consumer_key: e.target.value })}
            className="h-9 text-[12px] font-mono"
          />
        </div>
      </div>

      {/* toggles */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-gray-800">
              Aprovação no Garmin Connect Developer Program
            </p>
            <p className="text-[10.5px] text-gray-500">
              Sem esta confirmação a API não responde — é pré-requisito da Garmin.
            </p>
          </div>
          <Switch
            checked={cfg.aprovado_programa}
            onCheckedChange={(v) => setCfg({ ...cfg, aprovado_programa: v })}
          />
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-gray-800">Integração ativa</p>
            <p className="text-[10.5px] text-gray-500">
              Permite baixar atividades e enviar treinos para o Garmin.
            </p>
          </div>
          <Switch checked={cfg.ativo} onCheckedChange={(v) => setCfg({ ...cfg, ativo: v })} />
        </div>
      </div>

      {/* resultado do último teste */}
      {cfg.last_test_result?.detalhe && (
        <div
          className={cn(
            'rounded-lg p-2.5 border text-[11px] flex items-start gap-2',
            cfg.last_test_result.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900',
          )}
        >
          {cfg.last_test_result.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-semibold">Último teste</p>
            <p>
              {cfg.last_test_result.detalhe}
              {cfg.last_test_result.quando && (
                <span className="block text-[10px] opacity-70 mt-0.5">
                  {String(cfg.last_test_result.quando).slice(0, 16).replace('T', ' ')}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ações */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={salvar}
          disabled={salvando}
          className="h-9 text-[12px] bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
        >
          {salvando ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          Salvar configuração
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={testar}
          disabled={testando}
          className="h-9 text-[12px]"
        >
          {testando ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Testar conexão
        </Button>
      </div>

      {status && !status.conexao_ok && status.detalhe && (
        <p className="text-[10.5px] text-gray-500 flex items-start gap-1">
          <XCircle className="h-3 w-3 shrink-0 mt-0.5 text-gray-400" />
          {status.detalhe}
        </p>
      )}
    </section>
  )
}

export default GarminConfigSection
