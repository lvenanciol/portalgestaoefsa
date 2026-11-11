import { useEffect, useState, useCallback } from 'react'
import {
  carregarPermissoes,
  permissoesCache,
  limparCachePermissoes,
  can as canFn,
  Permissoes,
} from '@/services/permissoes-service'
import pb from '@/lib/pocketbase/client'

/**
 * Hook único de permissões do app.
 * Centraliza o acesso a carregarPermissoes() + can() para que a Sidebar, os
 * guards de rota e os gates de botão leiam SEMPRE do mesmo objeto — e para que
 * um único `recarregar()` invalide o cache depois de uma edição no CAC.
 */
export function usePermissoes() {
  const [permissoes, setPermissoes] = useState<Permissoes | null>(permissoesCache())
  const [carregando, setCarregando] = useState(!permissoesCache())

  const carregar = useCallback(async (forcar = false) => {
    setCarregando(true)
    try {
      const p = await carregarPermissoes(forcar)
      setPermissoes(p)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    let ativo = true
    carregarPermissoes().then((p) => {
      if (!ativo) return
      setPermissoes(p)
      setCarregando(false)
    })
    return () => {
      ativo = false
    }
  }, [])

  const recarregar = useCallback(async () => {
    limparCachePermissoes()
    await carregar(true)
  }, [carregar])

  // 11/11/2026 — invalida o cache quando o USUÁRIO TROCA (login/logout direto
  // no authStore). Sem isto, o cache de 5 min do usuário anterior sobrevivia à
  // troca de conta no mesmo dispositivo e o novo usuário via menus do antigo.
  const usuarioId = pb.authStore.record?.id || ''
  useEffect(() => {
    limparCachePermissoes()
    setPermissoes(null)
    setCarregando(true)
    carregarPermissoes(true).then((p) => {
      setPermissoes(p)
      setCarregando(false)
    })
  }, [usuarioId])

  /** can('documentos-importacoes', 'editar') */
  const can = useCallback(
    (modulo: string, acao: string) => canFn(permissoes, modulo, acao),
    [permissoes],
  )

  const isAdmin = permissoes?.grupoNome === 'Admin'

  return { permissoes, carregando, can, isAdmin, recarregar }
}
