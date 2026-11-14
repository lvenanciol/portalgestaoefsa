import { useEffect, useMemo, useState } from 'react'
import {
  ListTree,
  Loader2,
  RefreshCw,
  GripVertical,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  X,
  FolderPlus,
  ArrowRightLeft,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { useBotoes } from '@/services/botoes-service'
import { MENU_MODULOS } from '@/services/permissoes-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

// ============================================================================
// ÁRVORE DE MENUS — CRUD completo (15/11/2026)
//
// ANTES: a tela só listava e ligava/desligava o "ativo". Não criava, não
// editava, não excluía, não movia entre seções.
//
// AGORA:
//   · criar / editar / excluir ITEM (título, rota, seção, ícone, ativo)
//   · mover ITEM entre seções (dropdown "Seção" no próprio item)
//   · reordenar ITEM dentro da seção (setas ↑ ↓)
//   · CRUD de SEÇÃO: renomear (afeta todos os itens), excluir (exige vazia),
//     criar (digitando um nome novo no formulário de item)
//
// POR QUE HOOK NO SERVIDOR: a coleção `menus` tem createRule/updateRule/
// deleteRule = null — nenhuma escrita passa pela API do PocketBase.
// ============================================================================

interface MenuItem {
  id: string
  titulo: string
  rota: string
  secao: string
  ordem: number
  icone: string
  ativo: boolean
}

const ICONES = [
  'dashboard',
  'briefcase',
  'bar-chart',
  'line-chart',
  'file-text',
  'calendar',
  'folder',
  'users',
  'mail',
  'file-check',
  'chart',
  'sparkles',
  'list-tree',
  'shield',
  'settings',
  'plug',
  'database',
  'message',
]

const SECOES_PADRAO = ['GESTÃO', 'OPERAÇÃO', 'RELACIONAMENTO', 'PLATAFORMA', 'INTEGRAÇÕES']

export default function MenusPage() {
  const { user } = useAuth()
  const { pode } = useBotoes()
  const [itens, setItens] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  // dialogs
  const [itemOpen, setItemOpen] = useState(false)
  const [editando, setEditando] = useState<MenuItem | null>(null)
  const [excluirId, setExcluirId] = useState<string | null>(null)
  const [secaoRenomear, setSecaoRenomear] = useState<string | null>(null)
  const [secaoExcluir, setSecaoExcluir] = useState<string | null>(null)
  const [novaSecaoOpen, setNovaSecaoOpen] = useState(false)
  const [novaSecao, setNovaSecao] = useState('')

  // formulário do item
  const [form, setForm] = useState({
    titulo: '',
    rota: '',
    secao: '',
    icone: 'file-text',
    ativo: true,
  })

  const isAdmin = user?.grupoNome === 'Admin' || user?.grupo_id === ''
  const podeEditar = isAdmin && pode('menus', 'toggle_ativo')

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.collection('menus').getFullList({ sort: 'secao,ordem' })
      setItens(r as any[])
      setErro('')
    } catch (e: any) {
      setErro(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  // seções = as do banco (preserva a ordem de exibição) + as padrão ainda vazias
  const secoes = useMemo(() => {
    const doBanco = Array.from(new Set(itens.map((i) => i.secao).filter(Boolean)))
    const extras = SECOES_PADRAO.filter((s) => !doBanco.includes(s))
    const todas = [...doBanco, ...extras]
    // ordena SECOES_PADRAO na ordem canônica, as demais depois
    return todas.sort((a, b) => {
      const ia = SECOES_PADRAO.indexOf(a)
      const ib = SECOES_PADRAO.indexOf(b)
      if (ia >= 0 && ib >= 0) return ia - ib
      if (ia >= 0) return -1
      if (ib >= 0) return 1
      return a.localeCompare(b, 'pt-BR')
    })
  }, [itens])

  const chamar = async (rota: string, corpo: any) => {
    const r: any = await pb.send('/backend/v1/menus/' + rota, {
      method: 'POST',
      body: JSON.stringify(corpo),
    })
    return r
  }

  // ---------------- item: criar/editar ----------------
  const abrirNovo = (secao?: string) => {
    setEditando(null)
    setForm({
      titulo: '',
      rota: '',
      secao: secao || secoes[0] || 'OPERAÇÃO',
      icone: 'file-text',
      ativo: true,
    })
    setItemOpen(true)
  }

  const abrirEdicao = (i: MenuItem) => {
    setEditando(i)
    setForm({
      titulo: i.titulo,
      rota: i.rota || '',
      secao: i.secao,
      icone: i.icone || 'file-text',
      ativo: !!i.ativo,
    })
    setItemOpen(true)
  }

  const salvarItem = async () => {
    if (!form.titulo.trim()) {
      toast({ title: 'Informe o título', variant: 'destructive' })
      return
    }
    if (!form.secao.trim()) {
      toast({ title: 'Informe a seção', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      const ordem = editando
        ? editando.ordem
        : Math.max(0, ...itens.filter((i) => i.secao === form.secao).map((i) => i.ordem || 0)) + 1

      if (editando) {
        await chamar('editar', { id: editando.id, ...form, ordem })
      } else {
        await chamar('criar', { ...form, ordem })
      }
      toast({ title: editando ? 'Item atualizado' : 'Item criado' })
      setItemOpen(false)
      await carregar()
    } catch (e: any) {
      toast({
        title: 'Falha ao salvar',
        description: e?.response?.data?.message || e?.message || String(e),
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const excluirItem = async () => {
    if (!excluirId) return
    try {
      await chamar('excluir', { id: excluirId })
      toast({ title: 'Item excluído' })
      setExcluirId(null)
      await carregar()
    } catch (e: any) {
      toast({
        title: 'Falha ao excluir',
        description: e?.response?.data?.message || e?.message || String(e),
        variant: 'destructive',
      })
    }
  }

  const toggleAtivo = async (i: MenuItem) => {
    if (!podeEditar) return
    try {
      await chamar('editar', {
        id: i.id,
        titulo: i.titulo,
        rota: i.rota,
        secao: i.secao,
        ordem: i.ordem,
        icone: i.icone,
        ativo: !i.ativo,
      })
      await carregar()
    } catch (e: any) {
      setErro(e?.message || String(e))
    }
  }

  // ---------------- mover entre seções ----------------
  const moverParaSecao = async (i: MenuItem, secao: string) => {
    if (secao === i.secao) return
    try {
      await chamar('mover', { id: i.id, secao })
      toast({ title: 'Movido', description: `"${i.titulo}" agora está em ${secao}.` })
      await carregar()
    } catch (e: any) {
      toast({
        title: 'Falha ao mover',
        description: e?.response?.data?.message || e?.message || String(e),
        variant: 'destructive',
      })
    }
  }

  // ---------------- reordenar dentro da seção ----------------
  const moverOrdem = async (secao: string, i: MenuItem, direcao: -1 | 1) => {
    const daSecao = itens
      .filter((x) => x.secao === secao)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.titulo.localeCompare(b.titulo))
    const pos = daSecao.findIndex((x) => x.id === i.id)
    const alvo = pos + direcao
    if (pos < 0 || alvo < 0 || alvo >= daSecao.length) return

    const nova = [...daSecao]
    const [movido] = nova.splice(pos, 1)
    nova.splice(alvo, 0, movido)

    try {
      await chamar('reordenar', { secao, ids: nova.map((x) => x.id) })
      await carregar()
    } catch (e: any) {
      toast({
        title: 'Falha ao reordenar',
        description: e?.response?.data?.message || e?.message || String(e),
        variant: 'destructive',
      })
    }
  }

  // ---------------- seções ----------------
  const renomearSecao = async () => {
    if (!secaoRenomear) return
    const novo = novaSecao.trim()
    if (!novo) {
      toast({ title: 'Informe o novo nome da seção', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      const daSecao = itens.filter((i) => i.secao === secaoRenomear)
      for (const i of daSecao) {
        await chamar('editar', {
          id: i.id,
          titulo: i.titulo,
          rota: i.rota,
          secao: novo,
          ordem: i.ordem,
          icone: i.icone,
          ativo: i.ativo,
        })
      }
      toast({
        title: 'Seção renomeada',
        description: `${daSecao.length} item(ns) movidos para "${novo}".`,
      })
      setSecaoRenomear(null)
      setNovaSecao('')
      await carregar()
    } catch (e: any) {
      toast({
        title: 'Falha ao renomear',
        description: e?.response?.data?.message || e?.message || String(e),
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const excluirSecao = async () => {
    if (!secaoExcluir) return
    const daSecao = itens.filter((i) => i.secao === secaoExcluir)
    if (daSecao.length > 0) {
      toast({
        title: 'Seção não está vazia',
        description: `Mova ou exclua os ${daSecao.length} item(ns) antes de remover a seção.`,
        variant: 'destructive',
      })
      setSecaoExcluir(null)
      return
    }
    // seção vazia: nada a gravar — ela some sozinha da lista
    toast({ title: 'Seção removida', description: secaoExcluir })
    setSecaoExcluir(null)
    await carregar()
  }

  const criarSecao = () => {
    const nome = novaSecao.trim()
    if (!nome) {
      toast({ title: 'Informe o nome da seção', variant: 'destructive' })
      return
    }
    // a seção passa a existir ao receber o primeiro item
    setNovaSecaoOpen(false)
    setNovaSecao('')
    abrirNovo(nome)
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <ListTree className="h-6 w-6 text-[#1B5E20]" /> Árvore de Menus
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Seções da sidebar e telas do portal — criar, editar, excluir, reordenar e mover
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={carregar} className="h-9" title="Recarregar">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {podeEditar && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNovaSecao('')
                  setNovaSecaoOpen(true)
                }}
                className="h-9 text-[12px]"
              >
                <FolderPlus className="h-3.5 w-3.5 mr-1.5" /> Nova seção
              </Button>
              <Button
                size="sm"
                onClick={() => abrirNovo()}
                className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-[12px]"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo item
              </Button>
            </>
          )}
        </div>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[#1B5E20]" />
        </div>
      ) : (
        <div className="space-y-4">
          {secoes.map((sec) => {
            const daSecao = itens
              .filter((i) => i.secao === sec)
              .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.titulo.localeCompare(b.titulo))
            return (
              <div
                key={sec}
                className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden"
              >
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                      {sec}
                    </span>
                    <span className="text-[10px] font-semibold text-gray-500 bg-white border border-gray-200 rounded-full px-1.5 py-0.5 tabular-nums">
                      {daSecao.length}
                    </span>
                  </div>
                  {podeEditar && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSecaoRenomear(sec)
                          setNovaSecao(sec)
                        }}
                        title="Renomear seção"
                        className="p-1.5 rounded hover:bg-white text-gray-500 hover:text-gray-800"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSecaoExcluir(sec)}
                        title="Excluir seção (precisa estar vazia)"
                        className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirNovo(sec)}
                        title="Novo item nesta seção"
                        className="p-1.5 rounded hover:bg-white text-gray-500 hover:text-[#1B5E20]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="divide-y divide-gray-50">
                  {daSecao.length === 0 ? (
                    <div className="px-4 py-3 text-[12px] text-gray-400">
                      Seção vazia — adicione um item ou mova uma tela para cá.
                    </div>
                  ) : (
                    daSecao.map((i, idx) => (
                      <div key={i.id} className="flex items-center gap-2.5 px-4 py-2.5">
                        <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                        <span className="text-[11px] font-bold text-gray-400 tabular-nums w-5 shrink-0">
                          {i.ordem}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div
                            className={cn(
                              'text-[13px] font-semibold text-gray-900 truncate',
                              !i.ativo && 'opacity-50 line-through',
                            )}
                          >
                            {i.titulo}
                          </div>
                          <div className="text-[11px] text-gray-400 truncate">
                            {i.rota || '—'}
                            {i.icone ? ' · ícone: ' + i.icone : ''}
                            {MENU_MODULOS[i.rota] ? ' · módulo: ' + MENU_MODULOS[i.rota] : ''}
                          </div>
                        </div>

                        {podeEditar && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => moverOrdem(sec, i, -1)}
                              disabled={idx === 0}
                              title="Subir"
                              className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moverOrdem(sec, i, 1)}
                              disabled={idx === daSecao.length - 1}
                              title="Descer"
                              className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>

                            {/* mover para outra seção */}
                            <Select value={i.secao} onValueChange={(v) => moverParaSecao(i, v)}>
                              <SelectTrigger
                                className="h-7 w-[26px] px-0 justify-center border-0 bg-transparent hover:bg-gray-100 text-gray-500 [&>svg]:hidden"
                                title="Mover para outra seção"
                              >
                                <ArrowRightLeft className="h-3.5 w-3.5" />
                                <SelectValue className="hidden" />
                              </SelectTrigger>
                              <SelectContent className="bg-white border-gray-200 z-[120]">
                                {secoes.map((s) => (
                                  <SelectItem key={s} value={s} className="text-[12px]">
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <button
                              type="button"
                              onClick={() => abrirEdicao(i)}
                              title="Editar item"
                              className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setExcluirId(i.id)}
                              title="Excluir item"
                              className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}

                        <Switch
                          checked={i.ativo}
                          onCheckedChange={() => toggleAtivo(i)}
                          disabled={!podeEditar}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}

          {!podeEditar && (
            <p className="text-[11px] text-gray-400">
              Somente administradores podem alterar a árvore de menus.
            </p>
          )}
        </div>
      )}

      {/* ---------- Dialog criar/editar item ---------- */}
      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editando ? 'Editar item de menu' : 'Novo item de menu'}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              A tela aparece na sidebar na seção escolhida, na ordem definida.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Título *</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex.: Tarefas"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Rota</Label>
              <Input
                value={form.rota}
                onChange={(e) => setForm({ ...form, rota: e.target.value })}
                placeholder="Ex.: /tarefas"
                className="h-9 text-sm font-mono"
              />
              <p className="text-[11px] text-gray-400">
                Caminho da tela. Deixe em branco para um item sem destino.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Seção *</Label>
                <Select value={form.secao} onValueChange={(v) => setForm({ ...form, secao: v })}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200 z-[120]">
                    {secoes.map((s) => (
                      <SelectItem key={s} value={s} className="text-[12px]">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={form.secao}
                  onChange={(e) => setForm({ ...form, secao: e.target.value.toUpperCase() })}
                  placeholder="ou digite uma nova"
                  className="h-8 text-[12px] mt-1"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Ícone</Label>
                <Select value={form.icone} onValueChange={(v) => setForm({ ...form, icone: v })}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200 z-[120] max-h-[260px]">
                    {ICONES.map((ic) => (
                      <SelectItem key={ic} value={ic} className="text-[12px] font-mono">
                        {ic}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })}
              />
              <Label className="text-xs font-semibold cursor-pointer">
                Item visível na sidebar
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setItemOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={salvarItem}
              disabled={salvando}
              className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvando ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1.5" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog renomear seção ---------- */}
      <Dialog open={!!secaoRenomear} onOpenChange={(o) => !o && setSecaoRenomear(null)}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Renomear seção</DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Todos os itens de <strong>{secaoRenomear}</strong> passarão para o novo nome.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className="text-xs font-semibold">Novo nome</Label>
            <Input
              value={novaSecao}
              onChange={(e) => setNovaSecao(e.target.value.toUpperCase())}
              className="h-9 text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSecaoRenomear(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={renomearSecao}
              disabled={salvando}
              className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Renomear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog nova seção ---------- */}
      <Dialog open={novaSecaoOpen} onOpenChange={setNovaSecaoOpen}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Nova seção</DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              A seção passa a existir na sidebar ao receber o primeiro item. Em seguida você escolhe
              a tela que vai nela.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className="text-xs font-semibold">Nome da seção</Label>
            <Input
              value={novaSecao}
              onChange={(e) => setNovaSecao(e.target.value.toUpperCase())}
              placeholder="Ex.: RELATÓRIOS"
              className="h-9 text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNovaSecaoOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={criarSecao}
              className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              Criar e adicionar item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Confirmar exclusão de item ---------- */}
      <AlertDialog open={!!excluirId} onOpenChange={(o) => !o && setExcluirId(null)}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold">
              Excluir este item de menu?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600">
              O item sai da sidebar. A tela continua acessível pela URL.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                excluirItem()
              }}
              className="text-xs bg-red-600 hover:bg-red-700 text-white"
            >
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- Confirmar exclusão de seção ---------- */}
      <AlertDialog open={!!secaoExcluir} onOpenChange={(o) => !o && setSecaoExcluir(null)}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold">
              Remover a seção {secaoExcluir}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600">
              Só é possível remover uma seção vazia. Mova ou exclua os itens antes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                excluirSecao()
              }}
              className="text-xs bg-red-600 hover:bg-red-700 text-white"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
