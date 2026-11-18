/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// CAMPO `realizado` EM pen_kpi E pen_objective (18/11/2026)
//
// DEFEITO ENCONTRADO COM A TELA NO AR: o Cockpit mostrava "—" e "sem dado" em
// EBITDA e Turnover. Causa: o schema da Fase 1.1 criou baseline/target, mas
// NUNCA criou `realizado` — não havia onde guardar o valor medido. O mock
// tinha o campo; o banco não.
//
// Corrige com TextField/NumberField de verdade (fields.add com objeto simples
// falha em silêncio no JSVM) e semeia os valores que o dono fixou:
//   EBITDA 8,6% · Turnover 5,4% · Receita 164,2 mi · etc.
// ============================================================================
migrate(
  (app) => {
    // ---- 1) campo realizado nas duas coleções ----
    for (const nome of ['pen_kpi', 'pen_objective']) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        let tem = false
        for (let i = 0; i < col.fields.length; i++) {
          if (String(col.fields[i].name || '') === 'realizado') tem = true
        }
        if (!tem) {
          col.fields.add(new NumberField({ name: 'realizado', required: false }))
          app.save(col)
          console.log('[realizado] ' + nome + '.realizado CRIADO')
        } else {
          console.log('[realizado] ' + nome + '.realizado já existia')
        }
      } catch (e) {
        console.log('[realizado] ' + nome + ' ERRO: ' + String(e).slice(0, 120))
      }
    }

    // ---- 2) semear o valor medido nos KPIs ----
    const valores = {
      'Receita consolidada': 164200000,
      EBITDA: 8.6,
      'Turnover operacional': 5.4,
      'Quebra de perecíveis': 2.9,
      'Receita Casafruti': 18700000,
      'Receita FoldBox': 3650000,
      'NPS varejo': 55,
      'Automação fiscal': 52,
    }

    let n = 0
    try {
      const kpis = app.findRecordsByFilter('pen_kpi', "id != ''", '', 200, 0)
      for (const k of kpis) {
        const nome = String(k.getString('nome') || '')
        if (valores[nome] !== undefined) {
          k.set('realizado', valores[nome])
          app.save(k)
          n++
        }
      }
    } catch (e) {
      console.log('[realizado] semear kpi: ' + String(e).slice(0, 120))
    }
    console.log('[realizado] KPIs atualizados: ' + n)

    // ---- 3) objetivos também (para o Norte/BSC da fase seguinte) ----
    const objValores = {
      'Crescer receita consolidada para R$ 218,4 mi': 164200000,
      'Elevar EBITDA consolidado a 9,1%': 8.6,
      'Casafruti: R$ 25 mi de faturamento': 18700000,
      'FoldBox: R$ 5 mi em embalagens retornáveis': 3650000,
      'Reduzir turnover operacional a 3,0% ao mês': 5.4,
      'Quebra de perecíveis abaixo de 2,5%': 2.9,
      'NPS do varejo acima de 60': 55,
      'Automação de 70% do processo fiscal': 52,
    }
    let m = 0
    try {
      const objs = app.findRecordsByFilter('pen_objective', "id != ''", '', 200, 0)
      for (const o of objs) {
        const t = String(o.getString('titulo') || '')
        if (objValores[t] !== undefined) {
          o.set('realizado', objValores[t])
          app.save(o)
          m++
        }
      }
    } catch (e) {
      console.log('[realizado] semear objetivo: ' + String(e).slice(0, 120))
    }
    console.log('[realizado] objetivos atualizados: ' + m)

    // ---- conferência ----
    try {
      const eb = app.findRecordsByFilter('pen_kpi', 'nome = "EBITDA"', '', 1, 0)
      if (eb && eb.length) {
        console.log(
          '[realizado] EBITDA = ' +
            eb[0].getFloat('realizado') +
            ' | meta ' +
            eb[0].getFloat('target'),
        )
      }
    } catch (_) {}
    console.log('[realizado] CONCLUÍDO')
  },
  (app) => {
    console.log('[realizado] rollback: campo mantido')
  },
)
