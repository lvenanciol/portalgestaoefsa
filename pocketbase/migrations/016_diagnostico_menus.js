// ============================================================================
// 15/11/2026 — DIAGNÓSTICO: lista TODOS os menus e força "Tarefas" (v4)
//
// As migrações 076/077/078 não mudaram o rótulo exibido na sidebar. Antes de
// tentar de novo às cegas, esta migração REGISTRA no log o conteúdo real da
// coleção (id, titulo, rota, secao, ativo) para sabermos exatamente o que o
// banco devolve — pode ser que o registro tenha rota diferente ou que o
// título esteja em outro campo.
// ============================================================================
migrate(
  (app) => {
    let todos = []
    try {
      todos = app.findRecordsByFilter('menus', '', 'secao,ordem', 500, 0) || []
    } catch (err) {
      console.warn('[016] ERRO ao listar: ' + String(err).slice(0, 200))
      return
    }

    console.log('[016] ===== CONTEÚDO DA COLEÇÃO menus (' + todos.length + ' registros) =====')
    for (const r of todos) {
      console.log(
        '[016] id=' +
          r.id +
          ' | ativo=' +
          r.getBool('ativo') +
          ' | secao="' +
          r.getString('secao') +
          '" | ordem=' +
          r.get('ordem') +
          ' | rota="' +
          r.getString('rota') +
          '" | titulo="' +
          r.getString('titulo') +
          '"',
      )
    }
    console.log('[016] ===== FIM =====')

    // corrige qualquer registro cujo título menciona "Tarefa"
    let corrigidos = 0
    for (const r of todos) {
      const titulo = String(r.getString('titulo') || '')
      if (titulo.toLowerCase().indexOf('tarefa') !== -1 && titulo !== 'Tarefas') {
        r.set('titulo', 'Tarefas')
        try {
          app.save(r)
          corrigidos++
          console.log(
            '[016] CORRIGIDO: "' + titulo + '" -> "Tarefas" | rota=' + r.getString('rota'),
          )
        } catch (err) {
          console.warn('[016] falha ao salvar: ' + String(err).slice(0, 150))
        }
      }
    }
    console.log('[016] corrigidos=' + corrigidos)
  },
  (app) => {
    // rollback: não mexe (a mudança de rótulo é segura e reversível pelo CRUD)
  },
)
