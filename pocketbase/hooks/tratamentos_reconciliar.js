// ============================================================================
// TRATAMENTOS — RECONCILIAÇÃO DE TAREFAS (v2, 15/11/2026)
//
// PROBLEMA (b6): ao clicar em "Reconciliar tarefas", nasciam tarefas NOVAS em
// status 'triagem' mesmo já existindo as mesmas tarefas em outros status.
//
// CAUSA: a checagem olhava apenas `tarefa_ids` do tratamento. Tarefas criadas
// antes desse controle — ou por outro caminho — não estavam no array, então o
// reconciliar as considerava inexistentes e criava OUTRA em 'triagem'.
//
// CORREÇÃO: a busca por "já existe tarefa para esta data" passa a consultar o
// PGE INTEIRO, por PRAZO, independente de status e de estar no array.
//
// Também remove as tarefas em 'triagem' duplicadas que já têm equivalente em
// outro status.
// ============================================================================

routerAdd(
  'POST',
  '/backend/v1/tratamentos/reconciliar-tarefas',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')
    const dono = e.auth.id

    let tratamentos = []
    try {
      // sort VAZIO: 'created' é rejeitado por findRecordsByFilter e matava o laço
      tratamentos = $app.findRecordsByFilter(
        'll5_treatments',
        "owner_id = '" + dono + "'",
        '',
        0,
        0,
      )
    } catch (err) {
      console.log('[reconciliar] falha ao listar: ' + String(err).slice(0, 140))
      tratamentos = []
    }

    console.log('[reconciliar] tratamentos: ' + tratamentos.length)

    let orfas = 0
    let duplicadas = 0
    let validas = 0
    let criadas = 0
    let ajustados = 0
    let apagadasTriagem = 0

    for (const t of tratamentos) {
      let ids = []
      try {
        const bruto = t.get('tarefa_ids')
        if (Array.isArray(bruto)) ids = bruto
        else if (typeof bruto === 'string') {
          const p = JSON.parse(bruto)
          ids = Array.isArray(p) ? p : []
        }
      } catch (_) {
        ids = []
      }

      let sessoes = []
      try {
        const brutoS = t.get('proximas_sessoes')
        if (Array.isArray(brutoS)) sessoes = brutoS
        else if (typeof brutoS === 'string') {
          const p2 = JSON.parse(brutoS)
          sessoes = Array.isArray(p2) ? p2 : []
        }
      } catch (_) {
        sessoes = []
      }

      // ------------------- 1) mapa de tarefas do PGE POR DATA -------------------
      //
      // Consulta ampla: todas as tarefas cujo prazo cai numa das datas de
      // sessão deste tratamento. Não importa o status nem o array.
      const porData = {}

      for (const brutoDia of sessoes) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(brutoDia || '').trim())
        if (!m) continue
        const dia = m[1] + '-' + m[2] + '-' + m[3]
        if (porData[dia]) continue

        // ------------------------------------------------------------------
        // 15/11/2026 — CAUSA DAS 32 TAREFAS NOVAS (b6)
        //
        // A busca por JANELA DE PRAZO falha por fuso: uma tarefa gravada em
        // "17/12 00:00:00.000Z" equivale a 16/12 21:00 no horário local, e cai
        // FORA de "17/12 00:00Z ~ 17/12 23:59Z". O reconciliar não encontrava
        // a tarefa existente e criava outra em 'triagem' — a cada clique.
        //
        // Correção: buscar TAMBÉM pelo TÍTULO contendo dd/mm/aaaa, que é o
        // formato usado por todos os caminhos que criam tarefa de sessão.
        // Junta os dois resultados e deduplica por id.
        // ------------------------------------------------------------------
        const diaBR = dia.split('-').reverse().join('/')
        let encontradas = []
        let porTitulo = []

        try {
          encontradas = $app.findRecordsByFilter(
            'tarefas',
            "prazo >= '" + dia + " 00:00:00.000Z' && prazo <= '" + dia + " 23:59:59.999Z'",
            '',
            20,
            0,
          )
        } catch (err) {
          console.log('[reconciliar] busca prazo ' + dia + ': ' + String(err).slice(0, 100))
          encontradas = []
        }

        try {
          porTitulo = $app.findRecordsByFilter('tarefas', "titulo ~ '" + diaBR + "'", '', 20, 0)
        } catch (err) {
          console.log('[reconciliar] busca título ' + diaBR + ': ' + String(err).slice(0, 100))
          porTitulo = []
        }

        // mescla sem duplicar id
        const vistos = {}
        const todasDoDia = []
        for (const lote of [encontradas, porTitulo]) {
          for (const r of lote) {
            const idr = String(r.id)
            if (vistos[idr]) continue
            vistos[idr] = true
            todasDoDia.push(r)
          }
        }
        encontradas = todasDoDia

        // prefere a que NÃO está em triagem (já foi trabalhada)
        let escolhida = null
        for (const cand of encontradas) {
          let st = ''
          try {
            st = String(cand.get('status') || '')
          } catch (_) {}
          if (st !== 'triagem') {
            escolhida = cand
            break
          }
          if (!escolhida) escolhida = cand
        }

        if (escolhida) {
          porData[dia] = String(escolhida.id)

          // apaga as OUTRAS da mesma data (ex.: a duplicata em 'triagem')
          for (const cand of encontradas) {
            if (String(cand.id) === String(escolhida.id)) continue
            try {
              $app.delete(cand)
              apagadasTriagem++
            } catch (_) {}
          }
        }
      }

      // ------------------- 2) limpa ids que não existem mais -------------------
      const validos = []
      for (const id of ids) {
        let tarefa = null
        try {
          tarefa = $app.findRecordById('tarefas', String(id))
        } catch (_) {
          tarefa = null
        }
        if (!tarefa) {
          orfas++
          continue
        }
        if (validos.indexOf(String(id)) >= 0) {
          // duplicado dentro do próprio array
          try {
            $app.delete(tarefa)
            duplicadas++
          } catch (_) {}
          continue
        }
        validos.push(String(id))
        validas++
      }

      // ------------------- 3) cria SOMENTE o que realmente falta -------------------
      const tipoNome = String(t.get('tipo_nome') || 'Tratamento')
      const paciente = String(t.get('paciente_nome') || '')
      const empresa = String(t.get('empresa') || '')
      const responsavel = String(t.get('responsavel_id') || '')
      const instituto = String(t.get('instituto') || '')
      const profissional = String(t.get('profissional') || '')

      for (const brutoDia of sessoes) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(brutoDia || '').trim())
        if (!m) continue
        const dia = m[1] + '-' + m[2] + '-' + m[3]

        // JÁ EXISTE tarefa nesta data (em QUALQUER status)? então não cria.
        if (porData[dia]) {
          if (validos.indexOf(porData[dia]) < 0) validos.push(porData[dia])
          continue
        }

        try {
          const colT = $app.findCollectionByNameOrId('tarefas')
          const nova = new Record(colT)
          nova.set('titulo', tipoNome + ' · ' + dia.split('-').reverse().join('/'))
          nova.set('descricao', (instituto ? instituto + ' · ' : '') + (profissional || ''))
          nova.set('prazo', dia + ' 12:00:00.000Z')
          // 16/11/2026 — o reconciliar criava sem `status_kanban`, e o padrão
          // do PocketBase caía em 'triagem'. Era essa a origem das 40 tarefas
          // em triagem que voltavam depois de cada limpeza.
          nova.set('status', 'pendente')
          nova.set('status_kanban', 'a_fazer')
          nova.set('prioridade', 'media')
          if (empresa) nova.set('empresa', empresa)
          if (responsavel) {
            try {
              nova.set('responsaveis_ids', [responsavel])
            } catch (_) {}
          }
          if (paciente) {
            try {
              nova.set('responsavel', paciente)
            } catch (_) {}
          }
          nova.set('criado_por', String(t.getString('created_by') || 'reconciliar'))
          $app.save(nova)

          // confere se o prazo gravou mesmo (sem data, o dedupe falha)
          let gravou = ''
          try {
            gravou = String(nova.getDateTime('prazo') || '').slice(0, 10)
          } catch (_) {}
          if (gravou !== dia) {
            console.log('[reconciliar] prazo não gravou em ' + dia + ' (ficou "' + gravou + '")')
            try {
              $app.delete(nova)
            } catch (_) {}
            continue
          }

          porData[dia] = String(nova.id)
          validos.push(String(nova.id))
          criadas++
          validas++
        } catch (err) {
          console.log('[reconciliar] criar ' + dia + ': ' + String(err).slice(0, 120))
        }
      }

      // ------------------- 4) grava o estado final -------------------
      if (validos.length !== ids.length || criadas > 0) {
        try {
          const mapa = {}
          for (const k of Object.keys(porData)) mapa[k] = porData[k]
          t.set('tarefa_ids', validos)
          t.set('tarefa_por_data', mapa)
          $app.save(t)
          ajustados++
        } catch (err) {
          console.log('[reconciliar] salvar tratamento: ' + String(err).slice(0, 140))
        }
      }
    }

    const resumo =
      'criadas=' +
      criadas +
      ' órfãs=' +
      orfas +
      ' duplicadas=' +
      duplicadas +
      ' triagem removidas=' +
      apagadasTriagem
    console.log('[reconciliar] ' + resumo)

    return e.json(200, {
      success: true,
      tratamentos: tratamentos.length,
      tratamentos_ajustados: ajustados,
      tarefas_criadas: criadas,
      tarefas_orfas_removidas: orfas,
      tarefas_duplicadas_removidas: duplicadas,
      tarefas_triagem_removidas: apagadasTriagem,
      tarefas_validas: validas,
      mensagem: resumo,
    })
  },
  $apis.requireAuth(),
)
