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

const LOGOS: Record<string, { nome: string; cor: string; sigla: string }> = {
  Extrafruti: { nome: 'Extrafruti', cor: '#1B5E20', sigla: 'EX' },
  Casafruti: { nome: 'Casafruti', cor: '#F59E0B', sigla: 'CA' },
  FoldBox: { nome: 'FoldBox', cor: '#0F3D13', sigla: 'FB' },
}

export default function ConfiguracoesCompletaPage() {
  const { timeoutMin, setTimeoutMin, user } = useAuth()
  const [testes, setTestes] = useState<
    Record<string, { ok?: boolean; erro?: string; detalhe?: string; loading?: boolean }>
  >({})
  const [idioma, setIdioma] = useState<Idioma>(idiomaSalvo())
  const [padrao, setPadrao] = useState<PadraoContabil>(padraoSalvo())
  const [logoSel, setLogoSel] = useState('Extrafruti')
  const [backup, setBackup] = useState('')
  const [backupMsg, setBackupMsg] = useState('')
  const [auditoria, setAuditoria] = useState<any[]>([])
  const [tSalvo, setTSalvo] = useState(false)
  const [syncando, setSyncando] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

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
  }

  const trocarPadrao = (p: PadraoContabil) => {
    setPadrao(p)
    salvarPadrao(p)
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

      {/* Identidade visual */}
      <section className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-[#1B5E20]" /> Identidade Visual
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Object.entries(LOGOS).map(([key, l]) => (
            <button
              key={key}
              type="button"
              onClick={() => setLogoSel(key)}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left',
                logoSel === key
                  ? 'border-[#1B5E20] bg-emerald-50/40'
                  : 'border-gray-100 hover:border-gray-300',
              )}
            >
              <span
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-[12px] shrink-0"
                style={{ backgroundColor: l.cor }}
              >
                {l.sigla}
              </span>
              <span>
                <span className="block text-[13px] font-bold text-gray-900">{l.nome}</span>
                <span className="block text-[10px] text-gray-500">
                  {logoSel === key ? 'aplicada no portal' : 'clicar para aplicar'}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500">
          <span className="h-6 w-6 rounded-full bg-[#1B5E20] text-white inline-flex items-center justify-center font-bold text-[9px]">
            EC
          </span>
          Emblema "EC" (Extrafruti-Casafruti) aplicado ao lado da empresa selecionada no Topbar.
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
