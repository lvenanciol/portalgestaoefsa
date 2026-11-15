/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — AMPLIAR O SELECT `status` DE ll5_treatments (15/11/2026)
//
// O erro ao salvar "não agendado" tem causa conhecida: o campo `status` é um
// SELECT e só aceita ['em_andamento','concluido','suspenso','cancelado'].
// O PocketBase REJEITA o registro inteiro quando recebe valor fora da lista.
//
// A migração 037 tentou ampliar via `col.fields.getByName('status').values`
// + `app.save(col)` — o mesmo caminho que JÁ FALHOU neste projeto para
// ll5_activity (rodou como applied e o schema não mudou).
//
// Aqui o schema é alterado direto na tabela `_collections`, onde o PocketBase
// guarda a definição em JSON. ATENÇÃO: é escrita em tabela de sistema, por
// isso a verificação é feita logo depois e o log diz o resultado real.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---- 1) lê o schema atual ----
    let jsonAtual = ''
    try {
      const rows = db
        .newQuery("SELECT fields FROM _collections WHERE name = 'll5_treatments'")
        .all()
      for (const r of rows) {
        jsonAtual = String(r.get('fields') || '')
      }
      console.log('[status-v2] schema lido: ' + jsonAtual.length + ' chars')
    } catch (err) {
      console.log('[status-v2] falha ao ler _collections: ' + String(err).slice(0, 160))
      return
    }

    if (!jsonAtual) {
      console.log('[status-v2] schema vazio — aborta')
      return
    }

    // ---- 2) já tem agendado? então não faz nada ----
    if (jsonAtual.indexOf('"agendado"') >= 0) {
      console.log('[status-v2] agendado já existe no schema')
      return
    }

    // ---- 3) substitui a lista de valores do campo status ----
    //
    // No JSON do schema, o campo aparece como:
    //   {"name":"status", ..., "values":["em_andamento","concluido",...]}
    // Trocamos só a lista de `values` do campo status.
    const novos = '["agendado","nao_agendado","em_andamento","concluido","suspenso","cancelado"]'

    // localiza o bloco do campo status e troca o array imediatamente após
    const idxCampo = jsonAtual.indexOf('"name":"status"')
    if (idxCampo < 0) {
      console.log('[status-v2] campo status não encontrado no JSON')
      return
    }

    const idxValues = jsonAtual.indexOf('"values":', idxCampo)
    if (idxValues < 0) {
      console.log('[status-v2] chave values não encontrada após status')
      return
    }

    const abreCol = jsonAtual.indexOf('[', idxValues)
    // encontra o fechamento equilibrando colchetes
    let nivel = 0
    let fechaCol = -1
    for (let i = abreCol; i < jsonAtual.length; i++) {
      if (jsonAtual[i] === '[') nivel++
      else if (jsonAtual[i] === ']') {
        nivel--
        if (nivel === 0) {
          fechaCol = i
          break
        }
      }
    }
    if (fechaCol < 0) {
      console.log('[status-v2] não consegui delimitar o array de values')
      return
    }

    const novoJson = jsonAtual.slice(0, abreCol) + novos + jsonAtual.slice(fechaCol + 1)

    // ---- 4) grava ----
    try {
      db.newQuery("UPDATE _collections SET fields = {:f} WHERE name = 'll5_treatments'")
        .bind({
          f: novoJson,
        })
        .execute()
      console.log('[status-v2] UPDATE em _collections executado')
    } catch (err) {
      console.log('[status-v2] UPDATE falhou: ' + String(err).slice(0, 200))
      return
    }

    // ---- 5) VERIFICAÇÃO ----
    try {
      const conf = app.findCollectionByNameOrId('ll5_treatments')
      const c = conf.fields.getByName('status')
      const valores = c ? c.values || [] : []
      console.log('[status-v2] DEPOIS: ' + JSON.stringify(valores))
      if (valores.indexOf('agendado') >= 0 && valores.indexOf('nao_agendado') >= 0) {
        console.log('[status-v2] OK: agendado e nao_agendado aceitos')
      } else {
        console.log('[status-v2] ATENÇÃO: schema não mudou')
      }
    } catch (err) {
      console.log('[status-v2] verificação: ' + String(err).slice(0, 140))
    }
  },
  (app) => {
    console.log('[status-v2] rollback: valores mantidos')
  },
)
