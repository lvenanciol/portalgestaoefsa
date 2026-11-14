import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { carregarPermissoes, permissoesCache, type Permissoes } from '@/services/permissoes-service'
import { atorAtual, type Ator } from './repo'

// ============================================================================
// LL5 — CONTEXTO DE PAPEL E OWNER (15/11/2026)
//
// Fonte do papel: o SERVIÇO DE PERMISSÕES (que resolve o nome do grupo).
// NUNCA `user.grupoNome` — esse campo não existe no record do authStore e já
// causou um bug de "admin não vê os botões" no PGE.
//
// O admin pode alternar o owner visualizado (para lançar por um familiar).
// O membro NÃO tem esse controle: o owner é sempre ele.
// ============================================================================

interface Ll5Ctx {
  ator: Ator
  isAdmin: boolean
  perfil: Permissoes | null
  /** owner cujos dados estão sendo vistos */
  ownerAtual: string
  setOwnerAtual: (id: string) => void
  /** lista de owners disponíveis para o admin escolher */
  owners: Array<{ id: string; nome: string; email: string }>
  carregando: boolean
}

const Ctx = createContext<Ll5Ctx | undefined>(undefined)

export function Ll5Provider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [perfil, setPerfil] = useState<Permissoes | null>(permissoesCache())
  const [carregando, setCarregando] = useState(true)
  const [owners, setOwners] = useState<Array<{ id: string; nome: string; email: string }>>([])
  const [ownerAtual, setOwnerAtualState] = useState<string>('')

  useEffect(() => {
    let vivo = true
    carregarPermissoes()
      .then((p) => {
        if (vivo) setPerfil(p)
      })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [user])

  const ator = useMemo(() => atorAtual(user, perfil?.grupoNome), [user, perfil])
  const isAdmin = ator.role === 'admin'

  // owner inicial: o próprio ator; admin pode trocar
  useEffect(() => {
    if (!ator.id) return
    setOwnerAtualState((prev) => prev || ator.id)
  }, [ator.id])

  // lista de owners para o seletor do admin
  useEffect(() => {
    if (!isAdmin) return
    let vivo = true
    ;(async () => {
      try {
        const pb = (await import('@/lib/pocketbase/client')).default
        const r = await pb.collection('users').getFullList({ sort: 'name' })
        if (!vivo) return
        setOwners(
          (r as any[]).map((u) => ({
            id: u.id,
            nome: u.name || u.email,
            email: u.email,
          })),
        )
      } catch (_) {
        if (vivo) setOwners([])
      }
    })()
    return () => {
      vivo = false
    }
  }, [isAdmin])

  const setOwnerAtual = (id: string) => {
    // membro não troca de owner, mesmo que a UI tente
    if (!isAdmin) return
    setOwnerAtualState(id)
  }

  const valor: Ll5Ctx = {
    ator,
    isAdmin,
    perfil,
    ownerAtual: isAdmin ? ownerAtual || ator.id : ator.id,
    setOwnerAtual,
    owners,
    carregando,
  }

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useLl5(): Ll5Ctx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useLl5 deve ser usado dentro de Ll5Provider')
  return c
}
