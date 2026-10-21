import { useEffect, useMemo, useState } from 'react'
import { Plus, Loader2, Search, Pencil, Trash2, Download, X, FileText } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import AditivosDialog from '@/components/operacional/AditivosDialog'
import { fmtDataBR } from '@/components/operacional/aditivos-utils'
import { useBotoes } from '@/services/botoes-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { fmtDataBRT } from '@/lib/brt'

// Fase 10 — CRUD genérico das telas operacionais (Documentos, Tarefas,
// Projetos, Atas, E-mails, Contratos): lista + busca + criar/editar/excluir,
// botões sob gate da Fase 9. Config dirigido (campos/colunas por tela).

export interface CampoDef {
  name: string
  label: string
  tipo: 'text' | 'textarea' | 'number' | 'date' | 'select'
  options?: string[]
  required?: boolean
  largura?: string
}

export interface CrudConfig {
  colecao: string
  gate: string // screen key p/ Fase 9
  titulo: string
  subtitulo: string
  campos: CampoDef[]
  colunas: { name: string; label: string; fmt?: (v: any) => string; badge?: boolean }[]
  buscaCampos: string[]
  seedVazio?: string
  acaoAditivos?: boolean // COR-3 F8: habilita botão de aditivos por contrato
}

const fmtData = (iso?: string) => {
  if (!iso) return '—'
  const d = iso.slice(0, 10).split('-')
  return `${d[2]}/${d[1]}/${d[0]}`
}

const fmtBRL = (v: any) =>
  typeof v === 'number'
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : '—'

export function fmtValor(col: string, v: any): string {
  if (col.includes('valor') || col === 'valor_mensal') return fmtBRL(v)
  if (col === 'data' || col === 'prazo' || col === 'inicio' || col === 'fim') return fmtData(v)
  // TAREFA TIME: created/updated são timestamps UTC — exibir em BRT (com hora)
  if (col === 'created' || col === 'updated') return fmtDataBRT(v)
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

export default function CrudPage({ config }: { config: CrudConfig }) {
  const { pode } = useBotoes()
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState<any | null>(null)
  // COR-3 F8: aditivos por contrato
  const [aditivoDe, setAditivoDe] = useState<any | null>(null)
  // vigência efetiva por contrato (último aditivo ou fim) — cache local
  const [vigEfetiva, setVigEfetiva] = useState<Record<string, string>>({})

  const carregarVigencias = async (ids: string[]) => {
    if (!config.acaoAditivos || !ids.length) return
    try {
      const r = await pb.collection('contratos_aditivos').getFullList({ sort: '-data' })
      const mapa: Record<string, string> = {}
      for (const a of r as any[]) {
        const cid = a.contrato_id
        if (cid && a.nova_vigencia && !mapa[cid]) mapa[cid] = a.nova_vigencia
      }
      setVigEfetiva(mapa)
    } catch (_) {
      /* coleção ainda sem migração aplicada — segue com fim do contrato */
    }
  }

  useEffect(() => {
    carregarVigencias(itens.map((i) => i.id))
  }, [itens, config.acaoAditivos])

  const carregar = async () => {
    setLoading(true)
    setErro('')
    try {
      const r = await pb.collection(config.colecao).getFullList({ sort: '-created' })
      setItens(r as any[])
    } catch (e) {
      setErro(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const filtrados = useMemo(
    () =>
      itens.filter(
        (i) =>
          !busca ||
          config.buscaCampos.some((c) =>
            String(i[c] || '')
              .toLowerCase()
              .includes(busca.toLowerCase()),
          ),
      ),
    [itens, busca, config],
  )

  const abrirNovo = () => {
    const f: Record<string, any> = {}
    config.campos.forEach((c) => (f[c.name] = c.tipo === 'number' ? '' : ''))
    setForm(f)
    setEditando(null)
    setDialogAberto(true)
  }

  const abrirEditar = (item: any) => {
    const f: Record<string, any> = {}
    config.campos.forEach((c) => (f[c.name] = item[c.name] ?? ''))
    setForm(f)
    setEditando(item)
    setDialogAberto(true)
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      const dados: Record<string, any> = {}
      config.campos.forEach((c) => {
        let v = form[c.name]
        if (c.tipo === 'number') v = v === '' ? null : Number(v)
        if (v === '') v = null
        dados[c.name] = v
      })
      if (editando) {
        await pb.collection(config.colecao).update(editando.id, dados)
      } else {
        dados.criado_por = pb.authStore.record?.email || ''
        await pb.collection(config.colecao).create(dados)
      }
      // Trilha de auditoria (best-effort) — toda ação manual CRUD
      try {
        await pb.send('/backend/v1/auditoria', {
          method: 'POST',
          body: JSON.stringify({
            acao: editando ? 'editar_registro' : 'criar_registro',
            modulo: config.colecao,
            detalhe:
              (editando ? 'Editou' : 'Criou') +
              ' em ' +
              config.colecao +
              (form.titulo ? ': ' + form.titulo : ''),
          }),
        })
      } catch (_) {
        /* best-effort */
      }
      setDialogAberto(false)
      await carregar()
    } catch (e) {
      setErro(String(e))
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async () => {
    if (!excluindo) return
    try {
      await pb.collection(config.colecao).delete(excluindo.id)
      setExcluindo(null)
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
  }

  const exportCsv = () => {
    const header = config.colunas.map((c) => c.label)
    const rows = filtrados.map((i) => config.colunas.map((c) => fmtValor(c.name, i[c.name])))
    const csv = [header, ...rows]
      .map((r) => r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(';'))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = config.colecao + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const badgeCor = (v: string) => {
    const positivos = ['concluida', 'concluido', 'ativo', 'enviado']
    const alertas = ['em_andamento', 'vencendo', 'pausado', 'alta']
    if (positivos.includes(v)) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    if (alertas.includes(v)) return 'bg-amber-50 text-amber-700 border-amber-200'
    if (v === 'erro' || v === 'encerrado') return 'bg-red-50 text-red-700 border-red-200'
    return 'bg-gray-100 text-gray-700 border-gray-200'
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight">
            {config.titulo}
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">{config.subtitulo}</p>
        </div>
        <div className="flex items-center gap-2">
          {pode(config.gate, 'exportar_csv') && (
            <Button variant="outline" size="sm" onClick={exportCsv} className="h-9">
              <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
            </Button>
          )}
          {pode(config.gate, 'novo') && (
            <Button
              size="sm"
              onClick={abrirNovo}
              className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              <Plus className="h-4 w-4 mr-1" /> Novo
            </Button>
          )}
        </div>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar..."
          className="h-9 pl-9 text-xs bg-gray-50"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[#1B5E20]" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  {config.colunas.map((c) => (
                    <th
                      key={c.name}
                      className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 whitespace-nowrap"
                    >
                      {c.label}
                    </th>
                  ))}
                  {pode(config.gate, 'editar') && (
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Ações
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((i) => (
                  <tr
                    key={i.id}
                    className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                  >
                    {config.colunas.map((c) => (
                      <td
                        key={c.name}
                        className="px-4 py-2.5 text-[12px] text-gray-700 whitespace-nowrap"
                      >
                        {c.badge ? (
                          <span
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                              badgeCor(String(i[c.name] || '')),
                            )}
                          >
                            {String(i[c.name] || '—').replace('_', ' ')}
                          </span>
                        ) : c.name === 'fim' && config.acaoAditivos ? (
                          // COR-3 F8: mostra a vigência EFETIVA (último aditivo) quando houver
                          <span className="flex items-center gap-1.5">
                            {fmtDataBR(vigEfetiva[i.id] || i.fim)}
                            {vigEfetiva[i.id] && (
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                                title="Vigência do último aditivo"
                              >
                                ADT
                              </span>
                            )}
                          </span>
                        ) : (
                          fmtValor(c.name, i[c.name])
                        )}
                      </td>
                    ))}
                    {pode(config.gate, 'editar') && (
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => abrirEditar(i)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                            aria-label="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {config.acaoAditivos && (
                            <button
                              type="button"
                              onClick={() => setAditivoDe(i)}
                              className="p-1.5 rounded-md text-gray-400 hover:text-emerald-700 hover:bg-emerald-50"
                              aria-label="Aditivos"
                              title="Aditivos"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {pode(config.gate, 'excluir') && (
                            <button
                              type="button"
                              onClick={() => setExcluindo(i)}
                              className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                              aria-label="Excluir"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td
                      colSpan={config.colunas.length + 1}
                      className="px-4 py-10 text-center text-sm text-gray-400"
                    >
                      {config.seedVazio || 'Nenhum registro.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="bg-white max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editando ? 'Editar' : 'Novo'} — {config.titulo}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {config.campos.map((c) => (
              <div key={c.name} className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {c.label}
                  {c.required ? ' *' : ''}
                </Label>
                {c.tipo === 'textarea' ? (
                  <Textarea
                    value={form[c.name] || ''}
                    onChange={(e) => setForm({ ...form, [c.name]: e.target.value })}
                    rows={3}
                  />
                ) : c.tipo === 'select' ? (
                  <Select
                    value={form[c.name] || ''}
                    onValueChange={(v) => setForm({ ...form, [c.name]: v })}
                  >
                    <SelectTrigger className="h-10 bg-gray-50">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(c.options || []).map((o) => (
                        <SelectItem key={o} value={o}>
                          {o.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : c.tipo === 'date' ? (
                  <Input
                    type="date"
                    value={(form[c.name] || '').slice(0, 10)}
                    onChange={(e) => setForm({ ...form, [c.name]: e.target.value })}
                    className="h-10 bg-gray-50"
                  />
                ) : c.tipo === 'number' ? (
                  <Input
                    type="number"
                    value={form[c.name] ?? ''}
                    onChange={(e) => setForm({ ...form, [c.name]: e.target.value })}
                    className="h-10 bg-gray-50"
                  />
                ) : (
                  <Input
                    value={form[c.name] || ''}
                    onChange={(e) => setForm({ ...form, [c.name]: e.target.value })}
                    className="h-10 bg-gray-50"
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} className="h-9">
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={salvando}
              className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* COR-3 F8: dialog de aditivos por contrato */}
      {config.acaoAditivos && (
        <AditivosDialog
          contrato={aditivoDe || { id: '', titulo: '', parte: '' }}
          open={!!aditivoDe}
          onClose={() => setAditivoDe(null)}
          onChange={carregar}
        />
      )}

      {/* Confirmar exclusão */}
      <Dialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <DialogContent className="bg-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir registro</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-gray-600">
            Confirma excluir{' '}
            <strong>{excluindo?.titulo || excluindo?.nome || 'este registro'}</strong>? A ação não
            pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindo(null)} className="h-9">
              Cancelar
            </Button>
            <Button onClick={excluir} className="h-9 bg-red-600 hover:bg-red-700 text-white">
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
