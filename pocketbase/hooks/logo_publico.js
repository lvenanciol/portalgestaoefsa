// ============================================================================
// LL5 — ROTA PÚBLICA PARA O LOGO NO E-MAIL (15/11/2026)
//
// PROBLEMA: o e-mail chegou sem logo. O HTML gerado aponta para
//   https://<dominio>/api/files/pbc_3701359284/<id>/<arquivo>
// mas no domínio público a rota `/api/*` é servida pela SPA (React) — o que
// volta é o index.html, não a imagem. Testado: GET nessa URL devolve o HTML
// do app, e o cliente de e-mail mostra imagem quebrada.
//
// SOLUÇÃO: esta rota pública, fora de /api, devolve os BYTES da imagem com o
// Content-Type correto. O e-mail passa a apontar para ela.
//
//   GET /backend/v1/logo/:empresa   → imagem da empresa (ou 404)
//   GET /backend/v1/logo/marcas     → todas as marcas ativas (JSON com URLs)
//
// É pública de propósito: cliente de e-mail não envia autenticação.
// ============================================================================

routerAdd('GET', '/backend/v1/logo/marcas', (e) => {
  let lista = []
  try {
    const recs = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 20, 0)
    for (const r of recs) {
      const arq = r.getString('logo') || r.getString('emblema')
      if (!arq) continue
      lista.push({
        empresa: r.getString('empresa'),
        id: r.id,
        arquivo: arq,
      })
    }
  } catch (err) {
    return e.json(200, { success: false, erro: String(err).slice(0, 120), marcas: [] })
  }
  return e.json(200, { success: true, total: lista.length, marcas: lista })
})

routerAdd('GET', '/backend/v1/logo/:chave', (e) => {
  const chave = String(e.request.pathValue('chave') || '').trim()
  if (!chave) return e.notFoundError('logo não informado')

  let rec = null
  try {
    // tenta por id do registro, depois por nome de empresa
    try {
      rec = $app.findRecordById('logomarcas', chave)
    } catch (_) {
      rec = null
    }
    if (!rec) {
      const esc = chave.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const ach = $app.findRecordsByFilter('logomarcas', 'empresa = "' + esc + '"', '', 1, 0)
      if (ach && ach.length) rec = ach[0]
    }
  } catch (err) {
    return e.notFoundError('consulta falhou')
  }

  if (!rec) return e.notFoundError('logo não encontrado')

  const arquivo = rec.getString('logo') || rec.getString('emblema')
  if (!arquivo) return e.notFoundError('registro sem arquivo de logo')

  // ------------------------------------------------------------------
  // 15/11/2026 — LER O ARQUIVO PELA ROTA INTERNA DO POCKETBASE.
  //
  // A tentativa anterior montou o caminho em disco com $os.readFile e falhou
  // (404) — o layout do storage não é garantido e o $os nem sempre está
  // exposto no JSVM.
  //
  // Aqui o próprio PocketBase serve o arquivo pela rota padrão
  // /api/files/<colecao>/<id>/<arquivo>, que é a única forma estável. Como o
  // domínio PÚBLICO entrega a SPA em /api/*, chamamos o host INTERNO.
  // ------------------------------------------------------------------
  const ext = String(arquivo).toLowerCase().split('.').pop()
  let mime = 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg'
  else if (ext === 'gif') mime = 'image/gif'
  else if (ext === 'webp') mime = 'image/webp'
  else if (ext === 'svg') mime = 'image/svg+xml'

  let urlInterna = ''
  try {
    urlInterna = String($secrets.get('PB_INSTANCE_URL') || '').trim()
  } catch (_) {
    urlInterna = ''
  }
  if (!urlInterna) {
    try {
      urlInterna = String($app.settings().meta.appURL || '').trim()
    } catch (_) {}
  }
  if (!urlInterna) return e.notFoundError('URL interna indisponível')

  const alvo =
    urlInterna.replace(/\/+$/, '') +
    '/api/files/' +
    rec.collection().id +
    '/' +
    rec.id +
    '/' +
    encodeURIComponent(arquivo)

  let res = null
  try {
    res = $http.send({ url: alvo, method: 'GET', timeout: 20 })
  } catch (err) {
    console.log('[logo] rede: ' + String(err).slice(0, 140))
    return e.notFoundError('falha ao buscar o arquivo')
  }

  if (res.statusCode !== 200) {
    console.log('[logo] arquivo respondeu ' + res.statusCode + ' em ' + alvo)
    return e.notFoundError('arquivo respondeu ' + res.statusCode)
  }

  // corpo pode vir como bytes
  let bytes = res.body
  if (typeof bytes === 'string') {
    // converte string em bytes
    const arr = []
    for (let i = 0; i < bytes.length; i++) arr.push(bytes.charCodeAt(i) & 0xff)
    bytes = arr
  }

  e.response.header().set('Content-Type', mime)
  e.response.header().set('Cache-Control', 'public, max-age=86400')
  e.response.header().set('Access-Control-Allow-Origin', '*')
  return e.blob(200, bytes, mime)
})
