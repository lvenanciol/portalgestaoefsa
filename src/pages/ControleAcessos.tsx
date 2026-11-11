import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  ShieldCheck,
  Plus,
  Loader2,
  Search,
  X,
  MousePointerClick,
  Mail,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
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
  enviarLoginUsuario,
  listarGrupos,
  listarEmpresas,
  listarUnidades,
  listarAuditoria,
  listarParceiros,
  criarGrupo,
  editarGrupo,
  excluirGrupo,
  ParceiroOpcao,
  UsuarioLista,
} from '@/services/usuarios-service'
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
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import pb from '@/lib/pocketbase/client'
// Máscara de telefone compartilhada com Parceiros & Contatos — mesmo formato.
import { mascaraTelefone } from '@/components/operacional/ParceiroCadastroDialog'
import { fmtDataBRT } from '@/lib/brt'
import { cn } from '@/lib/utils'

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

// T6a: abas/seções gerenciáveis por tela (CRUD via switches — estado em
// grupos_permissao.permissoes.botoes como 'aba_<key>')
const ABAS_POR_TELA: Record<string, { key: string; label: string }[]> = {
  financeiro: [
    { key: 'real', label: 'Aba Real (Sankhya)' },
    { key: 'dre', label: 'Aba DRE' },
    { key: 'fluxo', label: 'Aba Fluxo de Caixa' },
    { key: 'apar', label: 'Aba A/P & A/R' },
    { key: 'balancete', label: 'Aba Balancete' },
    { key: 'fechamento', label: 'Aba Fechamento' },
    { key: 'importar', label: 'Aba Importar' },
  ],
  ia: [
    { key: 'biblioteca', label: 'Biblioteca de prompts' },
    { key: 'historico', label: 'Histórico de pareceres' },
  ],
  // Documentos: as 7 abas de tipo documental — ocultar por grupo evita que um
  // usuário de RH abra Seguros ou Jurídicos, por exemplo.
  documentos: [
    { key: 'alvaras', label: 'Aba Alvarás' },
    { key: 'contratos', label: 'Aba Contratos' },
    { key: 'locacoes', label: 'Aba Locações' },
    { key: 'atas', label: 'Aba Atas' },
    { key: 'convencoes', label: 'Aba Convenções' },
    { key: 'seguros', label: 'Aba Seguros' },
    { key: 'juridicos', label: 'Aba Jurídicos' },
  ],
  // Integrações: cada conexão é uma tela própria.
  integracoes: [
    { key: 'status', label: 'Aba Status' },
    { key: 'sankhya', label: 'Aba Sankhya' },
    { key: 'whatsapp', label: 'Aba WhatsApp' },
    { key: 'email', label: 'Aba E-mail' },
  ],
  // Configurações: abas da tela completa.
  configuracoes: [
    { key: 'geral', label: 'Aba Geral' },
    { key: 'seguranca', label: 'Aba Segurança' },
    { key: 'notificacoes', label: 'Aba Notificações' },
    { key: 'integracoes', label: 'Aba Integrações' },
    { key: 'aparencia', label: 'Aba Aparência' },
  ],
}

// T6b: grade CRUD — colunas por tela (cada coluna = permissão marcável)
// 'ver'/'criar'/'editar'/'excluir'/'todas' — estado em botoes como 'crud_<tela>_<col>'
const COLUNAS_CRUD = [
  { key: 'ver', label: 'Ver' },
  { key: 'criar', label: 'Criar' },
  { key: 'editar', label: 'Editar' },
  { key: 'excluir', label: 'Excluir' },
  { key: 'todas', label: 'TODAS' },
]
const CHAVE_CRUD = (tela: string, col: string) => 'crud_' + tela + '_' + col

// Escopo válido no select 'escopo' de grupos_permissao (grupo|empresa|unidade).
// 'Padrão' NÃO existe nos valores permitidos e faria o create falhar (400).
const ESCOPO_PADRAO = 'grupo'

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
  // T6b: linha expandida da grade (botões/abas individuais da tela)
  const [expandida, setExpandida] = useState('')

  // form novo/editar
  const [fNome, setFNome] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fSenha, setFSenha] = useState('')
  const [fCargo, setFCargo] = useState('')
  const [fGrupo, setFGrupo] = useState('')
  // (11/11/2026) MÚLTIPLAS empresas: a tela passou a aceitar mais de um vínculo.
  // A primeira selecionada é a principal (vai para empresa_id no backend).
  const [fEmpresas, setFEmpresas] = useState<string[]>([])
  const [fUnidade, setFUnidade] = useState('')
  // Dados herdados do parceiro (preenchem a tela do usuário)
  const [fTelefone, setFTelefone] = useState('')
  const [fWhatsapp, setFWhatsapp] = useState('')
  const [fCentroResultado, setFCentroResultado] = useState('')
  const [fCentroResultadoCodigo, setFCentroResultadoCodigo] = useState('')
  // Centro de resultado: autocomplete alimentado pelo Sankhya (mesma origem da
  // tela de Parceiros & Contatos — hook sankhya_centros).
  const [centros, setCentros] = useState<{ codigo: string | number; descricao: string }[]>([])
  const [centrosCarregados, setCentrosCarregados] = useState(false)
  const [centrosBuscando, setCentrosBuscando] = useState(false)
  const [centrosErro, setCentrosErro] = useState('')
  const [dropCentro, setDropCentro] = useState(false)
  const [fObservacao, setFObservacao] = useState('')
  const [fAtivo, setFAtivo] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // ===== CAC (11/11/2026) — parceiro vinculado + CRUD de grupos =====
  const [fParceiro, setFParceiro] = useState('')

  const [opcoesParceiro, setOpcoesParceiro] = useState<ParceiroOpcao[]>([])
  const [carregandoParceiros, setCarregandoParceiros] = useState(false)
  const [dialogGrupo, setDialogGrupo] = useState<Grupo | 'novo' | null>(null)
  const [gNome, setGNome] = useState('')
  const [gEscopo, setGEscopo] = useState(ESCOPO_PADRAO)
  const [salvandoGrupo, setSalvandoGrupo] = useState(false)

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
      setGrupos(gs as unknown as Grupo[])
      setEmpresas(es as unknown as Empresa[])
      setUnidades(uns as unknown as Unidade[])
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

  // Busca os centros de resultado no Sankhya (mesma rota da tela de Parceiros)
  const buscarCentros = useCallback(async (q: string) => {
    setCentrosErro('')
    setCentrosBuscando(true)
    try {
      const r = (await pb.send(
        '/backend/v1/sankhya/centros-resultado?busca=' + encodeURIComponent(q || ''),
        { method: 'GET' },
      )) as any
      setCentros(r.itens || [])
      setCentrosCarregados(true)
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
    } finally {
      setCentrosBuscando(false)
    }
  }, [])

  const centrosFiltrados = useMemo(() => {
    const q = (fCentroResultado || '').trim().toLowerCase()
    if (!q) return centros
    return centros.filter(
      (c) =>
        (c.descricao || '').toLowerCase().includes(q) ||
        String(c.codigo || '')
          .toLowerCase()
          .includes(q),
    )
  }, [centros, fCentroResultado])

  // Carrega os parceiros ao abrir o dialog.
  // (11/11/2026) O campo de busca foi removido a pedido do dono — a lista
  // completa vem direto no dropdown, sem termo.
  useEffect(() => {
    if (!dialogNovo && !dialogEditar) return
    let vivo = true
    setCarregandoParceiros(true)
    listarParceiros('', 200)
      .then((lista) => {
        if (vivo) setOpcoesParceiro(lista)
      })
      .finally(() => {
        if (vivo) setCarregandoParceiros(false)
      })
    return () => {
      vivo = false
    }
  }, [dialogNovo, dialogEditar])

  // ===== CRUD de Grupos de permissão (tarefa CAC) =====
  const abrirNovoGrupo = () => {
    setGNome('')
    setGEscopo(ESCOPO_PADRAO)
    setDialogGrupo('novo')
  }

  const abrirEditarGrupo = (g: Grupo) => {
    setGNome(g.nome)
    setGEscopo(g.escopo || ESCOPO_PADRAO)
    setDialogGrupo(g)
  }

  const salvarGrupoHandler = async () => {
    const nome = gNome.trim()
    if (!nome) {
      setErro('Informe o nome do grupo.')
      return
    }
    setSalvandoGrupo(true)
    setErro('')
    try {
      const escopo = gEscopo || ESCOPO_PADRAO
      if (dialogGrupo === 'novo') {
        await criarGrupo({ nome, escopo })
      } else if (dialogGrupo) {
        await editarGrupo(dialogGrupo.id, { nome, escopo })
      }
      setDialogGrupo(null)
      await carregar()
    } catch (e) {
      setErro(getErrorMessage(e) || 'Erro ao salvar grupo.')
    } finally {
      setSalvandoGrupo(false)
    }
  }

  const excluirGrupoHandler = async (g: Grupo) => {
    const emUso = usuarios.filter((u) => u.grupo === g.nome).length
    if (emUso > 0) {
      setErro(`O grupo "${g.nome}" tem ${emUso} usuário(s) vinculado(s). Mova-os antes de excluir.`)
      return
    }
    if (typeof window !== 'undefined' && !window.confirm(`Excluir o grupo "${g.nome}"?`)) return
    try {
      await excluirGrupo(g.id)
      await carregar()
    } catch (e) {
      setErro(getErrorMessage(e) || 'Erro ao excluir grupo.')
    }
  }

  const abrirNovo = () => {
    setFNome('')
    setFEmail('')
    setFSenha('')
    setFCargo('')
    setFGrupo('')
    setFEmpresas([])
    setFTelefone('')
    setFWhatsapp('')
    setFCentroResultado('')
    setFCentroResultadoCodigo('')
    setFObservacao('')
    setFParceiro('')
    setFUnidade('')
    setFAtivo(true)
    setFParceiro('')
    setDialogNovo(true)
  }

  const abrirEditar = (u: UsuarioLista) => {
    setFNome(u.nome)
    // (11/11/2026) E-MAIL: o painel afirma "vem do parceiro vinculado", então
    // tem de exibir o e-mail DO PARCEIRO. Antes usava `u.email` (o do usuário),
    // que em cadastros antigos ficou diferente do parceiro — e a tela mostrava
    // um endereço contradizendo a própria legenda.
    setFEmail(u.parceiro_email || u.email)
    setFSenha('')
    setFCargo(u.cargo)
    const g = grupos.find((x) => x.nome === u.grupo)
    setFGrupo(g?.id || '')
    const e = empresas.find((x) => x.nome === u.empresa)
    setFEmpresas(Array.isArray(u.empresas_ids) ? u.empresas_ids : [])
    const un = unidades.find((x) => x.nome === u.unidade)
    setFUnidade(un?.id || '')
    setFAtivo(u.ativo)

    // (11/11/2026) PREENCHIMENTO DOS CAMPOS DO PARCEIRO.
    // Faltava isto: o formulário de edição nunca preenchia telefone, whatsapp,
    // centro de resultado e observação — chegavam vazios mesmo com o parceiro
    // vinculado e com os dados gravados. Sem parceiro, usa o que está no usuário.
    const tel = u.telefone || u.parceiro_telefone || ''
    const whats = u.whatsapp || u.parceiro_whatsapp || ''
    setFTelefone(tel)
    setFWhatsapp(whats || tel)
    setFCentroResultado(u.centro_resultado || '')
    setFCentroResultadoCodigo(u.centro_resultado_codigo || '')
    setFObservacao(u.observacao || '')

    // CAC: recupera o parceiro já vinculado para não sobrescrever no salvar
    setFParceiro(u.parceiro_id || '')
    if (u.parceiro_id && u.parceiro_nome) {
      setOpcoesParceiro((prev) =>
        prev.some((p) => p.id === u.parceiro_id)
          ? prev
          : [
              {
                id: u.parceiro_id as string,
                nome: u.parceiro_nome as string,
                cnpj: u.parceiro_documento || '',
                email: u.parceiro_email || '',
                cargo: u.parceiro_cargo || '',
                telefone: u.parceiro_telefone || '',
                whatsapp: u.parceiro_whatsapp || '',
              },
              ...prev,
            ],
      )
    }
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
        empresas: fEmpresas,
        unidade_id: fUnidade || undefined,
        parceiro_id: fParceiro || undefined,
        ativo: fAtivo,
        telefone: fTelefone,
        whatsapp: fWhatsapp,
        centro_resultado: fCentroResultado,
        centro_resultado_codigo: fCentroResultadoCodigo,
        observacao: fObservacao,
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
        empresas: fEmpresas,
        unidade_id: fUnidade,
        // '' desvincula o parceiro de forma explícita
        parceiro_id: fParceiro,
        telefone: fTelefone,
        whatsapp: fWhatsapp,
        centro_resultado: fCentroResultado,
        centro_resultado_codigo: fCentroResultadoCodigo,
        observacao: fObservacao,
        // E-mail de acesso acompanha o parceiro vinculado (fonte de verdade)
        ...(fEmail ? { email: fEmail } : {}),
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

  // CAC (11/11/2026) — "Enviar Login": manda ao usuário o link do Portal, o
  // login (e-mail) e o passo a passo de primeiro acesso. A senha não vai no
  // e-mail: mandá-la em claro criaria uma credencial permanente na caixa de
  // entrada. Quem define a senha é o admin, no cadastro.
  const [enviandoLoginId, setEnviandoLoginId] = useState<string | null>(null)
  // Diálogo de confirmação do design system (no lugar do window.confirm nativo)
  const [confirmarLogin, setConfirmarLogin] = useState<UsuarioLista | null>(null)
  const [resultadoLogin, setResultadoLogin] = useState<{
    ok: boolean
    nome: string
    email: string
    motivo?: string
  } | null>(null)

  const executarEnvioLogin = async (u: UsuarioLista) => {
    setConfirmarLogin(null)
    setEnviandoLoginId(u.id)
    setErro('')
    try {
      const res = await enviarLoginUsuario(u.id)
      if (res && res.ok) {
        setResultadoLogin({ ok: true, nome: u.nome, email: res.para || u.email })
      } else {
        setResultadoLogin({
          ok: false,
          nome: u.nome,
          email: u.email,
          motivo: res?.erro || 'O servidor não confirmou o envio.',
        })
      }
    } catch (e) {
      setResultadoLogin({
        ok: false,
        nome: u.nome,
        email: u.email,
        motivo: getErrorMessage(e) || 'Erro ao enviar o login.',
      })
    } finally {
      setEnviandoLoginId(null)
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

  // T6d: "todas" = sem filtro (valor explícito do dropdown)
  // Unidades da empresa PRINCIPAL (a primeira selecionada). Sem empresa marcada,
  // mostra todas — evita campo vazio antes da escolha.
  const empresaPrincipalId = fEmpresas[0] || ''
  const unidadesDaEmpresa = unidades.filter(
    (u) => !empresaPrincipalId || u.empresa_id === empresaPrincipalId,
  )

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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">Grupos de Permissão</h2>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={abrirNovoGrupo}
              className="h-8 text-xs gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Novo Grupo
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {grupos.map((g) => (
            <div
              key={g.id}
              className="bg-white rounded-lg border border-[#E5E7EB] p-2.5 shadow-xs hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[12px] font-bold text-gray-900 truncate">{g.nome}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-[#1B5E20] border border-emerald-200/60 uppercase shrink-0">
                  {g.escopo}
                </span>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                {usuarios.filter((u) => u.grupo === g.nome).length} usuário(s)
              </p>
              {isAdmin && (
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => abrirBotoes(g)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#1B5E20] hover:text-[#0F3D13] transition-colors"
                  >
                    <MousePointerClick className="h-3.5 w-3.5" /> Permissões
                  </button>
                  {/* CRUD de grupos (tarefa CAC, 11/11/2026) */}
                  <button
                    type="button"
                    onClick={() => abrirEditarGrupo(g)}
                    className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => excluirGrupoHandler(g)}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 transition-colors"
                  >
                    Excluir
                  </button>
                </div>
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
                          ? fmtDataBRT(u.ultimo_login)
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
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs text-[#1B5E20] hover:text-[#0F3D13]"
                              title="Enviar e-mail com o acesso ao Portal"
                              disabled={enviandoLoginId === u.id}
                              onClick={() => setConfirmarLogin(u)}
                            >
                              {enviandoLoginId === u.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                              ) : (
                                <Mail className="h-3.5 w-3.5 mr-1" />
                              )}
                              Enviar Login
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => abrirEditar(u)}
                            >
                              Editar
                            </Button>
                          </div>
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

      {/* Dialog Grupo de permissão (CRUD — tarefa CAC) */}
      <Dialog open={dialogGrupo !== null} onOpenChange={(o) => !o && setDialogGrupo(null)}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogGrupo && dialogGrupo !== 'novo' ? 'Editar Grupo' : 'Novo Grupo'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Nome do grupo
              </Label>
              <Input
                value={gNome}
                onChange={(e) => setGNome(e.target.value)}
                className="h-10 bg-gray-50"
                placeholder="Ex.: Comercial"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Escopo
              </Label>
              <Select value={gEscopo} onValueChange={setGEscopo}>
                <SelectTrigger className="h-10 bg-gray-50">
                  <SelectValue placeholder="Selecione o escopo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grupo">Grupo (acesso total)</SelectItem>
                  <SelectItem value="empresa">Empresa</SelectItem>
                  <SelectItem value="unidade">Unidade</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[11px] text-gray-400">
                Define a que nível de escopo este grupo se aplica.
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogGrupo(null)}>
              Cancelar
            </Button>
            <Button
              onClick={salvarGrupoHandler}
              disabled={salvandoGrupo}
              className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvandoGrupo && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <DialogContent className="bg-white w-full max-w-[95vw] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogEditar ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {/* ===== 1) PRIMEIRO CAMPO: vínculo com Parceiros & Contatos =====
                O parceiro é a FONTE DE VERDADE do cadastro: ao selecioná-lo, a
                tela é preenchida com os dados existentes nele (nome, e-mail,
                cargo, telefone, WhatsApp, centro de resultado, observação).
                Por isso ele vem antes de tudo — quem vincula preenche primeiro. */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                1. Parceiro / Contato vinculado
              </Label>
              {/* (11/11/2026) Campo de busca removido: era redundante com o
                  próprio dropdown, que já lista os parceiros. O e-mail do
                  usuário passa a ser DERIVADO deste vínculo. */}
              <Select
                value={fParceiro || 'nenhum'}
                onValueChange={(v) => {
                  if (v === 'nenhum') {
                    setFParceiro('')
                    setFEmail('')
                    return
                  }
                  setFParceiro(v)
                  // Preenche a tela com os dados do parceiro selecionado
                  const p = opcoesParceiro.find((o) => o.id === v)
                  if (p) {
                    if (p.nome) setFNome(p.nome)
                    setFEmail(String(p.email || '').toLowerCase())
                    if (p.cargo) setFCargo(p.cargo)
                    if (p.telefone) setFTelefone(p.telefone)
                    if (p.whatsapp) setFWhatsapp(p.whatsapp)
                    if (p.centro_resultado) setFCentroResultado(p.centro_resultado)
                    if (p.centro_resultado_codigo)
                      setFCentroResultadoCodigo(p.centro_resultado_codigo)
                    if (p.observacao) setFObservacao(p.observacao)
                  }
                }}
              >
                <SelectTrigger className="h-10 bg-gray-50 w-full">
                  <SelectValue
                    placeholder={carregandoParceiros ? 'Carregando…' : 'Selecione o parceiro'}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem vínculo</SelectItem>
                  {opcoesParceiro.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                      {p.cnpj ? ` · ${p.cnpj}` : ''}
                    </SelectItem>
                  ))}
                  {!carregandoParceiros && opcoesParceiro.length === 0 && (
                    <div className="px-2 py-1.5 text-[11px] text-gray-500">
                      Nenhum parceiro cadastrado.
                    </div>
                  )}
                </SelectContent>
              </Select>
              {fParceiro ? (
                <span className="text-[11px] text-emerald-700 font-medium">
                  Vinculado: {opcoesParceiro.find((p) => p.id === fParceiro)?.nome || fParceiro}
                  {' — '}os campos abaixo foram preenchidos com os dados dele.
                </span>
              ) : (
                <span className="text-[11px] text-gray-500">
                  Opcional. Ao escolher, nome, e-mail, cargo e contatos são preenchidos
                  automaticamente.
                </span>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                2. Nome
              </Label>
              <Input
                value={fNome}
                onChange={(e) => setFNome(e.target.value)}
                className="h-10 bg-gray-50"
              />
            </div>
            {/* ===== 3. E-MAIL: DERIVADO DO PARCEIRO =====
                (11/11/2026) O e-mail de acesso deixou de ser digitado: ele vem
                do vínculo com Parceiros & Contatos, que é a fonte de verdade do
                cadastro. Sem vínculo não há e-mail — a conta não pode ser criada. */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                3. E-mail de acesso
              </Label>
              <Input
                type="email"
                value={fEmail}
                readOnly
                disabled
                placeholder="Selecione um parceiro para obter o e-mail"
                className="h-10 bg-gray-100 text-gray-700 cursor-not-allowed"
              />
              {fEmail ? (
                <span className="text-[11px] text-emerald-700 font-medium">
                  Vem do parceiro vinculado. Para alterar, edite o e-mail em Parceiros &amp;
                  Contatos.
                </span>
              ) : (
                <span className="text-[11px] text-amber-700">
                  Obrigatório: vincule um parceiro que tenha e-mail cadastrado.
                </span>
              )}
            </div>

            {!dialogEditar && (
              <>
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

            {/* ===== Empresas (MÚLTIPLAS) =====
                O usuário pode responder por mais de uma empresa do grupo.
                A PRIMEIRA marcada é a principal (escopo e relatórios). */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Empresas vinculadas
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {empresas.map((e) => {
                  const marcada = fEmpresas.includes(e.id)
                  const principal = fEmpresas[0] === e.id
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        setFEmpresas((prev) => {
                          const nova = prev.includes(e.id)
                            ? prev.filter((x) => x !== e.id)
                            : [...prev, e.id]
                          return nova
                        })
                        setFUnidade('')
                      }}
                      className={
                        'inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-[12px] font-semibold transition-colors ' +
                        (marcada
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                          : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400')
                      }
                      title={principal ? 'Empresa principal (1ª selecionada)' : e.nome}
                    >
                      <span
                        className={
                          'h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center ' +
                          (marcada
                            ? 'border-emerald-700 bg-emerald-700'
                            : 'border-gray-400 bg-transparent')
                        }
                      >
                        {marcada ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                      </span>
                      {e.nome}
                      {principal ? (
                        <span className="text-[9px] uppercase tracking-wide text-emerald-700/80">
                          principal
                        </span>
                      ) : null}
                    </button>
                  )
                })}
                {empresas.length === 0 && (
                  <span className="text-[11px] text-gray-500">Nenhuma empresa cadastrada.</span>
                )}
              </div>
              <span className="text-[11px] text-gray-500">
                Selecione uma ou mais. A primeira marcada vira a empresa principal.
              </span>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Unidade da empresa principal
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

            {/* ===== Dados do contato — MESMO FORMATO de Parceiros & Contatos =====
                (11/11/2026) Máscara de telefone e centro de resultado como
                autocomplete do Sankhya, idênticos ao ParceiroCadastroDialog. */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                WhatsApp / Telefone
              </Label>
              <Input
                value={fWhatsapp || fTelefone || ''}
                onChange={(e) => {
                  const m = mascaraTelefone(e.target.value)
                  setFWhatsapp(m)
                  setFTelefone(m)
                }}
                className="h-10 bg-gray-50"
                placeholder="(27) 99999-9999"
                inputMode="tel"
              />
            </div>

            {/* Centro de resultado (Sankhya) — dropdown com busca */}
            <div
              className="grid gap-1.5 relative"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropCentro(false)
              }}
            >
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Centro de resultado (Sankhya)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  value={fCentroResultado || ''}
                  onChange={(e) => {
                    setFCentroResultado(e.target.value)
                    setFCentroResultadoCodigo('')
                    setDropCentro(true)
                    if (!centrosCarregados) buscarCentros('')
                  }}
                  onFocus={() => {
                    setDropCentro(true)
                    if (!centrosCarregados) buscarCentros('')
                  }}
                  placeholder="digite para filtrar os centros..."
                  className="h-10 bg-gray-50 flex-1"
                />
                {fCentroResultado ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFCentroResultado('')
                      setFCentroResultadoCodigo('')
                    }}
                    className="p-2 text-gray-400 hover:text-gray-600"
                    title="Limpar centro de resultado"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
                {centrosBuscando ? (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                ) : null}
              </div>

              {fCentroResultadoCodigo ? (
                <span className="text-[11px] text-emerald-700 font-medium">
                  Código Sankhya: {fCentroResultadoCodigo}
                </span>
              ) : null}

              {centrosCarregados && dropCentro && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {centrosFiltrados.length > 0 ? (
                    centrosFiltrados.map((c) => (
                      <button
                        key={c.codigo}
                        type="button"
                        onClick={() => {
                          setFCentroResultado(c.descricao)
                          setFCentroResultadoCodigo(String(c.codigo))
                          setDropCentro(false)
                        }}
                        className="block w-full text-left px-3 py-2 hover:bg-emerald-50 text-[12px]"
                      >
                        <span className="font-semibold text-gray-800">{c.descricao}</span>
                        <span className="ml-2 text-gray-400 tabular-nums">{c.codigo}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-[11px] text-gray-500">
                      {centrosBuscando ? 'Consultando o Sankhya…' : 'Nenhum centro encontrado.'}
                    </div>
                  )}
                </div>
              )}
              {centrosErro ? (
                <span className="text-[11px] text-amber-700">{centrosErro}</span>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Observação
              </Label>
              <Textarea
                value={fObservacao}
                onChange={(e) => setFObservacao(e.target.value)}
                rows={2}
                className="bg-gray-50 resize-none"
              />
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
                    {fmtDataBRT(r.created)}
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
        <DialogContent className="bg-white w-full max-w-[95vw] sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MousePointerClick className="h-4 w-4 text-[#1B5E20]" />
                Permissões — {dialogBotoes?.nome}
              </span>
              {/* T6f: X manual REMOVIDO — o DialogContent já tem fecho próprio (duplicado) */}
            </DialogTitle>
          </DialogHeader>
          <p className="text-[12px] text-gray-500 -mt-2">
            Grade de permissões por módulo: marque as operações (CRUD) liberadas para este grupo.
            ABAS/BOTÕES controlam a visibilidade das seções e botões da tela (fail-open: sem
            marcação = tudo visível).
          </p>
          {/* T6d: grade à esquerda + painel CRUD à direita quando linha expandida */}
          <div className={expandida ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : ''}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left font-bold text-gray-700 py-2 pr-2">Módulo</th>
                    {COLUNAS_CRUD.map((c) => (
                      <th key={c.key} className="text-center font-bold text-gray-700 py-2 px-1.5">
                        {c.label}
                      </th>
                    ))}
                    <th className="text-center font-bold text-gray-700 py-2 px-1.5">ABAS</th>
                    <th className="text-center font-bold text-gray-700 py-2 px-1.5">BOTÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {BUTTON_GATES.map((tela) => {
                    const ocultos = botoesConfig[tela.key] || []
                    const temAbas = (ABAS_POR_TELA[tela.key] || []).length > 0
                    const temBotoes = tela.buttons.length > 0
                    return (
                      <tr key={tela.key} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="py-2 pr-2">
                          <div className="font-semibold text-gray-900">{tela.label}</div>
                          <div className="text-[10px] text-gray-400">{tela.key}</div>
                        </td>
                        {COLUNAS_CRUD.map((c) => {
                          const marcado = !ocultos.includes(CHAVE_CRUD(tela.key, c.key) + ':off')
                          // T6c: coluna TODAS marca/desmarca TODAS as permissões da linha
                          if (c.key === 'todas') {
                            const chaves = ['ver', 'criar', 'editar', 'excluir'].map(
                              (k) => CHAVE_CRUD(tela.key, k) + ':off',
                            )
                            const todasMarcadas = chaves.every((k) => !ocultos.includes(k))
                            return (
                              <td key={c.key} className="text-center py-2 px-1.5">
                                <input
                                  type="checkbox"
                                  checked={todasMarcadas}
                                  onChange={() => {
                                    for (const k of chaves) {
                                      const esta = ocultos.includes(k)
                                      if (todasMarcadas && !esta) toggleBotao(tela.key, k)
                                      else if (!todasMarcadas && esta) toggleBotao(tela.key, k)
                                    }
                                  }}
                                  className="h-3.5 w-3.5 accent-[#1B5E20] font-bold"
                                />
                              </td>
                            )
                          }
                          return (
                            <td key={c.key} className="text-center py-2 px-1.5">
                              <input
                                type="checkbox"
                                checked={marcado}
                                onChange={() =>
                                  toggleBotao(tela.key, CHAVE_CRUD(tela.key, c.key) + ':off')
                                }
                                className="h-3.5 w-3.5 accent-[#1B5E20]"
                              />
                            </td>
                          )
                        })}
                        {/* T6d: ABAS vira BOTÃO que abre o painel à direita */}
                        <td className="text-center py-2 px-1.5">
                          {temAbas ? (
                            <button
                              type="button"
                              onClick={() => setExpandida(expandida === tela.key ? '' : tela.key)}
                              className={cn(
                                'text-[11px] font-semibold hover:underline',
                                expandida === tela.key ? 'text-gray-900' : 'text-[#1B5E20]',
                              )}
                            >
                              Abas
                            </button>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        {/* T6d: BOTÕES também abre o painel à direita */}
                        <td className="text-center py-2 px-1.5">
                          {temBotoes ? (
                            <button
                              type="button"
                              onClick={() => setExpandida(expandida === tela.key ? '' : tela.key)}
                              className={cn(
                                'text-[11px] font-semibold hover:underline',
                                expandida === tela.key ? 'text-gray-900' : 'text-[#1B5E20]',
                              )}
                            >
                              Botões
                            </button>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* T6d: expansão — painel À DIREITA da grade (mesma linha do grid) */}
            {expandida &&
              (() => {
                const tela = BUTTON_GATES.find((t) => t.key === expandida)
                if (!tela) return null
                const ocultos = botoesConfig[tela.key] || []
                return (
                  <div className="p-3 rounded-lg border border-emerald-100 bg-emerald-50/40 self-start">
                    <div className="text-[12px] font-bold text-gray-900 mb-2 flex items-center justify-between">
                      <span>{tela.label} — abas e botões</span>
                      <button
                        type="button"
                        onClick={() => setExpandida('')}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-1.5">
                      {(ABAS_POR_TELA[tela.key] || []).length > 0 && (
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-1">
                          Abas
                        </div>
                      )}
                      {(ABAS_POR_TELA[tela.key] || []).map((aba: any) => (
                        <label
                          key={'aba_' + aba.key}
                          className="flex items-center gap-2 text-[12px] text-gray-700 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={!ocultos.includes('aba_' + aba.key)}
                            onChange={() => toggleBotao(tela.key, 'aba_' + aba.key)}
                            className="h-3.5 w-3.5 accent-[#1B5E20]"
                          />
                          <span className="truncate">{aba.label}</span>
                        </label>
                      ))}
                      {tela.buttons.length > 0 && (
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-2">
                          Botões
                        </div>
                      )}
                      {tela.buttons.map((b) => (
                        <label
                          key={b.key}
                          className="flex items-center gap-2 text-[12px] text-gray-700 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={!ocultos.includes(b.key)}
                            onChange={() => toggleBotao(tela.key, b.key)}
                            className="h-3.5 w-3.5 accent-[#1B5E20]"
                          />
                          <span className="truncate">{b.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })()}
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

      {/* Confirmação amigável — Enviar Login */}
      <AlertDialog
        open={confirmarLogin !== null}
        onOpenChange={(o) => !o && setConfirmarLogin(null)}
      >
        <AlertDialogContent className="bg-white max-w-md rounded-2xl border border-gray-200">
          <AlertDialogHeader>
            <div className="h-11 w-11 rounded-full bg-emerald-50 flex items-center justify-center text-[#1B5E20] mb-1">
              <Mail className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-base font-bold text-gray-900">
              Enviar acesso ao Portal?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600 leading-relaxed">
              Vamos enviar um e-mail de boas-vindas para{' '}
              <strong className="text-gray-900">{confirmarLogin?.nome}</strong> (
              <span className="font-mono text-[11px]">{confirmarLogin?.email}</span>).
              <br />
              <br />
              O e-mail contém os dados de cadastro, o login de acesso, o link para cadastrar/trocar
              a senha e o endereço do PGE.
              <br />
              <br />
              <span className="text-amber-700">
                Por segurança, a senha não é enviada por e-mail.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="h-9 text-xs bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
              onClick={(ev) => {
                ev.preventDefault()
                if (confirmarLogin) void executarEnvioLogin(confirmarLogin)
              }}
            >
              Enviar Acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Retorno do envio */}
      <AlertDialog
        open={resultadoLogin !== null}
        onOpenChange={(o) => !o && setResultadoLogin(null)}
      >
        <AlertDialogContent className="bg-white max-w-md rounded-2xl border border-gray-200">
          <AlertDialogHeader>
            <div
              className={
                'h-11 w-11 rounded-full flex items-center justify-center mb-1 ' +
                (resultadoLogin?.ok ? 'bg-emerald-50 text-[#1B5E20]' : 'bg-rose-50 text-rose-700')
              }
            >
              {resultadoLogin?.ok ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </div>
            <AlertDialogTitle className="text-base font-bold text-gray-900">
              {resultadoLogin?.ok ? 'Acesso enviado' : 'Não foi possível enviar'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600 leading-relaxed">
              {resultadoLogin?.ok ? (
                <>
                  O e-mail com as instruções de acesso foi enviado para{' '}
                  <strong className="text-gray-900">{resultadoLogin?.email}</strong>. Peça para
                  conferir a caixa de entrada e o spam.
                </>
              ) : (
                <>
                  O envio para <strong className="text-gray-900">{resultadoLogin?.email}</strong>{' '}
                  não foi concluído.
                  {resultadoLogin?.motivo ? (
                    <span className="block mt-2 font-mono text-[11px] text-rose-700 break-words">
                      {resultadoLogin.motivo}
                    </span>
                  ) : null}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="h-9 text-xs bg-[#1B5E20] hover:bg-[#0F3D13] text-white">
              Entendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
