/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// DEDUPLICAR `proximas_sessoes` E `sessoes_concluidas` (16/11/2026)
//
// O print mostrou 15/10, 13/11 e 19/11 repetidos três vezes na lista de
// Tratamentos. A causa está no DADO: `proximas_sessoes` acumulou datas
// repetidas — sincronizações antigas empilhavam sem verificar duplicidade.
//
// A UI já normaliza na leitura (dedupe em memória), mas o banco precisa ser
// corrigido para não arrastar lixo para o e-mail, o PDF e o reconciliar.
//
// Para cada tratamento:
//   · cada data vira AAAA-MM-DD (descarta hora/lixo)
//   · remove repetidas
//   · ordena
//   · o mesmo para `sessoes_concluidas`
//   · `tarefa_ids` perde ids repetidos e ids de tarefas inexistentes
// ============================================================================
migrate(
  (app) => {
    let tratamentos = []
    try {
      tratamentos = app.findRecordsByFilter('ll5_treatments', "id != ''", '', 0, 0)
    } catch (err) {
      console.log('[dedupe-sessoes] listar: ' + String(err).slice(0, 140))
      return
    }

    console.log('[dedupe-sessoes] tratamentos: ' + tratamentos.length)

    let ajustados = 0

    for (const tr of tratamentos) {
      let mudou = false

      // ---------- proximas_sessoes ----------
      let sessoesBrutas = []
      try {
        const b = tr.get('proximas_sessoes')
        if (Array.isArray(b)) sessoesBrutas = b
        else if (typeof b === 'string') {
          const p = JSON.parse(b)
          sessoesBrutas = Array.isArray(p) ? p : []
        }
      } catch (_) {
        sessoesBrutas = []
      }

      const limpas = []
      const jaTem = {}
      for (const item of sessoesBrutas) {
        const mm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(item || '').trim())
        if (!mm) continue
        const dia = mm[1] + '-' + mm[2] + '-' + mm[3]
        if (jaTem[dia]) continue
        jaTem[dia] = true
        limpas.push(dia)
      }
      limpas.sort()

      if (limpas.length !== sessoesBrutas.length) {
        mudou = true
        console.log(
          '[dedupe-sessoes] ' + tr.id + ': sessoes ' + sessoesBrutas.length + ' → ' + limpas.length,
        )
        try {
          tr.set('proximas_sessoes', limpas)
        } catch (_) {}
      }

      // ---------- sessoes_concluidas ----------
      let concBrutas = []
      try {
        const b2 = tr.get('sessoes_concluidas')
        if (Array.isArray(b2)) concBrutas = b2
        else if (typeof b2 === 'string') {
          const p2 = JSON.parse(b2)
          concBrutas = Array.isArray(p2) ? p2 : []
        }
      } catch (_) {
        concBrutas = []
      }

      const concLimpas = []
      const jaConc = {}
      for (const item of concBrutas) {
        const mm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(item || '').trim())
        if (!mm) continue
        const dia = mm[1] + '-' + mm[2] + '-' + mm[3]
        if (jaConc[dia]) continue
        jaConc[dia] = true
        concLimpas.push(dia)
      }
      concLimpas.sort()

      if (concLimpas.length !== concBrutas.length) {
        mudou = true
        try {
          tr.set('sessoes_concluidas', concLimpas)
        } catch (_) {}
      }

      // ---------- tarefa_ids: sem repetidos e sem fantasmas ----------
      let idsBrutos = []
      try {
        const b3 = tr.get('tarefa_ids')
        if (Array.isArray(b3)) idsBrutos = b3
        else if (typeof b3 === 'string') {
          const p3 = JSON.parse(b3)
          idsBrutos = Array.isArray(p3) ? p3 : []
        }
      } catch (_) {
        idsBrutos = []
      }

      const idsLimp = []
      const jaId = {}
      for (const idT of idsBrutos) {
        const s = String(idT || '')
        if (!s || jaId[s]) continue
        jaId[s] = true
        let existe = false
        try {
          app.findRecordById('tarefas', s)
          existe = true
        } catch (_) {
          existe = false
        }
        if (existe) idsLimp.push(s)
      }

      if (idsLimp.length !== idsBrutos.length) {
        mudou = true
        try {
          tr.set('tarefa_ids', idsLimp)
        } catch (_) {}
      }

      if (mudou) {
        try {
          app.save(tr)
          ajustados++
        } catch (err) {
          console.log('[dedupe-sessoes] salvar ' + tr.id + ': ' + String(err).slice(0, 120))
        }
      }
    }

    console.log('[dedupe-sessoes] tratamentos ajustados: ' + ajustados)
    console.log('[dedupe-sessoes] CONCLUÍDO')
  },
  (app) => {
    console.log('[dedupe-sessoes] rollback: dados normalizados não são revertidos')
  },
)
