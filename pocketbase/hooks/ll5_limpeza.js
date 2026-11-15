// ============================================================================
// LL5 — LIMPEZA E CORREÇÃO SOB DEMANDA (15/11/2026)
//
// POR QUE UM ENDPOINT E NÃO OUTRA MIGRAÇÃO
//
// As migrações 094→098 tentaram apagar em massa e falharam CALADAS: o print
// ainda mostra 2.350 atividades com pares CSV/API idênticos, e as tarefas
// seguem com o paciente no título e "Sem responsável".
//
// Um endpoint dá o que a migração não dá: LOG por registro e a possibilidade
// de rodar em LOTES, verificando o resultado de cada etapa.
//
//   POST /backend/v1/ll5/limpar-csv    → apaga TUDO de origem csv/.fit
//   POST /backend/v1/ll5/corrigir-tarefas → título sem paciente + responsável
// ============================================================================

routerAdd(
  'POST',
  '/backend/v1/ll5/limpar-csv',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')

    // ---- 1) remove o índice único (senão o save/delete em massa trava) ----
    try {
      $app.db().newQuery('DROP INDEX IF EXISTS idx_ll5_activity_canonica').execute()
      console.log('[limpar-csv] índice removido')
    } catch (err) {
      console.log('[limpar-csv] drop index: ' + String(err).slice(0, 100))
    }

    // ---- 2) lista TODAS as atividades em páginas de 500 ----
    let total = 0
    let apagadas = 0
    let mantidas = 0
    let falhas = 0
    const porFonte = {}

    let pagina = 1
    for (;;) {
      let lote = []
      try {
        lote = $app.findRecordsByFilter(
          'll5_activity',
          "id != ''",
          'created',
          500,
          (pagina - 1) * 500,
        )
      } catch (err) {
        console.log('[limpar-csv] falha ao listar página ' + pagina + ': ' + String(err))
        break
      }
      if (!lote || lote.length === 0) break

      for (const r of lote) {
        total++
        let fonte = ''
        try {
          fonte = String(r.get('fonte') || '')
            .toLowerCase()
            .trim()
        } catch (_) {
          fonte = ''
        }
        porFonte[fonte] = (porFonte[fonte] || 0) + 1

        // mantém SOMENTE a API
        if (fonte === 'garmin_api') {
          mantidas++
          continue
        }

        try {
          $app.delete(r)
          apagadas++
        } catch (err) {
          falhas++
          if (falhas <= 5) {
            console.log(
              '[limpar-csv] falha em ' +
                r.id +
                ' (fonte=' +
                fonte +
                '): ' +
                String(err).slice(0, 100),
            )
          }
        }
      }

      if (lote.length < 500) break
      pagina++
      if (pagina > 30) break
    }

    console.log(
      '[limpar-csv] total=' +
        total +
        ' apagadas=' +
        apagadas +
        ' mantidas=' +
        mantidas +
        ' falhas=' +
        falhas,
    )
    console.log('[limpar-csv] fontes encontradas: ' + JSON.stringify(porFonte))

    // ---- 3) recria a chave canônica nas sobreviventes + índice ----
    let marcadas = 0
    try {
      const restantes = $app.findRecordsByFilter('ll5_activity', "id != ''", '', 0, 0)
      for (const r of restantes) {
        try {
          let dia = 'sem-data'
          const b = String(r.get('data_hora_inicio') || '')
          const m = /(\d{4})-(\d{2})-(\d{2})/.exec(b)
          if (m) dia = m[1] + '-' + m[2] + '-' + m[3]
          const tipo = String(r.get('tipo') || 'outro')
          const d = r.get('distancia_m')
          const dist = d != null && Number(d) > 0 ? Math.round(Number(d) / 100) : 0
          r.set(
            'chave_canonica',
            dia === 'sem-data' ? 'sem-data|' + String(r.id) : dia + '|' + tipo + '|' + dist,
          )
          $app.save(r)
          marcadas++
        } catch (_) {}
      }
    } catch (_) {}

    try {
      $app
        .db()
        .newQuery(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_ll5_activity_canonica ON ll5_activity (chave_canonica)',
        )
        .execute()
    } catch (_) {}

    return e.json(200, {
      success: true,
      total_lidas: total,
      apagadas: apagadas,
      mantidas_api: mantidas,
      falhas: falhas,
      marcadas: marcadas,
      fontes: porFonte,
    })
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------------------
// CORRIGE AS TAREFAS DOS TRATAMENTOS
// ---------------------------------------------------------------------------
routerAdd(
  'POST',
  '/backend/v1/ll5/corrigir-tarefas',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória.')

    let tratamentos = []
    try {
      tratamentos = $app.findRecordsByFilter('ll5_treatments', "id != ''", '', 0, 0)
    } catch (_) {
      tratamentos = []
    }
    console.log('[corrigir-tarefas] tratamentos: ' + tratamentos.length)

    let corrigidas = 0
    let semPaciente = 0
    let detalhes = []

    for (const t of tratamentos) {
      let tipoNome = ''
      let paciente = ''
      let responsavelId = ''
      let instituto = ''
      let profissional = ''
      try {
        tipoNome = String(t.get('tipo_nome') || '')
      } catch (_) {}
      try {
        paciente = String(t.get('paciente_nome') || '')
      } catch (_) {}
      try {
        responsavelId = String(t.get('responsavel_id') || '')
      } catch (_) {}
      try {
        instituto = String(t.get('instituto') || '')
      } catch (_) {}
      try {
        profissional = String(t.get('profissional') || '')
      } catch (_) {}

      if (!paciente) {
        semPaciente++
        continue
      }

      let ids = []
      try {
        const bruto = t.get('tarefa_ids')
        if (Array.isArray(bruto)) ids = bruto
        else if (typeof bruto === 'string') ids = JSON.parse(bruto)
      } catch (_) {
        ids = []
      }
      if (!Array.isArray(ids)) ids = []

      for (const id of ids) {
        let tarefa = null
        try {
          tarefa = $app.findRecordById('tarefas', String(id))
        } catch (_) {
          tarefa = null
        }
        if (!tarefa) continue

        try {
          // ---- título: remove o paciente, mantém tipo + data ----
          let titulo = String(tarefa.get('titulo') || '')
          // padrões já usados por mim
          titulo = titulo.replace(' — ' + paciente, '')
          titulo = titulo.replace(' — ' + paciente + ' · ', ' · ')
          titulo = titulo.replace(tipoNome + ' — ' + paciente + ' · ', tipoNome + ' · ')
          // se ficou "Tipo · 17/12" já está certo; se ficou vazio, reconstói
          if (!titulo.trim()) {
            let diaTxt = ''
            try {
              diaTxt = String(tarefa.getDateTime('prazo') || '').slice(0, 10)
              if (diaTxt) diaTxt = diaTxt.split('-').reverse().join('/')
            } catch (_) {}
            titulo = tipoNome + (diaTxt ? ' · ' + diaTxt : '')
          }
          tarefa.set('titulo', titulo)

          // ---- paciente como RESPONSÁVEL ----
          //
          // `responsavel` é campo TEXTO livre (o nome aparece na coluna).
          // `responsaveis_ids` é relação com users — só funciona se o
          // `responsavel_id` do tratamento for um id de usuário válido.
          try {
            tarefa.set('responsavel', paciente)
          } catch (err) {
            console.log('[corrigir-tarefas] falha em responsavel: ' + String(err).slice(0, 100))
          }

          if (responsavelId) {
            let usuarioExiste = false
            try {
              const u = $app.findRecordById('users', responsavelId)
              usuarioExiste = !!u
            } catch (_) {
              usuarioExiste = false
            }
            if (usuarioExiste) {
              try {
                tarefa.set('responsaveis_ids', [responsavelId])
              } catch (_) {}
            } else {
              // tenta achar o usuário pelo nome do paciente
              try {
                const achados = $app.findRecordsByFilter(
                  'users',
                  "name = '" + paciente.replace(/'/g, "\\'") + "'",
                  '',
                  1,
                  0,
                )
                if (achados.length > 0) tarefa.set('responsaveis_ids', [achados[0].id])
              } catch (_) {}
            }
          }

          // ---- descrição ----
          try {
            const desc = (instituto ? instituto + ' · ' : '') + (profissional || '')
            if (desc) tarefa.set('descricao', desc)
          } catch (_) {}

          $app.save(tarefa)
          corrigidas++
        } catch (err) {
          console.log('[corrigir-tarefas] falha em ' + id + ': ' + String(err).slice(0, 120))
        }
      }

      if (detalhes.length < 5) {
        detalhes.push(tipoNome + ' / ' + paciente + ' → ' + ids.length + ' tarefa(s)')
      }
    }

    console.log('[corrigir-tarefas] corrigidas=' + corrigidas + ' sem_paciente=' + semPaciente)

    return e.json(200, {
      success: true,
      tratamentos: tratamentos.length,
      tarefas_corrigidas: corrigidas,
      tratamentos_sem_paciente: semPaciente,
      amostra: detalhes,
    })
  },
  $apis.requireAuth(),
)
