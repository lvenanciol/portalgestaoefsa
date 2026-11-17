import { useCallback, useEffect, useRef, useState } from 'react'

// ============================================================================
// PERSISTÊNCIA DE FILTROS E AJUSTES DE EXIBIÇÃO POR USUÁRIO (17/11/2026)
//
// DIRETIVA DO DONO: "Memorizar e reexibir sempre o último filtro aplicado e
// ajustes de exibição por usuário em TODAS as telas do sistema".
//
// Este hook guarda um estado simples em localStorage, com a chave dividida por:
//   · `escopo`  → a tela (ex.: 'll5.tratamentos', 'tarefas.lista')
//   · `usuario` → o id/e-mail de quem está usando (cada usuário tem o seu)
//
// Assim o filtro é POR USUÁRIO, e telas diferentes não se contaminam.
//
// Uso:
//   const [busca, setBusca] = useFiltroPersistente('ll5.tratamentos', 'busca', '', userKey)
//
// `userKey` deve ser o id do usuário autenticado. Quando ele ainda não
// carregou, o hook funciona em memória e passa a persistir assim que chega.
// ============================================================================

const PREFIXO = 'pge_filtro_v1'

function chaveFinal(escopo: string, campo: string, usuario: string): string {
  return `${PREFIXO}:${escopo}:${usuario || 'anon'}:${campo}`
}

export function useFiltroPersistente<T>(
  escopo: string,
  campo: string,
  inicial: T,
  usuario: string,
): [T, (v: T) => void, () => void] {
  const chave = chaveFinal(escopo, campo, usuario)

  const [valor, setValor] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(chave)
      if (raw === null) return inicial
      const p = JSON.parse(raw)
      // guarda o tipo: se o valor salvo é de outro formato, ignora
      if (p && typeof p === 'object' && 'v' in p) return p.v as T
      return inicial
    } catch (_e) {
      return inicial
    }
  })

  // quando o usuário autentica depois, tentamos ler a preferência dele
  const chaveAnterior = useRef(chave)
  useEffect(() => {
    if (chaveAnterior.current === chave) return
    chaveAnterior.current = chave
    try {
      const raw = localStorage.getItem(chave)
      if (raw === null) return
      const p = JSON.parse(raw)
      if (p && typeof p === 'object' && 'v' in p) setValor(p.v as T)
    } catch (_e) {
      // sem preferência salva para este usuário: mantém o valor atual
    }
  }, [chave])

  const definir = useCallback(
    (v: T) => {
      setValor(v)
      try {
        localStorage.setItem(chave, JSON.stringify({ v }))
      } catch (_e) {
        // storage cheio/bloqueado: a tela segue funcionando
      }
    },
    [chave],
  )

  const limpar = useCallback(() => {
    setValor(inicial)
    try {
      localStorage.removeItem(chave)
    } catch (_e) {
      // nada a fazer
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  return [valor, definir, limpar]
}
