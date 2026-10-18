import { Sparkles, ArrowRight } from 'lucide-react'

// SPEC: card Pareceres IA — Gemini Flash com botão "Gerar parecer"
export function AiInsightsCard() {
  return (
    <div
      className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-[3px] flex flex-col justify-between"
      style={{
        animation: 'fade-in-up 400ms ease-out 600ms both',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-[#1B5E20]">
          <Sparkles className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-bold text-gray-900">Pareceres IA — Gemini Flash</h3>
      </div>

      <p className="text-[12px] text-gray-600 leading-relaxed mb-4">
        Analise dados, gere insights e receba recomendações estratégicas com IA.
      </p>

      <button
        type="button"
        className="inline-flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-[13px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/40"
      >
        <Sparkles className="h-4 w-4" />
        Gerar parecer
        <ArrowRight className="h-3.5 w-3.5 opacity-70" />
      </button>
    </div>
  )
}
