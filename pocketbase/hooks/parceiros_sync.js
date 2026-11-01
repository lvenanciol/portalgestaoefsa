// Hook: sincronização automática do nome do responsável nas tarefas ao atualizar parceiro
// Quando um parceiro/contato for renomeado, as tarefas vinculadas (por ID no campo JSON 'parceiros'
// ou pelo nome antigo no campo 'responsavel') têm o campo 'responsavel' atualizado para o novo nome,
// garantindo que o vínculo seja preservado por ID e o nome sempre reflita o cadastro atual.

onRecordAfterUpdateSuccess((e) => {
  try {
    const record = e.record
    if (!record) return e.next()

    const parceiroId = record.id
    const novoNome = record.getString('nome')
    const nomeAntigo = record.original() ? record.original().getString('nome') : ''

    if (!novoNome) return e.next()

    // Se o nome não mudou, nada a atualizar nas tarefas
    if (nomeAntigo && nomeAntigo === novoNome) return e.next()

    // 1. Atualizar tarefas onde este parceiro está na lista de parceiros (JSON array com o id)
    // No SQLite do PocketBase usamos LIKE com o id
    const filtroId = 'parceiros ~ "' + parceiroId + '"'
    let tarefasPorId = []
    try {
      tarefasPorId = $app.findRecordsByFilter('tarefas', filtroId, '', 500, 0)
    } catch (_) {
      tarefasPorId = []
    }

    for (let i = 0; i < tarefasPorId.length; i++) {
      const t = tarefasPorId[i]
      t.set('responsavel', novoNome)
      try {
        $app.save(t)
      } catch (errSalvar) {
        console.warn('Erro ao atualizar responsavel da tarefa ' + t.id + ':', errSalvar)
      }
    }

    // 2. Se o nome antigo for conhecido e diferente, atualizar tarefas que ainda guardavam o nome textual antigo
    if (nomeAntigo && nomeAntigo !== novoNome) {
      let tarefasPorNome = []
      try {
        tarefasPorNome = $app.findRecordsByFilter(
          'tarefas',
          'responsavel = "' + nomeAntigo + '"',
          '',
          500,
          0,
        )
      } catch (_) {
        tarefasPorNome = []
      }

      for (let j = 0; j < tarefasPorNome.length; j++) {
        const t2 = tarefasPorNome[j]
        t2.set('responsavel', novoNome)
        // Garante que o ID do parceiro também esteja no array de parceiros
        let ids = []
        try {
          const raw = t2.getString('parceiros')
          ids = raw ? JSON.parse(raw) : []
          if (!Array.isArray(ids)) ids = []
        } catch (_) {
          ids = []
        }
        if (!ids.includes(parceiroId)) {
          ids.push(parceiroId)
          t2.set('parceiros', JSON.stringify(ids))
        }
        try {
          $app.save(t2)
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('Erro no hook de sync de parceiros:', err)
  } finally {
    return e.next()
  }
}, 'parceiros')
