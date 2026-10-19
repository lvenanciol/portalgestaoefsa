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

    const sysTarefa =
      'Você é assistente de gestão do grupo Extrafruti. Responda EXCLUSIVAMENTE em JSON válido ' +
      '(sem markdown, sem cercas) com as chaves: titulo (string curta), descricao (string), ' +
      'responsavel (string ou vazio), prazo (YYYY-MM-DD ou vazio), prioridade_p ("P1"|"P2"|"P3"), ' +
      'empresa (Extrafruti|Casafruti|FoldBox|vazio), parceiros_sugeridos (array de strings — nomes ' +
      'citados como responsáveis/parceiros). Português do Brasil. Interprete pedidos falados ' +
      '(ex.: "preciso que o João resolva a entrega da semana que vem, é urgente") e extraia os campos.'

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
        { role: 'user', content: 'Transcrição (literal, pode conter erros de fala):\n' + texto },
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
