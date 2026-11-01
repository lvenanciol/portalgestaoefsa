// Ajustes PGE (19/10) — T2a + T5: transcrição de áudio via IA.
// POST /backend/v1/ia/transcrever (multipart: campo 'audio', max 20MB)
// O gateway $ai é texto-only — a transcrição usa o pipeline de documentos
// da plataforma quando o áudio chega como mídia suportada; como o pod não
// tem STT nativo, a rota aceita: (a) arquivo de áudio → tenta $documents
// (se o runtime suportar o mime) e (b) texto já transcrito no cliente via
// Web Speech API (reconhecimento nativo do navegador/Chrome/iOS Safari),
// que é o caminho primário do front (grava "Ouvir" → SpeechRecognition).
// Esta rota serve de fallback e de normalização: recebe { texto } e devolve
// a ESTRUTURA preenchida (tarefa ou ata) via $ai.chat JSON.

routerAdd(
  'POST',
  '/backend/v1/ia/estruturar-voz',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const body = e.requestInfo().body || {}
    const alvo = String(body.alvo || 'tarefa') // 'tarefa' | 'ata'
    const texto = String(body.texto || '').slice(0, 20000)
    if (!texto.trim()) return e.badRequestError('texto (transcrição) é obrigatório')

    // Data de referência informada pelo cliente ou hoje (UTC/BRT)
    const dataRefISO = String(body.data_referencia || new Date().toISOString().slice(0, 10))

    // Carrega empresas cadastradas para dar match preciso
    let listaEmpresas = []
    try {
      const emps = $app.findRecordsByFilter('empresas', "ativa = true || id != ''", 'nome', 50, 0)
      for (let i = 0; i < emps.length; i++) {
        listaEmpresas.push(emps[i].getString('nome'))
      }
    } catch (_) {}
    if (listaEmpresas.length === 0) {
      listaEmpresas = ['Extrafruti', 'Casafruti', 'FoldBox']
    }

    // Carrega parceiros/contatos para dar match confiável
    let listaParceiros = []
    try {
      const parcs = $app.findRecordsByFilter(
        'parceiros',
        "ativo = true || id != ''",
        'nome',
        100,
        0,
      )
      for (let i = 0; i < parcs.length; i++) {
        listaParceiros.push({
          id: parcs[i].id,
          nome: parcs[i].getString('nome'),
          empresa: parcs[i].getString('empresa'),
        })
      }
    } catch (_) {}

    const parceirosContexto = listaParceiros
      .map((p) => p.nome + (p.empresa ? ' (' + p.empresa + ')' : ''))
      .join(', ')

    const sysTarefa =
      'Você é o assistente oficial de gestão do grupo empresarial (empresas: ' +
      listaEmpresas.join(', ') +
      ', e opção especial "CPF").\n' +
      'Data atual de referência no sistema: ' +
      dataRefISO +
      '.\n' +
      'Parceiros e contatos cadastrados no sistema: ' +
      parceirosContexto +
      '.\n\n' +
      'Interprete a frase informada pelo usuário (falada ou digitada) para preenchimento de formulário de tarefa.\n' +
      'Responda EXCLUSIVAMENTE em JSON válido (sem cercas markdown, sem comentários) com as seguintes chaves:\n' +
      '{\n' +
      '  "titulo": string (título limpo e objetivo da tarefa, sem a repetição desnecessária de dados como responsável/data quando já capturados, ex.: "Emitir recibos de locação"),\n' +
      '  "descricao": string (detalhes ou observações da frase se houver, ou texto original se contiver instruções adicionais, ou vazio),\n' +
      '  "empresa": string (APENAS se corresponder claramente a uma das empresas cadastradas: ' +
      listaEmpresas.join(', ') +
      ' ou "CPF"; se não corresponder com certeza, deixe vazio ""),\n' +
      '  "responsavel": string (APENAS o nome exato de um parceiro/contato cadastrado se houver correspondência inequívoca; se a pessoa citada não constar no cadastro ou estiver ambígua, deixe vazio ""),\n' +
      '  "parceiros_sugeridos": array de strings (nomes cadastrados correspondentes às pessoas/parceiros citados),\n' +
      '  "prazo": string no formato YYYY-MM-DD (converta com precisão qualquer data relativa como "amanhã", "próxima sexta", "dia primeiro do mês que vem", "em três dias", "todo dia 1º", etc., considerando a data de referência ' +
      dataRefISO +
      '; se não houver data ou prazo claro na frase, deixe vazio ""),\n' +
      '  "recorrencia": string (DEVE ser EXATAMENTE uma das opções: "Nenhuma", "Diária", "Semanal", "Mensal", "Bimestral", "A definir". Converta expressões como "todo dia 1º", "todo mês", "mensalmente" -> "Mensal"; "toda segunda", "semanalmente" -> "Semanal"; "todo dia", "diariamente" -> "Diária"; "a cada dois meses", "a cada quinze dias", etc. Se não houver repetição, use "Nenhuma"),\n' +
      '  "prioridade_p": "P1" | "P2" | "P3" (se mencionado "urgente"/"alta" -> "P1", se "baixa" -> "P3", padrão "P2"),\n' +
      '  "status_kanban": "a_fazer" | "em_andamento" | "bloqueado" | "concluido" (padrão "a_fazer"),\n' +
      '  "vinculo_tipo": "ata" | "projeto" | "contrato" | "" (se mencionado explicitamente),\n' +
      '  "vinculo_id": string (código ou id citado, se houver),\n' +
      '  "pessoas_nao_encontradas": array de strings (nomes citados na frase que NÃO foram encontrados nos cadastros de parceiros),\n' +
      '  "empresa_nao_encontrada": string (empresa citada na frase que NÃO foi encontrada no cadastro, ou "")\n' +
      '}\n' +
      'REGRAS CRÍTICAS:\n' +
      '- Não invente dados! Preencha somente o que estiver expresso ou claramente dedutível na frase.\n' +
      '- Para empresas: Foldbox/FoldBox -> FoldBox. Extrafruti -> Extrafruti. Casafruti -> Casafruti.\n' +
      '- Para datas: se disser "todo dia 1º", calcule a data do próximo dia 1º a partir de ' +
      dataRefISO +
      ' para o campo prazo, e defina recorrencia como "Mensal".'

    const sysAta =
      'Você é assistente de gestão do grupo Extrafruti. Responda EXCLUSIVAMENTE em JSON válido ' +
      '(sem markdown, sem cercas) com as chaves: titulo (string curta), data (YYYY-MM-DD ou vazio), ' +
      'modalidade ("Presencial"|"Teams"|"Meet"|""), participantes (array de strings), pauta (string), ' +
      'decisoes (string), resumo (string executiva de até 5 linhas), action_items (array de objetos ' +
      '{acao, dono, prazo}). Português do Brasil. Interprete a transcrição da reunião e organize-a.'

    const sys = alvo === 'ata' ? sysAta : sysTarefa

    const r = $ai.chat({
      model: 'fast',
      messages: [
        { role: 'system', content: sys },
        {
          role: 'user',
          content: (alvo === 'ata' ? 'Transcrição:\n' : 'Frase de captura da tarefa:\n') + texto,
        },
      ],
    })
    const t =
      r && r.choices && r.choices[0] && r.choices[0].message ? r.choices[0].message.content : ''
    if (!t) return e.json(502, { ok: false, erro: 'IA não retornou conteúdo.' })

    let limpo = t.trim()
    if (limpo.startsWith('```')) {
      limpo = limpo
        .replace(/^```(json)?/, '')
        .replace(/```$/, '')
        .trim()
    }
    let estrutura = null
    try {
      estrutura = JSON.parse(limpo)
    } catch (_) {
      return e.json(502, { ok: false, erro: 'IA retornou JSON inválido.' })
    }

    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'ia_voz', 'ia', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: 'estruturar voz (' + alvo + '): ' + String(estrutura.titulo || '').slice(0, 80),
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, { ok: true, alvo: alvo, estrutura: estrutura })
  },
  $apis.requireAuth(),
)
