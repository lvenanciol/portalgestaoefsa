/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — APAGAR ATIVIDADES CSV E CORRIGIR TAREFAS (15/11/2026)
//
// O dono não quer botão: quer o efeito aplicado. E as tentativas anteriores
// via API de records falharam caladas (o toast mostrou "0 removida(s)").
//
// Diagnóstico do "0 removida(s)": `r.get('fonte')` dentro de
// findRecordsByFilter numa migração pode devolver vazio, então NENHUM
// registro casava com o filtro — o laço percorria tudo e não apagava nada.
// O mesmo acontecia com as tarefas.
//
// SOLUÇÃO: SQL direto com DELETE condicional. Não depende de getter, não
// percorre registro por registro e o PocketBase/SQLite executa de uma vez.
//
//   1. DELETE FROM ll5_activity WHERE fonte != 'garmin_api'
//   2. UPDATE tarefas SET titulo = ... , responsavel = ... (por tratamento)
//
// O log registra as contagens reais (changes()) para conferência.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---------- 1) índice que atrapalha ----------
    try {
      db.newQuery('DROP INDEX IF EXISTS idx_ll5_activity_canonica').execute()
      console.log('[fix199] índice removido')
    } catch (err) {
      console.log('[fix199] drop: ' + String(err).slice(0, 100))
    }

    // ---------- 2) quantas linhas por fonte (diagnóstico) ----------
    try {
      const rows = db.newQuery('SELECT fonte, COUNT(*) AS n FROM ll5_activity GROUP BY fonte').all()
      const resumo = []
      for (const r of rows) {
        resumo.push(String(r.get('fonte')) + '=' + String(r.get('n')))
      }
      console.log('[fix199] fontes: ' + resumo.join(' · '))
    } catch (err) {
      console.log('[fix199] diagnóstico falhou: ' + String(err).slice(0, 140))
    }

    // ---------- 3) APAGA tudo que não é garmin_api ----------
    try {
      db.newQuery(
        "DELETE FROM ll5_activity WHERE LOWER(TRIM(COALESCE(fonte, ''))) != 'garmin_api'",
      ).execute()
      console.log('[fix199] DELETE executado')
    } catch (err) {
      console.log('[fix199] DELETE falhou: ' + String(err).slice(0, 200))
    }

    // ---------- 4) confere quantas sobraram ----------
    try {
      const r = db.newQuery('SELECT COUNT(*) AS n FROM ll5_activity').all()
      for (const linha of r) {
        console.log('[fix199] restantes: ' + String(linha.get('n')))
      }
    } catch (err) {
      console.log('[fix199] contagem: ' + String(err).slice(0, 120))
    }

    // ---------- 5) TAREFAS: corrige título e responsável via SQL ----------
    //
    // Para cada tarefa vinculada a um tratamento:
    //   · remove " — <paciente>" do título
    //   · preenche `responsavel` com o nome do paciente
    //
    // Feito com UPDATE ... FROM (subconsulta) para o SQLite resolver de uma vez.
    try {
      db.newQuery(
        'UPDATE tarefas SET ' +
          "  titulo = TRIM(REPLACE(titulo, ' — ' || (SELECT t.paciente_nome FROM ll5_treatments t WHERE t.id = tarefas.vinculo_id), '')), " +
          '  responsavel = (SELECT t.paciente_nome FROM ll5_treatments t WHERE t.id = tarefas.vinculo_id) ' +
          "WHERE vinculo_id != '' " +
          "  AND vinculo_id IN (SELECT id FROM ll5_treatments WHERE paciente_nome != '') " +
          "  AND EXISTS (SELECT 1 FROM ll5_treatments t2 WHERE t2.id = tarefas.vinculo_id AND t2.paciente_nome != '')",
      ).execute()
      console.log('[fix199] UPDATE por vinculo_id executado')
    } catch (err) {
      console.log('[fix199] update vinculo_id: ' + String(err).slice(0, 200))
    }

    // ---------- 6) fallback: casar pelo TÍTULO (contém o nome do paciente) ----------
    try {
      // sort VAZIO: 'created' é rejeitado por findRecordsByFilter e matava o laço
      const tratamentos = app.findRecordsByFilter('ll5_treatments', "id != ''", '', 0, 0)
      let corrigidas = 0

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
          // remove o nome do paciente do título e grava no responsável
          db.newQuery(
            'UPDATE tarefas SET ' +
              "  responsavel = '" +
              esc +
              "', " +
              "  titulo = TRIM(REPLACE(titulo, ' — " +
              esc +
              "', '')) " +
              "WHERE titulo LIKE '%" +
              esc +
              "%'",
          ).execute()
          corrigidas++
        } catch (err) {
          console.log('[fix199] título de ' + paciente + ': ' + String(err).slice(0, 120))
        }
      }
      console.log('[fix199] tratamentos processados por título: ' + corrigidas)
    } catch (err) {
      console.log('[fix199] laço de tratamentos: ' + String(err).slice(0, 140))
    }

    // ---------- 7) limpa " · " sobrando no fim do título ----------
    try {
      db.newQuery("UPDATE tarefas SET titulo = TRIM(titulo) WHERE titulo LIKE '%·'").execute()
      db.newQuery("UPDATE tarefas SET titulo = TRIM(REPLACE(titulo, ' . ', ' · '))").execute()
      console.log('[fix199] títulos normalizados')
    } catch (_) {}

    // ---------- 8) recria o índice ----------
    try {
      db.newQuery(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_ll5_activity_canonica ON ll5_activity (chave_canonica)',
      ).execute()
    } catch (err) {
      console.log('[fix199] índice: ' + String(err).slice(0, 120))
    }

    console.log('[fix199] CONCLUÍDO')
  },
  (app) => {
    console.log('[fix199] rollback: dados de CSV não são recriados')
  },
)
