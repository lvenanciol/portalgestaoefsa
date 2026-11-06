import { useEffect, useRef, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { removerAnotacoesImportacao } from '@/components/documentos/juridicos-texto-utils'

interface ColecaoDestino {
  colecao: string
  id: string
  campo: string
}

/**
 * Sanitização one-shot do texto de observações de um processo jurídico:
 * remove anotações de importação legadas ("[Importado em ... por email ...]")
 * gravadas dentro do campo de observações por versões anteriores e regrava
 * o campo limpo. A timeline deixa de exibir o evento fantasma de importação
 * (data/hora da importação + e-mail do usuário como se fosse andamento).
 *
 * Roda uma única vez por processo (guard em memória + marca "sanitizado:"
 * no texto), para não competir com edições do usuário.
 */
const memoriaSanitizados = new Set<string>()

export function ehTextoSanitizado(texto?: string | null): boolean {
  return !!texto && texto.trimStart().startsWith('sanitizado:')
}

export function useSanitizarObservacoesImportacao(
  processoId: string | undefined,
  observacoesTexto: string | undefined,
  destino: ColecaoDestino | undefined,
) {
  const [textoLimpo, setTextoLimpo] = useState(observacoesTexto || '')
  const jaProcessado = useRef(false)

  useEffect(() => {
    setTextoLimpo(observacoesTexto || '')
  }, [observacoesTexto])

  useEffect(() => {
    if (!processoId || !destino?.colecao || !destino.id || jaProcessado.current) return
    if (!observacoesTexto || !observacoesTexto.trim()) return

    // Texto vindo do "Editar Texto Completo" já sanitizado nesta sessão
    if (memoriaSanitizados.has(processoId) || ehTextoSanitizado(observacoesTexto)) {
      jaProcessado.current = true
      setTextoLimpo(observacoesTexto.replace(/^\s*sanitizado:\s*/i, ''))
      return
    }

    const { limpo, anotacao } = extrairAnotacaoSegura(observacoesTexto)
    memoriaSanitizados.add(processoId)
    jaProcessado.current = true

    if (anotacao) {
      setTextoLimpo(limpo)
      // Persistência defensiva: nunca derruba a abertura do modal por falha aqui
      pb.collection(destino.colecao)
        .update(destino.id, { [destino.campo]: limpo })
        .catch(() => {
          /* texto permanece limpo apenas em memória */
        })
    }
  }, [processoId, observacoesTexto, destino?.colecao, destino?.id, destino?.campo])

  return textoLimpo
}

function extrairAnotacaoSegura(texto: string) {
  try {
    return removerAnotacoesImportacao(texto) as unknown as {
      limpo: string
      anotacao: string | null
    }
  } catch {
    return { limpo: texto, anotacao: null }
  }
}
