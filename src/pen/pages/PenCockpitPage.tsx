import { Link } from 'react-router-dom'
import { PEN } from '@/pen/tokens'
import { KpiCard, SectionHeader, SemaforoDot } from '@/pen/components'
import { usePenFiltro } from '@/pen/PenShell'

// ============================================================================
// FASE 0.1 — COCKPIT (tela inicial do /pen)
//
// Também vazia de conteúdo: os KPIs aparecem com "—" (sem dado) para provar
// que o componente trata ausência de dado em vez de mostrar zero falso, e o
// rodapé leva à vitrine de componentes — que é o que se quer validar no
// Portão 0.
// ============================================================================

export default function PenCockpitPage() {
  const { empresa, ciclo } = usePenFiltro()

  return (
    <div className="space-y-4">
      <SectionHeader
        titulo="Cockpit"
        descricao={`Visão consolidada do plano — ${empresa} · ${ciclo}`}
        acao={
          <Link
            to="/pen/components"
            className="px-2.5 py-1.5 text-[11.5px] font-bold"
            style={{ background: PEN.acento, color: '#FFFFFF', borderRadius: 8 }}
          >
            Ver componentes
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Faturamento do ciclo" valor={null} meta={null} />
        <KpiCard label="Margem de contribuição" valor={null} meta={null} formato="percentual" />
        <KpiCard label="Turnover operacional" valor={null} meta={3} formato="percentual" />
        <KpiCard label="Aderência ao plano" valor={null} meta={100} formato="percentual" />
      </div>

      <div
        className="p-4"
        style={{
          background: PEN.cartao,
          borderRadius: PEN.raio,
          border: `1px solid ${PEN.borda}`,
        }}
      >
        <p className="text-[13px] font-bold" style={{ color: PEN.texto }}>
          Fase 0 entregue — fundação pronta
        </p>
        <p className="mt-1 text-[12px] leading-relaxed" style={{ color: PEN.textoSecundario }}>
          Shell com as 8 telas navegáveis, filtro global de empresa e ciclo, e a biblioteca de
          componentes renderizando. Os indicadores acima estão sem dado de propósito: nenhuma tela
          desta fase calcula nada.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Shell e design system', 'verde'],
            ['Componentes base', 'verde'],
            ['8 rotas navegáveis', 'verde'],
            ['Conteúdo das telas', 'cinza'],
          ].map(([texto, nivel]) => (
            <div
              key={texto}
              className="flex items-center justify-between gap-2 px-2.5 py-2"
              style={{ background: '#FAFBFC', borderRadius: 8, border: `1px solid ${PEN.borda}` }}
            >
              <span className="text-[11.5px] font-medium" style={{ color: PEN.texto }}>
                {texto}
              </span>
              <SemaforoDot nivel={nivel as any} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
