// Leitura do snapshot sankhya_cache sincronizado para o Dashboard Executivo.
// Permite que qualquer usuário autenticado leia os dados agregados já sincronizados pelo cron diário.
// Rota: GET /backend/v1/sankhya/dashboard-cache

routerAdd(
  'GET',
  '/backend/v1/sankhya/dashboard-cache',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    try {
      let rec = null
      try {
        rec = $app.findFirstRecordByFilter('sankhya_cache', "chave = 'financeiro'")
      } catch (_) {
        rec = null
      }

      if (!rec) {
        return e.json(200, {
          ok: false,
          vazio: true,
          gerado_em: null,
          mensagem: 'Nenhum snapshot do Sankhya encontrado no momento.',
          dados: null,
        })
      }

      let payload = null
      try {
        payload = JSON.parse(rec.getString('payload') || '{}')
      } catch (errPayload) {
        return e.json(500, {
          ok: false,
          erro: 'Falha ao processar payload do cache: ' + String(errPayload),
        })
      }

      // Adicional: obter data da última execução da watermark ou do snapshot
      let watermarkRec = null
      try {
        watermarkRec = $app.findFirstRecordByFilter(
          'sankhya_cache',
          "chave = 'financeiro_watermark'",
        )
      } catch (_) {
        watermarkRec = null
      }

      const geradoEm = rec.getString('gerado_em') || payload.gerado_em || rec.getString('updated')
      const ultimaWatermark = watermarkRec ? watermarkRec.getString('gerado_em') : null

      return e.json(200, {
        ok: true,
        vazio: false,
        status: rec.getString('status') || payload.status || 'ok',
        gerado_em: geradoEm,
        ultima_watermark: ultimaWatermark,
        dados: payload.dados || {},
        falhas: payload.falhas || [],
      })
    } catch (err) {
      return e.json(500, {
        ok: false,
        erro: 'Erro ao consultar snapshot: ' + String(err),
      })
    }
  },
  $apis.requireAuth(),
)
