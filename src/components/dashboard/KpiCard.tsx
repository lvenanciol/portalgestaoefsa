import { KPI } from '@/data/mockData'
import {
  DollarSign,
  TrendingUp,
  Percent,
  AlertTriangle,
  Clock,
  Users,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const iconMap = {
  'dollar-sign': DollarSign,
  'chart-line': TrendingUp,
  percent: Percent,
  'alert-triangle': AlertTriangle,
  clock: Clock,
  users: Users,
}

interface KpiCardProps {
  kpi: KPI
  index: number
}

export function KpiCard({ kpi, index }: KpiCardProps) {
  const Icon = iconMap[kpi.iconName] || DollarSign
  const isPositive = kpi.deltaType === 'positive'
  const hasDelta = Boolean(kpi.delta)

  const iconTheme = (() => {
    switch (kpi.iconName) {
      case 'dollar-sign':
        return { bg: 'bg-emerald-50', border: 'border-emerald-200/60', text: 'text-[#1B5E20]' }
      case 'chart-line':
        return { bg: 'bg-emerald-50', border: 'border-emerald-200/60', text: 'text-[#0F3D13]' }
      case 'percent':
        return { bg: 'bg-amber-50', border: 'border-amber-200/60', text: 'text-[#B45309]' }
      case 'alert-triangle':
        return { bg: 'bg-red-50', border: 'border-red-200/60', text: 'text-red-600' }
      case 'clock':
        return { bg: 'bg-emerald-50', border: 'border-emerald-200/60', text: 'text-[#1B5E20]' }
      case 'users':
        return { bg: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-700' }
      default:
        return { bg: 'bg-emerald-50', border: 'border-emerald-200/60', text: 'text-[#1B5E20]' }
    }
  })()

  return (
    <div
      className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-[3px] flex flex-col justify-between"
      style={{
        animation: `fade-in-up 400ms ease-out ${index * 50}ms both`,
      }}
    >
      {/* Topo: label uppercase + ícone */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-semibold text-gray-500 tracking-wider uppercase">
          {kpi.label}
        </span>
        <div
          className={cn(
            'h-9 w-9 rounded-lg border flex items-center justify-center shrink-0 shadow-2xs',
            iconTheme.bg,
            iconTheme.border,
            iconTheme.text,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>

      {/* Valor com numerais tabulares */}
      <div className="my-2">
        <div className="text-[28px] lg:text-[30px] font-extrabold text-[#111827] tracking-tight tabular-nums leading-none">
          {kpi.value}
        </div>
      </div>

      {/* Base: chip de variação (quando houver) */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 min-h-[28px]">
        {hasDelta ? (
          <div
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums',
              isPositive
                ? 'bg-emerald-50 text-[#16A34A] border border-emerald-200/50'
                : 'bg-red-50 text-[#DC2626] border border-red-200/50',
            )}
          >
            {isPositive ? (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />
            )}
            <span>{kpi.delta}</span>
          </div>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}
