import { useEffect, useState } from 'react'
import { ChartColumnBig, ExternalLink, RefreshCw, Info, Loader2, MonitorPlay } from 'lucide-react'
// T11: MSAL é carregado dinamicamente (import()) — dependência opcional;
// se não estiver instalada, a listagem mostra instrução de configuração.
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
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

  const salvar = () => {
    if (url.trim()) {
      localStorage.setItem('pge_powerbi_url', url.trim())
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2500)
    }
  }

  // T11: obter token MSAL e listar relatórios
  const listarRelatorios = async () => {
    setCarregando(true)
    setErro('')
    try {
      const clientId = MS_CLIENT_ID()
      if (!clientId) {
        setErro(
          'Configure o app registration (Entra ID) nas Configurações — campo "Power BI (Entra ID)".',
        )
        return
      }
      const { PublicClientApplication } = await import('@azure/msal-browser')
      const pca = new PublicClientApplication({
        auth: { clientId, authority: 'https://login.microsoftonline.com/common' },
      })
      await pca.initialize()
      const login = await pca.loginPopup({
        scopes: ['https://analysis.windows.net/powerbi/api/Report.Read.All'],
      })
      const account = login.account
      const tokenRes = await pca.acquireTokenSilent({
        scopes: ['https://analysis.windows.net/powerbi/api/Report.Read.All'],
        account,
      })
      const r = (await pb.send('/backend/v1/powerbi/relatorios', {
        method: 'POST',
        body: JSON.stringify({ access_token: tokenRes.accessToken }),
      })) as any
      if (!r.ok) {
        setErro(r.erro || 'Falha ao listar relatórios.')
        setRelatorios(null)
        return
      }
      setRelatorios(r.itens || [])
    } catch (e: any) {
      setErro(e?.message || String(e))
      setRelatorios(null)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    // tenta listar automaticamente se client_id configurado
    if (MS_CLIENT_ID()) listarRelatorios()
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
                  <div className="text-[13px] font-semibold text-gray-900 truncate">{r.nome}</div>
                  <div className="text-[10px] text-gray-400 truncate">{r.workspace}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      localStorage.setItem('pge_powerbi_url', r.embed_url)
                      setUrl(r.embed_url)
                      setEmbedKey((k) => k + 1)
                    }}
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
            <iframe
              key={embedKey}
              src={urlSalva}
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
