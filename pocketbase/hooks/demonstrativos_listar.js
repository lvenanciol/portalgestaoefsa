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

    const out = rows.map((r) => ({
      conta: r.conta || '',
      nome: r.nome || '',
      grau: Number(r.grau || 0),
      ordem: Number(r.ordem || 0),
      nivel: r.nivel || '',
      saldo_anterior: Number(r.saldo_anterior || 0),
      debitos: Number(r.debitos || 0),
      creditos: Number(r.creditos || 0),
      saldo_atual: Number(r.saldo_atual || 0),
      valor: Number(r.valor || 0),
      fonte: r.fonte || '',
      empresa: r.empresa || '',
      importado_por: r.importado_por || '',
      updated: r.updated || '',
    }))

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
