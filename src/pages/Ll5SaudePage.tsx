import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Settings,
  Loader2,
  ChevronRight,
  GripVertical,
  Pencil,
  Copy,
  Trash2,
  X,
  RotateCcw,
  Footprints,
  BriefcaseMedical,
  Dumbbell,
  Scale,
  LayoutGrid,
  Sparkles,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useLl5 } from '@/ll5/Ll5Context'
import { listar, criar, atualizar, excluirLogico } from '@/ll5/repo'
import { criarAba, executarSeed, contarRegistros } from '@/ll5/seed'
import RunningTab from '@/ll5/tabs/RunningTab'
import TratamentosTab from '@/ll5/tabs/TratamentosTab'
import GymTab from '@/ll5/tabs/GymTab'
import ComposicaoTab from '@/ll5/tabs/ComposicaoTab'

// ============================================================================
// LL5 — SAÚDE (15/11/2026)
//
// A barra de abas é 100% DINÂMICA: lê ll5_tabs e renderiza o que existir.
// Não há aba hard-coded. As 4 abas iniciais nascem pelo mesmo `criarAba()`
// que o botão "＋ Aba" usa (seed.ts).
//
// Renderização por template_type. Aba criada com template 'composicao' abre
// exatamente o mesmo formulário da aba de Composição Corporal original.
// ============================================================================

const ICONES: Record<string, any> = {
  footprints: Footprints,
  'briefcase-medical': BriefcaseMedical,
  dumbbell: Dumbbell,
  scale: Scale,
  'layout-grid': LayoutGrid,
  sparkles: Sparkles,
}

const TEMPLATES = [
  { v: 'running', l: 'Corrida / Running' },
  { v: 'tratamentos', l: 'Tratamentos' },
  { v: 'gym', l: 'Treino de força (GYM)' },
  { v: 'composicao', l: 'Composição Corporal' },
  { v: 'custom', l: 'Personalizada (vazia)' },
]

export default function Ll5SaudePage() {
  const { ator, isAdmin, ownerAtual, setOwnerAtual, owners } = useLl5()
  const [abas, setAbas] = useState<any[]>([])
  const [abaAtiva, setAbaAtiva] = useState<string>('')
  const [carregando, setCarregando] = useState(true)
  const [gerenciarOpen, setGerenciarOpen] = useState(false)
  const [semeando, setSemeando] = useState(false)

  const carregarAbas = async () => {
    setCarregando(true)
    try {
      const todas = await listar('ll5_tabs', ator, {
        ownerEscolhido: ownerAtual,
        sort: 'ordem',
      })
      const ativas = todas.filter((t) => t.ativo && !t.deletado_em)
      setAbas(ativas)
      setAbaAtiva((prev) => (ativas.some((a) => a.id === prev) ? prev : ativas[0]?.id || ''))
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (!ator.id) return
    carregarAbas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ator.id, ownerAtual])

  const aba = useMemo(() => abas.find((a) => a.id === abaAtiva), [abas, abaAtiva])

  const rodarSeed = async () => {
    setSemeando(true)
    try {
      const r = await executarSeed(ator, ownerAtual)
      toast({
        title: r.pulado ? 'Seed já aplicado' : 'Dados carregados',
        description: r.mensagem,
      })
      await carregarAbas()
    } catch (e: any) {
      toast({
        title: 'Falha no seed',
        description: e?.message || String(e),
        variant: 'destructive',
      })
    } finally {
      setSemeando(false)
    }
  }

  // ---------------------------------------------------------------- render
  const renderConteudo = () => {
    if (carregando) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[#1b5e20]" />
        </div>
      )
    }
    if (abas.length === 0) {
      return (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
            <LayoutGrid className="h-6 w-6 text-[#1b5e20]" />
          </div>
          <h3 className="text-sm font-bold text-gray-900">Nenhuma aba criada ainda</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            As abas de Saúde são criadas por você. Comece carregando a base inicial ou crie a
            primeira aba manualmente.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button
              onClick={rodarSeed}
              disabled={semeando}
              className="h-9 bg-[#1b5e20] hover:bg-[#0F3D13] text-white text-xs"
            >
              {semeando ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              Carregar base inicial
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => setGerenciarOpen(true)}
                className="h-9 text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Criar primeira aba
              </Button>
            )}
          </div>
        </div>
      )
    }
    if (!aba) return null

    switch (aba.template_type) {
      case 'running':
        return <RunningTab aba={aba} />
      case 'tratamentos':
        return <TratamentosTab aba={aba} />
      case 'gym':
        return <GymTab aba={aba} />
      case 'composicao':
        return <ComposicaoTab aba={aba} />
      default:
        return (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <h3 className="text-sm font-bold text-gray-900">Aba personalizada</h3>
            <p className="text-xs text-gray-500 mt-1">
              Esta aba usa o template <strong>personalizado</strong> e ainda não tem campos. Edite a
              aba em "Gerenciar abas" para escolher outro tipo.
            </p>
          </div>
        )
    }
  }

  return (
    <div className="space-y-4 pb-8">
      {/* breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12px] text-gray-500">
        <span>LL5</span>
        <ChevronRight className="h-3 w-3" />
        <span>Saúde</span>
        {aba && (
          <>
            <ChevronRight className="h-3 w-3" />
            <span className="text-gray-800 font-semibold">{aba.nome}</span>
          </>
        )}
      </nav>

      {/* cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-[28px] font-bold text-gray-900 tracking-tight">Saúde</h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Assuntos pessoais do titular — exames, treinos e tratamentos
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* seletor de owner — SÓ admin */}
          {isAdmin && owners.length > 0 && (
            <Select value={ownerAtual} onValueChange={setOwnerAtual}>
              <SelectTrigger className="h-9 w-[200px] text-xs bg-white">
                <SelectValue placeholder="Proprietário" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200 z-[120]">
                {owners.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="text-[12px]">
                    {o.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* barra de abas */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-200">
        <div className="flex items-center gap-1 overflow-x-auto">
          {abas.map((a) => {
            const Ico = ICONES[a.icone] || LayoutGrid
            const ativa = a.id === abaAtiva
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAbaAtiva(a.id)}
                className={cn(
                  'relative inline-flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
                  ativa ? 'text-[#1b5e20]' : 'text-gray-500 hover:text-gray-800',
                )}
              >
                <Ico className="h-3.5 w-3.5" />
                {a.nome}
                {ativa && (
                  <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#1b5e20] rounded-full" />
                )}
              </button>
            )
          })}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1.5 shrink-0 pb-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGerenciarOpen(true)}
              className="h-8 text-[12px]"
            >
              <Settings className="h-3.5 w-3.5 mr-1.5" /> Gerenciar abas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGerenciarOpen(true)}
              className="h-8 text-[12px]"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Aba
            </Button>
          </div>
        )}
      </div>

      {/* conteúdo */}
      {renderConteudo()}

      {/* modal gerenciar abas */}
      <GerenciarAbasDialog
        open={gerenciarOpen}
        onOpenChange={setGerenciarOpen}
        onMudou={carregarAbas}
      />
    </div>
  )
}

// ============================================================================
// MODAL GERENCIAR ABAS (mockup 4)
// ============================================================================
function GerenciarAbasDialog({
  open,
  onOpenChange,
  onMudou,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onMudou: () => void
}) {
  const { ator, isAdmin, ownerAtual } = useLl5()
  const [abas, setAbas] = useState<any[]>([])
  const [contagens, setContagens] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [arrastando, setArrastando] = useState<number | null>(null)
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null)

  // formulário lateral
  const [f, setF] = useState({
    nome: '',
    icone: 'layout-grid',
    ordem: 1,
    template_type: 'custom',
    fontes: [] as string[],
    ia_habilitada: true,
    instrucao_ia: '',
  })

  const carregar = async () => {
    setCarregando(true)
    try {
      const todas = await listar('ll5_tabs', ator, { ownerEscolhido: ownerAtual, sort: 'ordem' })
      setAbas(todas)
      const c: Record<string, number> = {}
      for (const t of todas) {
        c[t.id] = await contarRegistros(ator, ownerAtual, t.template_type)
      }
      setContagens(c)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (open) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ownerAtual])

  const selecionar = (a: any) => {
    setEditando(a)
    setF({
      nome: a.nome || '',
      icone: a.icone || 'layout-grid',
      ordem: a.ordem || 1,
      template_type: a.template_type || 'custom',
      fontes: Array.isArray(a.fontes_dados) ? a.fontes_dados : [],
      ia_habilitada: !!a.ia_habilitada,
      instrucao_ia: a.instrucao_ia || '',
    })
  }

  const novaAba = async () => {
    try {
      const ordem = Math.max(0, ...abas.map((a) => a.ordem || 0)) + 1
      const rec = await criarAba(ator, ownerAtual, {
        nome: 'Nova aba',
        icone: 'layout-grid',
        cor: '#1b5e20',
        ordem,
        template_type: 'custom',
        ia_habilitada: true,
      })
      await carregar()
      selecionar(rec)
      onMudou()
    } catch (e: any) {
      toast({ title: 'Falha ao criar aba', description: e?.message, variant: 'destructive' })
    }
  }

  const salvar = async () => {
    if (!editando) return
    if (!f.nome.trim()) {
      toast({ title: 'Informe o nome da aba', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      await atualizar('ll5_tabs', ator, editando.id, {
        nome: f.nome.trim(),
        icone: f.icone,
        ordem: Number(f.ordem) || 1,
        template_type: f.template_type,
        fontes_dados: f.fontes,
        ia_habilitada: f.ia_habilitada,
        instrucao_ia: f.instrucao_ia,
      })
      toast({ title: 'Aba atualizada' })
      await carregar()
      onMudou()
    } catch (e: any) {
      toast({ title: 'Falha ao salvar', description: e?.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  const duplicar = async (a: any) => {
    try {
      const ordem = Math.max(0, ...abas.map((x) => x.ordem || 0)) + 1
      await criar(
        'll5_tabs',
        ator,
        {
          nome: a.nome + ' (cópia)',
          icone: a.icone,
          cor: a.cor,
          ordem,
          template_type: a.template_type,
          schema_template: a.schema_template,
          fontes_dados: a.fontes_dados || [],
          ia_habilitada: !!a.ia_habilitada,
          instrucao_ia: a.instrucao_ia || '',
          ativo: true,
          demo: a.demo,
        },
        ownerAtual,
      )
      toast({
        title: 'Aba duplicada',
        description: 'A cópia usa o mesmo template e uma série de dados independente.',
      })
      await carregar()
      onMudou()
    } catch (e: any) {
      toast({ title: 'Falha ao duplicar', description: e?.message, variant: 'destructive' })
    }
  }

  const excluir = async (id: string) => {
    try {
      await excluirLogico('ll5_tabs', ator, id)
      toast({ title: 'Aba desativada', description: 'Os dados foram preservados.' })
      setConfirmarExcluir(null)
      setEditando(null)
      await carregar()
      onMudou()
    } catch (e: any) {
      toast({ title: 'Falha ao excluir', description: e?.message, variant: 'destructive' })
    }
  }

  const reativar = async (a: any) => {
    try {
      await atualizar('ll5_tabs', ator, a.id, { ativo: true, deletado_em: null })
      await carregar()
      onMudou()
    } catch (e: any) {
      toast({ title: 'Falha ao reativar', description: e?.message, variant: 'destructive' })
    }
  }

  // drag-and-drop simples com HTML5
  const soltarEm = async (destinoIdx: number) => {
    if (arrastando === null || arrastando === destinoIdx) return
    const lista = [...abas]
    const [movida] = lista.splice(arrastando, 1)
    lista.splice(destinoIdx, 0, movida)
    setArrastando(null)
    setAbas(lista)
    // persiste a nova ordem
    try {
      for (let i = 0; i < lista.length; i++) {
        if (lista[i].ordem !== i + 1) {
          await atualizar('ll5_tabs', ator, lista[i].id, { ordem: i + 1 })
        }
      }
      onMudou()
    } catch (_e) {
      // reordenação parcial: os itens já movidos permanecem na nova posição
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
          <DialogTitle className="text-lg font-bold text-[#1b5e20]">
            Gerenciar abas — Saúde
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            Arraste para reordenar, edite ou crie novas abas
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] max-h-[70vh]">
          {/* lista */}
          <div className="p-4 overflow-y-auto border-r border-gray-100">
            {carregando ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-[#1b5e20]" />
              </div>
            ) : (
              <div className="space-y-2">
                {abas.map((a, idx) => {
                  const Ico = ICONES[a.icone] || LayoutGrid
                  const ativa = a.ativo && !a.deletado_em
                  return (
                    <div
                      key={a.id}
                      draggable
                      onDragStart={() => setArrastando(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => soltarEm(idx)}
                      onClick={() => selecionar(a)}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors',
                        editando?.id === a.id
                          ? 'border-[#1b5e20] bg-emerald-50/50'
                          : 'border-gray-200 bg-white hover:bg-gray-50',
                        !ativa && 'border-dashed opacity-70',
                      )}
                    >
                      <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0 cursor-grab" />
                      <Ico className="h-4 w-4 shrink-0" style={{ color: a.cor || '#1b5e20' }} />
                      <span className="text-[13px] font-semibold text-gray-900 truncate">
                        {a.nome}
                      </span>
                      <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
                        {contagens[a.id] ?? 0}
                      </span>
                      {!ativa && (
                        <span className="text-[10px] font-bold text-gray-400 uppercase shrink-0">
                          Inativa
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            selecionar(a)
                          }}
                          className="p-1 rounded hover:bg-gray-100 text-gray-500"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            duplicar(a)
                          }}
                          className="p-1 rounded hover:bg-gray-100 text-gray-500"
                          title="Duplicar"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmarExcluir(a.id)
                          }}
                          className="p-1 rounded hover:bg-red-50 text-red-500"
                          title="Excluir (desativa)"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}

                <button
                  type="button"
                  onClick={novaAba}
                  className="w-full py-2.5 rounded-lg border border-dashed border-gray-300 text-[12px] font-semibold text-gray-600 hover:border-[#1b5e20] hover:text-[#1b5e20] transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" /> Nova aba
                </button>

                {/* abas desativadas */}
                {abas.filter((a) => !a.ativo || a.deletado_em).length > 0 && (
                  <div className="pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                      Desativadas
                    </p>
                    {abas
                      .filter((a) => !a.ativo || a.deletado_em)
                      .map((a) => (
                        <div
                          key={'off-' + a.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-gray-500"
                        >
                          <span className="truncate">{a.nome}</span>
                          <button
                            type="button"
                            onClick={() => reativar(a)}
                            className="ml-auto text-[11px] font-semibold text-[#1b5e20] hover:underline"
                          >
                            Reativar
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* painel editar */}
          <div className="p-4 overflow-y-auto bg-gray-50/60">
            {!editando ? (
              <div className="text-center py-10 text-[12px] text-gray-500">
                Selecione uma aba para editar
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[12px] font-bold text-gray-900">Editar aba: {editando.nome}</p>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500">Nome da aba</Label>
                  <Input
                    value={f.nome}
                    onChange={(e) => setF({ ...f, nome: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-gray-500">Ícone</Label>
                    <Select value={f.icone} onValueChange={(v) => setF({ ...f, icone: v })}>
                      <SelectTrigger className="h-8 text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white z-[130]">
                        {Object.keys(ICONES).map((ic) => (
                          <SelectItem key={ic} value={ic} className="text-[12px]">
                            {ic}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-gray-500">Ordem</Label>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-7 p-0"
                        onClick={() => setF({ ...f, ordem: Math.max(1, f.ordem - 1) })}
                      >
                        −
                      </Button>
                      <span className="flex-1 text-center text-[12px] font-semibold tabular-nums">
                        {f.ordem}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-7 p-0"
                        onClick={() => setF({ ...f, ordem: f.ordem + 1 })}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500">Tipo de aba</Label>
                  <Select
                    value={f.template_type}
                    onValueChange={(v) => setF({ ...f, template_type: v })}
                  >
                    <SelectTrigger className="h-8 text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white z-[130]">
                      {TEMPLATES.map((t) => (
                        <SelectItem key={t.v} value={t.v} className="text-[12px]">
                          {t.l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500">Fonte de dados</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { id: 'garmin', l: 'Garmin', ok: false },
                      { id: 'apple', l: 'Apple Watch', ok: false },
                    ].map((src) => {
                      const sel = f.fontes.includes(src.id)
                      return (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() =>
                            setF({
                              ...f,
                              fontes: sel
                                ? f.fontes.filter((x) => x !== src.id)
                                : [...f.fontes, src.id],
                            })
                          }
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-semibold transition-colors',
                            sel
                              ? 'border-[#1b5e20] bg-emerald-50 text-[#1b5e20]'
                              : 'border-gray-300 bg-white text-gray-600',
                          )}
                          title={
                            src.id === 'garmin'
                              ? 'Requer aprovação no Garmin Connect Developer Program'
                              : 'HealthKit não tem API server-side'
                          }
                        >
                          {sel && <Check className="h-3 w-3" />}
                          {src.l}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Nenhum dispositivo está conectado neste ciclo — os dados são de demonstração.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-semibold text-gray-500">IA habilitada</Label>
                  <Switch
                    checked={f.ia_habilitada}
                    onCheckedChange={(v) => setF({ ...f, ia_habilitada: v })}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500">
                    Instrução de contexto para a IA
                  </Label>
                  <Textarea
                    value={f.instrucao_ia}
                    onChange={(e) => setF({ ...f, instrucao_ia: e.target.value })}
                    rows={3}
                    className="text-[12px]"
                    placeholder="Analise o desempenho, compare evolução…"
                  />
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <Button
                    size="sm"
                    onClick={salvar}
                    disabled={salvando}
                    className="h-8 text-[12px] bg-[#1b5e20] hover:bg-[#0F3D13] text-white flex-1"
                  >
                    {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar aba'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditando(null)}
                    className="h-8 text-[12px]"
                  >
                    Cancelar
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmarExcluir(editando.id)}
                  className="text-[11px] font-semibold text-red-600 hover:underline"
                >
                  Excluir aba
                </button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[10.5px] text-gray-400">Alterações afetam apenas a sua visão</p>
          <Button
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-[12px] bg-[#1b5e20] hover:bg-[#0F3D13] text-white"
          >
            Concluir
          </Button>
        </DialogFooter>

        {/* confirmação de exclusão */}
        <Dialog open={!!confirmarExcluir} onOpenChange={(o) => !o && setConfirmarExcluir(null)}>
          <DialogContent className="bg-white max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold">Desativar esta aba?</DialogTitle>
              <DialogDescription className="text-xs text-gray-600">
                A aba sai da navegação. <strong>Os dados são preservados</strong> e você pode
                reativá-la depois.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmarExcluir(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => confirmarExcluir && excluir(confirmarExcluir)}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Desativar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
