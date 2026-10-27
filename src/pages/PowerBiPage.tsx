import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChartColumnBig,
  ExternalLink,
  RefreshCw,
  Info,
  Loader2,
  MonitorPlay,
  CheckCircle2,
  Building2,
  LayoutDashboard,
  Sparkles,
  BarChart3,
  PieChart,
  FileSpreadsheet,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { cn } from '@/lib/utils'
// T11a (22/10): embed REAL via powerbi-client (SDK) — o iframe com embed_url
// crua é bloqueado (X-Frame-Options); o SDK usa embed token efêmero + postMessage.
// NÃO existe CSS a importar no powerbi-client 2.x (powerbi.css era do pacote
// antigo powerbi-report-component — importá-lo quebraria o build).
import { models, service, factories } from 'powerbi-client'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Ajustes PGE — T11: Power BI lista os relatórios disponíveis para o usuário.
// Token Microsoft via MSAL (app registration do tenant — campo abaixo).
// T11a (22/10): fluxo com PKCE REAL — acquireTokenRedirect do MSAL (a URL
// artesanal de authorize sem code_verifier era a causa das falhas intermitentes).

const URL_PADRAO =
  'https://app.powerbi.com/reportEmbed?reportId=2cccfc31-3dc0-4e13-9fd5-4ba67a0ea6d5&ctid=f297b97e-1aa1-423f-81e0-008ad95e11f2'

const TENANT = 'f297b97e-1aa1-423f-81e0-008ad95e11f2'
const AUTHORITY = 'https://login.microsoftonline.com/' + TENANT
const REDIRECT_URI = 'https://portal-de-gestao-executivo-b4d94.goskip.app/power-bi'
const SCOPES = ['https://analysis.windows.net/powerbi/api/Report.Read.All']

const MS_CLIENT_ID = () => localStorage.getItem('pge_ms_client_id') || ''

// MSAL: cria + inicializa a instância (sem consumir o redirect ainda)
async function abrirPca(clientId: string) {
  const { PublicClientApplication } = await import('@azure/msal-browser')
  const pca = new PublicClientApplication({
    auth: { clientId, authority: AUTHORITY, redirectUri: REDIRECT_URI },
  })
  await pca.initialize()
  return pca
}

// Token silencioso — '' quando não há sessão/consentimento
async function tokenSilencioso(pca: any): Promise<string> {
  const contas = pca.getAllAccounts()
  if (!contas.length) return ''
  try {
    const sil = await pca.acquireTokenSilent({ scopes: SCOPES, account: contas[0] })
    return sil.accessToken
  } catch (_e) {
    return ''
  }
}

export default function PowerBiPage() {
  const { selectedCompany, setSelectedCompany, empresas } = useApp()
  const urlSalva = localStorage.getItem('pge_powerbi_url') || URL_PADRAO
  const [url, setUrl] = useState(urlSalva)
  const [salvo, setSalvo] = useState(false)
  const [embedKey, setEmbedKey] = useState(0)
  const [relatorios, setRelatorios] = useState<any[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [relatorioSelecionadoId, setRelatorioSelecionadoId] = useState<string>('rep-consolidado')
  const [clientIdInput, setClientIdInput] = useState(
    () => localStorage.getItem('pge_ms_client_id') || '14f8fa0e-432c-4d1a-baea-a208d8eed1cd',
  )
  const [clientIdSalvo, setClientIdSalvo] = useState(false)

  // Catálogo de relatórios do grupo com suporte ao seletor de empresa
  const catalogoPadrao = useMemo(
    () => [
      {
        id: 'rep-consolidado',
        nome: 'DRE & Margem Operacional Consolidada',
        descricao: 'Visão executiva integrada das receitas, CMV e despesas operacionais do Grupo.',
        empresa: '',
        empresaNome: 'Grupo (Consolidado)',
        categoria: 'Financeiro',
        icone: BarChart3,
        atualizacao: 'Diária (06:00)',
      },
      {
        id: 'rep-extrafruti',
        nome: 'Performance Comercial & Logística — Extrafruti',
        descricao:
          'Acompanhamento diário de expedição de FLV, faturamento por rota e rupturas de entrega.',
        empresa: 'Extrafruti',
        empresaNome: 'Extrafruti',
        categoria: 'Operações & Logística',
        icone: LayoutDashboard,
        atualizacao: 'Horária',
      },
      {
        id: 'rep-casafruti',
        nome: 'Painel Varejo & Ticket Médio — Casafruti',
        descricao: 'Vendas por loja, margem de perecíveis, ticket médio e fluxo de clientes.',
        empresa: 'Casafruti',
        empresaNome: 'Casafruti',
        categoria: 'Varejo',
        icone: PieChart,
        atualizacao: 'Diária (23:30)',
      },
      {
        id: 'rep-foldbox',
        nome: 'Custos Industriais & OEE — FoldBox',
        descricao:
          'Produção de caixas e embalagens plásticas, perdas de matéria-prima e produtividade.',
        empresa: 'FoldBox',
        empresaNome: 'FoldBox',
        categoria: 'Indústria',
        icone: FileSpreadsheet,
        atualizacao: 'Diária (07:00)',
      },
    ],
    [],
  )

  // Filtra pelo seletor de empresa do portal
  const empresaAtivaObj = empresas.find((e) => e.id === selectedCompany)
  const nomeEmpresaAtiva = empresaAtivaObj ? empresaAtivaObj.nome : ''

  const relatoriosExibidos = useMemo(() => {
    if (!nomeEmpresaAtiva) return catalogoPadrao
    return catalogoPadrao.filter(
      (c) => !c.empresa || c.empresa.toLowerCase() === nomeEmpresaAtiva.toLowerCase(),
    )
  }, [catalogoPadrao, nomeEmpresaAtiva])

  const relatorioAtual =
    catalogoPadrao.find((r) => r.id === relatorioSelecionadoId) ||
    relatoriosExibidos[0] ||
    catalogoPadrao[0]

  // T11a (22/10): embed via SDK — config { type, id, embedUrl, accessToken }
  const [embedConfig, setEmbedConfig] = useState<any | null>(null)
  const [embedErro, setEmbedErro] = useState('')
  const [embedCarregando, setEmbedCarregando] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const serviceRef = useRef<service.Service | null>(null)

  const salvar = () => {
    if (url.trim()) {
      localStorage.setItem('pge_powerbi_url', url.trim())
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2500)
    }
  }

  const listarComToken = async (token: string) => {
    const r = (await pb.send('/backend/v1/powerbi/relatorios', {
      method: 'POST',
      body: JSON.stringify({ access_token: token }),
    })) as any
    if (!r.ok) {
      setErro(r.erro || 'Falha ao listar relatórios.')
      setRelatorios(null)
      return
    }
    setRelatorios(r.itens || [])
    setErro('')
  }

  // T11a (22/10): embed token (hook powerbi/embed) + SDK no container
  const abrirEmbed = async (reportId: string, token: string) => {
    setEmbedErro('')
    setEmbedCarregando(true)
    try {
      const er = (await pb.send('/backend/v1/powerbi/embed', {
        method: 'POST',
        body: JSON.stringify({ access_token: token, report_id: reportId }),
      })) as any
      if (!er.ok) {
        setEmbedErro(er.erro || 'Falha ao gerar embed token.')
        return
      }
      setEmbedConfig({
        type: 'report',
        id: reportId,
        embedUrl: er.embed_url,
        accessToken: er.embed_token,
        tokenType: models.TokenType.Embed,
      })
    } catch (e: any) {
      setEmbedErro('Falha ao gerar embed: ' + String(e?.message || e).slice(0, 200))
    } finally {
      setEmbedCarregando(false)
    }
  }

  const exibirRelatorio = async (r: any) => {
    setErro('')
    setEmbedErro('')
    setEmbedConfig(null)
    try {
      const clientId = clientIdInput.trim() || MS_CLIENT_ID()
      if (!clientId) {
        setErro('Configure o Application (client) ID (campo acima) antes de exibir o relatório.')
        return
      }
      const pca = await abrirPca(clientId)
      await pca.handleRedirectPromise()
      const token = await tokenSilencioso(pca)
      if (!token) {
        // sem sessão: redirect interativo (PKCE) — o retorno cai no useEffect mount
        sessionStorage.setItem('pge_pb_pending_report', r.id)
        await pca.acquireTokenRedirect({ scopes: SCOPES })
        return
      }
      await abrirEmbed(r.id, token)
    } catch (e: any) {
      setErro('Falha ao exibir relatório: ' + String(e?.message || e).slice(0, 200))
    }
  }

  const listarRelatorios = async () => {
    setCarregando(true)
    setErro('')
    try {
      const clientId = clientIdInput.trim() || MS_CLIENT_ID()
      if (!clientId) {
        setErro('Configure o app registration (Entra ID) — campo "Application (client) ID" acima.')
        return
      }
      localStorage.setItem('pge_ms_client_id', clientId)
      const pca = await abrirPca(clientId)
      await pca.handleRedirectPromise()
      const token = await tokenSilencioso(pca)
      if (!token) {
        // T11a (22/10): acquireTokenRedirect = authorize com PKCE + state reais
        // (full-page redirect; o retorno é tratado no useEffect de mount)
        await pca.acquireTokenRedirect({ scopes: SCOPES })
        return
      }
      await listarComToken(token)
    } catch (e: any) {
      const msg = String(e?.message || e)
      if (msg.includes('redirect_mismatch') || msg.includes('AADSTS50011')) {
        setErro(
          'URI de redirecionamento ausente no Entra ID: registre "' +
            REDIRECT_URI +
            '" como URI do tipo SPA no app registration (Autenticação) e tente de novo.',
        )
      } else if (msg.includes('user_cancelled')) {
        setErro('Login cancelado — clique em "Listar relatórios" e conclua o login Microsoft.')
      } else {
        setErro(msg)
      }
      setRelatorios(null)
    } finally {
      setCarregando(false)
    }
  }

  // T11 (22/10): ao voltar do redirect do Entra, completa a listagem —
  // ou abre o relatório pendente (fluxo "Exibir aqui" sem sessão).
  useEffect(() => {
    ;(async () => {
      const clientId = clientIdInput.trim() || MS_CLIENT_ID()
      if (!clientId) return
      try {
        const pca = await abrirPca(clientId)
        const resp = await pca.handleRedirectPromise()
        if (resp && resp.accessToken) {
          const pend = sessionStorage.getItem('pge_pb_pending_report')
          sessionStorage.removeItem('pge_pb_pending_report')
          if (pend) {
            await abrirEmbed(pend, resp.accessToken)
          } else {
            setCarregando(true)
            await listarComToken(resp.accessToken)
            setCarregando(false)
          }
          return
        }
        // fallback legado: retorno por fragment (#code=) — completa silencioso
        if (window.location.hash.includes('code=')) {
          history.replaceState(null, '', '/power-bi')
          const tok = await tokenSilencioso(pca)
          if (tok) {
            setCarregando(true)
            await listarComToken(tok)
            setCarregando(false)
          } else {
            setErro(
              'Login Microsoft concluído, mas o token não foi obtido — clique em "Listar relatórios" novamente.',
            )
          }
        }
      } catch (e: any) {
        // erro REAL do retorno — nunca engolir
        setErro(
          'Retorno do login Microsoft falhou: ' +
            String(e?.message || e).slice(0, 200) +
            ' — clique em "Listar relatórios" e conclua o login novamente.',
        )
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // T11a (22/10): renderiza o embed com o SDK quando há config (token+url)
  useEffect(() => {
    const el = containerRef.current
    if (!el || !embedConfig) return
    try {
      if (!serviceRef.current) {
        serviceRef.current = new service.Service(
          factories.hpmFactory,
          factories.wpmpFactory,
          factories.routerFactory,
        )
      }
      const svc = serviceRef.current
      svc.reset(el)
      const embed = svc.embed(el, embedConfig)
      // erro REAL do embed (licença/permissão/iframe) exibido na tela
      embed.on('error' as any, (ev: any) => {
        const d = ev && ev.detail ? ev.detail : ev
        setEmbedErro('Erro do relatório: ' + String(d && d.message ? d.message : d).slice(0, 200))
      })
    } catch (e: any) {
      setEmbedErro('Falha ao carregar o relatório: ' + String(e?.message || e).slice(0, 200))
    }
  }, [embedConfig])

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <ChartColumnBig className="h-6 w-6 text-[#1B5E20]" />
            Power BI
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Central de relatórios e painéis executivos do Grupo Extrafruti / Casafruti / FoldBox
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de empresa do portal integrado */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 shadow-2xs">
            <Building2 className="h-3.5 w-3.5 text-[#1B5E20]" />
            <span className="text-gray-400">Escopo:</span>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="bg-transparent font-bold text-gray-900 focus:outline-none cursor-pointer"
            >
              <option value="">Consolidado (todas)</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={listarRelatorios}
            disabled={carregando}
          >
            {carregando ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Sincronizar Service
          </Button>
        </div>
      </div>

      {/* Banner de status: Embed real em preparação */}
      <div className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-[#1B5E20] text-white flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-[#1B5E20]">
                Embed Power BI em Preparação
              </span>
              <span className="text-[11px] text-gray-500">
                Tenant: Extrafruti Gestão Corporativa
              </span>
            </div>
            <p className="text-[13px] font-medium text-gray-800 mt-1 leading-relaxed">
              Área de exibição e integração de relatórios interativos. A incorporação direta via
              Power BI Embedded / Pro está sendo configurada com permissões seguras por usuário.
              Enquanto isso, consulte o catálogo de painéis homologados abaixo e os links de acesso
              seguro.
            </p>
          </div>
        </div>
      </div>

      {/* Catálogo de relatórios disponíveis no grupo */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-[#1B5E20]" />
            Relatórios Homologados do Grupo
            {nomeEmpresaAtiva ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-[#1B5E20]">
                {nomeEmpresaAtiva}
              </span>
            ) : (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                Todos os Relatórios
              </span>
            )}
          </h2>
          <span className="text-xs text-gray-400">{relatoriosExibidos.length} disponíveis</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {relatoriosExibidos.map((rep) => {
            const Icon = rep.icone
            const ativo = rep.id === relatorioSelecionadoId
            return (
              <button
                key={rep.id}
                type="button"
                onClick={() => setRelatorioSelecionadoId(rep.id)}
                className={cn(
                  'text-left p-3.5 rounded-xl border transition-all duration-150 flex flex-col justify-between h-full bg-white shadow-2xs hover:shadow-md cursor-pointer',
                  ativo
                    ? 'border-[#1B5E20] ring-2 ring-[#1B5E20]/20 bg-emerald-50/20'
                    : 'border-gray-200 hover:border-gray-300',
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={cn(
                        'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                        ativo ? 'bg-[#1B5E20] text-white' : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      {rep.categoria}
                    </span>
                  </div>
                  <div className="text-[13px] font-bold text-gray-900 leading-snug">{rep.nome}</div>
                  <p className="text-[11px] text-gray-500 line-clamp-2 mt-1 leading-relaxed">
                    {rep.descricao}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-gray-100 text-[10px] text-gray-400">
                  <span className="font-semibold text-emerald-800">{rep.empresaNome}</span>
                  <span>{rep.atualizacao}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* T11: configuração do app registration (Entra ID) — client_id salvo no navegador */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1 grid gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Power BI — App registration (Entra ID) — Application (client) ID
            </Label>
            <Input
              value={clientIdInput}
              onChange={(e) => setClientIdInput(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="h-9 bg-gray-50 text-[12px]"
            />
          </div>
          <Button
            size="sm"
            className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            onClick={() => {
              localStorage.setItem('pge_ms_client_id', clientIdInput.trim())
              setErro('')
              setClientIdSalvo(true)
              setTimeout(() => setClientIdSalvo(false), 3000)
            }}
          >
            {clientIdSalvo ? <CheckCircle2 className="h-4 w-4 mr-1.5" /> : null}
            {clientIdSalvo ? 'Salvo' : 'Salvar'}
          </Button>
        </div>
        {clientIdSalvo && (
          <p className="flex items-center gap-1.5 text-[12px] text-emerald-700 font-semibold mt-2">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Application (client) ID salvo — agora clique em "Listar relatórios".
          </p>
        )}
        <p className="text-[11px] text-gray-400 mt-2">
          Cole aqui o "Application (client) ID" do app registration criado no Entra ID (passo a
          passo no rodapé da tela).
        </p>
      </div>

      {erro && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[12px] text-amber-800 leading-relaxed">{erro}</div>
        </div>
      )}

      {/* T11: lista de relatórios do usuário */}
      {relatorios && relatorios.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <MonitorPlay className="h-4 w-4 text-[#1B5E20]" /> Relatórios disponíveis (
              {relatorios.length})
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {relatorios.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  {/* T11b: nome do relatório = LINK de clique simples */}
                  <button
                    type="button"
                    className="text-[13px] font-semibold text-gray-900 hover:text-[#1B5E20] hover:underline text-left truncate"
                    title="Clique para exibir o relatório nesta tela"
                    onClick={() => exibirRelatorio(r)}
                  >
                    {r.nome}
                  </button>
                  <div className="text-[10px] text-gray-400 truncate">{r.workspace}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => exibirRelatorio(r)}
                  >
                    Exibir aqui
                  </Button>
                  <a
                    href={r.web_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] font-semibold text-[#1B5E20] hover:underline inline-flex items-center gap-1"
                  >
                    Abrir <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {relatorios && relatorios.length === 0 && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <Info className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
          <div className="text-[12px] text-gray-600 leading-relaxed">
            Nenhum relatório disponível para o seu usuário — verifique permissões e licença Pro no
            Power BI Service.
          </div>
        </div>
      )}

      {/* Área de Visualização do Relatório / Placeholder elegante de embed */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gray-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900">{relatorioAtual.nome}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-[#1B5E20]">
                {relatorioAtual.empresaNome}
              </span>
            </div>
            <span className="text-[11px] text-gray-500">
              {relatorioAtual.categoria} • Atualizado: {relatorioAtual.atualizacao}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setEmbedKey((k) => k + 1)}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recarregar
            </Button>
            <a
              href={urlSalva}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-[#1B5E20] hover:bg-[#0F3D13] text-white transition-colors"
            >
              Abrir no Power BI Service <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* Quadro interativo com placeholder visual elegante do embed Power BI */}
        {embedConfig ? (
          <div className="px-4 pb-4 pt-2">
            {embedCarregando && (
              <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando relatório…
              </div>
            )}
            {embedErro && (
              <div className="flex items-start gap-2.5 p-3 mb-2 rounded-lg bg-amber-50 border border-amber-200">
                <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[12px] text-amber-800 leading-relaxed">{embedErro}</div>
              </div>
            )}
            <div ref={containerRef} className="w-full h-[580px]" />
          </div>
        ) : (
          <div className="relative w-full h-[540px] bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col items-center justify-center p-6 text-center select-none overflow-hidden">
            {/* Efeito sutil de grid e dashboard em segundo plano */}
            <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px]" />
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between border-b border-white/10 pb-2 text-xs text-white/50">
              <span className="flex items-center gap-1.5">
                <ChartColumnBig className="h-3.5 w-3.5 text-amber-400" />
                Microsoft Power BI Embedded Workspace
              </span>
              <span>Modo Demonstrativo & Homologação</span>
            </div>

            <div className="relative z-10 max-w-lg space-y-4">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shadow-lg backdrop-blur-xs">
                <ChartColumnBig className="h-8 w-8 text-amber-400" />
              </div>
              <div>
                <span className="inline-block px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-300 font-semibold text-xs tracking-wider uppercase mb-2">
                  Área de Incorporação do Power BI
                </span>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  {relatorioAtual.nome}
                </h3>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                  O embed interativo real do Power BI virá integrado diretamente neste quadro via
                  token de sessão. Atualmente, os dados podem ser visualizados com credenciais
                  corporativas no link oficial do Power BI Service.
                </p>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <a
                  href={urlSalva}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition-colors shadow-md"
                >
                  <ExternalLink className="h-4 w-4" /> Acessar no Power BI Service
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={listarRelatorios}
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs h-9"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Testar Token Microsoft
                </Button>
              </div>
            </div>

            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[11px] text-white/40 pt-2 border-t border-white/10">
              <span>Escopo ativo: {nomeEmpresaAtiva || 'Consolidado (Todas)'}</span>
              <span>Segurança: RLS por perfil de acesso do portal</span>
            </div>
          </div>
        )}
      </div>

      {urlSalva ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-[12px] text-amber-800 leading-relaxed">
              <strong>O relatório fica carregando sem abrir?</strong> O embed "para organização"
              exige sua sessão Microsoft no navegador e licença Pro. Clique em{' '}
              <strong>Listar relatórios</strong> → conclua o login Microsoft → clique no relatório
              para exibir aqui (embed token efêmero). Sem app registration, use{' '}
              <strong>Abrir em nova aba</strong>.
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-2xl space-y-4">
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
            <h2 className="text-sm font-bold text-gray-900 mb-2">Conectar um relatório</h2>
            <p className="text-[12px] text-gray-600 leading-relaxed mb-3">
              No Power BI Service, abra o relatório do grupo →{' '}
              <strong>Arquivo → Inserir relatório → Site ou portal</strong> e cole aqui o link
              gerado.
            </p>
            <div className="flex items-center gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://app.powerbi.com/view?r=..."
                className="flex-1 h-10 rounded-md border border-gray-200 bg-gray-50 px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
              />
              <button
                type="button"
                onClick={salvar}
                disabled={!url.trim()}
                className="h-10 px-4 rounded-lg bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-[13px] font-semibold disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
            {salvo && (
              <p className="text-[12px] text-emerald-700 font-semibold mt-2">
                Link salvo — recarregue a página para ver o embed.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
