// Fase 8 — Leitura dos demonstrativos importados (qualquer autenticado).
// GET /backend/v1/demonstrativos?tipo=balancete&periodo=YYYY-MM
// Retorna linhas + totais + quadratura (ΣD=ΣC) com fonte.

routerAdd(
  'GET',
  '/backend/v1/demonstrativos',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const q = e.requestInfo().query || {}
    const tipo = String(q.tipo || 'balancete')
    const periodo = String(q.periodo || '')
    if (!['balancete', 'dre'].includes(tipo)) return e.badRequestError('tipo inválido')
    if (!/^\d{4}-\d{2}$/.test(periodo)) return e.badRequestError('periodo deve ser YYYY-MM')

    const tabela = tipo === 'balancete' ? 'balancete_linhas' : 'dre_linhas'

    let rows = []
    try {
      if (tipo === 'balancete') {
        rows = $app
          .db()
          .newQuery(
            'SELECT conta, nome, grau, saldo_anterior, debitos, creditos, saldo_atual, fonte, empresa, importado_por, updated FROM balancete_linhas WHERE periodo = {:p} ORDER BY conta',
          )
          .bind({ p: periodo })
          .all()
      } else {
        rows = $app
          .db()
          .newQuery(
            'SELECT ordem, conta, nome, nivel, valor, empresa, importado_por, updated FROM dre_linhas WHERE periodo = {:p} ORDER BY ordem',
          )
          .bind({ p: periodo })
          .all()
      }
    } catch (err) {
      return e.json(500, { ok: false, erro: String(err) })
    }

    if (rows.length === 0) {
      return e.json(200, {
        ok: true,
        tipo: tipo,
        periodo: periodo,
        linhas: [],
        totais: null,
        mensagem: 'Sem dados importados para este período.',
      })
    }

    const out = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      out.push({
        conta: r.getString('conta'),
        nome: r.getString('nome'),
        grau: r.getInt('grau'),
        ordem: r.getInt('ordem'),
        nivel: r.getString('nivel'),
        saldo_anterior: r.getFloat('saldo_anterior'),
        debitos: r.getFloat('debitos'),
        creditos: r.getFloat('creditos'),
        saldo_atual: r.getFloat('saldo_atual'),
        valor: r.getFloat('valor'),
        fonte: r.getString('fonte'),
        empresa: r.getString('empresa'),
        importado_por: r.getString('importado_por'),
        updated: r.getString('updated'),
      })
    }

    let totais = null
    if (tipo === 'balancete') {
      const debitos = out.reduce((a, l) => a + l.debitos, 0)
      const creditos = out.reduce((a, l) => a + l.creditos, 0)
      const fonte = out.find((l) => l.fonte)?.fonte || ''
      totais = {
        debitos: debitos,
        creditos: creditos,
        quadrado: Math.abs(debitos - creditos) < 0.01,
        fonte: fonte,
      }
    } else {
      totais = {
        linhas: out.length,
        grupos: out.filter((l) => l.nivel === 'grupo').length,
        subtotais: out.filter((l) => l.nivel === 'subtotal').length,
      }
    }

    return e.json(200, {
      ok: true,
      tipo: tipo,
      periodo: periodo,
      empresa: out[0]?.empresa || '',
      linhas: out,
      totais: totais,
    })
  },
  $apis.requireAuth(),
)
