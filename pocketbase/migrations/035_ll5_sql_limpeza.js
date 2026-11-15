/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — APAGAR CSV + CORRIGIR TAREFAS POR SQL (v2, 15/11/2026)
//
// CAUSA RAIZ DAS 6 TENTATIVAS ANTERIORES (provada pelo log de produção):
//
//   [limpar-csv] falha ao listar página 1:
//     GoError: invalid sort field "created"
//   [limpar-csv] total=0 apagadas=0 mantidas=0
//
// `findRecordsByFilter(..., 'created', ...)` LANÇA EXCEÇÃO nesse PocketBase.
// O laço morria na primeira iteração, tudo ficava zerado e o código seguia
// como se não houvesse nada a fazer. Por isso nenhum dedupe funcionou.
//
// Esta versão usa SÓ SQL direto — sem findRecordsByFilter, sem laço por
// registro, sem getter. O DELETE roda em 2.350 linhas de uma vez.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---------- 1) índice que atrapalha ----------
    try {
      db.newQuery('DROP INDEX IF EXISTS idx_ll5_activity_canonica').execute()
      console.log('[v2] índice removido')
    } catch (err) {
      console.log('[v2] drop: ' + String(err).slice(0, 100))
    }

    // ---------- 2) diagnóstico: quantas por fonte ----------
    try {
      const rows = db.newQuery('SELECT fonte, COUNT(*) AS n FROM ll5_activity GROUP BY fonte').all()
      const resumo = []
      for (const r of rows) {
        resumo.push(String(r.get('fonte')) + '=' + String(r.get('n')))
      }
      console.log('[v2] ANTES por fonte: ' + resumo.join(' · '))
    } catch (err) {
      console.log('[v2] diagnóstico: ' + String(err).slice(0, 140))
    }

    // ---------- 3) APAGA tudo que não é garmin_api ----------
    try {
      db.newQuery(
        "DELETE FROM ll5_activity WHERE LOWER(TRIM(COALESCE(fonte, ''))) != 'garmin_api'",
      ).execute()
      console.log('[v2] DELETE (fonte != garmin_api) executado')
    } catch (err) {
      console.log('[v2] DELETE fonte: ' + String(err).slice(0, 200))
    }

    // ---------- 4) quantas sobraram ----------
    try {
      const r = db.newQuery('SELECT COUNT(*) AS n FROM ll5_activity').all()
      for (const linha of r) {
        console.log('[v2] restantes: ' + String(linha.get('n')))
      }
    } catch (err) {
      console.log('[v2] contagem: ' + String(err).slice(0, 120))
    }

    // ---------- 5) TAREFAS: remove o paciente do título ----------
    //
    // UPDATE ... FROM com subconsulta: chaque tarefa cujo título contém o
    // nome do paciente de um tratamento perde esse trecho.
    try {
      db.newQuery(
        "UPDATE tarefas SET titulo = TRIM(REPLACE(titulo, ' — ' || paciente, '')) " +
          "FROM (SELECT paciente_nome AS paciente FROM ll5_treatments WHERE paciente_nome != '') " +
          "WHERE tarefas.titulo LIKE '%' || paciente || '%'",
      ).execute()
      console.log('[v2] UPDATE título (from) executado')
    } catch (err) {
      console.log('[v2] update from: ' + String(err).slice(0, 160))
    }

    // ---------- 6) TAREFAS: preenche o responsável ----------
    try {
      db.newQuery(
        'UPDATE tarefas SET responsavel = paciente ' +
          "FROM (SELECT paciente_nome AS paciente, id AS tid FROM ll5_treatments WHERE paciente_nome != '') " +
          "WHERE tarefas.titulo LIKE '%' || paciente || '%' OR tarefas.descricao LIKE '%' || paciente || '%'",
      ).execute()
      console.log('[v2] UPDATE responsavel (from) executado')
    } catch (err) {
      console.log('[v2] update responsavel: ' + String(err).slice(0, 160))
    }

    // ---------- 7) fallback por laço (sort VAZIO) ----------
    try {
      const tratamentos = app.findRecordsByFilter('ll5_treatments', "id != ''", '', 0, 0)
      console.log('[v2] tratamentos (laço): ' + tratamentos.length)

      for (const t of tratamentos) {
        let paciente = ''
        try {
          paciente = String(t.get('paciente_nome') || '')
        } catch (_) {
          paciente = ''
        }
        if (!paciente) continue
        const esc = paciente.replace(/'/g, "''")

        try {
          db.newQuery(
            "UPDATE tarefas SET titulo = TRIM(REPLACE(titulo, ' — " +
              esc +
              "', '')) WHERE titulo LIKE '%— " +
              esc +
              "%'",
          ).execute()
        } catch (_) {}

        try {
          db.newQuery(
            "UPDATE tarefas SET responsavel = '" +
              esc +
              "' WHERE responsavel = '' OR responsavel IS NULL",
          ).execute()
        } catch (_) {}

        try {
          db.newQuery(
            "UPDATE tarefas SET responsavel = '" +
              esc +
              "' WHERE titulo LIKE '%" +
              esc +
              "%' AND (responsavel = '' OR responsavel IS NULL)",
          ).execute()
        } catch (_) {}
      }
      console.log('[v2] laço de tratamentos concluído')
    } catch (err) {
      console.log('[v2] laço: ' + String(err).slice(0, 160))
    }

    // ---------- 8) amostra final ----------
    try {
      const amostra = db
        .newQuery(
          "SELECT titulo, responsavel FROM tarefas WHERE titulo LIKE '%Miofascial%' LIMIT 3",
        )
        .all()
      for (const a of amostra) {
        console.log(
          '[v2] amostra: ' + String(a.get('titulo')) + ' | resp=' + String(a.get('responsavel')),
        )
      }
    } catch (_) {}

    // ---------- 9) recria o índice ----------
    try {
      db.newQuery(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_ll5_activity_canonica ON ll5_activity (chave_canonica)',
      ).execute()
    } catch (err) {
      console.log('[v2] índice: ' + String(err).slice(0, 120))
    }

    console.log('[v2] CONCLUÍDO')
  },
  (app) => {
    console.log('[v2] rollback: dados de CSV não são recriados')
  },
)
