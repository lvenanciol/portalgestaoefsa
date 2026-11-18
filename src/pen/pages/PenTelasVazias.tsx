import { PenTelaVazia } from './PenTelaVazia'

// ============================================================================
// FASE 0.1 — as 7 telas restantes do módulo /pen.
//
// Cada uma existe só para o shell ficar navegável e para deixar escrito o que
// ela vai receber. Nenhuma tem dado, cálculo ou consulta.
// ============================================================================

// 2.2 — PenNortePage saiu daqui: tem arquivo próprio (PenNortePage.tsx).
// A tela vazia era o que aparecia na rota /pen/norte antes da fase 2.2.

// 2.3 — PenDiagnosticoPage saiu daqui: tem arquivo próprio.

// 2.4 — PenIshikawaPage saiu daqui: tem arquivo próprio.

// 2.5 — PenBscPage saiu daqui: tem arquivo próprio.

export function PenCincoW2hPage() {
  return (
    <PenTelaVazia
      titulo="5W2H"
      descricao="Plano de ação: o que, por que, quem, quando, onde, como e quanto."
      recebe={[
        'Ações derivadas das causas raiz',
        'Os 7 campos por ação',
        'Prazo e responsável',
        'Status de validação',
      ]}
    />
  )
}

export function PenAcompanhamentoPage() {
  return (
    <PenTelaVazia
      titulo="Acompanhamento"
      descricao="Execução mês a mês contra o plano."
      recebe={[
        'Realizado x meta por indicador',
        'Evolução no ciclo',
        'Desvios e plano de recuperação',
        'Histórico de medições',
      ]}
    />
  )
}

export function PenGovernancaPage() {
  return (
    <PenTelaVazia
      titulo="Governança"
      descricao="Rituais, aprovações e trilha de decisão."
      recebe={[
        'Calendário de rituais (mensal, trimestral)',
        'Aprovações e validações do ciclo',
        'Registro de decisões e trade-offs',
        'Trilha de auditoria das alterações',
      ]}
    />
  )
}
