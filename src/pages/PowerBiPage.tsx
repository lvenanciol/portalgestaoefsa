import { useState } from 'react'
import { ChartColumnBig, ExternalLink } from 'lucide-react'

// Fase 11 — Power BI: integração do portal com relatórios existentes.
// Relatório "Acompanhamento Varejo" (Extrafruti) — embed PARA ORGANIZAÇÃO,
// gerado da URL de visualização (groups/me/reports/2cccfc31…, tenant f297b97e).
// Usuários autenticam com a conta Microsoft (licença Pro) dentro do iframe.
// URL pública (publish to web, app.powerbi.com/view?r=…) NÃO recomendada
// para dados financeiros.

const URL_PADRAO =
  'https://app.powerbi.com/reportEmbed?reportId=2cccfc31-3dc0-4e13-9fd5-4ba67a0ea6d5&ctid=f297b97e-1aa1-423f-81e0-008ad95e11f2'

export default function PowerBiPage() {
  const urlSalva = localStorage.getItem('pge_powerbi_url') || URL_PADRAO
  const [url, setUrl] = useState(urlSalva)
  const [salvo, setSalvo] = useState(false)

  const salvar = () => {
    if (url.trim()) {
      localStorage.setItem('pge_powerbi_url', url.trim())
      setSalvo(true)
      setTimeout(() => setSalvo(false), 2500)
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <ChartColumnBig className="h-6 w-6 text-[#1B5E20]" />
            Power BI
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Relatórios corporativos do grupo — embed do Power BI Service
          </p>
        </div>
      </div>

      {urlSalva ? (
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900">Relatório configurado</span>
            <a
              href={urlSalva}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#1B5E20] hover:text-[#0F3D13]"
            >
              Abrir em nova aba <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <iframe
            src={urlSalva}
            title="Power BI"
            className="w-full h-[640px] border-0"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="max-w-2xl space-y-4">
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
            <h2 className="text-sm font-bold text-gray-900 mb-2">Conectar um relatório</h2>
            <p className="text-[12px] text-gray-600 leading-relaxed mb-3">
              No Power BI Service, abra o relatório do grupo →{' '}
              <strong>Arquivo → Inserir relatório → Site ou portal</strong> e cole aqui o link
              gerado. O portal exibe o relatório incorporado nesta tela para todos os usuários com
              permissão.
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
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Requisito: o relatório precisa estar publicado no Power BI Service com acesso "qualquer
            pessoa com o link" (publish to web) ou embed por tenant. Para embed autenticado por
            usuário, integrar com Entra ID — me peça.
          </p>
        </div>
      )}
    </div>
  )
}
