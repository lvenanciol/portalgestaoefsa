import { useEffect, useMemo, useState } from 'react'
import {
  Users,
  Plus,
  Loader2,
  Search,
  X,
  Pencil,
  Trash2,
  Download,
  Building2,
  Check,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { useApp } from '@/context/AppContext'
import { idiomaSalvo, traduzir } from '@/lib/i18n'
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
import {
  ParceiroCadastroDialog,
  TIPOS_PARCEIRO as TIPOS,
} from '@/components/operacional/ParceiroCadastroDialog'

// Ajustes PGE — T3: tela central de Parceiros/Contatos, usada em todo o
// sistema (tarefas obrigatórias, compartilhar WhatsApp/e-mail). Vínculo a
// CENTRO DE RESULTADO do Sankhya (TTRBC) via dropdown busca/filtro
// (hook /backend/v1/sankhya/centros-resultado, cache 24h).

const EMPRESAS = ['Extrafruti', 'Casafruti', 'FoldBox']

export default function ParceirosPage() {
  const { user } = useAuth()
  const { empresas: empresasApp } = useApp()
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [fTipo, setFTipo] = useState('todos')
  const [fEmpresa, setFEmpresa] = useState('todas')
  const [dialog, setDialog] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [excluindo, setExcluindo] = useState<any | null>(null)
  const [logos, setLogos] = useState<any[]>([])

  const carregar = async () => {
    setLoading(true)
    try {
      const [r, l] = await Promise.all([
        pb.collection('parceiros').getFullList({ sort: 'nome' }),
        pb
          .collection('logomarcas')
          .getFullList()
          .catch(() => []),
      ])
      setItens(r as any[])
      setLogos(l as any[])
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

  // Lista unificada de empresas cadastradas no portal
  const listaEmpresas = useMemo(() => {
    if (empresasApp && empresasApp.length > 0) {
      return empresasApp.map((e) => e.nome)
    }
    return EMPRESAS
  }, [empresasApp])

  const obterIconeEmpresa = (nomeEmpresa: string) => {
    if (!nomeEmpresa) return null
    const norm = (s: any) =>
      String(s || '')
        .trim()
        .toLowerCase()
    const logoRec = logos.find((l) => norm(l.empresa) === norm(nomeEmpresa))
    const empRec = empresasApp.find((e) => norm(e.nome) === norm(nomeEmpresa))
    const cor = logoRec?.cor || empRec?.cor || '#1B5E20'
    const sigla =
      logoRec?.sigla ||
      (empRec ? empRec.nome.slice(0, 2).toUpperCase() : nomeEmpresa.slice(0, 2).toUpperCase())

    const urlImagem = (rec: any, campo: string) => {
      if (!rec || !rec[campo]) return ''
      return pb.files.getURL(rec, rec[campo])
    }
    const urlEmb = urlImagem(logoRec, 'emblema')
    const urlLogo = urlImagem(logoRec, 'logo')

    if (urlEmb) {
      return (
        <img
          src={urlEmb}
          alt={nomeEmpresa}
          className="h-4 w-4 object-contain rounded-xs shrink-0"
        />
      )
    }
    if (urlLogo) {
      return (
        <img
          src={urlLogo}
          alt={nomeEmpresa}
          className="h-4 w-4 object-contain rounded-xs shrink-0"
        />
      )
    }
    return (
      <span
        className="h-4 w-4 rounded-xs text-[8px] font-bold text-white flex items-center justify-center shrink-0"
        style={{ backgroundColor: cor }}
      >
        {sigla}
      </span>
    )
  }

  // Extrai array de empresas de um parceiro (compatibilidade múltipla + legado)
  const obterEmpresasParceiro = (p: any): string[] => {
    let lista: string[] = []
    if (p.empresas) {
      if (Array.isArray(p.empresas)) {
        lista = p.empresas
      } else {
        try {
          const parsed = JSON.parse(p.empresas)
          if (Array.isArray(parsed)) lista = parsed
        } catch {
          /* intentionally ignored */
        }
      }
    }
    if (lista.length === 0 && p.empresa) {
      lista = [p.empresa]
    }
    return lista.filter(Boolean)
  }

  const filtrados = itens.filter((i) => {
    if (
      busca &&
      !(i.nome + (i.email || '') + (i.documento || '')).toLowerCase().includes(busca.toLowerCase())
    )
      return false
    if (fTipo !== 'todos' && i.tipo !== fTipo) return false
    if (fEmpresa !== 'todas') {
      const emps = obterEmpresasParceiro(i)
      if (!emps.includes(fEmpresa)) return false
    }
    return true
  })

  const abrirNovo = () => {
    setEditando(null)
    setDialog(true)
  }

  const abrirEditar = (p: any) => {
    setEditando(p)
    setDialog(true)
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
    // COR-2: export respeita o idioma ativo
    const L = idiomaSalvo()
    const header = [
      traduzir(L, 'responsavel'),
      traduzir(L, 'status'),
      traduzir(L, 'empresa'),
      'CPF/CNPJ',
      'E-mail',
      'WhatsApp',
      'Telefone',
      traduzir(L, 'cargo') || 'Cargo',
      traduzir(L, 'padrao_contabil'),
      traduzir(L, 'ativo'),
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
          <SelectTrigger className="h-9 w-44 text-xs bg-gray-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as empresas</SelectItem>
            {listaEmpresas.map((e) => (
              <SelectItem key={e} value={e}>
                <div className="flex items-center gap-1.5">
                  {obterIconeEmpresa(e)}
                  <span>{e}</span>
                </div>
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
                <td className="px-4 py-2.5 text-[12px] text-gray-600">
                  {(() => {
                    const emps = obterEmpresasParceiro(p)
                    if (emps.length === 0) return '—'
                    return (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {emps.map((emp) => (
                          <span
                            key={emp}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-800 text-[11px] font-medium border border-gray-200"
                          >
                            {obterIconeEmpresa(emp)}
                            <span>{emp}</span>
                          </span>
                        ))}
                      </div>
                    )
                  })()}
                </td>
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

      {/* Dialog criar/editar parceiro (reutilizável) */}
      <ParceiroCadastroDialog
        open={dialog}
        onOpenChange={setDialog}
        editando={editando}
        onSalvo={carregar}
      />

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
