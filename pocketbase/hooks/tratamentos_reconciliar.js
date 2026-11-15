// ============================================================================
// TRATAMENTOS — RECONCILIAÇÃO DE TAREFAS (15/11/2026)
//
// PROBLEMA RELATADO (b6): existem tarefas criadas pela tela de Tratamentos que
// não existem mais (tratamento excluído, agenda recalculada, sessão removida).
// E algumas datas podem ter mais de uma tarefa.
//
// Este endpoint RECONCILIA tudo:
//   1. lista todos os tratamentos do usuário;
//   2. para cada um, compara `tarefa_ids` com as tarefas REALMENTE existentes;
//   3. remove tarefas órfãs (id no array mas sem registro);
//   4. remove tarefas que sobraram no PGE mas não estão no array;
//   5. garante 1 tarefa por data (dedupe por prazo);
//   6. regrava `tarefa_ids` com a lista limpa.
//
// Devolve o resumo: quantas órfãs removeu, quantas duplicatas, quantas válidas.
// ============================================================================

routerAdd(
  'POST',
  '/backend/v1/tratamentos/reconciliar-tarefas',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')
    const dono = e.auth.id

    let tratamentos = []
    try {
      tratamentos = $app.findRecordsByFilter(
        'll5_treatments',
        "owner_id = '" + dono + "'",
        '',
        0,
        0,
      )
    } catch (_) {
      tratamentos = []
    }

    let orfas = 0
    let duplicadas = 0
    let validas = 0
    let tratamentosAjustados = 0
    let tarefasCriadas = 0

    for (const t of tratamentos) {
      // 15/11/2026 — CAUSA do "Something went wrong" ao reconciliar:
      // `const sessoes = []` seguido de `sessoes = brutoS` lançava
      // "Assignment to constant variable" — o JSVM não avisa, devolve o
      // genérico. Agora usamos `let` e uma normalização tolerante (o campo
      // JSON pode voltar como string, array ou objeto).
      let ids = []
      try {
        const bruto = t.get('tarefa_ids')
        if (Array.isArray(bruto)) {
          ids = bruto
        } else if (typeof bruto === 'string') {
          const p = JSON.parse(bruto)
          ids = Array.isArray(p) ? p : []
        }
      } catch (_) {
        ids = []
      }
      if (!Array.isArray(ids)) ids = []

      let sessoes = []
      try {
        const brutoS = t.get('proximas_sessoes')
        if (Array.isArray(brutoS)) {
          sessoes = brutoS
        } else if (typeof brutoS === 'string') {
          const p2 = JSON.parse(brutoS)
          sessoes = Array.isArray(p2) ? p2 : []
        }
      } catch (_) {
        sessoes = []
      }
      if (!Array.isArray(sessoes)) sessoes = []

      const validos = []
      const porData = {} // data -> id da tarefa mantida

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

        // 15/11/2026 — prazo vazio NÃO é "válido": tarefas criadas pela
        // versão antiga têm prazo em branco. Sem isso elas passavam no teste
        // e o reconciliar criava outras por cima, acumulando.
        let prazo = ''
        try {
          prazo = String(tarefa.getDateTime('prazo') || '').slice(0, 10)
        } catch (_) {
          prazo = ''
        }

        if (!prazo) {
          try {
            $app.delete(tarefa)
            orfas++
          } catch (_) {}
          continue
        }

        // se a data não está mais entre as sessões do tratamento, a tarefa
        // é órfã de agenda: remove
        if (sessoes.length > 0 && sessoes.indexOf(prazo) < 0) {
          try {
            $app.delete(tarefa)
            orfas++
          } catch (_) {}
          continue
        }

        // dedupe por data: mantém a primeira
        if (prazo && porData[prazo]) {
          try {
            $app.delete(tarefa)
            duplicadas++
          } catch (_) {}
          continue
        }

        if (prazo) porData[prazo] = String(id)
        validos.push(String(id))
        validas++
      }

      // ----------------------------------------------------------------
      // 3) CRIA as tarefas que FALTAM (pedido do dono: "apagou tarefas sem
      //    sessões/tratamento mas não criou tarefas para sessões sem
      //    tarefas vinculadas").
      //
      // Para cada data de `proximas_sessoes` sem tarefa válida, cria uma.
      // Assim toda sessão passa a ter exatamente UMA tarefa.
      // ----------------------------------------------------------------
      let criadas = 0
      if (sessoes.length > 0) {
        for (const dia of sessoes) {
          // 15/11/2026 — VALIDAÇÃO DE DATA (causa das tarefas em massa).
          // `proximas_sessoes` pode conter número, ISO com hora ou lixo.
          // Antes, `String(dia).slice(0,10)` virava algo inválido, o `prazo`
          // era gravado VAZIO (print mostrava "—") e o dedupe por prazo nunca
          // achava a tarefa anterior → criava outra a cada execução.
          const bruto = String(dia || '').trim()
          const mData = /^(\d{4})-(\d{2})-(\d{2})/.exec(bruto)
          if (!mData) continue // não é data válida: ignora
          const d = mData[1] + '-' + mData[2] + '-' + mData[3]
          if (porData[d]) continue // já tem tarefa válida nesta data

          const tipoNome = String(t.get('tipo_nome') || 'Tratamento')
          const paciente = String(t.get('paciente_nome') || 'paciente')
          const empresa = String(t.get('empresa') || '')
          const responsavel = String(t.get('responsavel_id') || '')

          try {
            const colT = $app.findCollectionByNameOrId('tarefas')
            const nova = new Record(colT)
            // 15/11/2026 — o paciente NÃO vai no título: ele é o RESPONSÁVEL
            // pela tarefa. O título descreve o procedimento e a data.
            nova.set('titulo', tipoNome + ' · ' + d.split('-').reverse().join('/'))
            nova.set(
              'descricao',
              (String(t.get('instituto') || '') ? String(t.get('instituto')) + ' · ' : '') +
                String(t.get('profissional') || ''),
            )
            nova.set('prazo', d + ' 12:00:00.000Z')
            nova.set('status', 'pendente')
            nova.set('prioridade', 'media')
            if (empresa) nova.set('empresa', empresa)

            // responsável da tarefa: o paciente do tratamento
            if (responsavel) {
              try {
                nova.set('responsaveis_ids', [responsavel])
              } catch (_) {}
            }
            // o campo texto `responsavel` guarda o nome legível
            try {
              nova.set('responsavel', paciente)
            } catch (_) {}

            nova.set('criado_por', String(t.getString('created_by') || 'reconciliar'))
            $app.save(nova)

            // 15/11/2026 — confere se o prazo gravou. O print mostrava PRAZO
            // vazio; sem data o dedupe nunca acha a tarefa e cria outra.
            let gravou = ''
            try {
              gravou = String(nova.getDateTime('prazo') || '').slice(0, 10)
            } catch (_) {
              gravou = ''
            }
            if (gravou !== d) {
              console.log('[reconciliar] prazo não gravou em ' + d + ' (ficou "' + gravou + '")')
              try {
                $app.delete(nova)
              } catch (_) {}
              continue
            }

            validos.push(nova.id)
            porData[d] = nova.id
            criadas++
            validas++
          } catch (err) {
            console.log(
              '[reconciliar] falha ao criar tarefa ' + d + ': ' + String(err).slice(0, 140),
            )
          }
        }
      }

      // regrava sempre que mudou algo (removida, criada ou deduplicada)
      if (validos.length !== ids.length || criadas > 0) {
        try {
          const mapa = {}
          for (const d of Object.keys(porData)) mapa[d] = porData[d]
          t.set('tarefa_ids', validos)
          t.set('tarefa_por_data', mapa)
          $app.save(t)
          tratamentosAjustados++
        } catch (err) {
          console.log('[reconciliar] falha ao salvar tratamento ' + t.id + ': ' + String(err))
        }
      }

      tarefasCriadas += criadas
    }

    console.log(
      '[reconciliar] órfãs=' +
        orfas +
        ' duplicadas=' +
        duplicadas +
        ' válidas=' +
        validas +
        ' tratamentos ajustados=' +
        tratamentosAjustados,
    )

    console.log(
      '[reconciliar] criadas=' + tarefasCriadas + ' órfãs=' + orfas + ' duplicadas=' + duplicadas,
    )

    return e.json(200, {
      success: true,
      tratamentos: tratamentos.length,
      tratamentos_ajustados: tratamentosAjustados,
      tarefas_orfas_removidas: orfas,
      tarefas_duplicadas_removidas: duplicadas,
      tarefas_criadas: tarefasCriadas,
      tarefas_validas: validas,
    })
  },
  $apis.requireAuth(),
)
