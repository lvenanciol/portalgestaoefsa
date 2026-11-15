/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — AMPLIAR O SELECT `status` (v3, 15/11/2026)
//
// v1 (037) usou `col.fields.getByName('status').values` → rodou como applied
//          e o schema NÃO mudou.
// v2 (103) tentou UPDATE em `_collections` → o PocketBase BLOQUEIA:
//          "raw SQL access to internal table _collections is not supported".
//
// v3: recria o CAMPO pela API de coleções. Em vez de mutar o objeto existente,
// APAGA o campo `status` e ADICIONA um novo com a lista completa. Assim não
// depende de o PocketBase persistir alteração de `values` no objeto antigo.
//
// O risco (perder o valor gravado) não existe aqui: o campo é um select de
// texto e os valores antigos ('em_andamento', etc.) continuam na lista nova.
// ============================================================================
migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('ll5_treatments')
    } catch (_) {
      console.log('[status-v3] ll5_treatments não existe')
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

    // ---- 1) o campo já aceita os dois novos valores? ----
    let jaOk = false
    try {
      const atual = col.fields.getByName('status')
      const vals = atual ? atual.values || [] : []
      jaOk = vals.indexOf('agendado') >= 0 && vals.indexOf('nao_agendado') >= 0
      console.log('[status-v3] valores atuais: ' + JSON.stringify(vals))
    } catch (err) {
      console.log('[status-v3] leitura: ' + String(err).slice(0, 120))
    }

    if (jaOk) {
      console.log('[status-v3] já está correto — nada a fazer')
      return
    }

    // ---- 2) remove o campo antigo e recria com a lista completa ----
    try {
      col.fields.removeByName('status')
      console.log('[status-v3] campo status removido')
    } catch (err) {
      console.log('[status-v3] removeByName: ' + String(err).slice(0, 140))
    }

    try {
      col.fields.add(
        new SelectField({
          name: 'status',
          maxSelect: 1,
          values: desejados,
        }),
      )
      console.log('[status-v3] campo status recriado com ' + desejados.length + ' valores')
    } catch (err) {
      console.log('[status-v3] add: ' + String(err).slice(0, 140))
    }

    try {
      app.save(col)
      console.log('[status-v3] coleção salva')
    } catch (err) {
      console.log('[status-v3] save: ' + String(err).slice(0, 200))
    }

    // ---- 3) VERIFICAÇÃO ----
    try {
      const conf = app.findCollectionByNameOrId('ll5_treatments')
      const c = conf.fields.getByName('status')
      const vals = c ? c.values || [] : []
      console.log('[status-v3] DEPOIS: ' + JSON.stringify(vals))
      if (vals.indexOf('agendado') >= 0) {
        console.log('[status-v3] OK — agendado aceito')
      } else {
        console.log('[status-v3] ATENÇÃO — schema não mudou; a UI deve evitar esses valores')
      }
    } catch (err) {
      console.log('[status-v3] verificação: ' + String(err).slice(0, 120))
    }
  },
  (app) => {
    console.log('[status-v3] rollback: valores mantidos')
  },
)
