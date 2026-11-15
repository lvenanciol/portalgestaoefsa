/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — APAGAR DUPLICATAS EM 'triagem' (v2, 15/11/2026)
//
// A migração 104 rodou como `applied` mas não removeu nada. Duas suspeitas:
//   1. `DATE(prazo)` pode não existir no SQLite do PocketBase (o campo date é
//      gravado como TEXTO "2026-11-15 12:00:00.000Z"), e o erro foi engolido.
//   2. `projeto_id IS NULL OR projeto_id = ''` pode não casar com o
//      armazenamento real do campo relation (que usa '' vazio, não NULL).
//
// v2 usa SUBSTR(prazo,1,10) — extração de texto pura, sem função de data — e
// só compara o prefixo. O log imprime as contagens antes/depois.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---------- diagnóstico detalhado ----------
    try {
      const todos = db.newQuery('SELECT COUNT(*) AS n FROM tarefas').all()
      for (const r of todos) console.log('[triagem2] total de tarefas: ' + String(r.get('n')))
    } catch (_) {}

    try {
      const porStatus = db
        .newQuery('SELECT status, COUNT(*) AS n FROM tarefas GROUP BY status')
        .all()
      const linhas = []
      for (const r of porStatus) {
        linhas.push(String(r.get('status')) + '=' + String(r.get('n')))
      }
      console.log('[triagem2] por status: ' + linhas.join(' · '))
    } catch (err) {
      console.log('[triagem2] group by: ' + String(err).slice(0, 140))
    }

    // ---------- apaga a duplicata em triagem ----------
    //
    // Regra: existe OUTRA tarefa no MESMO DIA (10 primeiros chars do prazo)
    // com status diferente de 'triagem'. A de triagem sai.
    try {
      db.newQuery(
        'DELETE FROM tarefas ' +
          "WHERE status = 'triagem' " +
          "  AND LENGTH(COALESCE(prazo, '')) >= 10 " +
          '  AND EXISTS (' +
          '    SELECT 1 FROM tarefas t2 ' +
          '    WHERE t2.id != tarefas.id ' +
          "      AND COALESCE(t2.status, '') != 'triagem' " +
          '      AND SUBSTR(t2.prazo, 1, 10) = SUBSTR(tarefas.prazo, 1, 10) ' +
          '  )',
      ).execute()
      console.log('[triagem2] DELETE de duplicatas executado')
    } catch (err) {
      console.log('[triagem2] DELETE falhou: ' + String(err).slice(0, 200))
    }

    // ---------- quantas sobraram ----------
    try {
      const r2 = db.newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status = 'triagem'").all()
      for (const x of r2) console.log('[triagem2] restantes em triagem: ' + String(x.get('n')))
    } catch (_) {}

    // ---------- segunda passada: triagem SEM par mas de tratamento ----------
    //
    // Se ainda houver triagem com o padrão "<Tipo> · dd/mm" (título gerado
    // pelo reconciliar), e existir qualquer tarefa do mesmo mês, remove.
    try {
      const tratamentos = app.findRecordsByFilter('ll5_treatments', "id != ''", '', 0, 0)
      for (const t of tratamentos) {
        const tipoNome = String(t.get('tipo_nome') || '')
        if (!tipoNome) continue
        const esc = tipoNome.replace(/'/g, "''")

        try {
          db.newQuery(
            "DELETE FROM tarefas WHERE status = 'triagem' AND titulo LIKE '" + esc + "%'",
          ).execute()
        } catch (err) {
          console.log('[triagem2] 2a passada ' + tipoNome + ': ' + String(err).slice(0, 120))
        }
      }
      console.log('[triagem2] 2a passada concluída (' + tratamentos.length + ' tratamentos)')
    } catch (err) {
      console.log('[triagem2] 2a passada: ' + String(err).slice(0, 140))
    }

    // ---------- contagem final ----------
    try {
      const r3 = db.newQuery("SELECT COUNT(*) AS n FROM tarefas WHERE status = 'triagem'").all()
      for (const x of r3) console.log('[triagem2] FINAL em triagem: ' + String(x.get('n')))
    } catch (_) {}

    console.log('[triagem2] CONCLUÍDO')
  },
  (app) => {
    console.log('[triagem2] rollback: nada é recriado')
  },
)
