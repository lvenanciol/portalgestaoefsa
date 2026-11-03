// pocketbase/hooks/tarefas_origem_progresso.js
// Implementa as regras de negócio do Prompt 5 (revisado v3) — Modelo de Vínculo por ORIGEM:
// 1. Recalcular progresso de projeto (tarefas avulsas fora de escopo, apenas projeto com marco).
// 2. Endpoints dedicados:
//    - POST /backend/v1/tarefas-projeto/vincular: vincularTarefaAoProjeto(tarefaId, projetoId, marcoId)
//    - POST /backend/v1/tarefas-projeto/desvincular: desvincularTarefaDeProjeto(tarefaId)
//    - POST /backend/v1/tarefas-projeto/recalcular-progresso: recalcularProgresso(projetoId)
//    - GET  /backend/v1/tarefas-projeto/diagnostico: diagnóstico do vínculo de origem
// 3. Hooks de integridade onRecordCreateRequest / onRecordUpdateRequest na coleção 'tarefas'.
// 4. Hook onRecordAfterUpdateSuccess / onRecordAfterDeleteSuccess na coleção 'tarefas'.
// 5. Hook onRecordDeleteRequest na coleção 'marcos' (ON DELETE RESTRICT).

// -------------------------------------------------------------
// POST /backend/v1/tarefas-projeto/vincular
// Body: { tarefaId, projetoId, marcoId }
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/tarefas-projeto/vincular', (e) => {
  const reqInfo = e.requestInfo()
  const body = reqInfo.body || {}

  const tarefaId = body.tarefaId || body.tarefa_id
  const projetoId = body.projetoId || body.projeto_id
  const marcoId = body.marcoId || body.marco_id

  if (!tarefaId || !projetoId || !marcoId) {
    return e.json(422, {
      error: 'Parâmetros obrigatórios ausentes: tarefaId, projetoId e marcoId são obrigatórios.',
      code: 'VALIDATION_FAILED',
    })
  }

  const app = $app
  let tarefa
  let projeto
  let marco

  try {
    tarefa = app.findRecordById('tarefas', tarefaId)
  } catch (_) {
    return e.json(404, { error: 'Tarefa não encontrada.' })
  }

  try {
    projeto = app.findRecordById('projetos', projetoId)
  } catch (_) {
    return e.json(404, { error: 'Projeto não encontrado.' })
  }

  try {
    marco = app.findRecordById('marcos', marcoId)
  } catch (_) {
    return e.json(422, { error: 'Marco não encontrado.', code: 'INVALID_MARCO' })
  }

  // Validação: marco deve pertencer ao projeto informado
  if (marco.get('projeto_id') !== projetoId) {
    return e.json(422, {
      error: 'O marco selecionado não pertence ao projeto informado.',
      code: 'MARCO_PROJETO_MISMATCH',
    })
  }

  const projetoAnteriorId = tarefa.get('projeto_id')

  // Operação atômica: atualiza origem, projeto_id e marco_id
  tarefa.set('origem', 'projeto')
  tarefa.set('projeto_id', projetoId)
  tarefa.set('marco_id', marcoId)
  tarefa.set('vinculo_tipo', 'projeto')
  tarefa.set('vinculo_id', projetoId)

  app.save(tarefa)

  // Função inline para recalcular progresso
  const recalcular = (pid) => {
    if (!pid) return null
    let proj
    try {
      proj = app.findRecordById('projetos', pid)
    } catch (_) {
      return null
    }

    if (proj.get('status') === 'concluido') {
      proj.set('progresso', 100)
      app.save(proj)
      return {
        projetoId: pid,
        progresso: 100,
        total_tarefas: 0,
        concluidas: 0,
        canceladas: 0,
        bloqueadas: 0,
        tarefas_sem_marco_inconsistente: 0,
      }
    }

    const rows = app.findRecordsByFilter(
      'tarefas',
      `projeto_id = "${pid}" && origem = "projeto"`,
      '',
      5000,
      0,
    )

    let totalAtivas = 0
    let concluidas = 0
    let canceladas = 0
    let bloqueadas = 0
    let inconsistentes = 0

    for (const t of rows) {
      const mId = t.get('marco_id')
      if (!mId) {
        inconsistentes++
        continue
      }
      const st = t.get('status')
      const sk = t.get('status_kanban')
      if (st === 'cancelada' || sk === 'cancelado') {
        canceladas++
        continue
      }
      totalAtivas++
      if (st === 'concluida' || sk === 'concluido') {
        concluidas++
      } else if (sk === 'bloqueado') {
        bloqueadas++
      }
    }

    let novoProgresso = 0
    if (totalAtivas > 0) {
      novoProgresso = Math.floor((concluidas / totalAtivas) * 100)
    } else {
      const marcosList = app.findRecordsByFilter('marcos', `projeto_id = "${pid}"`, '', 500, 0)
      if (marcosList.length > 0) {
        const conc = marcosList.filter((m) => !!m.get('concluido')).length
        novoProgresso = Math.floor((conc / marcosList.length) * 100)
      } else {
        novoProgresso = 0
      }
    }

    proj.set('progresso', novoProgresso)
    app.save(proj)

    return {
      projetoId: pid,
      progresso: novoProgresso,
      total_tarefas: totalAtivas,
      concluidas,
      canceladas,
      bloqueadas,
      tarefas_sem_marco_inconsistente: inconsistentes,
    }
  }

  const calcDestino = recalcular(projetoId)
  let calcOrigem = null
  if (projetoAnteriorId && projetoAnteriorId !== projetoId) {
    calcOrigem = recalcular(projetoAnteriorId)
  }

  return e.json(200, {
    success: true,
    tarefa: {
      id: tarefa.id,
      origem: 'projeto',
      projeto_id: projetoId,
      marco_id: marcoId,
    },
    projeto_progresso: calcDestino,
    projeto_origem_progresso: calcOrigem,
  })
})

// -------------------------------------------------------------
// POST /backend/v1/tarefas-projeto/desvincular
// Body: { tarefaId }
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/tarefas-projeto/desvincular', (e) => {
  const reqInfo = e.requestInfo()
  const body = reqInfo.body || {}

  const tarefaId = body.tarefaId || body.tarefa_id
  if (!tarefaId) {
    return e.json(422, {
      error: 'Parâmetro obrigatório ausente: tarefaId.',
      code: 'VALIDATION_FAILED',
    })
  }

  const app = $app
  let tarefa
  try {
    tarefa = app.findRecordById('tarefas', tarefaId)
  } catch (_) {
    return e.json(404, { error: 'Tarefa não encontrada.' })
  }

  const projetoAntigoId = tarefa.get('projeto_id') || tarefa.get('vinculo_id')

  // Zera projeto_id e marco_id juntos; origem = 'avulsa'
  tarefa.set('origem', 'avulsa')
  tarefa.set('projeto_id', '')
  tarefa.set('marco_id', '')
  if (tarefa.get('vinculo_tipo') === 'projeto') {
    tarefa.set('vinculo_tipo', '')
    tarefa.set('vinculo_id', '')
  }
  app.save(tarefa)

  let calc = null
  if (projetoAntigoId) {
    let proj
    try {
      proj = app.findRecordById('projetos', projetoAntigoId)
      if (proj) {
        if (proj.get('status') === 'concluido') {
          proj.set('progresso', 100)
          app.save(proj)
          calc = {
            projetoId: projetoAntigoId,
            progresso: 100,
            total_tarefas: 0,
            concluidas: 0,
            canceladas: 0,
            bloqueadas: 0,
            tarefas_sem_marco_inconsistente: 0,
          }
        } else {
          const rows = app.findRecordsByFilter(
            'tarefas',
            `projeto_id = "${projetoAntigoId}" && origem = "projeto"`,
            '',
            5000,
            0,
          )
          let totalAtivas = 0
          let concluidas = 0
          let canceladas = 0
          let bloqueadas = 0
          let inconsistentes = 0

          for (const t of rows) {
            const mId = t.get('marco_id')
            if (!mId) {
              inconsistentes++
              continue
            }
            const st = t.get('status')
            const sk = t.get('status_kanban')
            if (st === 'cancelada' || sk === 'cancelado') {
              canceladas++
              continue
            }
            totalAtivas++
            if (st === 'concluida' || sk === 'concluido') {
              concluidas++
            } else if (sk === 'bloqueado') {
              bloqueadas++
            }
          }

          let novoProgresso = 0
          if (totalAtivas > 0) {
            novoProgresso = Math.floor((concluidas / totalAtivas) * 100)
          } else {
            const marcosList = app.findRecordsByFilter(
              'marcos',
              `projeto_id = "${projetoAntigoId}"`,
              '',
              500,
              0,
            )
            if (marcosList.length > 0) {
              const conc = marcosList.filter((m) => !!m.get('concluido')).length
              novoProgresso = Math.floor((conc / marcosList.length) * 100)
            } else {
              novoProgresso = 0
            }
          }
          proj.set('progresso', novoProgresso)
          app.save(proj)
          calc = {
            projetoId: projetoAntigoId,
            progresso: novoProgresso,
            total_tarefas: totalAtivas,
            concluidas,
            canceladas,
            bloqueadas,
            tarefas_sem_marco_inconsistente: inconsistentes,
          }
        }
      }
    } catch (_) {}
  }

  return e.json(200, {
    success: true,
    tarefa: {
      id: tarefa.id,
      origem: 'avulsa',
      projeto_id: null,
      marco_id: null,
    },
    projeto_progresso: calc,
  })
})

// -------------------------------------------------------------
// POST /backend/v1/tarefas-projeto/recalcular-progresso
// Body: { projetoId }
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/tarefas-projeto/recalcular-progresso', (e) => {
  const reqInfo = e.requestInfo()
  const body = reqInfo.body || {}

  const projetoId = body.projetoId || body.projeto_id
  if (!projetoId) {
    return e.json(422, { error: 'projetoId é obrigatório' })
  }

  const app = $app
  let proj
  try {
    proj = app.findRecordById('projetos', projetoId)
  } catch (_) {
    return e.json(404, { error: 'Projeto não encontrado' })
  }

  if (proj.get('status') === 'concluido') {
    proj.set('progresso', 100)
    app.save(proj)
    return e.json(200, {
      success: true,
      projetoId,
      progresso: 100,
      total_tarefas: 0,
      concluidas: 0,
      canceladas: 0,
      bloqueadas: 0,
      tarefas_sem_marco_inconsistente: 0,
    })
  }

  const rows = app.findRecordsByFilter(
    'tarefas',
    `projeto_id = "${projetoId}" && origem = "projeto"`,
    '',
    5000,
    0,
  )

  let totalAtivas = 0
  let concluidas = 0
  let canceladas = 0
  let bloqueadas = 0
  let inconsistentes = 0

  for (const t of rows) {
    const mId = t.get('marco_id')
    if (!mId) {
      inconsistentes++
      continue
    }
    const st = t.get('status')
    const sk = t.get('status_kanban')
    if (st === 'cancelada' || sk === 'cancelado') {
      canceladas++
      continue
    }
    totalAtivas++
    if (st === 'concluida' || sk === 'concluido') {
      concluidas++
    } else if (sk === 'bloqueado') {
      bloqueadas++
    }
  }

  let novoProgresso = 0
  if (totalAtivas > 0) {
    novoProgresso = Math.floor((concluidas / totalAtivas) * 100)
  } else {
    const marcosList = app.findRecordsByFilter('marcos', `projeto_id = "${projetoId}"`, '', 500, 0)
    if (marcosList.length > 0) {
      const conc = marcosList.filter((m) => !!m.get('concluido')).length
      novoProgresso = Math.floor((conc / marcosList.length) * 100)
    } else {
      novoProgresso = 0
    }
  }

  proj.set('progresso', novoProgresso)
  app.save(proj)

  return e.json(200, {
    success: true,
    projetoId,
    progresso: novoProgresso,
    total_tarefas: totalAtivas,
    concluidas,
    canceladas,
    bloqueadas,
    tarefas_sem_marco_inconsistente: inconsistentes,
  })
})

// -------------------------------------------------------------
// GET /backend/v1/tarefas-projeto/diagnostico
// -------------------------------------------------------------
routerAdd('GET', '/backend/v1/tarefas-projeto/diagnostico', (e) => {
  const app = $app
  const tarefas = app.findRecordsByFilter('tarefas', '1=1', '', 5000, 0)
  const marcos = app.findRecordsByFilter('marcos', '1=1', '', 5000, 0)
  const projetos = app.findRecordsByFilter('projetos', '1=1', '', 5000, 0)

  let contagemA = 0
  let contagemB = 0
  let violacoes = []

  for (const t of tarefas) {
    const o = t.get('origem') || (t.get('projeto_id') ? 'projeto' : 'avulsa')
    const pid = t.get('projeto_id')
    const mid = t.get('marco_id')

    if (o === 'avulsa') {
      if (pid || mid) {
        violacoes.push({
          id: t.id,
          titulo: t.get('titulo'),
          origem: o,
          projeto_id: pid,
          marco_id: mid,
          motivo: 'Origem avulsa com projeto_id ou marco_id preenchido',
        })
      } else {
        contagemB++
      }
    } else if (o === 'projeto') {
      if (!pid || !mid) {
        violacoes.push({
          id: t.id,
          titulo: t.get('titulo'),
          origem: o,
          projeto_id: pid,
          marco_id: mid,
          motivo: 'Origem projeto sem projeto_id ou sem marco_id',
        })
      } else {
        try {
          const mRec = app.findRecordById('marcos', mid)
          if (mRec.get('projeto_id') !== pid) {
            violacoes.push({
              id: t.id,
              titulo: t.get('titulo'),
              origem: o,
              projeto_id: pid,
              marco_id: mid,
              motivo: 'marco_id não pertence ao projeto_id indicado',
            })
          } else {
            contagemA++
          }
        } catch (_) {
          violacoes.push({
            id: t.id,
            titulo: t.get('titulo'),
            origem: o,
            projeto_id: pid,
            marco_id: mid,
            motivo: 'marco_id não existe',
          })
        }
      }
    } else {
      violacoes.push({
        id: t.id,
        origem: o,
        motivo: 'origem inválida',
      })
    }
  }

  return e.json(200, {
    total_tarefas: tarefas.length,
    total_projetos: projetos.length,
    total_marcos: marcos.length,
    classe_a_projeto_com_marco: contagemA,
    classe_b_avulsa_em_conformidade: contagemB,
    violacoes_integridade: violacoes.length,
    violacoes,
  })
})

// -------------------------------------------------------------
// Hook de integridade: antes de criar/atualizar tarefa via API normal
// -------------------------------------------------------------
onRecordCreateRequest((e) => {
  const record = e.record
  let origem = record.get('origem')
  let projetoId = record.get('projeto_id')
  let marcoId = record.get('marco_id')

  if (!origem) {
    origem = projetoId && projetoId !== '' ? 'projeto' : 'avulsa'
    record.set('origem', origem)
  }

  if (origem === 'avulsa') {
    if ((projetoId && projetoId !== '') || (marcoId && marcoId !== '')) {
      throw new BadRequestError('Tarefa avulsa não pode possuir projeto_id nem marco_id.')
    }
  } else if (origem === 'projeto') {
    if (!projetoId || projetoId === '') {
      throw new BadRequestError('Tarefa com origem "projeto" exige projeto_id.')
    }
    if (!marcoId || marcoId === '') {
      throw new BadRequestError('Tarefa com origem "projeto" exige marco_id obrigatoriamente.')
    }

    let marco
    try {
      marco = $app.findRecordById('marcos', marcoId)
    } catch (_) {
      throw new BadRequestError('marco_id informado não existe.')
    }

    if (marco.get('projeto_id') !== projetoId) {
      throw new BadRequestError('O marco_id informado não pertence ao projeto da tarefa.')
    }
  } else {
    throw new BadRequestError('Origem inválida. Valores aceitos: "projeto" ou "avulsa".')
  }

  e.next()
}, 'tarefas')

onRecordUpdateRequest((e) => {
  const record = e.record
  let origem = record.get('origem')
  let projetoId = record.get('projeto_id')
  let marcoId = record.get('marco_id')

  if (!origem) {
    origem = projetoId && projetoId !== '' ? 'projeto' : 'avulsa'
    record.set('origem', origem)
  }

  if (origem === 'avulsa') {
    if ((projetoId && projetoId !== '') || (marcoId && marcoId !== '')) {
      throw new BadRequestError('Tarefa avulsa não pode possuir projeto_id nem marco_id.')
    }
  } else if (origem === 'projeto') {
    if (!projetoId || projetoId === '') {
      throw new BadRequestError('Tarefa com origem "projeto" exige projeto_id.')
    }
    if (!marcoId || marcoId === '') {
      throw new BadRequestError('Tarefa com origem "projeto" exige marco_id obrigatoriamente.')
    }

    let marco
    try {
      marco = $app.findRecordById('marcos', marcoId)
    } catch (_) {
      throw new BadRequestError('marco_id informado não existe.')
    }

    if (marco.get('projeto_id') !== projetoId) {
      throw new BadRequestError('O marco_id informado não pertence ao projeto da tarefa.')
    }
  } else {
    throw new BadRequestError('Origem inválida. Valores aceitos: "projeto" ou "avulsa".')
  }

  e.next()
}, 'tarefas')

// Hook de recálculo de progresso pós update ou delete de tarefa
onRecordAfterUpdateSuccess((e) => {
  e.next()
  try {
    const pid = e.record.get('projeto_id')
    if (pid) {
      const app = $app
      let proj = app.findRecordById('projetos', pid)
      if (proj && proj.get('status') !== 'concluido') {
        const rows = app.findRecordsByFilter(
          'tarefas',
          `projeto_id = "${pid}" && origem = "projeto"`,
          '',
          5000,
          0,
        )
        let totalAtivas = 0
        let concluidas = 0
        for (const t of rows) {
          if (!t.get('marco_id')) continue
          const st = t.get('status')
          const sk = t.get('status_kanban')
          if (st === 'cancelada' || sk === 'cancelado') continue
          totalAtivas++
          if (st === 'concluida' || sk === 'concluido') concluidas++
        }
        let novoProgresso = 0
        if (totalAtivas > 0) {
          novoProgresso = Math.floor((concluidas / totalAtivas) * 100)
        }
        proj.set('progresso', novoProgresso)
        app.save(proj)
      }
    }
  } catch (_) {}
}, 'tarefas')

onRecordAfterDeleteSuccess((e) => {
  e.next()
  try {
    const pid = e.record.get('projeto_id')
    if (pid) {
      const app = $app
      let proj = app.findRecordById('projetos', pid)
      if (proj && proj.get('status') !== 'concluido') {
        const rows = app.findRecordsByFilter(
          'tarefas',
          `projeto_id = "${pid}" && origem = "projeto"`,
          '',
          5000,
          0,
        )
        let totalAtivas = 0
        let concluidas = 0
        for (const t of rows) {
          if (!t.get('marco_id')) continue
          const st = t.get('status')
          const sk = t.get('status_kanban')
          if (st === 'cancelada' || sk === 'cancelado') continue
          totalAtivas++
          if (st === 'concluida' || sk === 'concluido') concluidas++
        }
        let novoProgresso = 0
        if (totalAtivas > 0) {
          novoProgresso = Math.floor((concluidas / totalAtivas) * 100)
        }
        proj.set('progresso', novoProgresso)
        app.save(proj)
      }
    }
  } catch (_) {}
}, 'tarefas')

// ON DELETE RESTRICT em marcos
onRecordDeleteRequest((e) => {
  const marcoId = e.record.id
  const tarefasComMarco = $app.findRecordsByFilter('tarefas', `marco_id = "${marcoId}"`, '', 1, 0)
  if (tarefasComMarco && tarefasComMarco.length > 0) {
    throw new BadRequestError(
      'ON DELETE RESTRICT: não é permitido excluir marco que possui tarefas vinculadas.',
    )
  }
  e.next()
}, 'marcos')
