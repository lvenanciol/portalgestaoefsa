/// <reference path="../pb_data/types.d.ts" />
// 0066 — CAC: vários vínculos de empresa + dados herdados do parceiro (11/11/2026)
//
// PEDIDO DO DONO:
//  "O parceiro vinculado deve prevalecer/preencher a tela do usuário com todos
//   os campos existentes, e o vínculo deve ser o primeiro campo. O campo empresa
//   deve permitir selecionar várias empresas."
//
// PROBLEMA ATUAL:
//  users só tem `empresa_id` (relation maxSelect 1). Um usuário que responde por
//  Casafruti + Extrafruti não podia ser representado, e a tela pedia escolher uma.
//  Além disso, o parceiro tem cargo/telefone/whatsapp/centro de resultado que o
//  usuário não tinha onde guardar — então "preencher todos os campos" era impossível.
//
// Esta migração é ADITIVA e idempotente: não altera nem remove campo existente.
//  `empresa_id` continua sendo a empresa PRINCIPAL (usada por escopo e relatórios);
//  `empresas` guarda a lista completa dos vínculos.
migrate(
  (app) => {
    let users
    try {
      users = app.findCollectionByNameOrId('users')
    } catch (_) {
      return
    }

    const existentes = (users.fields || []).map((f) => f.name)

    // Lista de empresas às quais o usuário está vinculado (ids de `empresas`).
    if (!existentes.includes('empresas')) {
      users.fields.add(new JSONField({ name: 'empresas', maxSize: 8192 }))
    }

    // Dados de contato/estrutura que o parceiro possui e o usuário não tinha.
    const textos = [
      { name: 'telefone', max: 30 },
      { name: 'whatsapp', max: 30 },
      { name: 'centro_resultado', max: 120 },
      { name: 'centro_resultado_codigo', max: 40 },
      { name: 'observacao', max: 2000 },
    ]
    for (const t of textos) {
      if (!existentes.includes(t.name)) {
        users.fields.add(new TextField({ name: t.name, max: t.max }))
      }
    }

    app.save(users)
  },
  (app) => {
    // Sem rollback destrutivo: os campos guardam dados de negócio.
  },
)
