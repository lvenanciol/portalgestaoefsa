/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — MANTER SOMENTE A API + CORRIGIR TAREFAS (15/11/2026)
//
// ─────────────────────────────────────────────────────────────────────────
// 1) ATIVIDADES: O DONO DECIDIU — MANTER SOMENTE `fonte = 'garmin_api'`
//
// Tentei 4 vezes agrupar duplicatas (por minuto, por dia, por chave canônica)
// e sempre falhou: o `.FIT` e o CSV gravam a MESMA corrida com dados que
// parecem iguais na tela mas divergem no instante exato — e o PocketBase
// normaliza datas de formas diferentes conforme a origem.
//
// Decisão do dono (e a mais correta): a API é a fonte da verdade. Apagamos
// TUDO que veio de CSV e .FIT. Sem duplicata possível, porque fica uma
// origem só.
// ─────────────────────────────────────────────────────────────────────────
// 2) TAREFAS: paciente como RESPONSÁVEL, fora do título — inclusive nas
//    tarefas JÁ EXISTENTES (o print mostra "Liberação Miofascial —
//    Leonardo Lourenço · 17/12" e responsável "Sem responsável").
// ============================================================================
migrate(
  (app) => {
    // ===================== 1) ATIVIDADES =====================
    // remove o índice único antes de apagar em massa
    try {
      app.db().newQuery('DROP INDEX IF EXISTS idx_ll5_activity_canonica').execute()
      console.log('[limpeza] índice removido')
    } catch (_) {}

    let atividades = []
    try {
      atividades = app.findRecordsByFilter('ll5_activity', "id != ''", 'created', 0, 0)
    } catch (_) {
      atividades = []
    }
    console.log('[limpeza] atividades lidas: ' + atividades.length)

    let apagadasCsv = 0
    let apagadasFit = 0
    let mantidasApi = 0
    let semFonte = 0

    for (const r of atividades) {
      let fonte = ''
      try {
        fonte = String(r.get('fonte') || '')
          .toLowerCase()
          .trim()
      } catch (_) {
        fonte = ''
      }

      if (fonte === 'garmin_api') {
        mantidasApi++
        continue
      }

      try {
        app.delete(r)
        if (fonte.indexOf('csv') >= 0) apagadasCsv++
        else if (fonte.indexOf('fit') >= 0) apagadasFit++
        else semFonte++
      } catch (err) {
        console.log('[limpeza] falha ao apagar ' + r.id + ': ' + String(err).slice(0, 100))
      }
    }

    console.log('[limpeza] csv=' + apagadasCsv + ' fit=' + apagadasFit + ' outras=' + semFonte)
    console.log('[limpeza] mantidas (garmin_api): ' + mantidasApi)

    // grava a chave canônica nas sobreviventes e recria o índice anti-duplicata
    let marcadas = 0
    try {
      const restantes = app.findRecordsByFilter('ll5_activity', "id != ''", '', 0, 0)
      for (const r of restantes) {
        try {
          let dia = 'sem-data'
          const b = String(r.get('data_hora_inicio') || '')
          const m = /(\d{4})-(\d{2})-(\d{2})/.exec(b)
          if (m) dia = m[1] + '-' + m[2] + '-' + m[3]
          const tipo = String(r.get('tipo') || 'outro')
          const d = r.get('distancia_m')
          const dist = d != null && Number(d) > 0 ? Math.round(Number(d) / 100) : 0
          const chave =
            dia === 'sem-data' ? 'sem-data|' + String(r.id) : dia + '|' + tipo + '|' + dist
          r.set('chave_canonica', chave)
          app.save(r)
          marcadas++
        } catch (_) {}
      }
    } catch (_) {}
    console.log('[limpeza] sobreviventes marcadas: ' + marcadas)

    try {
      app
        .db()
        .newQuery(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_ll5_activity_canonica ON ll5_activity (chave_canonica)',
        )
        .execute()
      console.log('[limpeza] índice recriado (protege contra nova duplicata)')
    } catch (err) {
      console.log('[limpeza] índice: ' + String(err).slice(0, 120))
    }

    // ===================== 2) TAREFAS DOS TRATAMENTOS =====================
    let tratamentos = []
    try {
      tratamentos = app.findRecordsByFilter('ll5_treatments', "id != ''", '', 0, 0)
    } catch (_) {
      tratamentos = []
    }
    console.log('[limpeza] tratamentos lidos: ' + tratamentos.length)

    let tarefasCorrigidas = 0

    for (const t of tratamentos) {
      let tipoNome = ''
      let paciente = ''
      let responsavelId = ''
      let instituto = ''
      let profissional = ''
      try {
        tipoNome = String(t.get('tipo_nome') || '')
      } catch (_) {}
      try {
        paciente = String(t.get('paciente_nome') || '')
      } catch (_) {}
      try {
        responsavelId = String(t.get('responsavel_id') || '')
      } catch (_) {}
      try {
        instituto = String(t.get('instituto') || '')
      } catch (_) {}
      try {
        profissional = String(t.get('profissional') || '')
      } catch (_) {}

      if (!paciente) continue

      let ids = []
      try {
        const bruto = t.get('tarefa_ids')
        if (Array.isArray(bruto)) ids = bruto
        else if (typeof bruto === 'string') ids = JSON.parse(bruto)
      } catch (_) {
        ids = []
      }
      if (!Array.isArray(ids)) ids = []

      for (const id of ids) {
        let tarefa = null
        try {
          tarefa = $app.findRecordById('tarefas', String(id))
        } catch (_) {
          tarefa = null
        }
        if (!tarefa) continue

        try {
          // ---- título SEM o paciente ----
          let titulo = String(tarefa.get('titulo') || '')
          // remove as três formas que já usei
          const formas = [
            ' — ' + paciente + ' · ',
            ' — ' + paciente + ' - ',
            tipoNome + ' — ' + paciente,
          ]
          for (const f of formas) {
            if (f && titulo.indexOf(f) >= 0) {
              titulo = titulo.replace(f, tipoNome + ' · ')
            }
          }
          // limpa duplicação acidental do tipo
          titulo = titulo.replace(tipoNome + ' · ' + tipoNome + ' · ', tipoNome + ' · ')
          // se ainda começa com "Tipo — Paciente" sem o resto, corrige
          if (titulo.indexOf(' — ' + paciente) >= 0) {
            titulo = titulo.replace(' — ' + paciente, '')
          }

          tarefa.set('titulo', titulo)

          // ---- paciente como RESPONSÁVEL ----
          try {
            tarefa.set('responsavel', paciente)
          } catch (_) {}
          if (responsavelId) {
            try {
              tarefa.set('responsaveis_ids', [responsavelId])
            } catch (_) {}
          }

          // ---- descrição com instituto/profissional ----
          try {
            const desc = (instituto ? instituto + ' · ' : '') + (profissional || '')
            if (desc) tarefa.set('descricao', desc)
          } catch (_) {}

          $app.save(tarefa)
          tarefasCorrigidas++
        } catch (err) {
          console.log('[limpeza] falha na tarefa ' + id + ': ' + String(err).slice(0, 120))
        }
      }
    }

    console.log('[limpeza] tarefas corrigidas: ' + tarefasCorrigidas)
  },
  (app) => {
    console.log('[limpeza] rollback: dados de CSV/FIT não são recriados')
  },
)
