import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Download, Clock, AlertTriangle } from 'lucide-react'
import { TITULOS_AP, TITULOS_AR, TituloAP, TituloAR } from '@/data/financeiroData'
import { csvHeader, idiomaSalvo } from '@/lib/i18n'
import { ParecerIaCard } from '@/components/ParecerIaCard'
import { useBotoes } from '@/services/botoes-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

// Fase 4 — Contas a Pagar & Receber: abas A/P e A/R, filtros (busca,
// empresa, status), aging buckets (a vencer, 1-30, 31-60, +60) e export CSV.

const HOJE = new Date('2026-10-18') // data de referência do mock
const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (iso: string) => {
  const p = iso.split('-') // parse por split — new Date('YYYY-MM-DD') é UTC e vira dia anterior no BRT
  return `${p[2]}/${p[1]}/${p[0]}`
}

function diasAtraso(vencimento: string): number {
  const p = vencimento.split('-')
  const venc = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
  return Math.floor((HOJE.getTime() - venc.getTime()) / 86400000)
}

interface TituloComum {
  id: string
  nome: string
  documento: string
  empresa: string
  emissao: string
  vencimento: string
  valor: number
  status: string
  categoria?: string
}

const paraComum = (t: TituloAP | TituloAR): TituloComum => ({
  id: t.id,
  nome: 'fornecedor' in t ? t.fornecedor : t.cliente,
  documento: t.documento,
  empresa: t.empresa,
  emissao: t.emissao,
  vencimento: t.vencimento,
  valor: t.valor,
  status: t.status,
  categoria: (t as TituloAP).categoria,
})

function AgingBuckets({ titulos }: { titulos: TituloComum[] }) {
  const abertos = titulos.filter((t) => t.status === 'aberto')
  const buckets = [
    { label: 'A vencer', v: 0, n: 0, cor: 'bg-emerald-600' },
    { label: '1–30 dias', v: 0, n: 0, cor: 'bg-amber-500' },
    { label: '31–60 dias', v: 0, n: 0, cor: 'bg-orange-500' },
    { label: '+60 dias', v: 0, n: 0, cor: 'bg-red-600' },
  ]
  abertos.forEach((t) => {
    const d = diasAtraso(t.vencimento)
    if (d <= 0) {
      buckets[0].v += t.valor
      buckets[0].n++
    } else if (d <= 30) {
      buckets[1].v += t.valor
      buckets[1].n++
    } else if (d <= 60) {
      buckets[2].v += t.valor
      buckets[2].n++
    } else {
      buckets[3].v += t.valor
      buckets[3].n++
    }
  })
  const total = buckets.reduce((a, b) => a + b.v, 0) || 1
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-bold text-gray-900">Aging — títulos em aberto</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {buckets.map((b) => (
          <div key={b.label} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
            <div className="flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', b.cor)} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                {b.label}
              </span>
            </div>
            <div className="text-sm font-bold text-gray-900 tabular-nums mt-1">{fmtBRL(b.v)}</div>
            <div className="text-[11px] text-gray-400">
              {b.n} título(s) · {((b.v / total) * 100).toFixed(0)}%
            </div>
            <div className="h-1.5 rounded-full bg-gray-200 mt-2 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', b.cor)}
                style={{ width: `${(b.v / total) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TabelaTitulos({ titulos, tipo }: { titulos: TituloComum[]; tipo: 'ap' | 'ar' }) {
  const [busca, setBusca] = useState('')
  const [empresa, setEmpresa] = useState('todas')
  const [status, setStatus] = useState('todos')
  const { pode } = useBotoes()

  const filtrados = titulos.filter((t) => {
    if (busca && !(t.nome + t.documento).toLowerCase().includes(busca.toLowerCase())) return false
    if (empresa !== 'todas' && t.empresa !== empresa) return false
    if (status === 'abertos' && t.status !== 'aberto') return false
    if (status === 'liquidados' && t.status === 'aberto') return false
    return true
  })

  const totalAberto = filtrados
    .filter((t) => t.status === 'aberto')
    .reduce((a, t) => a + t.valor, 0)
  const totalLiquidado = filtrados
    .filter((t) => t.status !== 'aberto')
    .reduce((a, t) => a + t.valor, 0)

  const exportCsv = () => {
    const header = csvHeader(idiomaSalvo(), [
      'csv_nome',
      'csv_documento',
      'csv_empresa',
      'csv_emissao',
      'csv_vencimento',
      'csv_valor',
      'csv_status',
    ])
    const rows = filtrados.map((t) => [
      t.nome,
      t.documento,
      t.empresa,
      fmtData(t.emissao),
      fmtData(t.vencimento),
      t.valor,
      t.status,
    ])
    const csv = [header, ...rows].map((r) => r.join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = tipo === 'ap' ? 'contas-a-pagar.csv' : 'contas-a-receber.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const atrasados = filtrados.filter((t) => t.status === 'aberto' && diasAtraso(t.vencimento) > 0)

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou documento..."
          className="h-9 w-56 text-xs bg-gray-50"
        />
        <Select value={empresa} onValueChange={setEmpresa}>
          <SelectTrigger className="h-9 w-36 text-xs bg-gray-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as empresas</SelectItem>
            <SelectItem value="extrafruti">Extrafruti</SelectItem>
            <SelectItem value="casafruti">Casafruti</SelectItem>
            <SelectItem value="foldbox">FoldBox</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-32 text-xs bg-gray-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="abertos">Em aberto</SelectItem>
            <SelectItem value="liquidados">Liquidados</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {atrasados.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-full">
              <AlertTriangle className="h-3 w-3" /> {atrasados.length} vencido(s)
            </span>
          )}
          {pode('financeiro', 'exportar_csv') && (
            <Button variant="outline" size="sm" onClick={exportCsv} className="h-9">
              <Download className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
          )}
        </div>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {tipo === 'ap' ? 'Total em aberto (pagar)' : 'Total em aberto (receber)'}
          </div>
          <div className="text-lg font-bold text-gray-900 tabular-nums mt-1">
            {fmtBRL(totalAberto)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {tipo === 'ap' ? 'Liquidado no período' : 'Recebido no período'}
          </div>
          <div className="text-lg font-bold text-emerald-700 tabular-nums mt-1">
            {fmtBRL(totalLiquidado)}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  {tipo === 'ap' ? 'Fornecedor' : 'Cliente'}
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Documento
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Empresa
                </th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Vencimento
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Valor
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((t) => {
                const atraso = t.status === 'aberto' ? diasAtraso(t.vencimento) : 0
                return (
                  <tr
                    key={t.id}
                    className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <div className="text-[13px] font-semibold text-gray-900">{t.nome}</div>
                      {t.categoria && (
                        <div className="text-[11px] text-gray-400">{t.categoria}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-600 tabular-nums">
                      {t.documento}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                        {t.empresa === 'extrafruti'
                          ? 'Extrafruti'
                          : t.empresa === 'casafruti'
                            ? 'Casafruti'
                            : 'FoldBox'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] tabular-nums">
                      <span className={cn(atraso > 0 && 'text-red-600 font-semibold')}>
                        {fmtData(t.vencimento)}
                      </span>
                      {atraso > 0 && (
                        <span className="block text-[10px] text-red-500">{atraso}d em atraso</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] font-bold text-gray-900 tabular-nums">
                      {fmtBRL(t.valor)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                          t.status === 'aberto'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        )}
                      >
                        {tipo === 'ap'
                          ? t.status === 'aberto'
                            ? 'Em aberto'
                            : 'Pago'
                          : t.status === 'aberto'
                            ? 'Em aberto'
                            : 'Recebido'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                    Nenhum título encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function ApArPage() {
  const ap = useMemo(() => TITULOS_AP.map(paraComum), [])
  const ar = useMemo(() => TITULOS_AR.map(paraComum), [])

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <ArrowDownToLine className="h-6 w-6 text-[#1B5E20]" />
            Contas a Pagar & Receber
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Títulos, aging e posição por empresa — referência 18/10/2026
          </p>
        </div>
      </div>

      <AgingBuckets titulos={[...ap, ...ar]} />

      <Tabs defaultValue="ap">
        <TabsList className="bg-gray-100 p-1 rounded-lg h-10">
          <TabsTrigger
            value="ap"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 text-[13px] font-semibold gap-1.5"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" /> A Pagar
          </TabsTrigger>
          <TabsTrigger
            value="ar"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 text-[13px] font-semibold gap-1.5"
          >
            <ArrowUpFromLine className="h-3.5 w-3.5" /> A Receber
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ap" className="mt-4">
          <TabelaTitulos titulos={ap} tipo="ap" />
        </TabsContent>
        <TabsContent value="ar" className="mt-4">
          <TabelaTitulos titulos={ar} tipo="ar" />
        </TabsContent>
      </Tabs>

      {/* Parecer IA — títulos (dados de demonstração) */}
      <ParecerIaCard
        titulo="Parecer IA — contas a pagar & receber"
        contexto={
          'Carteira de títulos (dados de demonstração, referência 18/10/2026): ' +
          'A/P: 12 títulos, total em aberto R$ 2,42M, vencidos R$ 191,6K (Insumos Tropicais 34d, Manutenção Frota 50d). ' +
          'A/R: 12 títulos, total em aberto R$ 2,60M, vencidos R$ 735,0K (Atacado Frutas Centro 21d, Varejo Fresh Market 39d, Distribuidora Capixaba 44d). ' +
          'Aging consolidado e top devedores visíveis na tela.'
        }
        prompt="Analise a carteira de títulos a pagar e receber. Destaque riscos de inadimplência (clientes vencidos), custo financeiro de atraso com fornecedores e dê 2-3 recomendações de cobrança/negociação."
      />
    </div>
  )
}
