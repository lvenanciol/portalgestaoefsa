import { useEffect, useMemo, useState } from 'react'
import { Users, Plus, Loader2, Search, X, Pencil, Trash2, Download, Building2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
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

// Ajustes PGE — T3: tela central de Parceiros/Contatos, usada em todo o
// sistema (tarefas obrigatórias, compartilhar WhatsApp/e-mail). Vínculo a
// CENTRO DE RESULTADO do Sankhya (TTRBC) via dropdown busca/filtro
// (hook /backend/v1/sankhya/centros-resultado, cache 24h).

const TIPOS = ['Parceiro', 'Contato', 'Fornecedor', 'Cliente']
const EMPRESAS = ['Extrafruti', 'Casafruti', 'FoldBox']

const fmtBRL = (v: any) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ParceirosPage() {
  const { user } = useAuth()
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [fTipo, setFTipo] = useState('todos')
  const [fEmpresa, setFEmpresa] = useState('todas')
  const [dialog, setDialog] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState<any | null>(null)
  // centros de resultado (Sankhya)
  const [centros, setCentros] = useState<any[]>([])
  const [centroBusca, setCentroBusca] = useState('')
  const [centrosAberto, setCentrosAberto] = useState(false)

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.collection('parceiros').getFullList({ sort: 'nome' })
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

  const buscarCentros = async (q: string) => {
    try {
      const r = (await pb.send(
        '/backend/v1/sankhya/centros-resultado?busca=' + encodeURIComponent(q),
        { method: 'GET' },
      )) as any
      setCentros(r.itens || [])
    } catch (_) {
      setCentros([])
    }
  }

  const abrirCentros = () => {
    setCentrosAberto(true)
    buscarCentros(centroBusca)
  }

  const filtrados = itens.filter((i) => {
    if (
      busca &&
      !(i.nome + (i.email || '') + (i.documento || '')).toLowerCase().includes(busca.toLowerCase())
    )
      return false
    if (fTipo !== 'todos' && i.tipo !== fTipo) return false
    if (fEmpresa !== 'todas' && i.empresa !== fEmpresa) return false
    return true
  })

  const abrirNovo = () => {
    setForm({
      nome: '',
      tipo: 'Parceiro',
      empresa: 'Extrafruti',
      documento: '',
      email: '',
      whatsapp: '',
      telefone: '',
      cargo: '',
      centro_resultado: '',
      centro_resultado_codigo: '',
      observacao: '',
      ativo: true,
    })
    setEditando(null)
    setDialog(true)
  }

  const abrirEditar = (p: any) => {
    setForm({ ...p })
    setEditando(p)
    setDialog(true)
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      const dados = {
        nome: form.nome,
        tipo: form.tipo,
        empresa: form.empresa,
        documento: form.documento,
        email: form.email,
        whatsapp: form.whatsapp,
        telefone: form.telefone,
        cargo: form.cargo,
        centro_resultado: form.centro_resultado || '',
        centro_resultado_codigo: form.centro_resultado_codigo || '',
        observacao: form.observacao,
        ativo: !!form.ativo,
      }
      if (editando) await pb.collection('parceiros').update(editando.id, dados)
      else {
        dados.criado_por = user?.email || ''
        await pb.collection('parceiros').create(dados)
      }
      setDialog(false)
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
      await pb.collection('parceiros').delete(excluindo.id)
      setExcluindo(null)
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
  }

  const exportCsv = () => {
    const header = [
      'Nome',
      'Tipo',
      'Empresa',
      'Documento',
      'E-mail',
      'WhatsApp',
      'Telefone',
      'Cargo',
      'Centro de resultado',
      'Ativo',
    ]
    const rows = filtrados.map((i) => [
      i.nome,
      i.tipo,
      i.empresa,
      i.documento,
      i.email,
      i.whatsapp,
      i.telefone,
      i.cargo,
      i.centro_resultado,
      i.ativo ? 'Sim' : 'Não',
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((x) => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(';'))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'parceiros.csv'
    a.click()
    URL.revokeObjectURL(url)
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
            <Users className="h-6 w-6 text-[#1B5E20]" /> Parceiros & Contatos
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Cadastro central — usado em tarefas, compartilhamento e vínculo a centro de resultado
            (Sankhya)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv} className="h-9">
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </Button>
          <Button onClick={abrirNovo} className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white">
            <Plus className="h-4 w-4 mr-1" /> Novo parceiro
          </Button>
        </div>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar..."
            className="h-9 pl-9 text-xs bg-gray-50"
          />
        </div>
        <Select value={fTipo} onValueChange={setFTipo}>
          <SelectTrigger className="h-9 w-36 text-xs bg-gray-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {TIPOS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fEmpresa} onValueChange={setFEmpresa}>
          <SelectTrigger className="h-9 w-40 text-xs bg-gray-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as empresas</SelectItem>
            {EMPRESAS.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50/80 border-b border-gray-100">
            <tr>
              {['Nome', 'Tipo', 'Empresa', 'Contato', 'Centro de resultado', 'Ações'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                <td className="px-4 py-2.5 text-[12px] font-semibold text-gray-800">
                  {p.nome}
                  {!p.ativo && (
                    <span className="ml-2 text-[9px] font-bold text-gray-400">INATIVO</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-[#1B5E20] border border-emerald-200/60">
                    {p.tipo}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[12px] text-gray-600">{p.empresa || '—'}</td>
                <td className="px-4 py-2.5 text-[12px] text-gray-600">
                  {p.email && <div>{p.email}</div>}
                  {(p.whatsapp || p.telefone) && (
                    <div className="text-gray-400">{p.whatsapp || p.telefone}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-gray-600">
                  {p.centro_resultado ? (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-gray-400" /> {p.centro_resultado}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => abrirEditar(p)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcluindo(p)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                  Nenhum parceiro. Use "Novo parceiro" para cadastrar o primeiro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog criar/editar */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar' : 'Novo'} parceiro/contato</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
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
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Tipo
                </Label>
                <Select
                  value={form.tipo || 'Parceiro'}
                  onValueChange={(v) => setForm({ ...form, tipo: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Empresa
                </Label>
                <Select
                  value={form.empresa || 'Extrafruti'}
                  onValueChange={(v) => setForm({ ...form, empresa: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPRESAS.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  CPF/CNPJ
                </Label>
                <Input
                  value={form.documento || ''}
                  onChange={(e) => setForm({ ...form, documento: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  E-mail
                </Label>
                <Input
                  value={form.email || ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  WhatsApp
                </Label>
                <Input
                  value={form.whatsapp || ''}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  className="h-10 bg-gray-50"
                  placeholder="27999999999"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Telefone
                </Label>
                <Input
                  value={form.telefone || ''}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Cargo
                </Label>
                <Input
                  value={form.cargo || ''}
                  onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
            </div>
            {/* Centro de resultado — dropdown busca/filtro Sankhya */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Centro de resultado (Sankhya)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  value={form.centro_resultado || ''}
                  readOnly
                  placeholder="nenhum vínculo"
                  className="h-10 bg-gray-50 flex-1"
                />
                <Button variant="outline" size="sm" onClick={abrirCentros} className="h-10">
                  Buscar…
                </Button>
                {form.centro_resultado && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm({ ...form, centro_resultado: '', centro_resultado_codigo: '' })
                    }
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Observação
              </Label>
              <Textarea
                value={form.observacao || ''}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-[12px] text-gray-700">Ativo</span>
              <Switch
                checked={!!form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })}
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

      {/* Dialog busca centro de resultado */}
      <Dialog open={centrosAberto} onOpenChange={setCentrosAberto}>
        <DialogContent className="bg-white max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Centro de resultado — Sankhya (TTRBC)</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={centroBusca}
              onChange={(e) => {
                setCentroBusca(e.target.value)
                buscarCentros(e.target.value)
              }}
              placeholder="Filtrar por descrição ou código..."
              className="h-10 pl-9 bg-gray-50"
            />
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {centros.map((c) => (
              <button
                key={c.codigo}
                type="button"
                onClick={() => {
                  setForm({
                    ...form,
                    centro_resultado: c.descricao,
                    centro_resultado_codigo: c.codigo,
                  })
                  setCentrosAberto(false)
                }}
                className="block w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-[12px]"
              >
                <span className="font-semibold text-gray-800">{c.descricao}</span>
                <span className="ml-2 text-gray-400 tabular-nums">{c.codigo}</span>
              </button>
            ))}
            {centros.length === 0 && (
              <p className="text-center text-[12px] text-gray-400 py-6">
                Nenhum centro encontrado.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <Dialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <DialogContent className="bg-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir parceiro</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-gray-600">
            Confirma excluir <strong>{excluindo?.nome}</strong>? A ação não pode ser desfeita.
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
