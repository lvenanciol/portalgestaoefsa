import { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CircleDashed,
  ShoppingBag,
  Database,
  MessageCircle,
  Mail,
  Sparkles,
  ChartColumnBig,
  Clock,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

// TAREFA A — Status Integrações (espelho do StatusIntegracoesAdmin do Foldbox,
// adaptado ao PGE): cards por integração com StateBadge ok/warn/error/off.

interface TokenLogEntry {
  created_at: string
  action: string
  detalhe?: string
}

interface IntegracoesStatus {
  gerado_em: string
  integracoes: {
    sankhya?: {
      ok?: boolean
      configurado?: boolean
      credenciais_cofre?: boolean
      erro?: string
      ultimas_acoes?: { created_at: string; action: string; user_email: string | null }[]
    }
    email?: {
      ok?: boolean
      relay?: string
      erro?: string
      oauth?: Record<string, { conectado?: boolean; conta?: string }>
    }
    gemini?: { ok?: boolean; model?: string; erro?: string }
    powerbi?: { ok?: boolean; detalhe?: string; erro?: string }
    whatsapp?: {
      ativo?: boolean
      phone_display?: string
      credenciais_ok?: boolean
      meta_ok?: boolean
      meta_erro?: string
      quality?: string
      webhook_verify?: string
      ultima_mensagem?: { ok?: boolean; detalhe?: string; quando?: string } | null
      erro?: string
    }
  }
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

function StateBadge({ state }: { state: 'ok' | 'warn' | 'error' | 'off' | 'unknown' }) {
  const map = {
    ok: {
      label: 'OK',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-300',
      icon: CheckCircle2,
    },
    warn: {
      label: 'Atenção',
      cls: 'bg-amber-50 text-amber-700 border-amber-300',
      icon: AlertTriangle,
    },
    error: { label: 'Falha', cls: 'bg-red-50 text-red-700 border-red-300', icon: XCircle },
    off: {
      label: 'Não configurado',
      cls: 'bg-gray-50 text-gray-500 border-gray-200',
      icon: CircleDashed,
    },
    unknown: { label: '—', cls: 'bg-gray-50 text-gray-400 border-gray-200', icon: CircleDashed },
  }
  const m = map[state]
  const Icon = m.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border',
        m.cls,
      )}
    >
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  )
}

// Linha label→valor dos cards (mesmo formato do Foldbox)
function Linha({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800 text-right">{valor}</span>
    </div>
  )
}

export default function StatusIntegracoesPage() {
  const { user } = useAuth()
  const [data, setData] = useState<IntegracoesStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [erro, setErro] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const r = (await pb.send('/backend/v1/integracoes/status', { method: 'GET' })) as any
      if (!r.success) throw new Error(r.erro || 'falha')
      setData(r)
      setErro('')
    } catch (e: any) {
      setErro(e?.message || String(e))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load(true)
  }, [load])

  const i = data?.integracoes || {}
  const sk = i.sankhya || {}
  const em = i.email || {}
  const gm = i.gemini || {}
  const pbi = i.powerbi || {}
  const wa = i.whatsapp || {}

  const skState: any = sk.erro ? 'error' : sk.ok ? 'ok' : sk.configurado ? 'warn' : 'off'
  const emState: any = em.erro ? 'error' : em.ok ? 'ok' : 'warn'
  const gmState: any = gm.erro ? 'error' : gm.ok ? 'ok' : 'warn'
  const pbiState: any = pbi.ok ? 'ok' : 'warn'
  const waState: any = wa.erro
    ? 'error'
    : wa.ativo && wa.credenciais_ok && wa.meta_ok
      ? 'ok'
      : wa.credenciais_ok
        ? 'warn'
        : 'off'

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
            <Activity className="h-6 w-6 text-[#1B5E20]" /> Status Integrações
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Monitoramento ao vivo de todas as integrações do portal
            {data?.gerado_em && (
              <span className="text-xs"> · atualizado {fmtDateTime(data.gerado_em)}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => load()}
          disabled={refreshing}
          className="h-9 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-[13px] font-semibold text-gray-700 inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Atualizar
        </button>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ===== SANKHYA ===== */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600" />
              <h2 className="font-semibold text-gray-900">Sankhya ERP</h2>
            </div>
            <StateBadge state={skState} />
          </div>
          {sk.erro && !sk.ok ? (
            <p className="text-xs text-red-600">Erro: {sk.erro}</p>
          ) : (
            <div className="space-y-2.5 text-xs">
              <Linha
                label="Conexão"
                valor={
                  sk.ok
                    ? 'OAuth OK (edge proxy)'
                    : sk.configurado
                      ? 'Falha na edge'
                      : 'Não configurado'
                }
              />
              <Linha label="Credenciais (cofre)" valor={sk.credenciais_cofre ? 'OK' : 'Ausentes'} />
              <div className="pt-2 border-t border-gray-100">
                <p className="font-semibold text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">
                  Últimas ações registradas
                </p>
                {(sk.ultimas_acoes?.length ?? 0) === 0 ? (
                  <p className="text-[11px] text-gray-400">Nenhum log recente.</p>
                ) : (
                  <div className="space-y-1">
                    {sk.ultimas_acoes!.map((l, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[11px]">
                        <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="text-gray-500">{fmtDateTime(l.created_at)}</span>
                        <span className="text-gray-800">{l.action}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ===== WHATSAPP ===== */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-emerald-600" />
              <h2 className="font-semibold text-gray-900">WhatsApp (Meta API)</h2>
            </div>
            <StateBadge state={waState} />
          </div>
          {wa.erro ? (
            <p className="text-xs text-red-600">Erro ao carregar: {wa.erro}</p>
          ) : (
            <div className="space-y-2.5 text-xs">
              <Linha label="Ativo" valor={wa.ativo ? 'Sim' : 'Não'} />
              <Linha label="Número" valor={wa.phone_display || '—'} />
              <Linha label="Credenciais" valor={wa.credenciais_ok ? 'OK' : 'Incompletas'} />
              <Linha
                label="Meta API"
                valor={
                  wa.meta_ok
                    ? 'OK' + (wa.quality ? ' · ' + wa.quality : '')
                    : wa.meta_erro || 'não testado'
                }
              />
              <Linha label="Verify token" valor={wa.webhook_verify || '—'} />
              {wa.ultima_mensagem?.detalhe && (
                <p className="text-[11px] text-gray-500 pt-1 border-t border-gray-100">
                  Último teste: {wa.ultima_mensagem.detalhe}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ===== E-MAIL ===== */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-sky-600" />
              <h2 className="font-semibold text-gray-900">E-mail</h2>
            </div>
            <StateBadge state={emState} />
          </div>
          <div className="space-y-2.5 text-xs">
            <Linha label="Relay" valor={em.relay || '—'} />
            {(['google', 'microsoft'] as const).map((p) => {
              const o = em.oauth?.[p] || { conectado: false }
              return (
                <Linha
                  key={p}
                  label={p === 'google' ? 'Gmail (OAuth)' : 'Outlook (OAuth)'}
                  valor={
                    o.conectado ? (
                      <span className="text-emerald-700">
                        Conectado{o.conta ? ' · ' + o.conta : ''}
                      </span>
                    ) : (
                      <span className="text-gray-400">Desconectado</span>
                    )
                  }
                />
              )
            })}
          </div>
        </div>

        {/* ===== GEMINI ===== */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h2 className="font-semibold text-gray-900">Gemini Flash (IA)</h2>
            </div>
            <StateBadge state={gmState} />
          </div>
          <div className="space-y-2.5 text-xs">
            <Linha label="Gateway" valor="Skip $ai — chave gerenciada" />
            <Linha label="Modelo" valor={gm.model || 'fast'} />
            {gm.erro && <p className="text-[11px] text-red-600">Erro: {gm.erro}</p>}
          </div>
        </div>

        {/* ===== POWER BI ===== */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChartColumnBig className="w-5 h-5 text-yellow-600" />
              <h2 className="font-semibold text-gray-900">Power BI</h2>
            </div>
            <StateBadge state={pbiState} />
          </div>
          <div className="space-y-2.5 text-xs">
            <Linha label="Modo" valor="Embed para organização" />
            <Linha label="Detalhe" valor={pbi.detalhe || '—'} />
          </div>
        </div>

        {/* ===== MERCADO LIVRE (sem integração no PGE — card informativo) ===== */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs space-y-3 opacity-75">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-yellow-600" />
              <h2 className="font-semibold text-gray-900">Mercado Livre</h2>
            </div>
            <StateBadge state="off" />
          </div>
          <div className="space-y-2.5 text-xs">
            <Linha label="Integração" valor="Disponível no site Foldbox" />
            <Linha label="Portal PGE" valor="Não aplicável (gestão interna)" />
          </div>
        </div>
      </div>
    </div>
  )
}
