/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — RECRIA AS ABAS ESTRUTURAIS (15/11/2026)
//
// CONTEXTO DO ERRO: a migração 022 apagou TODO registro com demo=true,
// incluindo as 4 abas (Running, Tratamentos, GYM, Composição Corporal).
//
// Mas ABA É ESTRUTURA DA TELA, não dado de demonstração: sem elas a seção
// Saúde fica sem navegação. O que não devia aparecer era o CONTEÚDO fictício
// (as 5 corridas, as 5 sessões) — esse continua removido.
//
// Esta migração recria as 4 abas com demo=FALSE, para nunca mais serem
// confundidas com dado de demonstração.
// ============================================================================
migrate(
  (app) => {
    // dono das abas: o admin real (primeiro usuário do grupo Admin) ou o
    // primeiro usuário existente. Sem isso a aba fica órfã de owner.
    let ownerId = ''
    try {
      const grupos = app.findRecordsByFilter('grupos_permissao', "nome = 'Admin'", '', 1, 0)
      if (grupos.length > 0) {
        const usuarios = app.findRecordsByFilter(
          'users',
          "grupo_id = '" + grupos[0].id + "'",
          '-created',
          1,
          0,
        )
        if (usuarios.length > 0) ownerId = usuarios[0].id
      }
    } catch (_) {}

    if (!ownerId) {
      try {
        const u = app.findRecordsByFilter('users', "id != ''", '-created', 1, 0)
        if (u.length > 0) ownerId = u[0].id
      } catch (_) {}
    }

    if (!ownerId) {
      console.log('[ll5/abas] nenhum usuário encontrado — abas não criadas')
      return
    }

    const abas = [
      {
        nome: 'Running',
        icone: 'footprints',
        cor: '#1b5e20',
        ordem: 1,
        template_type: 'running',
        fonte: 'garmin',
      },
      {
        nome: 'Tratamentos',
        icone: 'briefcase-medical',
        cor: '#dc2626',
        ordem: 2,
        template_type: 'tratamentos',
        fonte: 'manual',
      },
      {
        nome: 'GYM',
        icone: 'dumbbell',
        cor: '#111827',
        ordem: 3,
        template_type: 'gym',
        fonte: 'garmin',
      },
      {
        nome: 'Composição Corporal',
        icone: 'scale',
        cor: '#7c3aed',
        ordem: 4,
        template_type: 'composicao',
        fonte: 'manual',
      },
    ]

    let col
    try {
      col = app.findCollectionByNameOrId('ll5_tabs')
    } catch (_) {
      console.log('[ll5/abas] coleção ll5_tabs não existe')
      return
    }

    let criadas = 0

    for (const a of abas) {
      // idempotente: não duplica se já existir uma aba com o mesmo nome
      let existe = false
      try {
        const r = app.findRecordsByFilter(
          'll5_tabs',
          "owner_id = '" + ownerId + "' && nome = '" + a.nome.replace(/'/g, "\\'") + "'",
          '',
          1,
          0,
        )
        existe = r.length > 0
      } catch (_) {
        existe = false
      }

      if (existe) {
        console.log('[ll5/abas] já existe: ' + a.nome)
        continue
      }

      try {
        const rec = new Record(col)
        rec.set('owner_id', ownerId)
        rec.set('created_by', 'migracao-022')
        rec.set('updated_by', 'migracao-022')
        rec.set('nome', a.nome)
        rec.set('icone', a.icone)
        rec.set('cor', a.cor)
        rec.set('ordem', a.ordem)
        rec.set('template_type', a.template_type)
        rec.set('schema_template', 'template-' + a.template_type)
        rec.set('fontes_dados', a.fonte ? [a.fonte] : [])
        rec.set('ia_habilitada', true)
        rec.set('ativo', true)
        // ESTRUTURA: nunca demo=true
        rec.set('demo', false)
        app.save(rec)
        criadas++
        console.log('[ll5/abas] criada: ' + a.nome)
      } catch (err) {
        console.log('[ll5/abas] falha em ' + a.nome + ': ' + String(err).slice(0, 160))
      }
    }

    console.log('[ll5/abas] total criado: ' + criadas + ' (owner ' + ownerId + ')')
  },
  (app) => {
    // rollback: remove só as abas criadas por esta migração (marcadas no created_by)
    try {
      const r = app.findRecordsByFilter('ll5_tabs', "created_by = 'migracao-022'", '', 0, 0)
      for (const rec of r) {
        try {
          app.delete(rec)
        } catch (_) {}
      }
    } catch (_) {}
  },
)
