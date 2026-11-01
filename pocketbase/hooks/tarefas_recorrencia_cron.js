// Cron diário para regeneração de tarefas recorrentes no prazo
// Executa todos os dias às 06:00 BRT (09:00 UTC) e oferece rota para execução/teste:
// POST /backend/v1/tarefas/recorrencia-cron

// Helper inline para uso dentro de cada callback
function executarLogicaRecorrencia(appInstance) {
  function calcularProximoPrazo(prazoAtualStr, recorrencia) {
    if (!prazoAtualStr) return null
    const dStr = String(prazoAtualStr).slice(0, 10)
    const partes = dStr.split('-')
    if (partes.length !== 3) return null
    const ano = parseInt(partes[0], 10)
    const mes = parseInt(partes[1], 10) - 1
    const dia = parseInt(partes[2], 10)

    const data = new Date(Date.UTC(ano, mes, dia, 0, 0, 0, 0))
    if (isNaN(data.getTime())) return null

    if (recorrencia === 'Diária') {
      data.setUTCDate(data.getUTCDate() + 1)
    } else if (recorrencia === 'Semanal') {
      data.setUTCDate(data.getUTCDate() + 7)
    } else if (recorrencia === 'Mensal') {
      data.setUTCMonth(data.getUTCMonth() + 1)
    } else if (recorrencia === 'Bimestral') {
      data.setUTCMonth(data.getUTCMonth() + 2)
    } else {
      return null
    }

    const y = data.getUTCFullYear()
    const m = String(data.getUTCMonth() + 1).padStart(2, '0')
    const d = String(data.getUTCDate()).padStart(2, '0')
    return y + '-' + m + '-' + d + ' 00:00:00.000Z'
  }

  const agora = new Date()
  const hojeStr = agora.toISOString().slice(0, 10) + ' 23:59:59.999Z'
  const logResultado = {
    executado_em: agora.toISOString(),
    total_avaliadas: 0,
    regeradas: [],
    erros: [],
  }

  try {
    const filtro =
      "recorrencia != '' && recorrencia != 'Nenhuma' && recorrencia != 'A definir' && prazo != '' && prazo <= '" +
      hojeStr +
      "'"
    const tarefas = appInstance.findRecordsByFilter('tarefas', filtro, 'prazo', 500, 0)
    logResultado.total_avaliadas = tarefas.length

    const colTarefas = appInstance.findCollectionByNameOrId('tarefas')

    for (let i = 0; i < tarefas.length; i++) {
      const t = tarefas[i]
      const recTipo = t.getString('recorrencia')
      const prazoAtual = t.getString('prazo')
      const tituloOriginal = t.getString('titulo')

      const proxPrazo = calcularProximoPrazo(prazoAtual, recTipo)
      if (!proxPrazo) continue

      const proxDataApenas = proxPrazo.slice(0, 10)

      try {
        const jaExiste = appInstance.findRecordsByFilter(
          'tarefas',
          'titulo = {:titulo} && prazo ~ {:prazoData}',
          '-created',
          1,
          0,
          { titulo: tituloOriginal, prazoData: proxDataApenas },
        )
        if (jaExiste && jaExiste.length > 0) {
          continue
        }
      } catch (_) {}

      try {
        const nova = new Record(colTarefas)
        nova.set('titulo', tituloOriginal)
        nova.set('descricao', t.getString('descricao'))
        nova.set('status_kanban', 'triagem')
        nova.set('status', 'pendente')
        nova.set('prioridade_p', t.getString('prioridade_p') || 'P2')
        nova.set('prioridade', t.getString('prioridade') || 'media')
        nova.set('responsavel', t.getString('responsavel'))
        nova.set('empresa', t.getString('empresa'))
        nova.set('prazo', proxPrazo)
        nova.set('recorrencia', recTipo)
        nova.set('vinculo_tipo', t.getString('vinculo_tipo'))
        nova.set('vinculo_id', t.getString('vinculo_id'))
        nova.set('criado_por', t.getString('criado_por') || 'sistema_recorrencia')

        const parceirosRaw = t.getString('parceiros')
        if (parceirosRaw) {
          nova.set('parceiros', parceirosRaw)
        }

        const subsRaw = t.getString('subtarefas')
        if (subsRaw) {
          try {
            const subsParsed = JSON.parse(subsRaw)
            if (Array.isArray(subsParsed)) {
              const resetadas = subsParsed.map((s) => ({ t: s.t, ok: false }))
              nova.set('subtarefas', JSON.stringify(resetadas))
            }
          } catch (_) {
            nova.set('subtarefas', '[]')
          }
        }

        appInstance.save(nova)

        // Encerra recorrência na ocorrência anterior já vencida/atingida
        t.set('recorrencia', 'Nenhuma')
        appInstance.save(t)

        logResultado.regeradas.push({
          id_origem: t.id,
          id_nova: nova.id,
          titulo: tituloOriginal,
          recorrencia: recTipo,
          prazo_anterior: prazoAtual,
          novo_prazo: proxPrazo,
        })
      } catch (errRegerar) {
        logResultado.erros.push({
          id: t.id,
          erro: String(errRegerar),
        })
      }
    }

    if (logResultado.regeradas.length > 0 || logResultado.erros.length > 0) {
      try {
        const colAuditoria = appInstance.findCollectionByNameOrId('auditoria')
        const aud = new Record(colAuditoria)
        aud.set('acao', 'tarefas_recorrencia_cron')
        aud.set('modulo', 'tarefas')
        aud.set('usuario_email', 'sistema_cron@portal.internal')
        aud.set('detalhe', JSON.stringify(logResultado))
        appInstance.save(aud)
      } catch (errAud) {
        console.log('tarefas_recorrencia: falha ao gravar auditoria ' + String(errAud))
      }
    }

    console.log(
      'tarefas_recorrencia_cron: ' +
        logResultado.regeradas.length +
        ' tarefas regeradas, ' +
        logResultado.erros.length +
        ' erros',
    )
  } catch (errGeral) {
    console.log('tarefas_recorrencia_cron: erro geral ' + String(errGeral))
    logResultado.erros.push({ geral: String(errGeral) })
  }

  return logResultado
}

// Cron diário 06:00 BRT (09:00 UTC)
cronAdd('tarefas_recorrencia_diario', '0 9 * * *', () => {
  function calcProx(prazoAtualStr, recorrencia) {
    if (!prazoAtualStr) return null
    const dStr = String(prazoAtualStr).slice(0, 10)
    const partes = dStr.split('-')
    if (partes.length !== 3) return null
    const ano = parseInt(partes[0], 10)
    const mes = parseInt(partes[1], 10) - 1
    const dia = parseInt(partes[2], 10)

    const data = new Date(Date.UTC(ano, mes, dia, 0, 0, 0, 0))
    if (isNaN(data.getTime())) return null

    if (recorrencia === 'Diária') {
      data.setUTCDate(data.getUTCDate() + 1)
    } else if (recorrencia === 'Semanal') {
      data.setUTCDate(data.getUTCDate() + 7)
    } else if (recorrencia === 'Mensal') {
      data.setUTCMonth(data.getUTCMonth() + 1)
    } else if (recorrencia === 'Bimestral') {
      data.setUTCMonth(data.getUTCMonth() + 2)
    } else {
      return null
    }

    const y = data.getUTCFullYear()
    const m = String(data.getUTCMonth() + 1).padStart(2, '0')
    const d = String(data.getUTCDate()).padStart(2, '0')
    return y + '-' + m + '-' + d + ' 00:00:00.000Z'
  }

  const agora = new Date()
  const hojeStr = agora.toISOString().slice(0, 10) + ' 23:59:59.999Z'
  const logResultado = {
    executado_em: agora.toISOString(),
    total_avaliadas: 0,
    regeradas: [],
    erros: [],
  }

  try {
    const filtro =
      "recorrencia != '' && recorrencia != 'Nenhuma' && recorrencia != 'A definir' && prazo != '' && prazo <= '" +
      hojeStr +
      "'"
    const tarefas = $app.findRecordsByFilter('tarefas', filtro, 'prazo', 500, 0)
    logResultado.total_avaliadas = tarefas.length

    const colTarefas = $app.findCollectionByNameOrId('tarefas')

    for (let i = 0; i < tarefas.length; i++) {
      const t = tarefas[i]
      const recTipo = t.getString('recorrencia')
      const prazoAtual = t.getString('prazo')
      const tituloOriginal = t.getString('titulo')

      const proxPrazo = calcProx(prazoAtual, recTipo)
      if (!proxPrazo) continue

      const proxDataApenas = proxPrazo.slice(0, 10)

      try {
        const jaExiste = $app.findRecordsByFilter(
          'tarefas',
          'titulo = {:titulo} && prazo ~ {:prazoData}',
          '-created',
          1,
          0,
          { titulo: tituloOriginal, prazoData: proxDataApenas },
        )
        if (jaExiste && jaExiste.length > 0) {
          continue
        }
      } catch (_) {}

      try {
        const nova = new Record(colTarefas)
        nova.set('titulo', tituloOriginal)
        nova.set('descricao', t.getString('descricao'))
        nova.set('status_kanban', 'triagem')
        nova.set('status', 'pendente')
        nova.set('prioridade_p', t.getString('prioridade_p') || 'P2')
        nova.set('prioridade', t.getString('prioridade') || 'media')
        nova.set('responsavel', t.getString('responsavel'))
        nova.set('empresa', t.getString('empresa'))
        nova.set('prazo', proxPrazo)
        nova.set('recorrencia', recTipo)
        nova.set('vinculo_tipo', t.getString('vinculo_tipo'))
        nova.set('vinculo_id', t.getString('vinculo_id'))
        nova.set('criado_por', t.getString('criado_por') || 'sistema_recorrencia')

        const parceirosRaw = t.getString('parceiros')
        if (parceirosRaw) {
          nova.set('parceiros', parceirosRaw)
        }

        const subsRaw = t.getString('subtarefas')
        if (subsRaw) {
          try {
            const subsParsed = JSON.parse(subsRaw)
            if (Array.isArray(subsParsed)) {
              const resetadas = subsParsed.map((s) => ({ t: s.t, ok: false }))
              nova.set('subtarefas', JSON.stringify(resetadas))
            }
          } catch (_) {
            nova.set('subtarefas', '[]')
          }
        }

        $app.save(nova)

        t.set('recorrencia', 'Nenhuma')
        $app.save(t)

        logResultado.regeradas.push({
          id_origem: t.id,
          id_nova: nova.id,
          titulo: tituloOriginal,
          recorrencia: recTipo,
          prazo_anterior: prazoAtual,
          novo_prazo: proxPrazo,
        })
      } catch (errRegerar) {
        logResultado.erros.push({
          id: t.id,
          erro: String(errRegerar),
        })
      }
    }

    if (logResultado.regeradas.length > 0 || logResultado.erros.length > 0) {
      try {
        const colAuditoria = $app.findCollectionByNameOrId('auditoria')
        const aud = new Record(colAuditoria)
        aud.set('acao', 'tarefas_recorrencia_cron')
        aud.set('modulo', 'tarefas')
        aud.set('usuario_email', 'sistema_cron@portal.internal')
        aud.set('detalhe', JSON.stringify(logResultado))
        $app.save(aud)
      } catch (errAud) {
        console.log('tarefas_recorrencia: falha ao gravar auditoria ' + String(errAud))
      }
    }

    console.log(
      'tarefas_recorrencia_diario: ' +
        logResultado.regeradas.length +
        ' tarefas regeradas, ' +
        logResultado.erros.length +
        ' erros',
    )
  } catch (errGeral) {
    console.log('tarefas_recorrencia_diario: erro geral ' + String(errGeral))
  }
})

// Rota manual para acionar e testar a regeneração de tarefas recorrentes
routerAdd('POST', '/backend/v1/tarefas/recorrencia-cron', (c) => {
  function calcProx(prazoAtualStr, recorrencia) {
    if (!prazoAtualStr) return null
    const dStr = String(prazoAtualStr).slice(0, 10)
    const partes = dStr.split('-')
    if (partes.length !== 3) return null
    const ano = parseInt(partes[0], 10)
    const mes = parseInt(partes[1], 10) - 1
    const dia = parseInt(partes[2], 10)

    const data = new Date(Date.UTC(ano, mes, dia, 0, 0, 0, 0))
    if (isNaN(data.getTime())) return null

    if (recorrencia === 'Diária') {
      data.setUTCDate(data.getUTCDate() + 1)
    } else if (recorrencia === 'Semanal') {
      data.setUTCDate(data.getUTCDate() + 7)
    } else if (recorrencia === 'Mensal') {
      data.setUTCMonth(data.getUTCMonth() + 1)
    } else if (recorrencia === 'Bimestral') {
      data.setUTCMonth(data.getUTCMonth() + 2)
    } else {
      return null
    }

    const y = data.getUTCFullYear()
    const m = String(data.getUTCMonth() + 1).padStart(2, '0')
    const d = String(data.getUTCDate()).padStart(2, '0')
    return y + '-' + m + '-' + d + ' 00:00:00.000Z'
  }

  const agora = new Date()
  const hojeStr = agora.toISOString().slice(0, 10) + ' 23:59:59.999Z'
  const logResultado = {
    executado_em: agora.toISOString(),
    total_avaliadas: 0,
    regeradas: [],
    erros: [],
  }

  try {
    const filtro =
      "recorrencia != '' && recorrencia != 'Nenhuma' && recorrencia != 'A definir' && prazo != '' && prazo <= '" +
      hojeStr +
      "'"
    const tarefas = $app.findRecordsByFilter('tarefas', filtro, 'prazo', 500, 0)
    logResultado.total_avaliadas = tarefas.length

    const colTarefas = $app.findCollectionByNameOrId('tarefas')

    for (let i = 0; i < tarefas.length; i++) {
      const t = tarefas[i]
      const recTipo = t.getString('recorrencia')
      const prazoAtual = t.getString('prazo')
      const tituloOriginal = t.getString('titulo')

      const proxPrazo = calcProx(prazoAtual, recTipo)
      if (!proxPrazo) continue

      const proxDataApenas = proxPrazo.slice(0, 10)

      try {
        const jaExiste = $app.findRecordsByFilter(
          'tarefas',
          'titulo = {:titulo} && prazo ~ {:prazoData}',
          '-created',
          1,
          0,
          { titulo: tituloOriginal, prazoData: proxDataApenas },
        )
        if (jaExiste && jaExiste.length > 0) {
          continue
        }
      } catch (_) {}

      try {
        const nova = new Record(colTarefas)
        nova.set('titulo', tituloOriginal)
        nova.set('descricao', t.getString('descricao'))
        nova.set('status_kanban', 'triagem')
        nova.set('status', 'pendente')
        nova.set('prioridade_p', t.getString('prioridade_p') || 'P2')
        nova.set('prioridade', t.getString('prioridade') || 'media')
        nova.set('responsavel', t.getString('responsavel'))
        nova.set('empresa', t.getString('empresa'))
        nova.set('prazo', proxPrazo)
        nova.set('recorrencia', recTipo)
        nova.set('vinculo_tipo', t.getString('vinculo_tipo'))
        nova.set('vinculo_id', t.getString('vinculo_id'))
        nova.set('criado_por', t.getString('criado_por') || 'sistema_recorrencia')

        const parceirosRaw = t.getString('parceiros')
        if (parceirosRaw) {
          nova.set('parceiros', parceirosRaw)
        }

        const subsRaw = t.getString('subtarefas')
        if (subsRaw) {
          try {
            const subsParsed = JSON.parse(subsRaw)
            if (Array.isArray(subsParsed)) {
              const resetadas = subsParsed.map((s) => ({ t: s.t, ok: false }))
              nova.set('subtarefas', JSON.stringify(resetadas))
            }
          } catch (_) {
            nova.set('subtarefas', '[]')
          }
        }

        $app.save(nova)

        t.set('recorrencia', 'Nenhuma')
        $app.save(t)

        logResultado.regeradas.push({
          id_origem: t.id,
          id_nova: nova.id,
          titulo: tituloOriginal,
          recorrencia: recTipo,
          prazo_anterior: prazoAtual,
          novo_prazo: proxPrazo,
        })
      } catch (errRegerar) {
        logResultado.erros.push({
          id: t.id,
          erro: String(errRegerar),
        })
      }
    }

    if (logResultado.regeradas.length > 0 || logResultado.erros.length > 0) {
      try {
        const colAuditoria = $app.findCollectionByNameOrId('auditoria')
        const aud = new Record(colAuditoria)
        aud.set('acao', 'tarefas_recorrencia_cron')
        aud.set('modulo', 'tarefas')
        aud.set('usuario_email', 'sistema_cron@portal.internal')
        aud.set('detalhe', JSON.stringify(logResultado))
        $app.save(aud)
      } catch (errAud) {
        console.log('tarefas_recorrencia: falha ao gravar auditoria ' + String(errAud))
      }
    }
  } catch (errGeral) {
    logResultado.erros.push({ geral: String(errGeral) })
  }

  return c.json(200, { ok: true, resultado: logResultado })
})
