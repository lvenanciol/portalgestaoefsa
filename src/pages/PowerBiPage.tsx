import { useEffect, useRef, useState } from 'react'
import {
  ChartColumnBig,
  ExternalLink,
  RefreshCw,
  Info,
  Loader2,
  MonitorPlay,
  CheckCircle2,
} from 'lucide-react'
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
  const urlSalva = localStorage.getItem('pge_powerbi_url') || URL_PADRAO
  const [url, setUrl] = useState(urlSalva)
  const [salvo, setSalvo] = useState(false)
  const [embedKey, setEmbedKey] = useState(0)
  const [relatorios, setRelatorios] = useState<any[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [clientIdInput, setClientIdInput] = useState(
    () => localStorage.getItem('pge_ms_client_id') || '14f8fa0e-432c-4d1a-baea-a208d8eed1cd',
  )
  const [clientIdSalvo, setClientIdSalvo] = useState(false)

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
            Relatórios do Power BI Service disponíveis para o seu usuário
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            Listar relatórios
          </Button>
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

      {urlSalva ? (
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-900">Relatório em exibição</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setEmbedKey((k) => k + 1)}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recarregar embed
                </Button>
                <a
                  href={urlSalva}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#1B5E20] hover:text-[#0F3D13]"
                >
                  Abrir em nova aba <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
            {/* T11a v6 (22/10): com embed token usa o SDK (postMessage) — o iframe
                com embed_url crua é bloqueado por X-Frame-Options */}
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
                <div ref={containerRef} className="w-full h-[640px]" />
              </div>
            ) : (
              <iframe
                key={embedKey}
                src={urlSalva}
                title="Power BI"
                className="w-full h-[640px] border-0"
                allowFullScreen
              />
            )}
          </div>

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
