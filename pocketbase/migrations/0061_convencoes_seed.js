/// <reference path="../pb_data/types.d.ts" />
// 0061 — Seed da aba Convenções: registro "Segundo Aditivo à CCT 2025/2027 — SINDICOMERCIÁRIOS".
// Idempotente: garante a coleção (caso 0060 não tenha aplicado) e garante o registro-seed.
// O PDF do aditivo é anexado em runtime pelo app (garantirAnexoSeedConvencao), pois migrações
// JS não acessam os assets do front-end.
migrate(
  (app) => {
    // 1) Garante a coleção 'convencoes' com o schema completo (espelho da 0060)
    let col = null
    try {
      col = app.findCollectionByNameOrId('convencoes')
    } catch (e) {
      col = null
    }
    if (!col) {
      col = new Collection({
        name: 'convencoes',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'titulo', type: 'text', required: true },
          { name: 'empresa', type: 'text' },
          { name: 'entidade_sindical', type: 'text' },
          { name: 'parte_patronal', type: 'text' },
          { name: 'vigencia_inicio', type: 'date' },
          { name: 'vigencia_fim', type: 'date' },
          { name: 'data_base', type: 'text' },
          { name: 'reajuste_percentual', type: 'number' },
          { name: 'piso_salarial', type: 'number' },
          { name: 'status', type: 'text' },
          { name: 'responsaveis', type: 'text' },
          { name: 'observacoes', type: 'text' },
          {
            name: 'anexo',
            type: 'file',
            maxSelect: 10,
            maxSize: 52428800,
            mimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
          },
        ],
        indexes: ['CREATE INDEX idx_convencoes_empresa ON convencoes (empresa)'],
      })
      app.save(col)
    } else {
      // Torna campos ausentes tolerantes a falhas parciais de migrações anteriores
      const garantirCampo = (nome, criador) => {
        try {
          col.fields.getByName(nome)
        } catch (e) {
          col.fields.add(criador())
        }
      }
      garantirCampo('titulo', () => new TextField({ name: 'titulo', required: true }))
      garantirCampo('empresa', () => new TextField({ name: 'empresa' }))
      garantirCampo('entidade_sindical', () => new TextField({ name: 'entidade_sindical' }))
      garantirCampo('parte_patronal', () => new TextField({ name: 'parte_patronal' }))
      garantirCampo('vigencia_inicio', () => new DateField({ name: 'vigencia_inicio' }))
      garantirCampo('vigencia_fim', () => new DateField({ name: 'vigencia_fim' }))
      garantirCampo('data_base', () => new TextField({ name: 'data_base' }))
      garantirCampo('reajuste_percentual', () => new NumberField({ name: 'reajuste_percentual' }))
      garantirCampo('piso_salarial', () => new NumberField({ name: 'piso_salarial' }))
      garantirCampo('status', () => new TextField({ name: 'status' }))
      garantirCampo('responsaveis', () => new TextField({ name: 'responsaveis' }))
      garantirCampo('observacoes', () => new TextField({ name: 'observacoes' }))
      garantirCampo(
        'anexo',
        () =>
          new FileField({
            name: 'anexo',
            maxSelect: 10,
            maxSize: 52428800,
            mimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
          }),
      )
      app.save(col)
    }

    // 2) Garante o registro-seed com id fixo (idempotente)
    let seed = null
    try {
      seed = app.findRecordById('convencoes', 'convcct2025ad01')
    } catch (e) {
      seed = null
    }
    if (!seed) {
      const rec = new Record(col)
      rec.set('id', 'convcct2025ad01')
      rec.set('titulo', 'Segundo Aditivo à CCT 2025/2027 — SINDICOMERCIÁRIOS')
      rec.set('empresa', 'Extrafruti')
      rec.set(
        'entidade_sindical',
        'SINDICOMERCIÁRIOS — Sindicato dos Empregados no Comércio de Vitória/ES',
      )
      rec.set('parte_patronal', 'Sindilojas ES')
      rec.set('vigencia_inicio', '2025-11-01 00:00:00.000Z')
      rec.set('vigencia_fim', '2027-10-31 00:00:00.000Z')
      rec.set('data_base', 'Outubro')
      rec.set('status', 'ativo')
      rec.set(
        'responsaveis',
        'Departamento de Relações Trabalhistas — conferir dados conforme PDF anexado',
      )
      rec.set(
        'observacoes',
        'Seed da migração 0061. Dados extraídos do PDF do Segundo Aditivo à CCT 2025/2027 (data-base Outubro/2026). Conferir percentual de reajuste e piso salarial diretamente no documento.',
      )
      app.save(rec)
    }
  },
  (app) => {
    try {
      const rec = app.findRecordById('convencoes', 'convcct2025ad01')
      app.delete(rec)
    } catch (e) {
      // registro já ausente — nada a desfazer
    }
  },
)
