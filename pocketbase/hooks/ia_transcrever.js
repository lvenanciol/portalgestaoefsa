// T5d (20/10) — Transcrição de áudio REAL via Gemini API (multimodal).
// POST /backend/v1/ia/transcrever (JSON: { audio_base64, mime })
// O gateway $ai é texto-only; para áudio usamos a API REST do Gemini
// (generateContent com inline_data) usando GEMINI_API_KEY. Retorna a
// transcrição LITERAL do áudio (visão principal da ata).
// Limite: 15MB de áudio (base64 ~20MB no body).

routerAdd(
  'POST',
  '/backend/v1/ia/transcrever',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const body = e.requestInfo().body || {}
    const b64 = String(body.audio_base64 || '').trim()
    const mime = String(body.mime || 'audio/webm')
    if (!b64) return e.badRequestError('audio_base64 é obrigatório')
    if (b64.length > 20 * 1024 * 1024) {
      return e.json(413, { ok: false, erro: 'Áudio muito grande (máx. ~15MB).' })
    }
    const apiKey = $secrets.get('GEMINI_API_KEY')
    if (!apiKey) return e.json(502, { ok: false, erro: 'GEMINI_API_KEY não configurada.' })

    const modelos = ['gemini-2.0-flash', 'gemini-1.5-flash']
    let texto = ''
    let ultimoErro = ''
    for (const modelo of modelos) {
      try {
        const res = $http.send({
          url:
            'https://generativelanguage.googleapis.com/v1beta/models/' +
            modelo +
            ':generateContent?key=' +
            encodeURIComponent(apiKey),
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: 'Transcreva este áudio em português do Brasil, LITERALMENTE (não resuma, não corrija, não adicione pontuação além do necessário para leitura). Saída: apenas o texto transcrito.',
                  },
                  { inline_data: { mime_type: mime, data: b64 } },
                ],
              },
            ],
          }),
          timeout: 120,
        })
        if (res.statusCode !== 200) {
          ultimoErro = 'gemini ' + res.statusCode
          continue
        }
        const d = res.json || {}
        const parts =
          d.candidates && d.candidates[0] && d.candidates[0].content
            ? d.candidates[0].content.parts || []
            : []
        texto = parts
          .map((p) => String(p.text || ''))
          .join('')
          .trim()
        if (texto) break
      } catch (err) {
        ultimoErro = String(err).slice(0, 120)
      }
    }
    if (!texto) {
      return e.json(502, { ok: false, erro: 'Falha na transcrição: ' + (ultimoErro || 'vazio') })
    }

    try {
      const aid = $security.randomString(15)
      $app
        .db()
        .newQuery(
          "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'ia_transcrever', 'ia', {:det}, {:now}, {:now})",
        )
        .bind({
          id: aid,
          uid: auth.id,
          uemail: auth.getString('email'),
          det: 'transcrever áudio: ' + texto.slice(0, 80) + '…',
          now: new DateTime().string(),
        })
        .execute()
    } catch (_) {}

    return e.json(200, { ok: true, texto: texto })
  },
  $apis.requireAuth(),
)
