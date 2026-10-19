import { useEffect, useState } from 'react'
import {
  Settings,
  CheckCircle2,
  XCircle,
  Loader2,
  Plug,
  Palette,
  DatabaseBackup,
  Globe,
  ShieldCheck,
  Upload,
  Download,
  RefreshCw,
  Mail,
  Inbox,
  LogOut,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import {
  IDIOMAS,
  PADROES,
  Idioma,
  PadraoContabil,
  idiomaSalvo,
  padraoSalvo,
  salvarIdioma,
  salvarPadrao,
  traduzir,
} from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Fase 10 (prompt-mestre) — Configurações: integrações (Sankhya, Power BI,
// E-mail, Gemini) com status e "Testar conexão"; Identidade Visual (logos
// Extrafruti/Casafruti/FoldBox + emblema EC); backup/restore JSON; auditoria
// consolidada; globalização (bandeiras BR/EUA/UE trocando idioma + padrão
// contábil sem reload).

const MARCA_LS = 'pge_marca_visual'

const LOGOS: Record<string, { nome: string; cor: string; sigla: string }> = {
  Extrafruti: { nome: 'Extrafruti', cor: '#1B5E20', sigla: 'EX' },
  Casafruti: { nome: 'Casafruti', cor: '#F59E0B', sigla: 'CA' },
  FoldBox: { nome: 'FoldBox', cor: '#0F3D13', sigla: 'FB' },
}

// marca ativa (persistida) — lida pelo Topbar para aplicar a identidade
export function marcaAtiva(): { nome: string; cor: string; sigla: string } {
  try {
    const k = localStorage.getItem(MARCA_LS) || 'Extrafruti'
    return LOGOS[k] || LOGOS.Extrafruti
  } catch (_) {
    return LOGOS.Extrafruti
  }
}

export default function ConfiguracoesCompletaPage() {
  const { timeoutMin, setTimeoutMin, user } = useAuth()
  const [testes, setTestes] = useState<
    Record<string, { ok?: boolean; erro?: string; detalhe?: string; loading?: boolean }>
  >({})
  const [idioma, setIdioma] = useState<Idioma>(idiomaSalvo())
  const [padrao, setPadrao] = useState<PadraoContabil>(padraoSalvo())
  const [logoSel, setLogoSel] = useState(() => {
    try {
      return localStorage.getItem('pge_marca_visual') || 'Extrafruti'
    } catch (_) {
      return 'Extrafruti'
    }
  })
  // T7: identidades reais da coleção logomarcas (upload na tela Logomarcas)
  const [logoMarcas, setLogoMarcas] = useState<any[]>([])
  useEffect(() => {
    ;(async () => {
      try {
        const r = await pb.collection('logomarcas').getFullList({ sort: 'empresa' })
        setLogoMarcas(r as any[])
      } catch (_) {
        setLogoMarcas([])
      }
    })()
  }, [])
  const [backup, setBackup] = useState('')
  const [backupMsg, setBackupMsg] = useState('')
  const [auditoria, setAuditoria] = useState<any[]>([])
  const [tSalvo, setTSalvo] = useState(false)
  const [syncando, setSyncando] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  // COR-4 F8 — conexão real Gmail/Outlook (OAuth)
  const [oauth, setOauth] = useState<Record<string, { conectado: boolean; conta?: string }>>({
    google: { conectado: false },
    microsoft: { conectado: false },
  })
  const [oauthMsg, setOauthMsg] = useState('')
  const [oauthLoading, setOauthLoading] = useState('')
  const [inbox, setInbox] = useState<any[]>([])
  const [inboxOpen, setInboxOpen] = useState(false)

  const carregarOauth = async () => {
    try {
      const r = (await pb.send('/backend/v1/email/oauth/status', { method: 'GET' })) as any
      setOauth({
        google: r.google || { conectado: false },
        microsoft: r.microsoft || { conectado: false },
      })
    } catch (_) {}
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
    carregarOauth()
    // retorno do callback OAuth: ?oauth=ok|erro
    const p = new URLSearchParams(window.location.search)
    if (p.get('oauth') === 'ok') {
      setOauthMsg('Conectado com sucesso (' + (p.get('provedor') || '') + ').')
      carregarOauth()
      window.history.replaceState({}, '', '/configuracoes')
    } else if (p.get('oauth') === 'erro') {
      setOauthMsg('Falha na conexão: ' + (p.get('det') || 'erro desconhecido'))
      window.history.replaceState({}, '', '/configuracoes')
    }
  }, [])

  const conectarOauth = async (provedor: string) => {
    setOauthLoading(provedor)
    setOauthMsg('')
    try {
      const r = (await pb.send('/backend/v1/email/oauth/iniciar', {
        method: 'POST',
        body: JSON.stringify({ provedor }),
      })) as any
      if (r.ok && r.url) {
        window.location.href = r.url
        return
      }
      setOauthMsg(r.erro || 'Falha ao iniciar OAuth.')
    } catch (e) {
      setOauthMsg('Erro: ' + String(e))
    } finally {
      setOauthLoading('')
    }
  }

  const sincronizarInbox = async (provedor: string) => {
    setOauthLoading('sync-' + provedor)
    setOauthMsg('')
    try {
      const r = (await pb.send('/backend/v1/email/oauth/sync', {
        method: 'POST',
        body: JSON.stringify({ provedor }),
      })) as any
      if (r.ok) {
        setOauthMsg('Caixa sincronizada — ' + r.novos + ' novo(s) e-mail(s).')
        await carregarInbox()
        setInboxOpen(true)
      } else {
        setOauthMsg('Falha no sync: ' + (r.erro || 'desconhecido'))
      }
    } catch (e) {
      setOauthMsg('Erro no sync: ' + String(e))
    } finally {
      setOauthLoading('')
      setTimeout(() => setOauthMsg(''), 10000)
    }
  }

  const desconectarOauth = async (provedor: string) => {
    setOauthLoading('desc-' + provedor)
    try {
      await pb.send('/backend/v1/email/oauth/desconectar', {
        method: 'POST',
        body: JSON.stringify({ provedor }),
      })
      setOauthMsg('Desconectado (' + provedor + ').')
      await carregarOauth()
    } catch (e) {
      setOauthMsg('Erro: ' + String(e))
    } finally {
      setOauthLoading('')
    }
  }

  const sincronizarAgora = async () => {
    setSyncando(true)
    setSyncMsg('')
    try {
      const r = (await pb.send('/backend/v1/sankhya/sync', { method: 'POST', body: '{}' })) as any
      if (r.ok) setSyncMsg('Sync OK — ' + (r.gerado_em || '').slice(0, 16).replace('T', ' '))
      else
        setSyncMsg(
          'Sync parcial — ' +
            (r.falhas || []).length +
            ' falha(s): ' +
            (r.falhas || []).join('; ').slice(0, 120),
        )
    } catch (e) {
      setSyncMsg('Erro no sync: ' + String(e))
    } finally {
      setSyncando(false)
      setTimeout(() => setSyncMsg(''), 8000)
    }
  }

  const testar = async (alvo: string) => {
    setTestes((t) => ({ ...t, [alvo]: { loading: true } }))
    try {
      const r = (await pb.send('/backend/v1/integracoes/testar', {
        method: 'POST',
        body: JSON.stringify({ alvo }),
      })) as any
      setTestes((t) => ({ ...t, [alvo]: { ok: r.ok, erro: r.erro, detalhe: r.detalhe } }))
    } catch (e) {
      setTestes((t) => ({ ...t, [alvo]: { ok: false, erro: String(e) } }))
    }
  }

  const carregarAuditoria = async () => {
    try {
      const r = await pb.collection('auditoria').getList(1, 30, { sort: '-created' })
      setAuditoria(r.items as any[])
    } catch (_) {
      setAuditoria([])
    }
  }

  useEffect(() => {
    carregarAuditoria()
  }, [])

  const exportarBackup = () => {
    ;(async () => {
      try {
        const cols = [
          'empresas',
          'unidades',
          'menus',
          'tarefas',
          'projetos',
          'atas',
          'contratos',
          'indicadores',
          'ia_prompts',
          'importacoes',
        ]
        const dump: any = {}
        for (const c of cols) {
          try {
            dump[c] = await pb.collection(c).getFullList()
          } catch (_) {
            dump[c] = []
          }
        }
        const json = JSON.stringify({ gerado_em: new Date().toISOString(), dados: dump }, null, 2)
        setBackup(json)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'pge-backup-' + new Date().toISOString().slice(0, 10) + '.json'
        a.click()
        URL.revokeObjectURL(url)
        setBackupMsg('Backup exportado (' + Object.keys(dump).length + ' coleções).')
        setTimeout(() => setBackupMsg(''), 4000)
      } catch (e) {
        setBackupMsg('Erro: ' + String(e))
      }
    })()
  }

  const importarBackup = (file: File) => {
    ;(async () => {
      try {
        const txt = await file.text()
        const j = JSON.parse(txt)
        const dump = j.dados || j
        let criados = 0
        for (const col of Object.keys(dump)) {
          for (const item of dump[col] || []) {
            try {
              const { id, created, updated, expand, collectionId, collectionName, ...resto } = item
              await pb.collection(col).create(resto)
              criados++
            } catch (_) {
              /* duplicado — pula */
            }
          }
        }
        setBackupMsg('Restore concluído: ' + criados + ' registros recriados.')
        setTimeout(() => setBackupMsg(''), 6000)
      } catch (e) {
        setBackupMsg('Erro no restore: ' + String(e))
      }
    })()
  }

  const trocarIdioma = (i: Idioma) => {
    setIdioma(i)
    salvarIdioma(i)
    // notifica módulos abertos (sidebar etc.) sem reload
    window.dispatchEvent(new Event('pge_idioma_change'))
  }

  const trocarPadrao = (p: PadraoContabil) => {
    setPadrao(p)
    salvarPadrao(p)
    // COR-2: notifica módulos abertos (títulos DRE/Balancete ganham sufixo do padrão)
    window.dispatchEvent(new Event('pge_padrao_change'))
  }

  return (
    <div className="space-y-5 pb-8 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Settings className="h-6 w-6 text-[#1B5E20]" /> Configurações
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Integrações, identidade visual, globalização, backup e auditoria
          </p>
        </div>
      </div>

      {/* Integrações */}
      <section className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Plug className="h-4 w-4 text-[#1B5E20]" /> Integrações
        </h2>
        <div className="space-y-2">
          {[
            {
              key: 'sankhya',
              nome: 'Sankhya (ERP)',
              desc: 'OAuth serviço via edge proxy — TGFCAB/TGFFIN',
            },
            { key: 'email', nome: 'E-mail', desc: 'Relay Skip — marca Extrafruti' },
            {
              key: 'gemini',
              nome: 'Gemini Flash (IA)',
              desc: 'Gateway $ai da Skip — chave gerenciada',
            },
            {
              key: 'powerbi',
              nome: 'Power BI',
              desc: 'Embed para organização — reportId 2cccfc31…',
            },
          ].map((i) => {
            const t = testes[i.key]
            return (
              <div
                key={i.key}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/50"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-gray-900">{i.nome}</div>
                  <div className="text-[11px] text-gray-500">{t?.detalhe || i.desc}</div>
                  {t?.ok === false && (
                    <div className="text-[11px] text-red-600">Falha: {t.erro}</div>
                  )}
                  {i.key === 'sankhya' && syncMsg && (
                    <div className="text-[11px] text-emerald-700">{syncMsg}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t?.ok === true && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {t?.ok === false && <XCircle className="h-4 w-4 text-red-600" />}
                  {t?.loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                  {i.key === 'sankhya' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={sincronizarAgora}
                      disabled={syncando}
                    >
                      {syncando ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-1" />
                      )}
                      Sincronizar agora
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => testar(i.key)}
                    disabled={t?.loading}
                  >
                    Testar conexão
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* COR-4 F8 — Conexão real Gmail/Outlook (OAuth) */}
      <section className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <h2 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#1B5E20]" /> E-mail — conexão real (Gmail / Outlook)
        </h2>
        <p className="text-[11px] text-gray-500 mb-3">
          OAuth 2.0 com escopos de leitura e envio. Após conectar: sincronize a caixa de entrada e
          envie e-mails pela sua conta real.
        </p>
        {oauthMsg && (
          <div
            className={cn(
              'p-2.5 rounded-lg text-[12px] font-semibold mb-3',
              oauthMsg.startsWith('Falha') || oauthMsg.startsWith('Erro')
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
            )}
          >
            {oauthMsg}
          </div>
        )}
        <div className="space-y-2">
          {(['google', 'microsoft'] as const).map((prov) => {
            const st = oauth[prov] || { conectado: false }
            const nome = prov === 'google' ? 'Gmail (Google)' : 'Outlook (Microsoft 365)'
            return (
              <div
                key={prov}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/50"
              >
                <div className="min-w-0">
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
                <div className="flex items-center gap-2 shrink-0">
                  {st.conectado ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => sincronizarInbox(prov)}
                        disabled={oauthLoading === 'sync-' + prov}
                      >
                        {oauthLoading === 'sync-' + prov ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Inbox className="h-4 w-4 mr-1" />
                        )}
                        Sincronizar caixa
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => desconectarOauth(prov)}
                        disabled={oauthLoading === 'desc-' + prov}
                      >
                        {oauthLoading === 'desc-' + prov ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <LogOut className="h-4 w-4 mr-1" />
                        )}
                        Desconectar
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="h-8 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                      onClick={() => conectarOauth(prov)}
                      disabled={oauthLoading === prov}
                    >
                      {oauthLoading === prov ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Plug className="h-4 w-4 mr-1" />
                      )}
                      Conectar {prov === 'google' ? 'Gmail' : 'Outlook'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {inboxOpen && inbox.length > 0 && (
          <div className="mt-3 border border-gray-100 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Caixa de entrada sincronizada ({inbox.length})
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
              {inbox.slice(0, 15).map((m) => (
                <div key={m.id} className="px-3 py-2">
                  <div className="text-[12px] font-semibold text-gray-800 truncate">
                    {m.assunto}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {m.de} · {String(m.recebido_em).slice(0, 16).replace('T', ' ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Identidade visual */}
      <section className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-[#1B5E20]" /> Identidade Visual
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {logoMarcas.map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/50"
            >
              <span
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-[12px] shrink-0 overflow-hidden"
                style={{ backgroundColor: l.cor || '#1B5E20' }}
              >
                {l.logo ? (
                  <img
                    src={pb.files.getURL(l, l.logo)}
                    alt={l.empresa}
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  l.sigla || 'EX'
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-gray-900 truncate">
                  {l.empresa}
                </span>
                <span className="block text-[10px] text-gray-500">
                  {l.logo ? 'logo anexada' : 'sem logo — sigla'} · {l.cor}
                </span>
              </span>
            </div>
          ))}
          {logoMarcas.length === 0 && (
            <p className="text-[12px] text-gray-400">Carregando identidades…</p>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500">
          <span className="h-6 w-6 rounded-full bg-[#1B5E20] text-white inline-flex items-center justify-center font-bold text-[9px]">
            EC
          </span>
          Emblema aplicado ao lado da empresa selecionada no Topbar — anexe a imagem na tela
          Logomarcas.
        </div>
      </section>

      {/* Globalização */}
      <section className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Globe className="h-4 w-4 text-[#1B5E20]" /> Globalização — idioma e padrão contábil
        </h2>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {IDIOMAS.map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => trocarIdioma(i.key)}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] font-semibold transition-all',
                idioma === i.key
                  ? 'border-[#1B5E20] bg-emerald-50 text-[#1B5E20]'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              <span className="text-[14px]">{i.bandeira}</span> {i.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PADROES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => trocarPadrao(p.key)}
              className={cn(
                'px-3 py-2 rounded-lg border text-[12px] font-semibold transition-all',
                padrao === p.key
                  ? 'border-[#1B5E20] bg-emerald-50 text-[#1B5E20]'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Troca sem reload via dicionário i18n central — rótulos de navegação e módulos refletem na
          sidebar e nas telas.
        </p>
      </section>

      {/* Timeout */}
      <section className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-gray-900">Logout por inatividade</div>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Encerra a sessão após o período sem uso.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={5}
              max={240}
              value={timeoutMin}
              onChange={(e) =>
                setTimeoutMin(Math.max(5, Math.min(240, parseInt(e.target.value, 10) || 30)))
              }
              className="h-10 w-24 bg-gray-50"
            />
            <span className="text-[12px] text-gray-500">min</span>
            {tSalvo && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          </div>
        </div>
      </section>

      {/* Backup / Restore */}
      <section className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <DatabaseBackup className="h-4 w-4 text-[#1B5E20]" /> Backup & Restore (JSON)
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={exportarBackup} className="h-9">
            <Download className="h-4 w-4 mr-1.5" /> Exportar backup
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importarBackup(f)
              }}
            />
            <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-[13px] font-semibold text-gray-800 cursor-pointer">
              <Upload className="h-4 w-4" /> Importar backup
            </span>
          </label>
          {backupMsg && (
            <span className="text-[12px] font-semibold text-emerald-700">{backupMsg}</span>
          )}
        </div>
      </section>

      {/* Auditoria consolidada */}
      <section className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#1B5E20]" /> Auditoria — últimos 30 eventos
        </h2>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {auditoria.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 text-[12px] border-b border-gray-50 py-1.5"
            >
              <div className="min-w-0">
                <span className="font-semibold text-gray-800">{a.acao}</span>
                {a.modulo && <span className="text-gray-400"> · {a.modulo}</span>}
                {a.detalhe && typeof a.detalhe === 'string' && (
                  <span className="text-gray-500 block truncate">
                    {String(a.detalhe).slice(0, 90)}
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-gray-500">{a.usuario_email}</div>
                <div className="text-gray-400 tabular-nums">
                  {String(a.created).slice(0, 16).replace('T', ' ')}
                </div>
              </div>
            </div>
          ))}
          {auditoria.length === 0 && <p className="text-[12px] text-gray-400">Sem eventos.</p>}
        </div>
      </section>
    </div>
  )
}
