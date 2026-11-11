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
 * Fail-open por construção: sem grupo, sem permissões carregadas ou grupo
 * Admin, tudo é visível — o mesmo contrato dos botões.
 */
export function useAbas(tela: string) {
  const { pode, permissoes } = useBotoes()
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setPronto(true), 0)
    return () => clearTimeout(t)
  }, [permissoes])

  const abaVisivel = useCallback(
    (key: string) => {
      if (!pronto) return true
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
