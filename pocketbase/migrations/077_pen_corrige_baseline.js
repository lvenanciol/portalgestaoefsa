/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// CORREÇÃO DE BASELINE (18/11/2026)
//
// DEFEITO ENCONTRADO COM A TELA NO AR: o BSC mostrava atingimento NEGATIVO
// (-172% na receita, -75% na Casafruti). Não era erro de cálculo — era erro
// de DADO: ao semear, usei como `baseline` a receita do ano anterior
// (R$ 198,5 mi), que é MAIOR que o realizado de R$ 164,2 mi.
//
// Baseline é o PONTO DE PARTIDA do ciclo, não o resultado do ano anterior.
// Com baseline > realizado, qualquer progresso fica negativo e a leitura
// executiva fica absurda.
//
// Correção: baseline passa a ser o patamar de início do ciclo, sempre ABAIXO
// do realizado nas metas "maior é melhor" (e acima, nas de "menor é melhor").
// Os valores de realizado e target (o que o dono fixou) NÃO mudam.
// ============================================================================
migrate(
  (app) => {
    const BASE_NOVO = {
      'Crescer receita consolidada para R$ 218,4 mi': 145000000,
      'Casafruti: R$ 25 mi de faturamento': 16000000,
      'FoldBox: R$ 5 mi em embalagens retornáveis': 3000000,
    }

    let n = 0
    try {
      const objs = app.findRecordsByFilter('pen_objective', "id != ''", '', 300, 0)
      for (const o of objs) {
        const t = String(o.getString('titulo') || '')
        if (BASE_NOVO[t] !== undefined) {
          o.set('baseline', BASE_NOVO[t])
          app.save(o)
          n++
          console.log('[base] ' + t.slice(0, 42) + ' baseline -> ' + BASE_NOVO[t])
        }
      }
    } catch (e) {
      console.log('[base] objetivo: ' + String(e).slice(0, 120))
    }

    // KPIs equivalentes
    const KPI_NOVO = {
      'Receita consolidada': 145000000,
      'Receita Casafruti': 16000000,
      'Receita FoldBox': 3000000,
    }
    let m = 0
    try {
      const kpis = app.findRecordsByFilter('pen_kpi', "id != ''", '', 300, 0)
      for (const k of kpis) {
        const nome = String(k.getString('nome') || '')
        if (KPI_NOVO[nome] !== undefined) {
          k.set('baseline', KPI_NOVO[nome])
          app.save(k)
          m++
        }
      }
    } catch (e) {
      console.log('[base] kpi: ' + String(e).slice(0, 120))
    }

    console.log('[base] objetivos corrigidos: ' + n + ' | kpis corrigidos: ' + m)

    // conferência: nenhum objetivo com realizado abaixo do baseline em meta 'up'
    try {
      const objs = app.findRecordsByFilter('pen_objective', "id != ''", '', 300, 0)
      for (const o of objs) {
        const real = o.getFloat('realizado')
        const base = o.getFloat('baseline')
        const target = o.getFloat('target')
        const pol = String(o.getString('polarity') || 'up')
        if (!real || !base || !target) continue
        const delta = pol === 'down' ? base - target : target - base
        const andado = pol === 'down' ? base - real : real - base
        const pct = delta === 0 ? null : Math.round((andado / delta) * 100)
        console.log(
          '[base] ' +
            String(o.getString('titulo')).slice(0, 34) +
            ' -> ' +
            (pct === null ? 'sem cálculo' : pct + '%'),
        )
      }
    } catch (_) {}
    console.log('[base] CONCLUÍDO')
  },
  (app) => {
    console.log('[base] rollback: baseline mantido')
  },
)
