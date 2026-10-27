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

// Ajustes PGE — T3: tela central de Parceiros/Contatos, usada em todo o
// sistema (tarefas obrigatórias, compartilhar WhatsApp/e-mail). Vínculo a
// CENTRO DE RESULTADO do Sankhya (TTRBC) via dropdown busca/filtro
// (hook /backend/v1/sankhya/centros-resultado, cache 24h).

const TIPOS = ['Parceiro', 'Contato', 'Fornecedor', 'Cliente']
const EMPRESAS = ['Extrafruti', 'Casafruti', 'FoldBox']

const fmtBRL = (v: any) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// T3h (21/10): MÁSCARAS de documento e telefone (Parceiros).
// Documento: detecta CPF (11 dígitos) vs CNPJ (14) pela QUANTIDADE digitada —
// máscara progressiva enquanto digita. Telefone: (27) 99999-9999 (cel) ou
// (27) 3333-3334 (fixo, 8 dígitos). Guarda COM máscara (padrão dos e-mails/PDF).
const soDigitos = (v: string) => String(v || '').replace(/\D/g, '')

const mascaraDocumento = (v: string): string => {
  const d = soDigitos(v).slice(0, 14)
  if (d.length <= 11) {
    // CPF: 000.000.000-00
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  // CNPJ: 00.000.000/0000-00
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

const mascaraTelefone = (v: string): string => {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 10) {
    // fixo ou cel antigo: (27) 3333-3334 / (27) 9999-9999
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  // celular 9 dígitos: (27) 99999-9999
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

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
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState<any | null>(null)
  const [logos, setLogos] = useState<any[]>([])
  // centros de resultado (Sankhya)
  const [centros, setCentros] = useState<any[]>([])
  const [centroBusca, setCentroBusca] = useState('')
  // T3: erro real do endpoint (ex.: grant Oracle pendente) — exibido no dialog
  const [centrosErro, setCentrosErro] = useState('')
  // T3c: autocomplete inline — lista carregada 1x (cache 24h no hook) e filtro
  // LOCAL enquanto digita; dropdown aberto = lista carregada + campo focado
  const [centrosCarregados, setCentrosCarregados] = useState(false)
  // T3g: dropdown recolhe ao selecionar / clicar fora
  const [dropAberto, setDropAberto] = useState(false)
  const centrosFiltrados = useMemo(() => {
    const q = (form.centro_resultado || '').trim().toLowerCase()
    if (!q) return centros
    return centros.filter(
      (c) =>
        (c.descricao || '').toLowerCase().includes(q) ||
        String(c.codigo || '')
          .toLowerCase()
          .includes(q),
    )
  }, [centros, form.centro_resultado])

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

  const buscarCentros = async (q: string) => {
    setCentrosErro('')
    try {
      const r = (await pb.send(
        '/backend/v1/sankhya/centros-resultado?busca=' + encodeURIComponent(q),
        { method: 'GET' },
      )) as any
      setCentros(r.itens || [])
      setCentrosCarregados(true)
      // T3: endpoint ok mas sem itens → mostra o motivo (fonte/erro)
      if (!(r.itens || []).length) {
        setCentrosErro(
          r.erro || (r.fonte === 'cache' ? 'Cache vazio — tente novamente em instantes.' : ''),
        )
      }
    } catch (e: any) {
      setCentros([])
      setCentrosCarregados(true)
      setCentrosErro(
        String(e?.response?.message || e?.message || e).slice(0, 200) ||
          'Falha ao consultar o Sankhya.',
      )
    }
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
    setForm({
      nome: '',
      tipo: 'Parceiro',
      empresa: 'Extrafruti',
      empresas: ['Extrafruti'],
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
    const listaEmpresasP = obterEmpresasParceiro(p)
    setForm({
      ...p,
      empresas: listaEmpresasP.length > 0 ? listaEmpresasP : [p.empresa || 'Extrafruti'],
      empresa: listaEmpresasP[0] || p.empresa || 'Extrafruti',
    })
    setEditando(p)
    setDialog(true)
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      const empresasSalvas =
        Array.isArray(form.empresas) && form.empresas.length > 0
          ? form.empresas
          : [form.empresa || 'Extrafruti']

      const dados: any = {
        nome: form.nome,
        tipo: form.tipo,
        empresa: empresasSalvas[0] || 'Extrafruti', // mantém compatibilidade com campo legado
        empresas: JSON.stringify(empresasSalvas), // suporta múltiplas empresas
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
            {/* TAREFA CONT: Seleção de MAIS DE UMA empresa com ícone ao lado do nome */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Empresas do Parceiro * (múltipla escolha)
                  </Label>
                  <span className="text-[11px] text-[#1B5E20] font-semibold">
                    {(form.empresas || []).length} selecionada(s)
                  </span>
                </div>
                {/* Dropdown com ícone ao lado do nome da empresa para alternar seleção */}
                <Select
                  value="placeholder"
                  onValueChange={(val) => {
                    if (val === 'placeholder') return
                    setForm((f: any) => {
                      const cur = Array.isArray(f.empresas)
                        ? f.empresas
                        : [f.empresa || 'Extrafruti']
                      const exists = cur.includes(val)
                      // Se desmarcar a única, mantém ao menos uma
                      if (exists && cur.length === 1) return f
                      const novas = exists ? cur.filter((x: string) => x !== val) : [...cur, val]
                      return {
                        ...f,
                        empresas: novas,
                        empresa: novas[0] || val,
                      }
                    })
                  }}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue placeholder="Adicionar/remover empresa..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placeholder" disabled>
                      Selecione uma empresa para alternar vínculo
                    </SelectItem>
                    {listaEmpresas.map((e) => {
                      const sel = (form.empresas || []).includes(e)
                      return (
                        <SelectItem key={e} value={e}>
                          <div className="flex items-center justify-between gap-3 w-full">
                            <div className="flex items-center gap-2">
                              {obterIconeEmpresa(e)}
                              <span
                                className={cn(
                                  'text-xs',
                                  sel ? 'font-bold text-[#1B5E20]' : 'text-gray-800',
                                )}
                              >
                                {e}
                              </span>
                            </div>
                            {sel && <Check className="h-3.5 w-3.5 text-[#1B5E20]" />}
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>

                {/* Badges/Tags clicáveis com os ícones das empresas */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {listaEmpresas.map((e) => {
                    const sel = (form.empresas || []).includes(e)
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => {
                          setForm((f: any) => {
                            const cur = Array.isArray(f.empresas)
                              ? f.empresas
                              : [f.empresa || 'Extrafruti']
                            const exists = cur.includes(e)
                            if (exists && cur.length === 1) return f
                            const novas = exists ? cur.filter((x: string) => x !== e) : [...cur, e]
                            return {
                              ...f,
                              empresas: novas,
                              empresa: novas[0] || e,
                            }
                          })
                        }}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer',
                          sel
                            ? 'bg-emerald-50 text-[#1B5E20] border-emerald-300 shadow-2xs'
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-800',
                        )}
                      >
                        {obterIconeEmpresa(e)}
                        <span>{e}</span>
                        {sel ? (
                          <Check className="h-3 w-3 ml-0.5 text-[#1B5E20]" />
                        ) : (
                          <Plus className="h-3 w-3 ml-0.5 text-gray-400" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  CPF/CNPJ
                </Label>
                <Input
                  value={form.documento || ''}
                  onChange={(e) =>
                    setForm({ ...form, documento: mascaraDocumento(e.target.value) })
                  }
                  className="h-10 bg-gray-50"
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  inputMode="numeric"
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
                  {/* T3b: WhatsApp e Telefone UNIFICADOS (grava nos 2 campos) */}
                  WhatsApp / Telefone
                </Label>
                <Input
                  value={form.whatsapp || form.telefone || ''}
                  onChange={(e) => {
                    const m = mascaraTelefone(e.target.value)
                    setForm({ ...form, whatsapp: m, telefone: m })
                  }}
                  className="h-10 bg-gray-50"
                  placeholder="(27) 99999-9999"
                  inputMode="tel"
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
            {/* T3c (21/10): AUTOCOMPLETE INLINE — filtra enquanto digita (cache 24h
                do hook, sem bater no ERP a cada tecla) e seleciona no clique, SEM
                2º dialog (ele derrubava o dialog de edição ao fechar — Radix).
                T3g: dropdown RECOLHE ao selecionar (estado dropAberto) e ao
                clicar fora (onBlur com relção ao container). */}
            <div
              className="grid gap-1.5 relative"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAberto(false)
              }}
            >
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Centro de resultado (Sankhya)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  value={form.centro_resultado || ''}
                  onChange={(e) => {
                    setForm({
                      ...form,
                      centro_resultado: e.target.value,
                      centro_resultado_codigo: '',
                    })
                    setCentroBusca(e.target.value)
                    setDropAberto(true)
                    if (!centrosCarregados) buscarCentros('')
                  }}
                  onFocus={() => {
                    setDropAberto(true)
                    if (!centrosCarregados) buscarCentros('')
                  }}
                  placeholder="digite para filtrar os centros..."
                  className="h-10 bg-gray-50 flex-1"
                />
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
              {centrosCarregados && dropAberto && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {centrosFiltrados.length > 0 ? (
                    centrosFiltrados.map((c) => (
                      <button
                        key={c.codigo}
                        type="button"
                        onClick={() => {
                          setForm({
                            ...form,
                            centro_resultado: c.descricao,
                            centro_resultado_codigo: c.codigo,
                          })
                          setDropAberto(false)
                        }}
                        className="block w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-[12px]"
                      >
                        <span className="font-semibold text-gray-800">{c.descricao}</span>
                        <span className="ml-2 text-gray-400 tabular-nums">{c.codigo}</span>
                      </button>
                    ))
                  ) : (
                    <p className="text-center text-[12px] text-gray-400 py-4">
                      {centrosErro || 'Nenhum centro encontrado.'}
                    </p>
                  )}
                </div>
              )}
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
