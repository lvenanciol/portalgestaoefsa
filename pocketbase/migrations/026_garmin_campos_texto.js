/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// GARMIN — CAMPOS DEDICADOS PARA A API KEY (15/11/2026)
//
// PROBLEMA: `rec.set('config', objetoJS)` + `$app.save(rec)` no JSVM NÃO
// persistia o campo JSON `config` — o save não lançava erro, mas a releitura
// vinha vazia. A tela mostrava "falha de persistência do campo JSON".
//
// SOLUÇÃO: campos TEXT dedicados na própria coleção `integracoes_config`.
// Texto é gravado de forma confiável no JSVM; o JSON não é.
//
// Campos:
//   garmin_personal_api_key  → a Personal API Key (texto)
//   garmin_personal_token    → access token (texto)
//   garmin_token_validade    → ISO de expiração (texto)
//   garmin_ativo             → toggle da integração (bool)
//   garmin_ultimo_teste      → resultado do último teste (texto)
//   garmin_ultimo_sync       → ISO do último sync (texto)
// ============================================================================
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('integracoes_config')
    } catch (_) {
      console.log('[garmin/campos] integracoes_config não existe')
      return
    }

    const existentes = (col.fields || []).map((f) => f.name)

    const adicionar = (campo) => {
      if (!existentes.includes(campo.name)) {
        col.fields.add(campo)
        console.log('[garmin/campos] adicionado: ' + campo.name)
      } else {
        console.log('[garmin/campos] já existe: ' + campo.name)
      }
    }

    adicionar(new TextField({ name: 'garmin_personal_api_key', max: 500 }))
    adicionar(new TextField({ name: 'garmin_personal_token', max: 4000 }))
    adicionar(new TextField({ name: 'garmin_token_validade', max: 60 }))
    adicionar(new BoolField({ name: 'garmin_ativo' }))
    adicionar(new TextField({ name: 'garmin_ultimo_teste', max: 500 }))
    adicionar(new TextField({ name: 'garmin_ultimo_sync', max: 60 }))

    try {
      app.save(col)
      console.log('[garmin/campos] coleção salva')
    } catch (err) {
      console.log('[garmin/campos] FALHA ao salvar: ' + String(err).slice(0, 200))
    }

    // conferência: relê e confirma que os campos existem
    try {
      const conf = app.findCollectionByNameOrId('integracoes_config')
      const nomes = (conf.fields || []).map((f) => f.name)
      console.log(
        '[garmin/campos] CONFERÊNCIA: ' +
          (nomes.includes('garmin_personal_api_key') ? 'OK' : 'AUSENTE'),
      )
    } catch (_) {}
  },
  (app) => {
    console.log('[garmin/campos] rollback: campos mantidos para preservar dados')
  },
)
