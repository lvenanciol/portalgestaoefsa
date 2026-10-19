import { useEffect, useState, useCallback } from 'react'
import { ShieldCheck, Plus, Loader2, Search, X, MousePointerClick } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useBotoes,
  BUTTON_GATES,
  salvarBotoesGrupo,
  lerBotoesGrupo,
} from '@/services/botoes-service'
import {
  listarUsuarios,
  criarUsuario,
  editarUsuario,
  listarGrupos,
  listarEmpresas,
  listarUnidades,
  listarAuditoria,
  UsuarioLista,
} from '@/services/usuarios-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Switch } from '@/components/ui/switch'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface Grupo {
  id: string
  nome: string
  escopo: string
}
interface Empresa {
  id: string
  nome: string
}
interface Unidade {
  id: string
  nome: string
  empresa_id: string
}
interface RegistroAuditoria {
  id: string
  created: string
  usuario_email: string
  acao: string
  modulo: string
  ip: string
}

export default function ControleAcessos() {
  const { user } = useAuth()
  const { pode } = useBotoes()
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  const [dialogNovo, setDialogNovo] = useState(false)
  const [dialogEditar, setDialogEditar] = useState<UsuarioLista | null>(null)
  const [dialogAuditoria, setDialogAuditoria] = useState(false)
  const [dialogBotoes, setDialogBotoes] = useState<Grupo | null>(null)
  const [botoesConfig, setBotoesConfig] = useState<Record<string, string[]>>({})
  const [salvandoBotoes, setSalvandoBotoes] = useState(false)

  // form novo/editar
  const [fNome, setFNome] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fSenha, setFSenha] = useState('')
  const [fCargo, setFCargo] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  const [fEmpresa, setFEmpresa] = useState('')
  const [fUnidade, setFUnidade] = useState('')
  const [fAtivo, setFAtivo] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const [{ usuarios: us }, gs, es, uns] = await Promise.all([
        listarUsuarios(),
        listarGrupos(),
        listarEmpresas(),
        listarUnidades(),
      ])
      setUsuarios(us)
      setGrupos(gs as Grupo[])
      setEmpresas(es as Empresa[])
      setUnidades(uns as Unidade[])
      setIsAdmin(us.some((u) => u.email === user?.email && u.grupo === 'Admin'))
      try {
        const { registros } = await listarAuditoria(50)
        setAuditoria(registros)
      } catch (_) {
        setAuditoria([])
      }
    } catch (e) {
      setErro(getErrorMessage(e) || 'Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    carregar()
  }, [carregar])

  const abrirNovo = () => {
    setFNome('')
    setFEmail('')
    setFSenha('')
    setFCargo('')
    setFGrupo('')
    setFEmpresa('')
    setFUnidade('')
    setFAtivo(true)
    setDialogNovo(true)
  }

  const abrirEditar = (u: UsuarioLista) => {
    setFNome(u.nome)
    setFEmail(u.email)
    setFSenha('')
    setFCargo(u.cargo)
    const g = grupos.find((x) => x.nome === u.grupo)
    setFGrupo(g?.id || '')
    const e = empresas.find((x) => x.nome === u.empresa)
    setFEmpresa(e?.id || '')
    const un = unidades.find((x) => x.nome === u.unidade)
    setFUnidade(un?.id || '')
    setFAtivo(u.ativo)
    setDialogEditar(u)
  }

  const abrirBotoes = async (g: Grupo) => {
    setDialogBotoes(g)
    try {
      const cfg = await lerBotoesGrupo(g.id)
      setBotoesConfig(cfg)
    } catch (_) {
      setBotoesConfig({})
    }
  }

  const toggleBotao = (screen: string, key: string) => {
    setBotoesConfig((prev) => {
      const atual = prev[screen] || []
      return {
        ...prev,
        [screen]: atual.includes(key) ? atual.filter((k) => k !== key) : [...atual, key],
      }
    })
  }

  const salvarBotoes = async () => {
    if (!dialogBotoes) return
    setSalvandoBotoes(true)
    try {
      await salvarBotoesGrupo(dialogBotoes.id, botoesConfig)
      setDialogBotoes(null)
    } catch (e) {
      setErro(getErrorMessage(e) || 'Erro ao salvar botões.')
    } finally {
      setSalvandoBotoes(false)
    }
  }

  const salvarNovo = async () => {
    setSalvando(true)
    try {
      await criarUsuario({
        nome: fNome,
        email: fEmail,
        senha: fSenha,
        cargo: fCargo,
        grupo_id: fGrupo || undefined,
        empresa_id: fEmpresa || undefined,
        unidade_id: fUnidade || undefined,
        ativo: fAtivo,
      })
      setDialogNovo(false)
      await carregar()
    } catch (e) {
      setErro(getErrorMessage(e) || 'Erro ao criar usuário.')
    } finally {
      setSalvando(false)
    }
  }

  const salvarEdicao = async () => {
    if (!dialogEditar) return
    setSalvando(true)
    try {
      await editarUsuario(dialogEditar.id, {
        nome: fNome,
        cargo: fCargo,
        ativo: fAtivo,
        grupo_id: fGrupo,
        empresa_id: fEmpresa,
        unidade_id: fUnidade,
        ...(fSenha ? { senha: fSenha } : {}),
      })
      setDialogEditar(null)
      await carregar()
    } catch (e) {
      setErro(getErrorMessage(e) || 'Erro ao salvar usuário.')
    } finally {
      setSalvando(false)
    }
  }

  const alternarAtivo = async (u: UsuarioLista) => {
    try {
      await editarUsuario(u.id, { ativo: !u.ativo })
      await carregar()
    } catch (e) {
      setErro(getErrorMessage(e) || 'Erro ao alterar status.')
    }
  }

  const filtrados = usuarios.filter(
    (u) =>
      !busca ||
      u.nome.toLowerCase().includes(busca.toLowerCase()) ||
      u.email.toLowerCase().includes(busca.toLowerCase()) ||
      u.grupo.toLowerCase().includes(busca.toLowerCase()),
  )

  const unidadesDaEmpresa = unidades.filter((u) => !fEmpresa || u.empresa_id === fEmpresa)

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-[#1B5E20]" />
            Controle de Acessos
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Grupos, usuários e matriz de permissões com escopo por empresa/unidade
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {pode('acessos', 'auditoria') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogAuditoria(true)}
                className="h-9"
              >
                Trilha de Auditoria
              </Button>
            )}
            {pode('acessos', 'novo_usuario') && (
              <Button
                size="sm"
                onClick={abrirNovo}
                className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
              >
                <Plus className="h-4 w-4 mr-1" /> Novo Usuário
              </Button>
            )}
          </div>
        )}
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700 font-medium">
          {erro}
        </div>
      )}

      {/* Grupos de permissão */}
      <section>
        <h2 className="text-sm font-bold text-gray-900 mb-3">Grupos de Permissão</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {grupos.map((g) => (
            <div
              key={g.id}
              className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">{g.nome}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-[#1B5E20] border border-emerald-200/60 uppercase">
                  {g.escopo}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                {usuarios.filter((u) => u.grupo === g.nome).length} usuário(s)
              </p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => abrirBotoes(g)}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#1B5E20] hover:text-[#0F3D13] transition-colors"
                >
                  <MousePointerClick className="h-3.5 w-3.5" /> Botões
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Usuários */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">Usuários</h2>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar usuário..."
              className="h-9 pl-9 text-xs bg-gray-50"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-[#1B5E20]" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-muted/20 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Nome
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Grupo
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Escopo
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Último login
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="text-[13px] font-semibold text-gray-900">{u.nome}</div>
                        <div className="text-[11px] text-gray-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[12px] font-semibold text-[#1B5E20] bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                          {u.grupo || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-gray-600">
                        {u.unidade || u.empresa || 'Grupo'}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-gray-500 tabular-nums">
                        {u.ultimo_login && u.ultimo_login !== '0001-01-01 00:00:00.000Z'
                          ? new Date(u.ultimo_login).toLocaleString('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : 'Nunca'}
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin && pode('acessos', 'alternar_ativo') ? (
                          <Switch checked={u.ativo} onCheckedChange={() => alternarAtivo(u)} />
                        ) : (
                          <span
                            className={
                              'text-[11px] font-bold px-2 py-0.5 rounded-full ' +
                              (u.ativo
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-700')
                            }
                          >
                            {u.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isAdmin && pode('acessos', 'editar_usuario') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => abrirEditar(u)}
                          >
                            Editar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtrados.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                        Nenhum usuário encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Dialog Novo/Editar usuário */}
      <Dialog
        open={dialogNovo || Boolean(dialogEditar)}
        onOpenChange={(open) => {
          if (!open) {
            setDialogNovo(false)
            setDialogEditar(null)
          }
        }}
      >
        <DialogContent className="bg-white max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogEditar ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Nome
              </Label>
              <Input
                value={fNome}
                onChange={(e) => setFNome(e.target.value)}
                className="h-10 bg-gray-50"
              />
            </div>
            {!dialogEditar && (
              <>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    E-mail
                  </Label>
                  <Input
                    type="email"
                    value={fEmail}
                    onChange={(e) => setFEmail(e.target.value)}
                    className="h-10 bg-gray-50"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Senha inicial
                  </Label>
                  <Input
                    type="password"
                    value={fSenha}
                    onChange={(e) => setFSenha(e.target.value)}
                    className="h-10 bg-gray-50"
                    placeholder="mínimo 8 caracteres"
                  />
                </div>
              </>
            )}
            {dialogEditar && (
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Nova senha (opcional)
                </Label>
                <Input
                  type="password"
                  value={fSenha}
                  onChange={(e) => setFSenha(e.target.value)}
                  className="h-10 bg-gray-50"
                  placeholder="deixe vazio para manter"
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Cargo
              </Label>
              <Input
                value={fCargo}
                onChange={(e) => setFCargo(e.target.value)}
                className="h-10 bg-gray-50"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Grupo de permissão
              </Label>
              <Select value={fGrupo} onValueChange={setFGrupo}>
                <SelectTrigger className="h-10 bg-gray-50">
                  <SelectValue placeholder="Selecione o grupo" />
                </SelectTrigger>
                <SelectContent>
                  {grupos.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Empresa
                </Label>
                <Select
                  value={fEmpresa}
                  onValueChange={(v) => {
                    setFEmpresa(v)
                    setFUnidade('')
                  }}
                >
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Unidade
                </Label>
                <Select value={fUnidade} onValueChange={setFUnidade}>
                  <SelectTrigger className="h-10 bg-gray-50">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    {unidadesDaEmpresa.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
              <span className="text-[13px] font-semibold text-gray-700">Usuário ativo</span>
              <Switch checked={fAtivo} onCheckedChange={setFAtivo} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogNovo(false)
                setDialogEditar(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={dialogEditar ? salvarEdicao : salvarNovo}
              disabled={salvando}
              className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {dialogEditar ? 'Salvar' : 'Criar Usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Auditoria */}
      <Dialog open={dialogAuditoria} onOpenChange={setDialogAuditoria}>
        <DialogContent className="bg-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Trilha de Auditoria
              <button
                onClick={() => setDialogAuditoria(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-100">
            {auditoria.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">Nenhum registro ainda.</p>
            )}
            {auditoria.map((r) => (
              <div key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-gray-900">
                    {r.acao}
                    {r.modulo ? (
                      <span className="text-gray-400 font-normal"> · {r.modulo}</span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">{r.usuario_email}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-gray-500 tabular-nums">
                    {new Date(r.created).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </div>
                  <div className="text-[10px] text-gray-400">{r.ip}</div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Botões por grupo (Fase 9) */}
      <Dialog open={!!dialogBotoes} onOpenChange={(o) => !o && setDialogBotoes(null)}>
        <DialogContent className="bg-white max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MousePointerClick className="h-4 w-4 text-[#1B5E20]" />
                Botões — {dialogBotoes?.nome}
              </span>
              <button
                onClick={() => setDialogBotoes(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-gray-500 -mt-2">
            Botões LIGADOS ficam visíveis; DESLIGADOS são ocultados para os usuários deste grupo.
            Botão sem configuração = sempre visível.
          </p>
          <div className="space-y-4">
            {BUTTON_GATES.map((tela) => (
              <div key={tela.key} className="border border-gray-100 rounded-lg p-3">
                <div className="text-[12px] font-bold text-gray-900 mb-2">{tela.label}</div>
                <div className="space-y-2">
                  {tela.buttons.map((b) => {
                    const ocultos = botoesConfig[tela.key] || []
                    const visivel = !ocultos.includes(b.key)
                    return (
                      <div key={b.key} className="flex items-center justify-between gap-3">
                        <span className="text-[12px] text-gray-700">{b.label}</span>
                        <Switch
                          checked={visivel}
                          onCheckedChange={() => toggleBotao(tela.key, b.key)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogBotoes(null)} className="h-9">
              Cancelar
            </Button>
            <Button
              onClick={salvarBotoes}
              disabled={salvandoBotoes}
              className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvandoBotoes ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
