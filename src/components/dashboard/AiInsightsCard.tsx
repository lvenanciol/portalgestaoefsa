import { ParecerIaCard } from '@/components/ParecerIaCard'
import { MOCK_DATA, COMPANIES } from '@/data/mockData'

// Fase 7 — Pareceres IA do Dashboard: card vivo (gera parecer com os
// KPIs do Dashboard). Dados de demonstração enquanto o Dashboard não
// lê do Sankhya (mesma decisão do DRE/Balancete).

export function AiInsightsCard() {
  const kpis = MOCK_DATA.kpis
  const contexto =
    'KPIs do Dashboard Executivo do grupo (dados de demonstração): ' +
    kpis
      .map(
        (k) =>
          k.label.toLowerCase() +
          ' ' +
          k.value +
          (k.delta ? ' (' + k.delta + (k.deltaType === 'positive' ? ' ↑' : ' ↓') + ')' : ''),
      )
      .join('; ') +
    '. Empresas do grupo: ' +
    COMPANIES.map((c) => c.name).join(', ') +
    '.'

  return (
    <ParecerIaCard
      titulo="Pareceres IA — Gemini Flash"
      contexto={contexto}
      prompt="Você é o analista da diretoria do grupo Extrafruti. Analise os KPIs do Dashboard Executivo (faturamento YTD, EBITDA, margem bruta, recebível vencido, pagar 30d, turnover). Destaque riscos e oportunidades e dê 3 recomendações práticas para a reunião de resultados."
    />
  )
}
