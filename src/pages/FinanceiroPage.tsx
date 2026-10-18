import { useState } from 'react'
import {
  Database,
  Table2,
  Waves,
  ArrowDownToLine,
  Scale,
  ClipboardCheck,
  Download,
} from 'lucide-react'
import RealPage from './financeiro/RealPage'
import DrePage from './financeiro/DrePage'
import FluxoPage from './financeiro/FluxoPage'
import ApArPage from './financeiro/ApArPage'
import BalancetePage from './financeiro/BalancetePage'
import FechamentoPage from './financeiro/FechamentoPage'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// Fase 4 — Financeiro & Contábil: 5 módulos em abas na rota /financeiro.

const ABAS = [
  { value: 'real', label: 'Real (Sankhya)', icon: Database },
  { value: 'dre', label: 'DRE', icon: Table2 },
  { value: 'fluxo', label: 'Fluxo de Caixa', icon: Waves },
  { value: 'ap_ar', label: 'A Pagar & Receber', icon: ArrowDownToLine },
  { value: 'balancete', label: 'Balancete', icon: Scale },
  { value: 'fechamento', label: 'Fechamento', icon: ClipboardCheck },
]

export default function FinanceiroPage() {
  const [aba, setAba] = useState('real')

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight">
            Financeiro & Contábil
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            DRE, fluxo de caixa, títulos, balancete e fechamento — dados de demonstração
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] font-semibold text-amber-700">
          <Download className="h-3.5 w-3.5" />
          Mock — integração Sankhya na Fase 5
        </span>
        <div className="hidden sm:block" />
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="bg-gray-100 p-1 rounded-lg h-10 w-full justify-start overflow-x-auto">
          {ABAS.map((a) => {
            const Icon = a.icon
            return (
              <TabsTrigger
                key={a.value}
                value={a.value}
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-3.5 text-[13px] font-semibold gap-1.5 whitespace-nowrap"
              >
                <Icon className="h-3.5 w-3.5" />
                {a.label}
              </TabsTrigger>
            )
          })}
        </TabsList>
        <TabsContent value="real" className="mt-4">
          <RealPage />
        </TabsContent>
        <TabsContent value="dre" className="mt-4">
          <DrePage />
        </TabsContent>
        <TabsContent value="fluxo" className="mt-4">
          <FluxoPage />
        </TabsContent>
        <TabsContent value="ap_ar" className="mt-4">
          <ApArPage />
        </TabsContent>
        <TabsContent value="balancete" className="mt-4">
          <BalancetePage />
        </TabsContent>
        <TabsContent value="fechamento" className="mt-4">
          <FechamentoPage />
        </TabsContent>
      </Tabs>
    </div>
  )
}
