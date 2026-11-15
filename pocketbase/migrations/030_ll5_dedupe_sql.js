/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — DEDUPE POR SQL (v2, 15/11/2026)
//
// A migração 094 (via API de records) NÃO removeu nada: o print ainda mostra
// 2.350 atividades com linhas idênticas repetidas (13/11 e 10/11 duas vezes).
//
// Motivo provável: `r.getFloat()`/`r.getDateTime()` no JSVM podem devolver
// valores que não convertem, zerando a chave e deixando todo mundo em grupos
// distintos. E `app.delete()` dentro de um laço grande pode falhar calado.
//
// Esta versão faz o trabalho em SQL, que é atômico e verificável:
//   · agrupa por (data até o minuto, tipo, distância arredondada em 100 m);
//   · mantém o registro de MELHOR qualidade;
//   · apaga os demais;
//   · recria a chave canônica já limpa.
//
// PocketBase usa SQLite — strftime e ROW_NUMBER funcionam.
// ============================================================================
migrate(
  (app) => {
    const db = app.db()

    // ---- 1) quantas existem antes ----
    let antes = 0
    try {
      const r = db.newQuery('SELECT COUNT(*) AS n FROM ll5_activity').one()
      antes = Number(r.get('n') || 0)
    } catch (err) {
      console.log('[dedupe-sql] falha ao contar: ' + String(err).slice(0, 160))
    }
    console.log('[dedupe-sql] atividades antes: ' + antes)

    if (antes === 0) {
      console.log('[dedupe-sql] nada a fazer')
      return
    }

    // ---- 2) normaliza a chave canônica em SQL ----
    // data até o minuto (UTC), tipo e distância arredondada em 100m
    try {
      db.newQuery(
        'UPDATE ll5_activity SET chave_canonica = ' +
          "COALESCE(strftime('%s', data_hora_inicio), '0') / 60 || '|' || " +
          "COALESCE(tipo, 'outro') || '|' || " +
          'CAST(ROUND(COALESCE(distancia_m, 0) / 100) AS INTEGER)',
      ).execute()
      console.log('[dedupe-sql] chave_canonica recalculada')
    } catch (err) {
      console.log('[dedupe-sql] falha no update da chave: ' + String(err).slice(0, 160))
    }

    // ---- 3) apaga duplicatas mantendo o melhor registro ----
    // critério de qualidade: tem zonas > tem streams > fonte csv > fc_media > mais antigo
    try {
      db.newQuery(
        'DELETE FROM ll5_activity WHERE id NOT IN (' +
          '  SELECT id FROM (' +
          '    SELECT id, ROW_NUMBER() OVER (' +
          '      PARTITION BY chave_canonica' +
          '      ORDER BY' +
          "        CASE WHEN zonas_fc_seg IS NOT NULL AND zonas_fc_seg != '' AND zonas_fc_seg != '{}' THEN 0 ELSE 1 END," +
          '        CASE WHEN tem_streams = 1 THEN 0 ELSE 1 END,' +
          "        CASE WHEN fonte LIKE '%csv%' THEN 0 ELSE 1 END," +
          '        CASE WHEN fc_media > 0 THEN 0 ELSE 1 END,' +
          '        created ASC' +
          '    ) AS rn' +
          '    FROM ll5_activity' +
          '  ) WHERE rn = 1' +
          ')',
      ).execute()
      console.log('[dedupe-sql] duplicatas removidas')
    } catch (err) {
      console.log('[dedupe-sql] falha no delete: ' + String(err).slice(0, 200))
    }

    // ---- 4) quantas sobraram ----
    try {
      const r2 = db.newQuery('SELECT COUNT(*) AS n FROM ll5_activity').one()
      const depois = Number(r2.get('n') || 0)
      console.log(
        '[dedupe-sql] atividades depois: ' + depois + ' (removidas: ' + (antes - depois) + ')',
      )
    } catch (_) {}

    // ---- 5) garante o índice único ----
    try {
      db.newQuery(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_ll5_activity_canonica ON ll5_activity (chave_canonica)',
      ).execute()
      console.log('[dedupe-sql] índice único garantido')
    } catch (err) {
      console.log('[dedupe-sql] índice: ' + String(err).slice(0, 160))
    }
  },
  (app) => {
    console.log('[dedupe-sql] rollback: duplicatas não são recriadas')
  },
)
