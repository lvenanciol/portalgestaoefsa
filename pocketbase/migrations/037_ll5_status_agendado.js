/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — STATUS "AGENDADO" / "NÃO AGENDADO" (15/11/2026)
//
// b0 do pedido: o dropdown de status do tratamento precisa aceitar
// `agendado` e `nao_agendado`, além dos valores atuais.
//
// O campo `status` de ll5_treatments é um SELECT. O PocketBase REJEITA o
// registro inteiro quando recebe valor fora da lista (foi a causa de vários
// "Failed to create record" neste projeto). Por isso o valor precisa existir
// no schema ANTES de a UI enviá-lo.
//
// Tentativa via `col.fields.getByName(...).values = [...]` já falhou antes
// neste projeto (rodou como applied e não mudou o schema). Aqui o mesmo
// caminho é tentado, mas com CONFERÊNCIA explícita: se falhar, o log diz e a
// UI continua funcionando com os valores antigos (fail-safe).
// ============================================================================
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('ll5_treatments')
    } catch (_) {
      console.log('[status] ll5_treatments não existe')
      return
    }

    const desejados = [
      'agendado',
      'nao_agendado',
      'em_andamento',
      'concluido',
      'suspenso',
      'cancelado',
    ]

    try {
      const campo = col.fields.getByName('status')
      if (campo && campo.type === 'select') {
        const antes = JSON.stringify(campo.values || [])
        campo.values = desejados
        campo.maxSelect = 1
        console.log('[status] antes: ' + antes)
      }
    } catch (err) {
      console.log('[status] getByName falhou: ' + String(err).slice(0, 140))
    }

    try {
      app.save(col)
      console.log('[status] coleção salva')
    } catch (err) {
      console.log('[status] save falhou: ' + String(err).slice(0, 200))
    }

    // conferência — o que realmente ficou no schema
    try {
      const conf = app.findCollectionByNameOrId('ll5_treatments')
      const c2 = conf.fields.getByName('status')
      const valores = c2 ? JSON.stringify(c2.values || []) : 'campo ausente'
      console.log('[status] DEPOIS: ' + valores)
      if (c2 && (c2.values || []).indexOf('agendado') >= 0) {
        console.log('[status] OK: agendado aceito')
      } else {
        console.log('[status] ATENÇÃO: agendado NÃO entrou — a UI não deve enviá-lo')
      }
    } catch (err) {
      console.log('[status] conferência falhou: ' + String(err).slice(0, 140))
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('ll5_treatments')
      const campo = col.fields.getByName('status')
      if (campo) {
        campo.values = ['em_andamento', 'concluido', 'suspenso', 'cancelado']
        app.save(col)
      }
    } catch (_) {}
  },
)
