// Fase 3 — Diagnóstico: rota mínima sem middleware.
routerAdd('GET', '/backend/v1/ping', (e) => {
  const diag = {}
  try {
    const col = $app.findCollectionByNameOrId('logomarcas')
    const recs = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 10, 0)
    let base = String($app.settings().meta.appUrl || '')
    if (!base) base = String($secrets.get('PB_INSTANCE_URL') || '')
    base = base.replace(/\/_\/?$/, '').replace(/\/$/, '')

    function bytesToString(bytes) {
      if (!bytes) return ''
      if (typeof bytes === 'string') return bytes
      const parts = []
      const chunk = 4096
      for (let i = 0; i < bytes.length; i += chunk) {
        const sub = bytes.slice(i, Math.min(i + chunk, bytes.length))
        parts.push(String.fromCharCode.apply(null, sub))
      }
      return parts.join('')
    }

    function inspecionar(raw) {
      if (!raw || raw.length < 8)
        return { ok: false, motivo: 'Muito curto (' + (raw ? raw.length : 0) + ')' }
      function readU32(p) {
        return (
          ((raw.charCodeAt(p) & 0xff) << 24) |
          ((raw.charCodeAt(p + 1) & 0xff) << 16) |
          ((raw.charCodeAt(p + 2) & 0xff) << 8) |
          ((raw.charCodeAt(p + 3) & 0xff) >>> 0)
        )
      }
      let pos = 8,
        w = 0,
        h = 0,
        bitDepth = 0,
        colorType = -1,
        interlace = 0,
        idat = []
      while (pos + 8 <= raw.length) {
        const len = readU32(pos)
        const type = raw.slice(pos + 4, pos + 8)
        const dStart = pos + 8
        if (type === 'IHDR') {
          w = readU32(dStart)
          h = readU32(dStart + 4)
          bitDepth = raw.charCodeAt(dStart + 8) & 0xff
          colorType = raw.charCodeAt(dStart + 9) & 0xff
          interlace = raw.charCodeAt(dStart + 12) & 0xff
        } else if (type === 'IDAT') {
          idat.push(raw.slice(dStart, dStart + len))
        } else if (type === 'IEND') break
        pos = dStart + len + 4
      }
      return {
        ok: true,
        w: w,
        h: h,
        bitDepth: bitDepth,
        colorType: colorType,
        interlace: interlace,
        idatCount: idat.length,
        idatLen: idat.reduce((a, b) => a + b.length, 0),
      }
    }

    for (let i = 0; i < (recs || []).length; i++) {
      const r = recs[i]
      const emp = r.getString('empresa')
      const logo = r.getString('logo')
      const emb = r.getString('emblema')

      function testarUrl(fn) {
        if (!fn) return null
        const u = base + '/api/files/' + col.id + '/' + r.id + '/' + fn
        const res = $http.send({ method: 'GET', url: u })
        const raw = bytesToString(res.body)
        return { file: fn, status: res.statusCode, rawLen: raw.length, parse: inspecionar(raw) }
      }

      diag[emp] = { logo: testarUrl(logo), emb: testarUrl(emb) }
    }
  } catch (err) {
    diag.erro = String(err)
  }

  // Debug campo anexo
  const anexoInfo = {}
  for (const n of ['alvaras', 'contratos', 'atas', 'processos_juridicos', 'documentos']) {
    try {
      const c = $app.findCollectionByNameOrId(n)
      const f = c.fields.getByName('anexo')
      anexoInfo[n] = f ? { type: f.type, maxSelect: f.maxSelect, maxSize: f.maxSize } : null
    } catch (e) {
      anexoInfo[n] = String(e)
    }
  }

  return e.json(200, { ok: true, diag: diag, anexoInfo: anexoInfo })
})
