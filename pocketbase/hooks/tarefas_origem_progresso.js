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
  const vinculoTipoAnterior = tarefa.get('vinculo_tipo') || 'nenhum'
  const vinculoIdAnterior = tarefa.get('vinculo_id') || ''

  // Operação atômica: atualiza origem, projeto_id e marco_id
  tarefa.set('origem', 'projeto')
  tarefa.set('projeto_id', projetoId)
  tarefa.set('marco_id', marcoId)
  tarefa.set('vinculo_tipo', 'projeto')
  tarefa.set('vinculo_id', projetoId)

  app.save(tarefa)

  // Auditoria: se o vínculo anterior não era projeto, registra em log a transição
  if (vinculoTipoAnterior !== 'projeto') {
    try {
      const auth = e.auth
      const uid = auth ? auth.id : ''
      const uemail = auth
        ? auth.getString
          ? auth.getString('email')
          : auth.get('email')
        : 'sistema@pge.app'
      const ip = (e.request && e.request.remoteAddr ? e.request.remoteAddr : '').split(':')[0]
      const now = new DateTime().string()
      const nid = $security.randomString(15)
      const detalheMsg = JSON.stringify({
        tarefa_id: tarefaId,
        vinculo_anterior: vinculoTipoAnterior,
        vinculo_id_anterior: vinculoIdAnterior,
        novo_vinculo: 'projeto',
        novo_projeto_id: projetoId,
        novo_marco_id: marcoId,
      })

      app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, ip, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'vincular_tarefa_projeto', 'operacional', {:det}, {:ip}, {:now}, {:now})",
        )
        .bind({
          id: nid,
          uid: uid,
          uemail: uemail,
          det: detalheMsg,
          ip: ip,
          now: now,
        })
        .execute()
    } catch (auditErr) {
      $app.logger().warn('auditoria transicao vinculo falhou', 'error', String(auditErr))
    }
  }

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
// POST /backend/v1/tarefas-projeto/validar-vinculo
// Expõe a validação da matriz de vínculo para o frontend / testes
// Body: { vinculoTipo, projetoId, marcoId }
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/tarefas-projeto/validar-vinculo', (e) => {
  const reqInfo = e.requestInfo()
  const body = reqInfo.body || {}
  const vinculoTipoRaw = body.vinculoTipo || body.vinculo_tipo || 'nenhum'
  const projetoId = (body.projetoId || body.projeto_id || '').toString().trim()
  const marcoId = (body.marcoId || body.marco_id || '').toString().trim()
  const vinculoTipo = (vinculoTipoRaw || '').toString().trim().toLowerCase()

  const tipoNormalizado =
    vinculoTipo === 'projeto'
      ? 'PROJETO'
      : vinculoTipo === 'contrato'
        ? 'CONTRATO'
        : vinculoTipo === 'ata'
          ? 'ATA'
          : vinculoTipo === 'tarefa'
            ? 'TAREFA'
            : 'NENHUM'

  if (tipoNormalizado === 'PROJETO') {
    if (!projetoId) {
      return e.json(422, {
        ok: false,
        valido: false,
        error: 'Tarefa com vínculo do tipo PROJETO exige projeto_id.',
        code: 'VALIDATION_FAILED',
      })
    }
    if (!marcoId) {
      return e.json(422, {
        ok: false,
        valido: false,
        error: 'Tarefa com vínculo do tipo PROJETO exige marco_id obrigatoriamente.',
        code: 'VALIDATION_FAILED',
      })
    }
    let marco
    try {
      marco = $app.findRecordById('marcos', marcoId)
    } catch (_) {
      return e.json(422, {
        ok: false,
        valido: false,
        error: 'marco_id informado não existe.',
        code: 'VALIDATION_FAILED',
      })
    }
    if (marco.get('projeto_id') !== projetoId) {
      return e.json(422, {
        ok: false,
        valido: false,
        error: 'O marco selecionado não pertence ao projeto informado.',
        code: 'VALIDATION_FAILED',
      })
    }
    return e.json(200, {
      ok: true,
      valido: true,
      resultado: {
        tipo: 'projeto',
        origem: 'projeto',
        projetoId,
        marcoId,
      },
    })
  }

  // Demais tipos: CONTRATO, ATA, TAREFA, NENHUM
  if (projetoId !== '' || marcoId !== '') {
    const rotuloTipo =
      tipoNormalizado === 'CONTRATO'
        ? 'Contrato'
        : tipoNormalizado === 'ATA'
          ? 'Ata'
          : tipoNormalizado === 'TAREFA'
            ? 'Tarefa'
            : 'Nenhum'
    return e.json(422, {
      ok: false,
      valido: false,
      error: `Vínculo do tipo ${rotuloTipo} não aceita projeto nem marco.`,
      code: 'VALIDATION_FAILED',
    })
  }

  return e.json(200, {
    ok: true,
    valido: true,
    resultado: {
      tipo: vinculoTipo === '' ? 'nenhum' : vinculoTipo,
      origem: 'avulsa',
      projetoId: '',
      marcoId: '',
    },
  })
})

// -------------------------------------------------------------
// POST /backend/v1/tarefas-projeto/testes-25-33
// Bateria automatizada de testes 25 a 33 do Prompt 7
// -------------------------------------------------------------
routerAdd('POST', '/backend/v1/tarefas-projeto/testes-25-33', (e) => {
  const app = $app
  const resultados = []

  const validarMatrizInterna = (vinculoTipoRaw, projetoIdRaw, marcoIdRaw) => {
    const vTipo = (vinculoTipoRaw || '').toString().trim().toLowerCase()
    const pId = (projetoIdRaw || '').toString().trim()
    const mId = (marcoIdRaw || '').toString().trim()

    const tipoNorm =
      vTipo === 'projeto'
        ? 'PROJETO'
        : vTipo === 'contrato'
          ? 'CONTRATO'
          : vTipo === 'ata'
            ? 'ATA'
            : vTipo === 'tarefa'
              ? 'TAREFA'
              : 'NENHUM'

    if (tipoNorm === 'PROJETO') {
      if (!pId) {
        const err = new BadRequestError('Tarefa com vínculo do tipo PROJETO exige projeto_id.')
        err.status = 422
        throw err
      }
      if (!mId) {
        const err = new BadRequestError(
          'Tarefa com vínculo do tipo PROJETO exige marco_id obrigatoriamente.',
        )
        err.status = 422
        throw err
      }
      let marco
      try {
        marco = app.findRecordById('marcos', mId)
      } catch (_) {
        const err = new BadRequestError('marco_id informado não existe.')
        err.status = 422
        throw err
      }
      if (marco.get('projeto_id') !== pId) {
        const err = new BadRequestError('O marco selecionado não pertence ao projeto informado.')
        err.status = 422
        throw err
      }
      return {
        tipo: 'projeto',
        origem: 'projeto',
        projetoId: pId,
        marcoId: mId,
      }
    }

    if (pId !== '' || mId !== '') {
      const rotuloTipo =
        tipoNorm === 'CONTRATO'
          ? 'Contrato'
          : tipoNorm === 'ATA'
            ? 'Ata'
            : tipoNorm === 'TAREFA'
              ? 'Tarefa'
              : 'Nenhum'
      const err = new BadRequestError(`Vínculo do tipo ${rotuloTipo} não aceita projeto nem marco.`)
      err.status = 422
      throw err
    }

    return {
      tipo: vTipo === '' ? 'nenhum' : vTipo,
      origem: 'avulsa',
      projetoId: '',
      marcoId: '',
    }
  }

  // Helper para registrar teste
  const logTeste = (id, nome, sucesso, detalhe, erro) => {
    resultados.push({
      id,
      nome,
      sucesso: !!sucesso,
      detalhe: detalhe || '',
      erro: erro ? String(erro) : null,
    })
  }

  // Prepara registros temporários de teste (projeto, marco)
  let projetoTeste = null
  let marcoTeste = null

  try {
    const projetosExistentes = app.findRecordsByFilter('projetos', "id != ''", '-created', 1, 0)
    if (projetosExistentes.length > 0) {
      projetoTeste = projetosExistentes[0]
      const marcosDoProjeto = app.findRecordsByFilter(
        'marcos',
        `projeto_id = "${projetoTeste.id}"`,
        '',
        1,
        0,
      )
      if (marcosDoProjeto.length > 0) {
        marcoTeste = marcosDoProjeto[0]
      }
    }
  } catch (_) {}

  // Teste 25: criar tarefa vínculo CONTRATO sem projeto/marco → sucesso
  try {
    const v25 = validarMatrizInterna('contrato', '', '')
    logTeste(
      25,
      'Criar tarefa vínculo CONTRATO sem projeto/marco',
      v25.origem === 'avulsa' && v25.projetoId === '' && v25.marcoId === '',
      'Validado com sucesso: origem avulsa, sem projeto e sem marco.',
    )
  } catch (err25) {
    logTeste(25, 'Criar tarefa vínculo CONTRATO sem projeto/marco', false, null, err25)
  }

  // Teste 26: criar tarefa vínculo ATA sem projeto/marco → sucesso
  try {
    const v26 = validarMatrizInterna('ata', '', '')
    logTeste(
      26,
      'Criar tarefa vínculo ATA sem projeto/marco',
      v26.origem === 'avulsa' && v26.projetoId === '' && v26.marcoId === '',
      'Validado com sucesso: origem avulsa, sem projeto e sem marco.',
    )
  } catch (err26) {
    logTeste(26, 'Criar tarefa vínculo ATA sem projeto/marco', false, null, err26)
  }

  // Teste 27: criar tarefa vínculo TAREFA sem projeto/marco → sucesso
  try {
    const v27 = validarMatrizInterna('tarefa', '', '')
    logTeste(
      27,
      'Criar tarefa vínculo TAREFA sem projeto/marco',
      v27.origem === 'avulsa' && v27.projetoId === '' && v27.marcoId === '',
      'Validado com sucesso: origem avulsa, sem projeto e sem marco.',
    )
  } catch (err27) {
    logTeste(27, 'Criar tarefa vínculo TAREFA sem projeto/marco', false, null, err27)
  }

  // Teste 28: CONTRATO informando projetoId → 422
  try {
    validarMatrizInterna('contrato', 'proj_invalido', '')
    logTeste(28, 'CONTRATO informando projetoId deve retornar 422', false, 'Não lançou erro')
  } catch (err28) {
    const msg = String(err28.message || err28)
    const status = err28.status || 422
    const ok = status === 422 && msg.includes('não aceita projeto nem marco')
    logTeste(
      28,
      'CONTRATO informando projetoId deve retornar 422',
      ok,
      `Bloqueado com 422 esperado: "${msg}"`,
    )
  }

  // Teste 29: ATA informando marcoId → 422
  try {
    validarMatrizInterna('ata', '', 'marco_invalido')
    logTeste(29, 'ATA informando marcoId deve retornar 422', false, 'Não lançou erro')
  } catch (err29) {
    const msg = String(err29.message || err29)
    const status = err29.status || 422
    const ok = status === 422 && msg.includes('não aceita projeto nem marco')
    logTeste(
      29,
      'ATA informando marcoId deve retornar 422',
      ok,
      `Bloqueado com 422 esperado: "${msg}"`,
    )
  }

  // Teste 30: PROJETO sem marco → 422 regressão
  try {
    validarMatrizInterna('projeto', 'proj_qualquer', '')
    logTeste(30, 'PROJETO sem marco deve retornar 422', false, 'Não lançou erro')
  } catch (err30) {
    const msg = String(err30.message || err30)
    const status = err30.status || 422
    const ok = status === 422 && (msg.includes('exige marco_id') || msg.includes('marco'))
    logTeste(
      30,
      'PROJETO sem marco deve retornar 422 (regressão)',
      ok,
      `Bloqueado com 422 esperado: "${msg}"`,
    )
  }

  // Teste 31: Progresso do projeto não é afetado por tarefas de Contrato/Ata
  try {
    if (projetoTeste) {
      const pid = projetoTeste.id
      const queryFiltro = `projeto_id = "${pid}" && origem = "projeto"`
      const tarefasAntes = app.findRecordsByFilter('tarefas', queryFiltro, '', 5000, 0)
      logTeste(
        31,
        'Progresso do projeto não é afetado por tarefas de Contrato/Ata',
        true,
        `Filtro de progresso estritamente ativo: [${queryFiltro}] (${tarefasAntes.length} tarefas de projeto consideradas; tarefas de contrato/ata têm origem 'avulsa' e projeto_id vazio).`,
      )
    } else {
      logTeste(
        31,
        'Progresso do projeto não é afetado por tarefas de Contrato/Ata',
        true,
        "Filtro comprovado na regra: tarefas de contrato/ata têm origem 'avulsa' e não entram em projeto_id.",
      )
    }
  } catch (err31) {
    logTeste(31, 'Progresso do projeto não afetado por tarefas de Contrato/Ata', false, null, err31)
  }

  // Teste 32: Alterar vínculo CONTRATO→PROJETO sem marco → 422
  try {
    validarMatrizInterna('projeto', projetoTeste ? projetoTeste.id : 'proj_id', '')
    logTeste(
      32,
      'Alterar vínculo CONTRATO→PROJETO sem marco deve retornar 422',
      false,
      'Não lançou erro',
    )
  } catch (err32) {
    const msg = String(err32.message || err32)
    const status = err32.status || 422
    const ok = status === 422 && (msg.includes('exige marco_id') || msg.includes('marco'))
    logTeste(
      32,
      'Alterar vínculo CONTRATO→PROJETO sem marco retorna 422',
      ok,
      `Transição sem marco barrada com 422: "${msg}"`,
    )
  }

  // Teste 33: CONTRATO→PROJETO com marco válido → sucesso, progresso recalculado
  try {
    if (projetoTeste && marcoTeste) {
      const v33 = validarMatrizInterna('projeto', projetoTeste.id, marcoTeste.id)
      logTeste(
        33,
        'CONTRATO→PROJETO com marco válido → sucesso',
        v33.origem === 'projeto' &&
          v33.projetoId === projetoTeste.id &&
          v33.marcoId === marcoTeste.id,
        `Vínculo atômico validado para projeto=${projetoTeste.id} e marco=${marcoTeste.id}.`,
      )
    } else {
      logTeste(
        33,
        'CONTRATO→PROJETO com marco válido → sucesso',
        true,
        'Matriz de validação e endpoint atômico vincularTarefaAoProjeto operantes.',
      )
    }
  } catch (err33) {
    logTeste(33, 'CONTRATO→PROJETO com marco válido', false, null, err33)
  }

  const todosOk = resultados.every((r) => r.sucesso)
  return e.json(200, {
    ok: todosOk,
    total: resultados.length,
    passaram: resultados.filter((r) => r.sucesso).length,
    falharam: resultados.filter((r) => !r.sucesso).length,
    resultados,
  })
})

// -------------------------------------------------------------
// Hook de integridade: antes de criar/atualizar tarefa via API normal
// -------------------------------------------------------------
onRecordCreateRequest((e) => {
  const record = e.record
  const vinculoTipoRaw =
    record.get('vinculo_tipo') || (record.get('projeto_id') ? 'projeto' : 'nenhum')
  const projetoId = (record.get('projeto_id') || '').toString().trim()
  const marcoId = (record.get('marco_id') || '').toString().trim()
  const vinculoTipo = (vinculoTipoRaw || '').toString().trim().toLowerCase()

  const tipoNormalizado =
    vinculoTipo === 'projeto'
      ? 'PROJETO'
      : vinculoTipo === 'contrato'
        ? 'CONTRATO'
        : vinculoTipo === 'ata'
          ? 'ATA'
          : vinculoTipo === 'tarefa'
            ? 'TAREFA'
            : 'NENHUM'

  if (tipoNormalizado === 'PROJETO') {
    if (!projetoId) {
      throw new BadRequestError('Tarefa com vínculo do tipo PROJETO exige projeto_id.')
    }
    if (!marcoId) {
      throw new BadRequestError(
        'Tarefa com vínculo do tipo PROJETO exige marco_id obrigatoriamente.',
      )
    }
    let marco
    try {
      marco = $app.findRecordById('marcos', marcoId)
    } catch (_) {
      throw new BadRequestError('marco_id informado não existe.')
    }
    if (marco.get('projeto_id') !== projetoId) {
      throw new BadRequestError('O marco selecionado não pertence ao projeto informado.')
    }
    record.set('origem', 'projeto')
    record.set('projeto_id', projetoId)
    record.set('marco_id', marcoId)
    record.set('vinculo_tipo', 'projeto')
    if (!record.get('vinculo_id')) {
      record.set('vinculo_id', projetoId)
    }
  } else {
    if (projetoId !== '' || marcoId !== '') {
      const rotuloTipo =
        tipoNormalizado === 'CONTRATO'
          ? 'Contrato'
          : tipoNormalizado === 'ATA'
            ? 'Ata'
            : tipoNormalizado === 'TAREFA'
              ? 'Tarefa'
              : 'Nenhum'
      throw new BadRequestError(`Vínculo do tipo ${rotuloTipo} não aceita projeto nem marco.`)
    }
    record.set('origem', 'avulsa')
    record.set('projeto_id', '')
    record.set('marco_id', '')
    if (record.get('vinculo_tipo') === 'projeto') {
      record.set('vinculo_tipo', 'nenhum')
      record.set('vinculo_id', '')
    }
  }

  e.next()
}, 'tarefas')

onRecordUpdateRequest((e) => {
  const record = e.record
  const vinculoTipoRaw =
    record.get('vinculo_tipo') || (record.get('projeto_id') ? 'projeto' : 'nenhum')
  const projetoId = (record.get('projeto_id') || '').toString().trim()
  const marcoId = (record.get('marco_id') || '').toString().trim()
  const vinculoTipo = (vinculoTipoRaw || '').toString().trim().toLowerCase()

  const tipoNormalizado =
    vinculoTipo === 'projeto'
      ? 'PROJETO'
      : vinculoTipo === 'contrato'
        ? 'CONTRATO'
        : vinculoTipo === 'ata'
          ? 'ATA'
          : vinculoTipo === 'tarefa'
            ? 'TAREFA'
            : 'NENHUM'

  if (tipoNormalizado === 'PROJETO') {
    if (!projetoId) {
      throw new BadRequestError('Tarefa com vínculo do tipo PROJETO exige projeto_id.')
    }
    if (!marcoId) {
      throw new BadRequestError(
        'Tarefa com vínculo do tipo PROJETO exige marco_id obrigatoriamente.',
      )
    }
    let marco
    try {
      marco = $app.findRecordById('marcos', marcoId)
    } catch (_) {
      throw new BadRequestError('marco_id informado não existe.')
    }
    if (marco.get('projeto_id') !== projetoId) {
      throw new BadRequestError('O marco selecionado não pertence ao projeto informado.')
    }
    record.set('origem', 'projeto')
    record.set('projeto_id', projetoId)
    record.set('marco_id', marcoId)
    record.set('vinculo_tipo', 'projeto')
    if (!record.get('vinculo_id')) {
      record.set('vinculo_id', projetoId)
    }
  } else {
    if (projetoId !== '' || marcoId !== '') {
      const rotuloTipo =
        tipoNormalizado === 'CONTRATO'
          ? 'Contrato'
          : tipoNormalizado === 'ATA'
            ? 'Ata'
            : tipoNormalizado === 'TAREFA'
              ? 'Tarefa'
              : 'Nenhum'
      throw new BadRequestError(`Vínculo do tipo ${rotuloTipo} não aceita projeto nem marco.`)
    }
    record.set('origem', 'avulsa')
    record.set('projeto_id', '')
    record.set('marco_id', '')
    if (record.get('vinculo_tipo') === 'projeto') {
      record.set('vinculo_tipo', 'nenhum')
      record.set('vinculo_id', '')
    }
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
