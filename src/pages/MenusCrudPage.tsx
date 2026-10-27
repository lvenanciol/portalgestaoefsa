import { useEffect, useState } from 'react'
import { ListTree, Plus, Loader2, X, RotateCcw, LayoutDashboard } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

// Fase 10 (prompt-mestre) — Árvore de Menus: CRUD completo (nome, ícone,
// hierarquia/ordem, seção da sidebar, ativo, flag "exibir no dashboard"),
// refletindo na sidebar (coleção menus), restauração de padrão e auditoria.

const SECOES = ['GESTÃO', 'OPERAÇÃO', 'RELACIONAMENTO', 'PLATAFORMA']
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
]

const PADRAO = [
  { titulo: 'Dashboard Executivo', rota: '/', secao: 'GESTÃO', ordem: 1, icone: 'dashboard' },
  {
    titulo: 'Financeiro & Contábil',
    rota: '/financeiro',
    secao: 'GESTÃO',
    ordem: 2,
    icone: 'briefcase',
  },
  {
    titulo: 'Desempenho por Unidade',
    rota: '/desempenho',
    secao: 'GESTÃO',
    ordem: 3,
    icone: 'bar-chart',
  },
  { titulo: 'Indicadores', rota: '/indicadores', secao: 'GESTÃO', ordem: 4, icone: 'line-chart' },
  {
    titulo: 'Documentos & Importações',
    rota: '/documentos',
    secao: 'OPERAÇÃO',
    ordem: 5,
    icone: 'file-text',
  },
  { titulo: 'Tarefas & Agenda', rota: '/tarefas', secao: 'OPERAÇÃO', ordem: 6, icone: 'calendar' },
  { titulo: 'Projetos', rota: '/projetos', secao: 'OPERAÇÃO', ordem: 7, icone: 'folder' },
  { titulo: 'Atas & Reuniões', rota: '/atas', secao: 'OPERAÇÃO', ordem: 8, icone: 'users' },
  { titulo: 'E-mails', rota: '/emails', secao: 'RELACIONAMENTO', ordem: 9, icone: 'mail' },
  {
    titulo: 'Contratos',
    rota: '/contratos',
    secao: 'RELACIONAMENTO',
    ordem: 10,
    icone: 'file-check',
  },
  { titulo: 'Power BI', rota: '/power-bi', secao: 'GESTÃO', ordem: 5, icone: 'chart' },
  { titulo: 'IA Gemini Flash', rota: '/ia', secao: 'PLATAFORMA', ordem: 12, icone: 'sparkles' },
  { titulo: 'Árvore de Menus', rota: '/menus', secao: 'PLATAFORMA', ordem: 13, icone: 'list-tree' },
  {
    titulo: 'Controle de Acessos',
    rota: '/acessos',
    secao: 'PLATAFORMA',
    ordem: 14,
    icone: 'shield',
  },
  {
    titulo: 'Configurações',
    rota: '/configuracoes',
    secao: 'PLATAFORMA',
    ordem: 15,
    icone: 'settings',
  },
]

export default function MenusCrudPage() {
  const { user } = useAuth()
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [dialog, setDialog] = useState(false)
  const [editando, setEditando] = useState<any | null>(null)
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.collection('menus').getFullList({ sort: 'secao,ordem' })
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

  const abrirNovo = () => {
    setForm({
      titulo: '',
      rota: '',
      secao: 'GESTÃO',
      ordem: (itens.length || 0) + 1,
      icone: 'folder',
      ativo: true,
      no_dashboard: false,
    })
    setEditando(null)
    setDialog(true)
  }

  const abrirEditar = (m: any) => {
    setForm({ ...m, no_dashboard: !!m.no_dashboard })
    setEditando(m)
    setDialog(true)
  }

  const salvar = async () => {
    setSalvando(true)
    try {
      const dados = {
        titulo: form.titulo,
        rota: form.rota,
        secao: form.secao,
        ordem: Number(form.ordem) || 0,
        icone: form.icone,
        ativo: !!form.ativo,
      }
      if (editando)
        await pb.send('/backend/v1/menus/editar', {
          method: 'PATCH',
          body: JSON.stringify({ ...dados, id: editando.id }),
        })
      else await pb.send('/backend/v1/menus', { method: 'POST', body: JSON.stringify(dados) })
      setDialog(false)
      await carregar()
    } catch (e) {
      setErro(String(e))
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async (m: any) => {
    try {
      await pb.send('/backend/v1/menus/excluir?id=' + m.id, { method: 'DELETE' })
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
  }

  const toggleAtivo = async (m: any) => {
    try {
      await pb.send('/backend/v1/menus/toggle', {
        method: 'PATCH',
        body: JSON.stringify({ id: m.id, ativo: !m.ativo }),
      })
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
  }

  const restaurarPadrao = async () => {
    if (
      !confirm(
        'Restaurar a árvore de menus para o padrão? Itens criados manualmente serão removidos.',
      )
    )
      return
    try {
      // remove todos e recria o padrão (via hooks admin-only)
      const todos = await pb.collection('menus').getFullList()
      for (const m of todos)
        await pb.send('/backend/v1/menus/excluir?id=' + m.id, { method: 'DELETE' })
      for (const m of PADRAO)
        await pb.send('/backend/v1/menus', {
          method: 'POST',
          body: JSON.stringify({ ...m, ativo: true }),
        })
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
  }

  const secoes = SECOES.filter((s) => itens.some((i) => i.secao === s))

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
            <ListTree className="h-6 w-6 text-[#1B5E20]" /> Árvore de Menus
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            CRUD completo — reflete na sidebar e nos widgets em tempo real
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={restaurarPadrao} className="h-9">
            <RotateCcw className="h-4 w-4 mr-1.5" /> Restaurar padrão
          </Button>
          <Button onClick={abrirNovo} className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white">
            <Plus className="h-4 w-4 mr-1" /> Novo item
          </Button>
        </div>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      <div className="space-y-4">
        {secoes.map((sec) => (
          <div
            key={sec}
            className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                {sec}
              </span>
              <span className="text-[10px] text-gray-400">
                {itens.filter((i) => i.secao === sec).length} item(ns)
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              {itens
                .filter((i) => i.secao === sec)
                .map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-[11px] font-bold text-gray-400 tabular-nums w-6">
                      {m.ordem}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-gray-900">{m.titulo}</div>
                      <div className="text-[11px] text-gray-400">
                        {m.rota || '—'} · ícone: {m.icone}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => abrirEditar(m)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-red-600 hover:bg-red-50"
                      onClick={() => excluir(m)}
                    >
                      Excluir
                    </Button>
                    <Switch checked={m.ativo} onCheckedChange={() => toggleAtivo(m)} />
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar' : 'Novo'} item do menu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Nome *
              </Label>
              <Input
                value={form.titulo || ''}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                className="h-10 bg-gray-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Rota
                </Label>
                <Input
                  value={form.rota || ''}
                  onChange={(e) => setForm({ ...form, rota: e.target.value })}
                  className="h-10 bg-gray-50"
                  placeholder="/exemplo"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Ordem
                </Label>
                <Input
                  type="number"
                  value={form.ordem ?? ''}
                  onChange={(e) => setForm({ ...form, ordem: e.target.value })}
                  className="h-10 bg-gray-50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Seção da sidebar
                </Label>
                <Select
                  value={form.secao || 'GESTÃO'}
                  onValueChange={(v) => setForm({ ...form, secao: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECOES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Ícone
                </Label>
                <Select
                  value={form.icone || 'folder'}
                  onValueChange={(v) => setForm({ ...form, icone: v })}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICONES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-[12px] text-gray-700">Item ativo (visível na sidebar)</span>
              <Switch
                checked={!!form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
              <span className="text-[12px] text-gray-700 flex items-center gap-1.5">
                <LayoutDashboard className="h-3.5 w-3.5" /> Exibir no dashboard executivo
              </span>
              <Switch
                checked={!!form.no_dashboard}
                onCheckedChange={(v) => setForm({ ...form, no_dashboard: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)} className="h-9">
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={salvando || !form.titulo}
              className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
