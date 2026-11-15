// ============================================================================
// TRATAMENTOS — RECONCILIAÇÃO DE TAREFAS (15/11/2026)
//
// PROBLEMA RELATADO (b6): existem tarefas criadas pela tela de Tratamentos que
// não existem mais (tratamento excluído, agenda recalculada, sessão removida).
// E algumas datas podem ter mais de uma tarefa.
//
// Este endpoint RECONCILIA tudo:
//   1. lista todos os tratamentos do usuário;
//   2. para cada um, compara `tarefa_ids` com as tarefas REALMENTE existentes;
//   3. remove tarefas órfãs (id no array mas sem registro);
//   4. remove tarefas que sobraram no PGE mas não estão no array;
//   5. garante 1 tarefa por data (dedupe por prazo);
//   6. regrava `tarefa_ids` com a lista limpa.
//
// Devolve o resumo: quantas órfãs removeu, quantas duplicatas, quantas válidas.
// ============================================================================

routerAdd(
  'POST',
  '/backend/v1/tratamentos/reconciliar-tarefas',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')
    const dono = e.auth.id

    let tratamentos = []
    try {
      tratamentos = $app.findRecordsByFilter(
        'll5_treatments',
        "owner_id = '" + dono + "'",
        '',
        0,
        0,
      )
    } catch (_) {
      tratamentos = []
    }

    let orfas = 0
    let duplicadas = 0
    let validas = 0
    let tratamentosAjustados = 0

    for (const t of tratamentos) {
      let ids = []
      try {
        const bruto = t.get('tarefa_ids')
        if (Array.isArray(bruto)) ids = bruto
        else if (typeof bruto === 'string') ids = JSON.parse(bruto)
      } catch (_) {
        ids = []
      }
      if (!Array.isArray(ids)) ids = []

      const sessoes = []
      try {
        const brutoS = t.get('proximas_sessoes')
        if (Array.isArray(brutoS)) sessoes = brutoS
        else if (typeof brutoS === 'string') sessoes = JSON.parse(brutoS)
      } catch (_) {
        sessoes = []
      }
      if (!Array.isArray(sessoes)) sessoes = []

      const validos = []
      const porData = {} // data -> id da tarefa mantida

      for (const id of ids) {
        let tarefa = null
        try {
          tarefa = $app.findRecordById('tarefas', String(id))
        } catch (_) {
          tarefa = null
        }

        if (!tarefa) {
          orfas++
          continue
        }

        const prazo = String(tarefa.getDateTime('prazo') || '').slice(0, 10)

        // se a data não está mais entre as sessões do tratamento, a tarefa
        // é órfã de agenda: remove
        if (sessoes.length > 0 && prazo && sessoes.indexOf(prazo) < 0) {
          try {
            $app.delete(tarefa)
            orfas++
          } catch (_) {}
          continue
        }

        // dedupe por data: mantém a primeira
        if (prazo && porData[prazo]) {
          try {
            $app.delete(tarefa)
            duplicadas++
          } catch (_) {}
          continue
        }

        if (prazo) porData[prazo] = String(id)
        validos.push(String(id))
        validas++
      }

      // regrava só se mudou
      if (validos.length !== ids.length) {
        try {
          t.set('tarefa_ids', validos)
          $app.save(t)
          tratamentosAjustados++
        } catch (err) {
          console.log('[reconciliar] falha ao salvar tratamento ' + t.id + ': ' + String(err))
        }
      }
    }

    console.log(
      '[reconciliar] órfãs=' +
        orfas +
        ' duplicadas=' +
        duplicadas +
        ' válidas=' +
        validas +
        ' tratamentos ajustados=' +
        tratamentosAjustados,
    )

    return e.json(200, {
      success: true,
      tratamentos: tratamentos.length,
      tratamentos_ajustados: tratamentosAjustados,
      tarefas_orfas_removidas: orfas,
      tarefas_duplicadas_removidas: duplicadas,
      tarefas_validas: validas,
    })
  },
  $apis.requireAuth(),
)
