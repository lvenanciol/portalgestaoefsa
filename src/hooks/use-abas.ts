import { useCallback, useEffect, useState } from 'react'
import { useBotoes } from '@/services/botoes-service'

/**
 * Gate de ABAS por grupo de usuários.
 *
 * A matriz de Controle de Acessos grava as abas ocultas em
 * grupos_permissao.permissoes.botoes[tela] com a chave `aba_<key>`.
 * Este hook lê essa mesma fonte e expõe:
 *
 *   const { abaVisivel, filtrarAbas } = useAbas('documentos')
 *   abaVisivel('seguros')       // false se o grupo não pode ver a aba
 *   filtrarAbas(['alvaras'])    // já filtrado
 *
 * 11/11/2026 (pedido "só exibir abas com permissão"): era fail-open — a aba
 * aparecia até as permissões chegarem (pronto=false devolvia true) e para
 * qualquer grupo sem registro específico. Agora é fail-closed: aba visível
 * somente se a tela pertence ao grupo (módulo com 'ver') E a aba não está
 * oculta; Admin bypass; durante o load, nada aparece de mais.
 */
export function useAbas(tela: string) {
  const { pode, permissoes } = useBotoes()
  const [pronto, setPronto] = useState(permissoes !== null)

  useEffect(() => {
    setPronto(permissoes !== null)
  }, [permissoes])

  const abaVisivel = useCallback(
    (key: string) => {
      if (!pronto) return false // permissões ainda carregando → oculto
      return pode(tela, 'aba_' + key)
    },
    [pode, tela, pronto],
  )

  const filtrarAbas = useCallback(
    <T extends string>(abas: T[]): T[] => abas.filter((k) => abaVisivel(k)),
    [abaVisivel],
  )

  return { abaVisivel, filtrarAbas }
}
