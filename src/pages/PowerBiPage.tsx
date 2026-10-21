import { useEffect, useState } from 'react'
import {
  ChartColumnBig,
  ExternalLink,
  RefreshCw,
  Info,
  Loader2,
  MonitorPlay,
  CheckCircle2,
} from 'lucide-react'
// T11: MSAL é carregado dinamicamente via CDN — dependência opcional;
// se não estiver disponível, a listagem mostra instrução de configuração.
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// Ajustes PGE — T11: Power BI lista os relatórios disponíveis para o usuário.
// O embed "para organização" exige access token Microsoft (Entra ID/MSAL):
// o front pede o token (popup MSAL) e o hook /backend/v1/powerbi/relatorios
// consulta a API do Power BI. Sem app registration configurado, a tela exibe
// o embed padrão + instruções de configuração (não é limitação do portal —
// é requisito da plataforma Microsoft).

const URL_PADRAO =
  'https://app.powerbi.com/reportEmbed?reportId=2cccfc31-3dc0-4e13-9fd5-4ba67a0ea6d5&ctid=f297b97e-1aa1-423f-81e0-008ad95e11f2'

const MS_CLIENT_ID = () => localStorage.getItem('pge_ms_client_id') || ''

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

  const salvar = () => {
    if (url.trim()) {
      localStorage.setItem('pge_powerbi_url', url.trim())
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2500)
    }
  }

  // T11a v3 (21/10): MSAL redirect NÃO funciona dentro de iframe
  // (redirect_in_iframe) e popup é bloqueado — token silencioso quando há
  // sessão; sem sessão, navegação TOP-LEVEL (target=_top) para o authorize.
  const [embedToken, setEmbedToken] = useState('')
  const [embedUrl, setEmbedUrl] = useState('')

  const exibirRelatorio = async (r: any) => {
    setErro('')
    try {
      const clientId = clientIdInput.trim() || MS_CLIENT_ID()
      if (!clientId) {
        setErro('Configure o app registration (Entra ID) — campo acima.')
        return
      }
      let msToken = ''
      try {
        const { PublicClientApplication } = await import('@azure/msal-browser')
        const pca = new PublicClientApplication({
          auth: {
            clientId,
            authority:
              'https://login.microsoftonline.com/f297b97e-1aa1-423f-81e0-008ad95e11f2/oauth2/v2.0',
            redirectUri: 'https://portal-de-gestao-executivo-b4d94.goskip.app/power-bi',
          },
        })
        await pca.initialize()
        await pca.handleRedirectPromise()
        const contas = pca.getAllAccounts()
        if (contas.length) {
          const sil = await pca.acquireTokenSilent({
            scopes: ['https://analysis.windows.net/powerbi/api/Report.Read.All'],
            account: contas[0],
          })
          msToken = sil.accessToken
        }
      } catch (_eSil) {
        /* sem sessão — fluxo top-level abaixo */
      }
      if (!msToken) {
        sessionStorage.setItem('pge_pb_pending_report', r.id)
        const urlAuth =
          'https://login.microsoftonline.com/f297b97e-1aa1-423f-81e0-008ad95e11f2/oauth2/v2.0/authorize' +
          '?client_id=' +
          encodeURIComponent(clientId) +
          '&response_type=code' +
          '&redirect_uri=' +
          encodeURIComponent('https://portal-de-gestao-executivo-b4d94.goskip.app/power-bi') +
          '&response_mode=fragment' +
          '&scope=' +
          encodeURIComponent(
            'https://analysis.windows.net/powerbi/api/Report.Read.All openid profile offline_access',
          ) +
          '&state=pge_pb'
        const a = document.createElement('a')
        a.href = urlAuth
        a.target = '_top' // sai do iframe — redirect permitido
        document.body.appendChild(a)
        a.click()
        a.remove()
        return
      }
      const er = (await pb.send('/backend/v1/powerbi/embed', {
        method: 'POST',
        body: JSON.stringify({ access_token: msToken, report_id: r.id }),
      })) as any
      if (!er.ok) {
        setErro(er.erro || 'Falha ao gerar embed.')
        return
      }
      setEmbedToken(er.embed_token)
      setEmbedUrl(er.embed_url)
      setEmbedKey((k) => k + 1)
    } catch (e: any) {
      setErro(String(e?.message || e))
    }
  }

  // T11 (21/10): fluxo REDIRECT — handleRedirectPromise completa o retorno do
  // Entra; se há resposta, usa o token e lista; senão inicia o redirect.
  const concluirOuIniciarRedirect = async (clientId: string) => {
    const { PublicClientApplication } = await import('@azure/msal-browser')
    const TENANT = 'f297b97e-1aa1-423f-81e0-008ad95e11f2'
    const pca = new PublicClientApplication({
      auth: {
        clientId,
        authority: 'https://login.microsoftonline.com/' + TENANT,
        redirectUri: 'https://portal-de-gestao-executivo-b4d94.goskip.app/power-bi',
      },
    })
    await pca.initialize()
    const SCOPES = ['https://analysis.windows.net/powerbi/api/Report.Read.All']
    const resp = await pca.handleRedirectPromise()
    if (resp && resp.accessToken) return resp.accessToken
    // T11a v4 (21/10): acquireTokenRedirect REMOVIDO — em iframe dá
    // redirect_in_iframe. Sem sessão: devolve '' e o chamador usa o
    // fluxo TOP-LEVEL (a.target='_top' → authorize → retorno ssoSilent).
    return ''
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
  }

  const listarRelatorios = async () => {
    setCarregando(true)
    setErro('')
    try {
      const clientId = clientIdInput.trim() || MS_CLIENT_ID()
      if (!clientId) {
        setErro(
          'Configure o app registration (Entra ID) nas Configurações — campo "Power BI (Entra ID)".',
        )
        return
      }
      localStorage.setItem('pge_ms_client_id', clientId)
      const token = await concluirOuIniciarRedirect(clientId)
      if (!token) {
        // T11a v4: sem sessão — TOP-LEVEL authorize (funciona em iframe)
        const urlAuth =
          'https://login.microsoftonline.com/f297b97e-1aa1-423f-81e0-008ad95e11f2/oauth2/v2.0/authorize' +
          '?client_id=' +
          encodeURIComponent(clientId) +
          '&response_type=code' +
          '&redirect_uri=' +
          encodeURIComponent('https://portal-de-gestao-executivo-b4d94.goskip.app/power-bi') +
          '&response_mode=fragment' +
          '&scope=' +
          encodeURIComponent(
            'https://analysis.windows.net/powerbi/api/Report.Read.All openid profile offline_access',
          ) +
          '&state=pge_pb_listar'
        const a = document.createElement('a')
        a.href = urlAuth
        a.target = '_top'
        document.body.appendChild(a)
        a.click()
        a.remove()
        return
      }
      await listarComToken(token)
    } catch (e: any) {
      const msg = String(e?.message || e)
      if (msg.includes('redirect_mismatch') || msg.includes('AADSTS50011')) {
        setErro(
          'URI de redirecionamento ausente no Entra ID: registre "https://portal-de-gestao-executivo-b4d94.goskip.app/power-bi" como URI do tipo SPA no app registration (Autenticação) e tente de novo.',
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

  useEffect(() => {
    // T11: ao voltar do redirect do Entra, completa a listagem
    ;(async () => {
      const clientId = clientIdInput.trim() || MS_CLIENT_ID()
      if (!clientId) return
      try {
        const { PublicClientApplication } = await import('@azure/msal-browser')
        const TENANT = 'f297b97e-1aa1-423f-81e0-008ad95e11f2'
        const pca = new PublicClientApplication({
          auth: {
            clientId,
            authority: 'https://login.microsoftonline.com/' + TENANT,
            redirectUri: 'https://portal-de-gestao-executivo-b4d94.goskip.app/power-bi',
          },
        })
        await pca.initialize()
        const resp = await pca.handleRedirectPromise()
        if (resp && resp.accessToken) {
          setCarregando(true)
          await listarComToken(resp.accessToken)
          setCarregando(false)
        }
      } catch (_e) {
        /* sem retorno de redirect — nada a fazer */
      }
    })()
  }, [])

  // T11a v3: retorno do authorize TOP-LEVEL (response_mode=fragment) —
  // sessão SSO fica ativa; completa com ssoSilent/acquireTokenSilent.
  useEffect(() => {
    const frag = window.location.hash || ''
    if (!frag.includes('code=')) return
    ;(async () => {
      history.replaceState(null, '', '/power-bi')
      const clientId = clientIdInput.trim() || MS_CLIENT_ID()
      if (!clientId) return
      try {
        const { PublicClientApplication } = await import('@azure/msal-browser')
        const pca = new PublicClientApplication({
          auth: {
            clientId,
            authority:
              'https://login.microsoftonline.com/f297b97e-1aa1-423f-81e0-008ad95e11f2/oauth2/v2.0',
            redirectUri: 'https://portal-de-gestao-executivo-b4d94.goskip.app/power-bi',
          },
        })
        await pca.initialize()
        await pca.handleRedirectPromise()
        const contas = pca.getAllAccounts()
        const SCOPES = ['https://analysis.windows.net/powerbi/api/Report.Read.All']
        let tok = ''
        if (contas.length) {
          const sil = await pca.acquireTokenSilent({ scopes: SCOPES, account: contas[0] })
          tok = sil.accessToken
        } else {
          const sso = await pca.ssoSilent({ scopes: SCOPES })
          tok = sso.accessToken
        }
        if (tok) {
          setCarregando(true)
          await listarComToken(tok)
          setCarregando(false)
        } else {
          setErro(
            'Login Microsoft concluído, mas o token não foi obtido — clique em "Listar relatórios" novamente.',
          )
        }
      } catch (e: any) {
        // T11a-5 (21/10): erro REAL do retorno — antes era engolido (catch vazio)
        // e o dono não sabia por que a lista não vinha.
        setErro(
          'Retorno do login Microsoft falhou: ' +
            String(e?.message || e).slice(0, 200) +
            ' — clique em "Listar relatórios" e conclua o login novamente.',
        )
      }
    })()
  }, [])

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
            {/* T11a v2: com embed token usa a embedUrl efêmera (funciona no iframe) */}
            <iframe
              key={embedKey + (embedToken || '')}
              src={embedToken && embedUrl ? embedUrl : urlSalva}
              title="Power BI"
              className="w-full h-[640px] border-0"
              allowFullScreen
            />
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-[12px] text-amber-800 leading-relaxed">
              <strong>O relatório fica carregando sem abrir?</strong> O embed "para organização"
              exige sua sessão Microsoft no navegador. Faça assim:{' '}
              <strong>Abrir em nova aba</strong> → login Microsoft (licença Pro) → volte e clique em{' '}
              <strong>Recarregar embed</strong>. Para a listagem automática dos relatórios,
              configure o app registration no Entra ID (Configurações → campo Power BI).
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
