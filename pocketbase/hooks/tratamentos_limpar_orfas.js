// ============================================================================
// LIMPAR TAREFAS ÓRFÃS DE TRATAMENTOS EXCLUÍDOS (16/11/2026)
//
// PROBLEMA RELATADO: "agenda de tratamento excluída mas tarefas órfãs
// permaneceram". O print mostra várias "Liberação Miofascial · dd/mm" em
// A Fazer, Em Andamento e Concluído, de tratamentos que já não existem.
//
// CAUSA: ao excluir, eu apagava apenas os ids listados em `tarefa_ids`. Toda
// tarefa criada por outro caminho (reconciliação, recorrência, importação)
// — ou cujo id saiu do array numa sincronização — ficava sem dono e viva no
// kanban para sempre.
//
// Este endpoint faz a varredura completa:
//   1. lista TODOS os tratamentos vivos e reúne seus `tarefa_ids`;
//   2. lista TODAS as tarefas do PGE;
//   3. apaga a tarefa que:
//        · o título começa com o tipo de um tratamento ('<Tipo> · dd/mm/aaaa')
//          MAS não pertence a nenhum tratamento vivo, OU
//        · estava em `tarefa_por_data` de um tratamento já excluído.
//
// Nunca toca em tarefa que pertence a um tratamento existente.
//
//   POST /backend/v1/tratamentos/limpar-tarefas-orfas
// ============================================================================

routerAdd(
  'POST',
  '/backend/v1/tratamentos/limpar-tarefas-orfas',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')

    const db = $app.db()

    // ---------- 1) tratamentos vivos e seus ids de tarefa ----------
    let tratamentos = []
    try {
      tratamentos = $app.findRecordsByFilter('ll5_treatments', "id != ''", '', 0, 0)
    } catch (err) {
      console.log('[orfas] tratamentos: ' + String(err).slice(0, 140))
      tratamentos = []
    }

    const idsVivos = {}
    const tiposVivos = {}
    const prefixosOrfaos = {}

    for (const t of tratamentos) {
      let excluido = false
      try {
        const del = t.getString('deletado_em')
        if (del && String(del).length > 4) excluido = true
      } catch (_) {}

      const tipo = String(t.getString('tipo_nome') || '').trim()
      if (tipo) tiposVivos[tipo] = true

      // tratamento excluído: o tipo dele vira candidato a órfão
      if (excluido && tipo) {
        prefixosOrfaos[tipo] = true
      }

      if (excluido) continue

      // ids do array
      let ids = []
      try {
        const bruto = t.get('tarefa_ids')
        if (Array.isArray(bruto)) ids = bruto
        else if (typeof bruto === 'string') {
          const p = JSON.parse(bruto)
          ids = Array.isArray(p) ? p : []
        }
      } catch (_) {}
      for (const i of ids) idsVivos[String(i)] = true

      // ids do mapa por data
      try {
        const m = t.get('tarefa_por_data')
        if (m && typeof m === 'object' && !Array.isArray(m)) {
          for (const k of Object.keys(m)) idsVivos[String(m[k])] = true
        }
      } catch (_) {}
    }

    console.log(
      '[orfas] tratamentos=' +
        tratamentos.length +
        ' idsVivos=' +
        Object.keys(idsVivos).length +
        ' tiposVivos=' +
        Object.keys(tiposVivos).length +
        ' tiposOrfaos=' +
        Object.keys(prefixosOrfaos).join(', '),
    )

    // ---------- 2) tarefas candidatas, por SQL ----------
    //
    // Critério de órfã: NÃO está em idsVivos E o título começa com
    // "<tipo> · " de um tratamento (vivo ou excluído) — ou seja, é uma tarefa
    // criada pela agenda de tratamentos, não uma tarefa avulsa do PGE.
    let candidatas = []
    try {
      candidatas = db
        .newQuery("SELECT id, titulo, status_kanban, prazo FROM tarefas WHERE titulo LIKE '%·%'")
        .all()
    } catch (err) {
      console.log('[orfas] consulta: ' + String(err).slice(0, 160))
      candidatas = []
    }

    let apagadas = 0
    const amostra = []

    for (const row of candidatas) {
      const id = String(row.get('id'))
      if (idsVivos[id]) continue

      const titulo = String(row.get('titulo') || '')
      // formato esperado: "<Tipo> · dd/mm/aaaa"
      const casa = /^(.+?)\s*·\s*\d{2}\/\d{2}\/\d{4}\s*$/.exec(titulo)
      if (!casa) continue

      const tipoTarefa = casa[1].trim()
      const ehDeTratamento = tiposVivos[tipoTarefa] || prefixosOrfaos[tipoTarefa]
      if (!ehDeTratamento) continue

      // é órfã: apaga
      try {
        db.newQuery('DELETE FROM tarefas WHERE id = {:id}').bind({ id: id }).execute()
        apagadas++
        if (amostra.length < 10) amostra.push(titulo)
      } catch (errDel) {
        console.log('[orfas] falha ao apagar ' + id + ': ' + String(errDel).slice(0, 120))
      }
    }

    // ---------- 3) notificações dessas tarefas ----------
    try {
      db.newQuery(
        'DELETE FROM notificacoes WHERE tarefa_id NOT IN (SELECT id FROM tarefas)',
      ).execute()
      console.log('[orfas] notificações sem tarefa removidas')
    } catch (_) {}

    console.log('[orfas] apagadas=' + apagadas)

    return e.json(200, {
      ok: true,
      tratamentos: tratamentos.length,
      tarefas_vivas_vinculadas: Object.keys(idsVivos).length,
      tarefas_orfas_apagadas: apagadas,
      amostra: amostra,
    })
  },
  $apis.requireAuth(),
)
