import { useState, useMemo } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, Search, Check, AlertCircle, Loader2, Mail, Users } from 'lucide-react'
import { limparTextoResponsavel } from '@/lib/responsavel-utils'
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'

export interface DestinatarioItem {
  chave: string // identificador único (id ou email ou nome)
  id?: string
  nome: string
  email: string
  tipo: 'parceiro' | 'responsavel' | 'usuario'
  empresa?: string
  qtdTarefas: number
}

export interface TarefaEnvioProps {
  tarefasVisiveis: any[]
  parceirosTodos: any[]
  disabled?: boolean
}

export function TarefasEnviarPopover({
  tarefasVisiveis,
  parceirosTodos,
  disabled = false,
}: TarefaEnvioProps) {
  const { toast } = useToast()
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)

  // Extrai SOMENTE os responsáveis e/ou parceiros/contatos presentes nas tarefas da tela filtrada
  const destinatariosElegiveis = useMemo(() => {
    const mapa = new Map<string, DestinatarioItem>()

    // Mapa auxiliar de parceiros por ID e por nome (case insensitive)
    const parceirosMapId = new Map<string, any>()
    const parceirosMapNome = new Map<string, any>()
    for (const p of parceirosTodos) {
      if (p.id) parceirosMapId.set(p.id, p)
      const n = (p.nome || '').trim().toLowerCase()
      if (n) parceirosMapNome.set(n, p)
      const nLimpo = limparTextoResponsavel(p.nome || '')
        .trim()
        .toLowerCase()
      if (nLimpo) parceirosMapNome.set(nLimpo, p)
    }

    // Varre cada tarefa visível (filtrada)
    for (const t of tarefasVisiveis) {
      const respRaw = (t.responsavel || '').trim()
      const respLimpo = limparTextoResponsavel(respRaw) || respRaw

      // 1. Processa parceiros vinculados na tarefa (campo JSON ou array)
      let pIds: string[] = []
      try {
        pIds = Array.isArray(t.parceiros) ? t.parceiros : JSON.parse(t.parceiros || '[]')
      } catch (_) {
        pIds = []
      }

      for (const pid of pIds) {
        const pObj = parceirosMapId.get(pid)
        if (pObj) {
          const email = (pObj.email || '').trim().toLowerCase()
          const chave = pObj.id || email || pObj.nome
          const itemExistente = mapa.get(chave)
          if (itemExistente) {
            itemExistente.qtdTarefas += 1
          } else {
            mapa.set(chave, {
              chave,
              id: pObj.id,
              nome: limparTextoResponsavel(pObj.nome) || pObj.nome,
              email: email,
              tipo: 'parceiro',
              empresa:
                pObj.empresa || (Array.isArray(pObj.empresas) ? pObj.empresas.join(', ') : ''),
              qtdTarefas: 1,
            })
          }
        }
      }

      // 2. Processa o responsável da tarefa
      if (respRaw) {
        // Tenta achar o parceiro correspondente ao responsável
        const pPorNome =
          parceirosMapNome.get(respRaw.toLowerCase()) ||
          parceirosMapNome.get(respLimpo.toLowerCase())

        const email = pPorNome ? (pPorNome.email || '').trim().toLowerCase() : ''
        const chave = pPorNome ? pPorNome.id : `resp-${respLimpo.toLowerCase()}`

        const itemExistente = mapa.get(chave)
        if (itemExistente) {
          itemExistente.qtdTarefas += 1
        } else {
          mapa.set(chave, {
            chave,
            id: pPorNome?.id,
            nome: respLimpo,
            email: email,
            tipo: pPorNome ? 'parceiro' : 'responsavel',
            empresa:
              pPorNome?.empresa ||
              (Array.isArray(pPorNome?.empresas) ? pPorNome.empresas.join(', ') : t.empresa || ''),
            qtdTarefas: 1,
          })
        }
      }
    }

    return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [tarefasVisiveis, parceirosTodos])

  // Filtra por busca de texto (nome ou empresa ou e-mail)
  const destinatariosFiltrados = useMemo(() => {
    if (!busca.trim()) return destinatariosElegiveis
    const q = busca.trim().toLowerCase()
    return destinatariosElegiveis.filter(
      (d) =>
        d.nome.toLowerCase().includes(q) ||
        (d.empresa || '').toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q),
    )
  }, [destinatariosElegiveis, busca])

  // Alterna seleção individual
  const alternar = (chave: string) => {
    setSelecionados((prev) =>
      prev.includes(chave) ? prev.filter((k) => k !== chave) : [...prev, chave],
    )
  }

  // Alterna selecionar todos os filtrados com e-mail válido
  const comEmailValido = destinatariosFiltrados.filter((d) => d.email && d.email.includes('@'))
  const todosValidosSelecionados =
    comEmailValido.length > 0 && comEmailValido.every((d) => selecionados.includes(d.chave))

  const alternarTodos = () => {
    if (todosValidosSelecionados) {
      const chavesDesmarcar = new Set(comEmailValido.map((d) => d.chave))
      setSelecionados((prev) => prev.filter((k) => !chavesDesmarcar.has(k)))
    } else {
      const novasChaves = new Set([...selecionados, ...comEmailValido.map((d) => d.chave)])
      setSelecionados(Array.from(novasChaves))
    }
  }

  // Dispara o envio
  const handleEnviar = async () => {
    const listaEnvio = destinatariosElegiveis.filter((d) => selecionados.includes(d.chave))

    if (listaEnvio.length === 0) {
      toast({
        title: 'Nenhum destinatário selecionado',
        description: 'Selecione pelo menos um responsável ou parceiro com e-mail cadastrado.',
        variant: 'destructive',
      })
      return
    }

    const semEmail = listaEnvio.filter((d) => !d.email || !d.email.includes('@'))
    if (semEmail.length > 0 && listaEnvio.length === semEmail.length) {
      toast({
        title: 'Destinatário sem e-mail',
        description: `"${semEmail[0].nome}" não possui e-mail cadastrado. Atualize o cadastro do parceiro antes de enviar.`,
        variant: 'destructive',
      })
      return
    }

    const tarefasIds = tarefasVisiveis.map((t) => t.id).filter(Boolean)
    if (tarefasIds.length === 0) {
      toast({
        title: 'Nenhuma tarefa na tela',
        description: 'Não há tarefas disponíveis nos filtros ativos para envio.',
        variant: 'destructive',
      })
      return
    }

    setEnviando(true)
    try {
      const payload = {
        destinatarios: listaEnvio
          .filter((d) => d.email && d.email.includes('@'))
          .map((d) => ({
            id: d.id,
            nome: d.nome,
            email: d.email,
            tipo: d.tipo,
          })),
        tarefas_ids: tarefasIds,
      }

      const res = (await pb.send('/backend/v1/tarefas/enviar', {
        method: 'POST',
        body: JSON.stringify(payload),
      })) as any

      if (res?.ok) {
        toast({
          title: 'Tarefas enviadas com sucesso!',
          description: `${res.enviados || listaEnvio.length} e-mail(s) com as tarefas detalhadas e logo da empresa enviado(s).`,
        })
        setAberto(false)
        setSelecionados([])
        setBusca('')
      } else {
        toast({
          title: 'Falha no envio',
          description: res?.erro || 'Ocorreu um erro ao enviar os e-mails de acompanhamento.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Falha ao conectar ao servidor de e-mail.'
      toast({
        title: 'Erro ao enviar tarefas',
        description: String(msg).slice(0, 180),
        variant: 'destructive',
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          disabled={disabled}
          variant="outline"
          className="h-9 px-3 text-xs font-semibold border-gray-200 bg-white hover:bg-gray-50 text-gray-800 shadow-2xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
          title="Enviar tarefas filtradas por e-mail para ciência e acompanhamento"
        >
          <Send className="h-3.5 w-3.5 text-[#1B5E20]" />
          <span>Enviar</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[calc(100vw-2rem)] sm:w-[460px] p-0 bg-white shadow-xl border border-gray-200 rounded-xl"
      >
        {/* Cabeçalho do Popover */}
        <div className="p-3.5 border-b border-gray-100 bg-gray-50/60 rounded-t-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100/70 text-[#1B5E20] flex items-center justify-center shrink-0">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900 leading-tight">
                  Enviar Tarefas para Ciência
                </h4>
                <p className="text-[11px] text-gray-500">
                  {tarefasVisiveis.length} tarefa(s) na tela filtrada
                </p>
              </div>
            </div>

            <span className="text-[11px] font-bold text-[#1B5E20] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              {selecionados.length} selecionado(s)
            </span>
          </div>

          {/* Campo de busca interno */}
          <div className="relative mt-2.5">
            <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, empresa ou e-mail..."
              className="h-8 pl-8 text-xs bg-white border-gray-200 rounded-md"
            />
          </div>
        </div>

        {/* Barra de ações rápidas (selecionar todos) */}
        {destinatariosElegiveis.length > 0 && (
          <div className="px-3.5 py-1.5 bg-gray-50/30 border-b border-gray-100 flex items-center justify-between text-[11px] text-gray-600">
            <span>
              Destinatários presentes na tela:{' '}
              <strong className="text-gray-900">{destinatariosFiltrados.length}</strong>
            </span>
            {comEmailValido.length > 0 && (
              <button
                type="button"
                onClick={alternarTodos}
                className="text-[#1B5E20] hover:underline font-semibold cursor-pointer"
              >
                {todosValidosSelecionados ? 'Desmarcar todos' : 'Marcar todos com e-mail'}
              </button>
            )}
          </div>
        )}

        {/* Lista rolável de responsáveis e parceiros/contatos com tarefas na tela filtrada */}
        <div className="p-2 max-h-64 overflow-y-auto space-y-1">
          {destinatariosElegiveis.length === 0 ? (
            <div className="py-8 px-4 text-center">
              <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-400 mx-auto flex items-center justify-center mb-2">
                <Users className="h-5 w-5" />
              </div>
              <p className="text-xs font-semibold text-gray-700">Nenhum destinatário na tela</p>
              <p className="text-[11px] text-gray-500 mt-1 max-w-xs mx-auto">
                As tarefas exibidas com os filtros atuais não possuem responsáveis ou parceiros
                vinculados.
              </p>
            </div>
          ) : destinatariosFiltrados.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-6">
              Nenhum responsável ou parceiro encontrado com essa busca.
            </p>
          ) : (
            destinatariosFiltrados.map((d) => {
              const marcado = selecionados.includes(d.chave)
              const temEmail = Boolean(d.email && d.email.includes('@'))

              return (
                <button
                  key={d.chave}
                  type="button"
                  onClick={() => alternar(d.chave)}
                  className={cn(
                    'w-full flex items-center justify-between p-2 rounded-lg text-xs text-left transition-colors border',
                    marcado
                      ? 'bg-emerald-50/70 border-emerald-200 text-[#1B5E20]'
                      : 'border-transparent hover:bg-gray-50 text-gray-800',
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                    {/* Caixa de seleção no mesmo estilo do form */}
                    <span
                      className={cn(
                        'h-4 w-4 rounded-xs border flex items-center justify-center text-[10px] shrink-0 transition-colors',
                        marcado
                          ? 'bg-[#1B5E20] border-[#1B5E20] text-white'
                          : 'border-gray-300 bg-white',
                      )}
                    >
                      {marcado ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-semibold truncate text-gray-900">{d.nome}</span>
                        {d.empresa ? (
                          <span className="text-[10px] text-gray-400 font-medium shrink-0">
                            ({d.empresa})
                          </span>
                        ) : null}
                      </div>

                      {/* Informação de e-mail ou aviso */}
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px]">
                        {temEmail ? (
                          <span className="text-gray-500 truncate flex items-center gap-1">
                            <Mail className="h-3 w-3 text-gray-400 shrink-0" />
                            <span className="truncate">{d.email}</span>
                          </span>
                        ) : (
                          <span className="text-amber-700 font-medium flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 text-amber-600 shrink-0" />
                            <span>Sem e-mail cadastrado</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Contador de tarefas desse destinatário */}
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
                      {d.qtdTarefas} {d.qtdTarefas === 1 ? 'tarefa' : 'tarefas'}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Rodapé do Popover com botão de Envio */}
        <div className="p-3 border-t border-gray-100 bg-gray-50/80 rounded-b-xl flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500 truncate">
            {selecionados.length > 0
              ? `${selecionados.length} destinatário(s) para receber as tarefas`
              : 'Selecione os destinatários'}
          </p>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAberto(false)}
              disabled={enviando}
              className="h-8 text-xs text-gray-600 hover:text-gray-800"
            >
              Cancelar
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleEnviar}
              disabled={enviando || selecionados.length === 0}
              className="h-8 px-3.5 text-xs font-semibold bg-[#1B5E20] hover:bg-[#0F3D13] text-white shadow-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {enviando ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Enviar</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
