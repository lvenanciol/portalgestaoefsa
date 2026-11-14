// ============================================================================
// 15/11/2026 — GARANTE o menu de Tarefas como "Tarefas" (v3)
//
// Por que de novo: as migrações 076 e 077 filtraram por `rota = "/tarefas"`
// e não alteraram o registro da sidebar. Duas hipóteses:
//   a) o rótulo exibido não vem da coleção `menus`;
//   b) o registro tem rota diferente (barra final, caminho absoluto, nulo).
//
// Esta migração é DIAGNÓSTICA: varre TODOS os menus, corrige qualquer título
// que contenha "Tarefas" (com ou sem "& Agenda"), e registra no log o que
// encontrou — inclusive rota e título — para sabermos a verdade.
// ============================================================================
migrate(
  (app) => {
    let todos = []
    try {
      todos = app.findRecordsByFilter('menus', '', 'secao,ordem', 500, 0) || []
    } catch (err) {
      console.warn('[015] falha ao listar menus: ' + String(err).slice(0, 200))
      return
    }

    console.log('[015] total de menus: ' + todos.length)

    let achouRotaTarefas = 0
    let corrigidos = 0

    for (const r of todos) {
      const rota = String(r.getString('rota') || '')
      const titulo = String(r.getString('titulo') || '')

      // diagnóstico: tudo que menciona "tarefa" em qualquer campo
      if (
        rota.toLowerCase().indexOf('tarefa') !== -1 ||
        titulo.toLowerCase().indexOf('tarefa') !== -1
      ) {
        achouRotaTarefas++
        console.log(
          '[015] candidato -> id=' + r.id + ' | rota="' + rota + '" | titulo="' + titulo + '"',
        )

        if (titulo !== 'Tarefas') {
          r.set('titulo', 'Tarefas')
          try {
            app.save(r)
            corrigidos++
            console.log('[015] CORRIGIDO: "' + titulo + '" -> "Tarefas" (' + r.id + ')')
          } catch (err) {
            console.warn('[015] falha ao salvar ' + r.id + ': ' + String(err).slice(0, 150))
          }
        }
      }
    }

    console.log('[015] resumo: candidatos=' + achouRotaTarefas + ' corrigidos=' + corrigidos)
    if (!achouRotaTarefas) {
      console.warn(
        '[015] NENHUM menu relacionado a tarefas — o rótulo da sidebar vem de outra fonte',
      )
    }
  },
  (app) => {
    try {
      const todos = app.findRecordsByFilter('menus', '', '', 500, 0) || []
      for (const r of todos) {
        const rota = String(r.getString('rota') || '')
        if (rota.indexOf('tarefa') !== -1 && String(r.getString('titulo')) === 'Tarefas') {
          r.set('titulo', 'Tarefas & Agenda')
          app.save(r)
        }
      }
    } catch (_) {}
  },
)
