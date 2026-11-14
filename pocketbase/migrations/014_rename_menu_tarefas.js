// ============================================================================
// 14/11/2026 — renomeia o menu "Tarefas & Agenda" para "Tarefas".
//
// v2 (correção): a migração anterior filtrava por
//   titulo = "Tarefas & Agenda"
// e o `&` é o operador AND do filtro do PocketBase — a expressão quebrava e
// a lista voltava vazia (o try/catch engolia o erro, a migração "aplicava"
// sem mudar nada e a sidebar seguia com o nome antigo).
//
// Agora filtro APENAS pela rota (sem caracteres especiais) e decido no JS
// se o título precisa mudar. Idempotente e sem armadilha de escape.
// ============================================================================
migrate(
  (app) => {
    let alvo = []
    try {
      alvo = app.findRecordsByFilter('menus', 'rota = "/tarefas"', '', 20, 0) || []
    } catch (_) {
      alvo = []
    }

    if (!alvo.length) {
      console.log('[014-rename-tarefas] nenhum menu com rota /tarefas')
      return
    }

    let mudou = 0
    for (const r of alvo) {
      const titulo = String(r.getString('titulo') || '').trim()
      if (titulo !== 'Tarefas') {
        r.set('titulo', 'Tarefas')
        app.save(r)
        mudou++
        console.log('[014-rename-tarefas] "' + titulo + '" -> "Tarefas" (' + r.id + ')')
      }
    }
    if (!mudou) console.log('[014-rename-tarefas] todos já estavam como "Tarefas"')
  },
  (app) => {
    try {
      const alvo = app.findRecordsByFilter('menus', 'rota = "/tarefas"', '', 20, 0) || []
      for (const r of alvo) {
        if (String(r.getString('titulo') || '').trim() === 'Tarefas') {
          r.set('titulo', 'Tarefas & Agenda')
          app.save(r)
        }
      }
    } catch (_) {}
  },
)
