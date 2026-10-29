import { useEffect, useState } from 'react'
import { Gauge, Loader2, Sparkles, X, Plus } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Fase 8 (prompt-mestre) — Indicadores: catálogo Negócio/Pessoas/Operações
// com metas; realizado vs meta vs anterior em semáforo (verde ≥ meta,
// amarelo até -5%, vermelho abaixo); gráfico 12m; dono e observações;
// visão consolidada e por empresa; "Parecer com IA" (Fase 9 ativa).

const parse = (v: any) => {
  if (Array.isArray(v)) return v
  try {
    return JSON.parse(v || '[]')
  } catch (_) {
    return []
  }
}

function semaforo(realizado: number, meta: number) {
  if (!meta) return { cor: 'bg-gray-100 text-gray-600', label: 'sem meta', dot: 'bg-gray-300' }
  const pct = (realizado / meta) * 100
  if (pct >= 100)
    return {
      cor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      label: 'na meta',
      dot: 'bg-emerald-500',
    }
  if (pct >= 95)
    return {
      cor: 'bg-amber-50 text-amber-700 border-amber-200',
      label: 'até -5%',
      dot: 'bg-amber-500',
    }
  return { cor: 'bg-red-50 text-red-700 border-red-200', label: 'abaixo', dot: 'bg-red-500' }
}

const fmtVal = (v: number, u?: string) => {
  if (u === 'R$ M') return 'R$ ' + v.toFixed(1).replace('.', ',') + 'M'
  if (u === '%') return v.toFixed(1).replace('.', ',') + '%'
  return String(v)
}

export default function IndicadoresCatalogoPage() {
  const { user } = useAuth()
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [fCat, setFCat] = useState('todas')
  const [fEmp, setFEmp] = useState('todas')
  const [detalhe, setDetalhe] = useState<any | null>(null)
  const [parecer, setParecer] = useState<any>(null)
  const [gerando, setGerando] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.collection('indicadores').getFullList({ sort: 'categoria,nome' })
      setItens(r as any[])
      setErro('')
    } catch (e) {
      setErro(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const filtrados = itens.filter(
    (i) => (fCat === 'todas' || i.categoria === fCat) && (fEmp === 'todas' || i.empresa === fEmp),
  )
  const empresas = Array.from(new Set(itens.map((i) => i.empresa)))

  const gerarParecer = async (ind: any) => {
    setGerando(true)
    setParecer(null)
    try {
      const serie = parse(ind.serie_12m)
      const r = (await pb.send('/backend/v1/ia/estruturado', {
        method: 'POST',
        body: JSON.stringify({
          modulo: 'indicadores',
          ref: ind.nome,
          contexto:
            'Indicador ' +
            ind.nome +
            ' (' +
            ind.categoria +
            ', ' +
            (ind.empresa || 'Grupo') +
            '): meta ' +
            fmtVal(ind.meta, ind.unidade_medida) +
            ', realizado ' +
            fmtVal(ind.realizado, ind.unidade_medida) +
            ', mês anterior ' +
            fmtVal(ind.anterior, ind.unidade_medida) +
            '. Série 12m: ' +
            serie.join(', ') +
            '. Observações: ' +
            (ind.observacoes || 'nenhuma') +
            '.',
          prompt:
            'Diagnostique este indicador: realizado vs meta vs anterior, causas prováveis do desvio e 3 ações corretivas priorizadas.',
        }),
      })) as any
      setParecer(r.estrutura)
    } catch (e) {
      setErro(String(e))
    } finally {
      setGerando(false)
    }
  }

  const abrirNovo = () => {
    setForm({
      nome: '',
      categoria: 'Negócio',
      empresa: '',
      unidade_medida: '%',
      meta: '',
      realizado: '',
      anterior: '',
      dono: '',
      observacoes: '',
    })
    setDialog(true)
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      await pb.collection('indicadores').create({
        nome: form.nome,
        categoria: form.categoria,
        empresa: form.empresa,
        unidade_medida: form.unidade_medida,
        meta: Number(form.meta) || 0,
        realizado: Number(form.realizado) || 0,
        anterior: Number(form.anterior) || 0,
        dono: form.dono,
        observacoes: form.observacoes,
        serie_12m: '[]',
        criado_por: user?.email || '',
      })
      setDialog(false)
      await carregar()
    } catch (e) {
      setErro(String(e))
    } finally {
      setSalvando(false)
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#1B5E20]" />
      </div>
    )

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Gauge className="h-6 w-6 text-[#1B5E20]" /> Indicadores
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Catálogo com metas — realizado vs meta vs anterior em semáforo
          </p>
        </div>
        <Button onClick={abrirNovo} className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white">
          <Plus className="h-4 w-4 mr-1" /> Novo indicador
        </Button>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      {/* filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={fCat} onValueChange={setFCat}>
          <SelectTrigger className="h-9 w-40 text-xs bg-gray-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            <SelectItem value="Negócio">Negócio</SelectItem>
            <SelectItem value="Pessoas">Pessoas</SelectItem>
            <SelectItem value="Operações">Operações</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fEmp} onValueChange={setFEmp}>
          <SelectTrigger className="h-9 w-44 text-xs bg-gray-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Consolidado (todas)</SelectItem>
            {empresas.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* grid de indicadores */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtrados.map((i) => {
          const sem = semaforo(i.realizado, i.meta)
          const serie = parse(i.serie_12m)
          const grafico = serie.map((v: number, idx: number) => ({
            mes: String(idx + 1),
            valor: v,
          }))
          return (
            <div
              key={i.id}
              className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="text-[14px] font-bold text-gray-900 leading-snug">{i.nome}</div>
                <span
                  className={cn(
                    'text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0',
                    sem.cor,
                  )}
                >
                  {sem.label}
                </span>
              </div>
              <div className="text-[11px] text-gray-500 mb-3">
                {i.categoria} · {i.empresa || 'Grupo'} · {i.dono || '—'}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
                    Meta
                  </div>
                  <div className="text-[13px] font-bold text-gray-700 tabular-nums">
                    {fmtVal(i.meta, i.unidade_medida)}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
                    Realizado
                  </div>
                  <div
                    className={cn(
                      'text-[13px] font-bold tabular-nums',
                      sem.dot === 'bg-emerald-500'
                        ? 'text-emerald-700'
                        : sem.dot === 'bg-amber-500'
                          ? 'text-amber-700'
                          : 'text-red-600',
                    )}
                  >
                    {fmtVal(i.realizado, i.unidade_medida)}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
                    Anterior
                  </div>
                  <div className="text-[13px] font-bold text-gray-500 tabular-nums">
                    {fmtVal(i.anterior, i.unidade_medida)}
                  </div>
                </div>
              </div>

              {grafico.length > 0 && (
                <div className="h-[80px] w-full mb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={grafico} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                      <XAxis dataKey="mes" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip
                        formatter={(v: any) => fmtVal(Number(v), i.unidade_medida)}
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: '1px solid #E5E7EB',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="valor"
                        stroke="#1B5E20"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {i.observacoes && (
                <p className="text-[11px] text-gray-500 mb-2 line-clamp-2">{i.observacoes}</p>
              )}

              <Button
                size="sm"
                onClick={() => {
                  setDetalhe(i)
                  setParecer(null)
                  gerarParecer(i)
                }}
                className="w-full h-8 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Parecer com IA
              </Button>
            </div>
          )
        })}
        {filtrados.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-10 col-span-full">
            Nenhum indicador no filtro.
          </p>
        )}
      </div>

      {/* Dialog novo */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>Novo indicador</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Nome *
              </Label>
              <Input
                value={form.nome || ''}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className="h-10 bg-gray-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Categoria
                </Label>
                <Select
                  value={form.categoria || 'Negócio'}
                  onValueChange={(v) => setForm({ ...form, categoria: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Negócio">Negócio</SelectItem>
                    <SelectItem value="Pessoas">Pessoas</SelectItem>
                    <SelectItem value="Operações">Operações</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Empresa
                </Label>
                <Input
                  value={form.empresa || ''}
                  onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                  className="h-10 bg-gray-50"
                  placeholder="Grupo"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="grid gap-1.5 col-span-1">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Unid.
                </Label>
                <Input
                  value={form.unidade_medida || '%'}
                  onChange={(e) => setForm({ ...form, unidade_medida: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Meta
                </Label>
                <Input
                  type="number"
                  value={form.meta ?? ''}
                  onChange={(e) => setForm({ ...form, meta: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Realiz.
                </Label>
                <Input
                  type="number"
                  value={form.realizado ?? ''}
                  onChange={(e) => setForm({ ...form, realizado: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Anter.
                </Label>
                <Input
                  type="number"
                  value={form.anterior ?? ''}
                  onChange={(e) => setForm({ ...form, anterior: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Dono
              </Label>
              <Input
                value={form.dono || ''}
                onChange={(e) => setForm({ ...form, dono: e.target.value })}
                className="h-10 bg-gray-50"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Observações
              </Label>
              <Textarea
                value={form.observacoes || ''}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)} className="h-9">
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={salvando || !form.nome}
              className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog parecer IA */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="bg-white w-full max-w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Parecer IA — {detalhe?.nome}</span>
              <button
                onClick={() => setDetalhe(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          {gerando && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[#1B5E20]" />
              <span className="ml-2 text-sm text-gray-500">Gerando parecer estruturado...</span>
            </div>
          )}
          {parecer && (
            <div className="space-y-3">
              {typeof parecer.score_saude === 'number' && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div
                    className={cn(
                      'h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg',
                      parecer.score_saude >= 7
                        ? 'bg-emerald-600'
                        : parecer.score_saude >= 5
                          ? 'bg-amber-500'
                          : 'bg-red-600',
                    )}
                  >
                    {parecer.score_saude}
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Score de saúde
                    </div>
                    <div className="text-[13px] text-gray-700">0-10</div>
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Sumário executivo
                </div>
                <p className="text-[13px] text-gray-800 leading-relaxed">
                  {parecer.sumario_executivo}
                </p>
              </div>
              {parecer.principais_achados?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Principais achados
                  </div>
                  <ul className="space-y-1">
                    {parecer.principais_achados.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-gray-700">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parecer.riscos_alertas?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Riscos e alertas
                  </div>
                  <ul className="space-y-1">
                    {parecer.riscos_alertas.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-red-700">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parecer.recomendacoes?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Recomendações priorizadas
                  </div>
                  <ol className="space-y-1">
                    {parecer.recomendacoes.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-gray-700">
                        {i + 1}. {a}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <p className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">
                {parecer.disclaimer || 'Análise assistida — não substitui contador/auditor.'}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
