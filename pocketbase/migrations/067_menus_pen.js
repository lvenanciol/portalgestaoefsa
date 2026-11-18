/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// SEÇÃO "PLANO ESTRATÉGICO" NO MENU (18/11/2026)
//
// PROBLEMA: as rotas /pen existiam e funcionavam por URL, mas a Sidebar do
// PGE monta o menu a partir da coleção `menus` — sem registro lá, a seção
// simplesmente não aparecia. O usuário concluiu (com razão) que a entrega não
// existia.
//
// O que esta migração faz:
//   1. garante a entrada de cada uma das 8 telas do /pen em `menus`
//   2. coloca a seção "PLANO ESTRATÉGICO" no topo da sidebar (ordem 1),
//      antes de GESTÃO — é a tela de direção, não uma tela operacional
//   3. é IDEMPOTENTE: se a rota já existe, atualiza título/ordem/seção em vez
//      de duplicar
//
// A VITRINE (/pen/components) fica FORA do menu de propósito: é ferramenta de
// desenvolvimento, não destino do usuário final. Ainda assim entra aqui com
// ativo=false para poder ser ligada pelo CRUD de menus se quiser.
// ============================================================================
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('menus')

    // título, rota, seção, ordem, ícone
    const itens = [
      { titulo: 'Cockpit', rota: '/pen', ordem: 1, icone: 'dashboard' },
      { titulo: 'Norte', rota: '/pen/norte', ordem: 2, icone: 'navigation' },
      { titulo: 'Diagnóstico', rota: '/pen/diagnostico', ordem: 3, icone: 'search' },
      { titulo: 'Ishikawa', rota: '/pen/ishikawa', ordem: 4, icone: 'git-branch' },
      { titulo: 'BSC', rota: '/pen/bsc', ordem: 5, icone: 'target' },
      { titulo: '5W2H', rota: '/pen/5w2h', ordem: 6, icone: 'list-check' },
      { titulo: 'Acompanhamento', rota: '/pen/acompanhamento', ordem: 7, icone: 'trending-up' },
      { titulo: 'Governança', rota: '/pen/governanca', ordem: 8, icone: 'shield' },
    ]

    const SECAO = 'PLANO ESTRATÉGICO'

    for (const it of itens) {
      let reg = null
      try {
        const achados = app.findRecordsByFilter('menus', 'rota = "' + it.rota + '"', '', 1, 0)
        if (achados && achados.length) reg = achados[0]
      } catch (_) {
        reg = null
      }

      if (reg) {
        reg.set('titulo', it.titulo)
        reg.set('secao', SECAO)
        reg.set('ordem', it.ordem)
        reg.set('icone', it.icone)
        reg.set('ativo', true)
        app.save(reg)
        console.log('[menus/pen] atualizado: ' + it.rota)
      } else {
        const novo = new Record(col)
        novo.set('titulo', it.titulo)
        novo.set('rota', it.rota)
        novo.set('secao', SECAO)
        novo.set('ordem', it.ordem)
        novo.set('icone', it.icone)
        novo.set('ativo', true)
        app.save(novo)
        console.log('[menus/pen] criado: ' + it.rota)
      }
    }

    // vitrine de componentes: existe, mas desligada no menu
    try {
      const acha = app.findRecordsByFilter('menus', 'rota = "/pen/components"', '', 1, 0)
      if (!acha || !acha.length) {
        const novoV = new Record(col)
        novoV.set('titulo', 'Componentes (dev)')
        novoV.set('rota', '/pen/components')
        novoV.set('secao', SECAO)
        novoV.set('ordem', 9)
        novoV.set('icone', 'settings')
        novoV.set('ativo', false)
        app.save(novoV)
        console.log('[menus/pen] criado (inativo): /pen/components')
      }
    } catch (_) {}

    // ---- conferência ----
    try {
      const todos = app.findRecordsByFilter('menus', 'secao = "' + SECAO + '"', 'ordem', 20, 0)
      console.log('[menus/pen] seção com ' + todos.length + ' item(ns):')
      for (const t of todos) {
        console.log(
          '  ' +
            String(t.getString('ordem')) +
            ' · ' +
            String(t.getString('titulo')) +
            ' → ' +
            String(t.getString('rota')) +
            (t.getBool('ativo') ? '' : ' (inativo)'),
        )
      }
    } catch (err) {
      console.log('[menus/pen] conferência: ' + String(err).slice(0, 120))
    }

    console.log('[menus/pen] CONCLUÍDO')
  },
  (app) => {
    // rollback: remove os registros da seção
    try {
      const regs = app.findRecordsByFilter('menus', 'secao = "PLANO ESTRATÉGICO"', '', 50, 0)
      for (const r of regs) app.delete(r)
    } catch (_) {}
    console.log('[menus/pen] rollback executado')
  },
)
