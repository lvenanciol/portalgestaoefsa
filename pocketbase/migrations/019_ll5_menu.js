/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — ITENS DE MENU DA SEÇÃO (15/11/2026)
//
// Cria os 2 itens de navegação da seção LL5. Idempotente por rota: se o item
// já existe, não duplica. A coleção `menus` tem createRule null, por isso a
// escrita acontece aqui (servidor), como em todas as seeds de menu.
// ============================================================================
migrate(
  (app) => {
    const itens = [
      { titulo: 'Saúde', rota: '/ll5/saude', secao: 'LL5', ordem: 1, icone: 'sparkles' },
      { titulo: 'Auditoria LL5', rota: '/ll5/auditoria', secao: 'LL5', ordem: 2, icone: 'shield' },
    ]

    let col
    try {
      col = app.findCollectionByNameOrId('menus')
    } catch (_) {
      console.warn('[ll5/menu] coleção menus não existe')
      return
    }

    for (const it of itens) {
      try {
        const existe = app.findFirstRecordByData('menus', 'rota', it.rota)
        if (existe) {
          // corrige o título se estiver diferente (idempotente)
          if (existe.getString('titulo') !== it.titulo) {
            existe.set('titulo', it.titulo)
            existe.set('secao', it.secao)
            app.save(existe)
            console.log('[ll5/menu] atualizado: ' + it.rota)
          } else {
            console.log('[ll5/menu] já existe: ' + it.rota)
          }
          continue
        }
      } catch (_) {
        // não existe — cria abaixo
      }

      try {
        const rec = new Record(col)
        rec.set('titulo', it.titulo)
        rec.set('rota', it.rota)
        rec.set('secao', it.secao)
        rec.set('ordem', it.ordem)
        rec.set('icone', it.icone)
        rec.set('ativo', true)
        app.save(rec)
        console.log('[ll5/menu] criado: ' + it.rota)
      } catch (err) {
        console.warn('[ll5/menu] falha em ' + it.rota + ': ' + String(err).slice(0, 150))
      }
    }
  },
  (app) => {
    for (const rota of ['/ll5/saude', '/ll5/auditoria']) {
      try {
        app.delete(app.findFirstRecordByData('menus', 'rota', rota))
      } catch (_) {}
    }
  },
)
