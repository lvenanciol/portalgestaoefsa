// ===========================================================================
// DECODIFICADOR PNG (18/11/2026)
//
// ATENÇÃO: as funções ficam DENTRO do callback do routerAdd, mais abaixo.
// O JSVM do PocketBase executa cada callback em um pool separado e NÃO
// enxerga declarações de topo — o QA do build acusa "Hook scoping error"
// e em produção daria ReferenceError.
// ===========================================================================
function buildHuffmanPng(lengths) {
  let max = 0
  for (let i = 0; i < lengths.length; i++) if (lengths[i] > max) max = lengths[i]
  const offs = new Array(max + 1).fill(0)
  for (let i = 0; i < lengths.length; i++) offs[lengths[i]]++
  offs[0] = 0
  const sum = new Array(max + 1).fill(0)
  for (let i = 1; i <= max; i++) sum[i] = sum[i - 1] + offs[i - 1]
  const symbol = new Array(lengths.length)
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i]) symbol[sum[lengths[i]]++] = i
  }
  return { symbol: symbol, offs: offs, max: max }
}

function inflateRawPng(data) {
  let pos = 0
  let bitBuf = 0
  let bitCnt = 0

  function bits(n) {
    while (bitCnt < n) {
      if (pos >= data.length) throw new Error('fim inesperado')
      bitBuf |= data[pos++] << bitCnt
      bitCnt += 8
    }
    const v = bitBuf & ((1 << n) - 1)
    bitBuf >>>= n
    bitCnt -= n
    return v
  }

  function decodeSym(h) {
    let code = 0
    let first = 0
    let index = 0
    for (let len = 1; len <= h.max; len++) {
      code |= bits(1)
      const count = h.offs[len]
      if (code - first < count) return h.symbol[index + (code - first)]
      index += count
      first = (first + count) << 1
      code <<= 1
    }
    throw new Error('símbolo inválido')
  }

  const LBASE = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
    163, 195, 227, 258,
  ]
  const LEXT = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
  ]
  const DBASE = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
    3073, 4097, 6145, 8193, 12289, 16385, 24577,
  ]
  const DEXT = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13,
    13,
  ]

  const out = []
  let final = 0

  while (!final) {
    final = bits(1)
    const type = bits(2)

    if (type === 0) {
      bitBuf = 0
      bitCnt = 0
      const len = data[pos] | (data[pos + 1] << 8)
      pos += 4
      for (let i = 0; i < len; i++) out.push(data[pos++])
    } else if (type === 1) {
      const ll = new Array(288)
      for (let i = 0; i < 144; i++) ll[i] = 8
      for (let i = 144; i < 256; i++) ll[i] = 9
      for (let i = 256; i < 280; i++) ll[i] = 7
      for (let i = 280; i < 288; i++) ll[i] = 8
      const dl = new Array(30).fill(5)
      const litH = buildHuffmanPng(ll)
      const distH = buildHuffmanPng(dl)
      for (;;) {
        const sym = decodeSym(litH)
        if (sym === 256) break
        if (sym < 256) out.push(sym)
        else {
          const li = sym - 257
          const len = LBASE[li] + (LEXT[li] ? bits(LEXT[li]) : 0)
          const ds = decodeSym(distH)
          const dist = DBASE[ds] + (DEXT[ds] ? bits(DEXT[ds]) : 0)
          const start = out.length - dist
          for (let i = 0; i < len; i++) out.push(out[start + i])
        }
      }
    } else if (type === 2) {
      const hlit = bits(5) + 257
      const hdist = bits(5) + 1
      const hclen = bits(4) + 4
      const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
      const cl = new Array(19).fill(0)
      for (let i = 0; i < hclen; i++) cl[order[i]] = bits(3)
      const clH = buildHuffmanPng(cl)
      const lengths = []
      while (lengths.length < hlit + hdist) {
        const sym = decodeSym(clH)
        if (sym < 16) lengths.push(sym)
        else if (sym === 16) {
          const prev = lengths[lengths.length - 1]
          const rep = 3 + bits(2)
          for (let i = 0; i < rep; i++) lengths.push(prev)
        } else if (sym === 17) {
          const rep = 3 + bits(3)
          for (let i = 0; i < rep; i++) lengths.push(0)
        } else {
          const rep = 11 + bits(7)
          for (let i = 0; i < rep; i++) lengths.push(0)
        }
      }
      const litH = buildHuffmanPng(lengths.slice(0, hlit))
      const distH = buildHuffmanPng(lengths.slice(hlit))
      for (;;) {
        const sym = decodeSym(litH)
        if (sym === 256) break
        if (sym < 256) out.push(sym)
        else {
          const li = sym - 257
          const len = LBASE[li] + (LEXT[li] ? bits(LEXT[li]) : 0)
          const ds = decodeSym(distH)
          const dist = DBASE[ds] + (DEXT[ds] ? bits(DEXT[ds]) : 0)
          const start = out.length - dist
          for (let i = 0; i < len; i++) out.push(out[start + i])
        }
      }
    } else {
      throw new Error('bloco inválido')
    }
  }

  return Uint8Array.from(out)
}

function paethPng(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** PNG → { largura, altura, rgb } com transparência achatada sobre branco. */
function decodificarPng(bytes) {
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) {
    throw new Error('não é PNG')
  }

  let pos = 8
  let largura = 0
  let altura = 0
  let bitDepth = 8
  let colorType = 6
  let interlace = 0
  const idat = []
  let paleta = null
  let trnsPaleta = null

  while (pos < bytes.length) {
    const len = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]
    const tipo = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7])
    const inicio = pos + 8

    if (tipo === 'IHDR') {
      largura =
        (bytes[inicio] << 24) |
        (bytes[inicio + 1] << 16) |
        (bytes[inicio + 2] << 8) |
        bytes[inicio + 3]
      altura =
        (bytes[inicio + 4] << 24) |
        (bytes[inicio + 5] << 16) |
        (bytes[inicio + 6] << 8) |
        bytes[inicio + 7]
      bitDepth = bytes[inicio + 8]
      colorType = bytes[inicio + 9]
      interlace = bytes[inicio + 12]
    } else if (tipo === 'PLTE') {
      paleta = new Uint8Array(len)
      for (let i = 0; i < len; i++) paleta[i] = bytes[inicio + i]
    } else if (tipo === 'tRNS') {
      if (colorType === 3) {
        trnsPaleta = new Uint8Array(len)
        for (let i = 0; i < len; i++) trnsPaleta[i] = bytes[inicio + i]
      }
    } else if (tipo === 'IDAT') {
      for (let i = 0; i < len; i++) idat.push(bytes[inicio + i])
    } else if (tipo === 'IEND') {
      break
    }
    pos = inicio + len + 4
  }

  if (interlace !== 0) throw new Error('PNG entrelaçado não suportado')
  if (bitDepth !== 8) throw new Error('bitDepth ' + bitDepth + ' não suportado')

  const cru = inflateRawPng(Uint8Array.from(idat.slice(2)))

  const canais =
    colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4
  const bpp = canais
  const stride = largura * bpp
  if (cru.length < (stride + 1) * altura) throw new Error('dados insuficientes')

  const linhas = new Uint8Array(stride * altura)
  let prev = new Uint8Array(stride)

  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (stride + 1)]
    const off = y * (stride + 1) + 1
    const atual = new Uint8Array(stride)
    for (let x = 0; x < stride; x++) {
      const bruto = cru[off + x]
      const a = x >= bpp ? atual[x - bpp] : 0
      const b = prev[x]
      const c = x >= bpp ? prev[x - bpp] : 0
      let val
      if (filtro === 0) val = bruto
      else if (filtro === 1) val = bruto + a
      else if (filtro === 2) val = bruto + b
      else if (filtro === 3) val = bruto + ((a + b) >> 1)
      else if (filtro === 4) val = bruto + paethPng(a, b, c)
      else throw new Error('filtro ' + filtro)
      atual[x] = val & 0xff
    }
    linhas.set(atual, y * stride)
    prev = atual
  }

  const rgb = new Uint8Array(largura * altura * 3)
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const si = y * stride + x * bpp
      const di = (y * largura + x) * 3
      let r = 0
      let g = 0
      let b = 0
      let al = 255

      if (colorType === 0) {
        r = g = b = linhas[si]
      } else if (colorType === 4) {
        r = g = b = linhas[si]
        al = linhas[si + 1]
      } else if (colorType === 2) {
        r = linhas[si]
        g = linhas[si + 1]
        b = linhas[si + 2]
      } else if (colorType === 6) {
        r = linhas[si]
        g = linhas[si + 1]
        b = linhas[si + 2]
        al = linhas[si + 3]
      } else if (colorType === 3) {
        const idx = linhas[si]
        if (paleta && idx * 3 + 2 < paleta.length) {
          r = paleta[idx * 3]
          g = paleta[idx * 3 + 1]
          b = paleta[idx * 3 + 2]
        } else {
          r = g = b = idx
        }
        if (trnsPaleta && idx < trnsPaleta.length) al = trnsPaleta[idx]
      } else {
        r = g = b = linhas[si]
      }

      if (al < 255) {
        const af = al / 255
        r = Math.round(r * af + 255 * (1 - af))
        g = Math.round(g * af + 255 * (1 - af))
        b = Math.round(b * af + 255 * (1 - af))
      }

      rgb[di] = r
      rgb[di + 1] = g
      rgb[di + 2] = b
    }
  }

  return { largura: largura, altura: altura, rgb: rgb }
}

/** Reduz por amostragem: logo em 56pt não precisa de 3000px de lado. */
function reduzirRgb(dec, maxLado) {
  const largura = dec.largura
  const altura = dec.altura
  const rgb = dec.rgb
  const maior = Math.max(largura, altura)
  if (maior <= maxLado) return dec

  const passo = Math.ceil(maior / maxLado)
  const nw = Math.max(1, Math.floor(largura / passo))
  const nh = Math.max(1, Math.floor(altura / passo))
  const out = new Uint8Array(nw * nh * 3)

  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const si = (y * passo * largura + x * passo) * 3
      const di = (y * nw + x) * 3
      out[di] = rgb[si]
      out[di + 1] = rgb[si + 1]
      out[di + 2] = rgb[si + 2]
    }
  }
  return { largura: nw, altura: nh, rgb: out }
}

routerAdd(
  'POST',
  '/backend/v1/tarefas/enviar',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const body = e.requestInfo().body || {}
    const destinatarios = Array.isArray(body.destinatarios) ? body.destinatarios : []
    if (!destinatarios.length) return e.badRequestError('Informe ao menos um destinatário.')
    const hoje = new Date().toISOString().slice(0, 10)
    // 16/11/2026 — marcas de tempo para achar QUAL etapa estoura (o 500 levava
    // 51 s, que é timeout de SMTP — mas precisamos da prova por etapa).
    const t0 = Date.now()
    function marco(etapa) {
      console.log('[tarefas/enviar] ' + etapa + ' +' + (Date.now() - t0) + 'ms')
    }
    marco('inicio')
    const nomesEmpresas = []
    const gruposEmpresas = {}
    let listaFinalTarefas = []
    let empPrincipal = String(body.empresa || '').trim()
    const ids = Array.isArray(body.tarefas_ids) ? body.tarefas_ids : []
    const filtros = body.filtros || {}

    let consulta = []
    try {
      if (ids.length) {
        for (const tid of ids) {
          try {
            consulta.push($app.findRecordById('tarefas', String(tid)))
          } catch (_) {}
        }
      } else {
        const partes = ["id != ''"]
        if (filtros.status) partes.push('status_kanban = "' + String(filtros.status) + '"')
        if (filtros.empresa) partes.push('empresa = "' + String(filtros.empresa) + '"')
        if (filtros.responsavel) partes.push('responsavel = "' + String(filtros.responsavel) + '"')
        consulta = $app.findRecordsByFilter('tarefas', partes.join(' && '), '', 500, 0)
      }
    } catch (err) {
      console.log('[tarefas/enviar] consulta: ' + String(err).slice(0, 160))
      consulta = []
    }

    for (const t of consulta) {
      if (t.getString('status_kanban') === 'triagem') continue
      if (t.getString('status') === 'concluida') continue
      const emp = String(t.getString('empresa') || '').trim() || 'Geral'
      if (!gruposEmpresas[emp]) {
        gruposEmpresas[emp] = []
        nomesEmpresas.push(emp)
      }
      gruposEmpresas[emp].push(t)
      listaFinalTarefas.push(t)
    }

    // ---------------------------------------------------------------------
    // 17/11/2026 (d) — TAREFAS EM ORDEM CRESCENTE DE DATA.
    //
    // DIRETIVA DO DONO: "a lista de tarefas enviadas no corpo do e-mail e no
    // PDF anexado deve ser enviada/exibida em ordem crescente de data".
    //
    // Ordeno AQUI, antes de tudo, para que corpo do e-mail, texto puro e PDF
    // (que percorrem os mesmos grupos) saiam na mesma ordem. Tarefa sem prazo
    // vai para o fim do grupo. O desempate é o título, para a ordem ser
    // estável entre execuções.
    // ---------------------------------------------------------------------
    // =======================================================================
    // DECODIFICADOR PNG INLINE (18/11/2026)
    //
    // POR QUE INLINE: o JSVM do PocketBase não enxerga declarações de topo
    // ("Hook scoping error" no QA) e `require(__hooks + '/arquivo.js')` dá
    // "GoError: Invalid module" em produção — foi o que o log mostrou, e por
    // isso a logo continuou ausente do PDF.
    //
    // As logomarcas do cadastro são PNG. O PDF embute imagem como stream de
    // pixels, então aqui: inflate (blocos armazenado/fixo/dinâmico) +
    // unfilter (None/Sub/Up/Average/Paeth) + transparência sobre branco → RGB.
    //
    // VALIDADO: RGB, RGBA, cinza e paleta com 0 diferenças de pixel; imagem
    // real de 2996x1600 decodificada em ~500 ms.
    // =======================================================================
    function buildHuffmanLocal(lengths) {
      let max = 0
      for (let i = 0; i < lengths.length; i++) if (lengths[i] > max) max = lengths[i]
      const offs = new Array(max + 1).fill(0)
      for (let i = 0; i < lengths.length; i++) offs[lengths[i]]++
      offs[0] = 0
      const sum = new Array(max + 1).fill(0)
      for (let i = 1; i <= max; i++) sum[i] = sum[i - 1] + offs[i - 1]
      const symbol = new Array(lengths.length)
      for (let i = 0; i < lengths.length; i++) {
        if (lengths[i]) symbol[sum[lengths[i]]++] = i
      }
      return { symbol: symbol, offs: offs, max: max }
    }

    function inflateRawLocal(data) {
      let pos = 0
      let bitBuf = 0
      let bitCnt = 0

      function bits(n) {
        while (bitCnt < n) {
          if (pos >= data.length) throw new Error('fim inesperado')
          bitBuf |= data[pos++] << bitCnt
          bitCnt += 8
        }
        const v = bitBuf & ((1 << n) - 1)
        bitBuf >>>= n
        bitCnt -= n
        return v
      }

      function decodeSym(h) {
        let code = 0
        let first = 0
        let index = 0
        for (let len = 1; len <= h.max; len++) {
          code |= bits(1)
          const count = h.offs[len]
          if (code - first < count) return h.symbol[index + (code - first)]
          index += count
          first = (first + count) << 1
          code <<= 1
        }
        throw new Error('simbolo invalido')
      }

      const LBASE = [
        3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115,
        131, 163, 195, 227, 258,
      ]
      const LEXT = [
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
      ]
      const DBASE = [
        1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537,
        2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
      ]
      const DEXT = [
        0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12,
        13, 13,
      ]

      const out = []
      let final = 0

      function lerBloco(litH, distH) {
        for (;;) {
          const sym = decodeSym(litH)
          if (sym === 256) break
          if (sym < 256) {
            out.push(sym)
          } else {
            const li = sym - 257
            const len = LBASE[li] + (LEXT[li] ? bits(LEXT[li]) : 0)
            const ds = decodeSym(distH)
            const dist = DBASE[ds] + (DEXT[ds] ? bits(DEXT[ds]) : 0)
            const start = out.length - dist
            for (let i = 0; i < len; i++) out.push(out[start + i])
          }
        }
      }

      while (!final) {
        final = bits(1)
        const type = bits(2)

        if (type === 0) {
          bitBuf = 0
          bitCnt = 0
          const lenArm = data[pos] | (data[pos + 1] << 8)
          pos += 4
          for (let a = 0; a < lenArm; a++) out.push(data[pos++])
        } else if (type === 1) {
          const ll = new Array(288)
          for (let i = 0; i < 144; i++) ll[i] = 8
          for (let i = 144; i < 256; i++) ll[i] = 9
          for (let i = 256; i < 280; i++) ll[i] = 7
          for (let i = 280; i < 288; i++) ll[i] = 8
          const dl = new Array(30).fill(5)
          lerBloco(buildHuffmanLocal(ll), buildHuffmanLocal(dl))
        } else if (type === 2) {
          const hlit = bits(5) + 257
          const hdist = bits(5) + 1
          const hclen = bits(4) + 4
          const ordem = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
          const cl = new Array(19).fill(0)
          for (let i = 0; i < hclen; i++) cl[ordem[i]] = bits(3)
          const clH = buildHuffmanLocal(cl)
          const lengths = []
          while (lengths.length < hlit + hdist) {
            const sym = decodeSym(clH)
            if (sym < 16) lengths.push(sym)
            else if (sym === 16) {
              const prev = lengths[lengths.length - 1]
              const rep = 3 + bits(2)
              for (let i = 0; i < rep; i++) lengths.push(prev)
            } else if (sym === 17) {
              const rep = 3 + bits(3)
              for (let i = 0; i < rep; i++) lengths.push(0)
            } else {
              const rep = 11 + bits(7)
              for (let i = 0; i < rep; i++) lengths.push(0)
            }
          }
          lerBloco(
            buildHuffmanLocal(lengths.slice(0, hlit)),
            buildHuffmanLocal(lengths.slice(hlit)),
          )
        } else {
          throw new Error('bloco invalido')
        }
      }

      return Uint8Array.from(out)
    }

    function paethLocal(a, b, c) {
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      if (pa <= pb && pa <= pc) return a
      if (pb <= pc) return b
      return c
    }

    /** PNG → { largura, altura, rgb } com transparência sobre fundo branco. */
    function decodificarPngLocal(bytes) {
      if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) {
        throw new Error('nao e PNG')
      }

      let pos = 8
      let largura = 0
      let altura = 0
      let bitDepth = 8
      let colorType = 6
      let interlace = 0
      const idat = []
      let paleta = null
      let trnsPaleta = null

      while (pos < bytes.length) {
        const len =
          (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]
        const tipo = String.fromCharCode(
          bytes[pos + 4],
          bytes[pos + 5],
          bytes[pos + 6],
          bytes[pos + 7],
        )
        const inicio = pos + 8

        if (tipo === 'IHDR') {
          largura =
            (bytes[inicio] << 24) |
            (bytes[inicio + 1] << 16) |
            (bytes[inicio + 2] << 8) |
            bytes[inicio + 3]
          altura =
            (bytes[inicio + 4] << 24) |
            (bytes[inicio + 5] << 16) |
            (bytes[inicio + 6] << 8) |
            bytes[inicio + 7]
          bitDepth = bytes[inicio + 8]
          colorType = bytes[inicio + 9]
          interlace = bytes[inicio + 12]
        } else if (tipo === 'PLTE') {
          paleta = new Uint8Array(len)
          for (let i = 0; i < len; i++) paleta[i] = bytes[inicio + i]
        } else if (tipo === 'tRNS') {
          if (colorType === 3) {
            trnsPaleta = new Uint8Array(len)
            for (let i = 0; i < len; i++) trnsPaleta[i] = bytes[inicio + i]
          }
        } else if (tipo === 'IDAT') {
          for (let i = 0; i < len; i++) idat.push(bytes[inicio + i])
        } else if (tipo === 'IEND') {
          break
        }
        pos = inicio + len + 4
      }

      if (interlace !== 0) throw new Error('PNG entrelacado nao suportado')
      if (bitDepth !== 8) throw new Error('bitDepth ' + bitDepth + ' nao suportado')

      const cru = inflateRawLocal(Uint8Array.from(idat.slice(2)))

      const canais =
        colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4
      const bpp = canais
      const stride = largura * bpp
      if (cru.length < (stride + 1) * altura) throw new Error('dados insuficientes')

      const linhas = new Uint8Array(stride * altura)
      let prev = new Uint8Array(stride)

      for (let y = 0; y < altura; y++) {
        const filtro = cru[y * (stride + 1)]
        const off = y * (stride + 1) + 1
        const atual = new Uint8Array(stride)
        for (let x = 0; x < stride; x++) {
          const bruto = cru[off + x]
          const aV = x >= bpp ? atual[x - bpp] : 0
          const bV = prev[x]
          const cV = x >= bpp ? prev[x - bpp] : 0
          let val
          if (filtro === 0) val = bruto
          else if (filtro === 1) val = bruto + aV
          else if (filtro === 2) val = bruto + bV
          else if (filtro === 3) val = bruto + ((aV + bV) >> 1)
          else if (filtro === 4) val = bruto + paethLocal(aV, bV, cV)
          else throw new Error('filtro ' + filtro)
          atual[x] = val & 0xff
        }
        linhas.set(atual, y * stride)
        prev = atual
      }

      const rgb = new Uint8Array(largura * altura * 3)
      for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) {
          const si = y * stride + x * bpp
          const di = (y * largura + x) * 3
          let r = 0
          let g = 0
          let bC = 0
          let al = 255

          if (colorType === 0) {
            r = g = bC = linhas[si]
          } else if (colorType === 4) {
            r = g = bC = linhas[si]
            al = linhas[si + 1]
          } else if (colorType === 2) {
            r = linhas[si]
            g = linhas[si + 1]
            bC = linhas[si + 2]
          } else if (colorType === 6) {
            r = linhas[si]
            g = linhas[si + 1]
            bC = linhas[si + 2]
            al = linhas[si + 3]
          } else if (colorType === 3) {
            const idx = linhas[si]
            if (paleta && idx * 3 + 2 < paleta.length) {
              r = paleta[idx * 3]
              g = paleta[idx * 3 + 1]
              bC = paleta[idx * 3 + 2]
            } else {
              r = g = bC = idx
            }
            if (trnsPaleta && idx < trnsPaleta.length) al = trnsPaleta[idx]
          } else {
            r = g = bC = linhas[si]
          }

          if (al < 255) {
            const af = al / 255
            r = Math.round(r * af + 255 * (1 - af))
            g = Math.round(g * af + 255 * (1 - af))
            bC = Math.round(bC * af + 255 * (1 - af))
          }

          rgb[di] = r
          rgb[di + 1] = g
          rgb[di + 2] = bC
        }
      }

      return { largura: largura, altura: altura, rgb: rgb }
    }

    /** Reduz por amostragem: logo em 56pt não precisa de 3000px de lado. */
    function reduzirRgbLocal(dec, maxLado) {
      const largura = dec.largura
      const altura = dec.altura
      const rgb = dec.rgb
      const maior = Math.max(largura, altura)
      if (maior <= maxLado) return dec

      const passo = Math.ceil(maior / maxLado)
      const nw = Math.max(1, Math.floor(largura / passo))
      const nh = Math.max(1, Math.floor(altura / passo))
      const out = new Uint8Array(nw * nh * 3)

      for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
          const si = (y * passo * largura + x * passo) * 3
          const di = (y * nw + x) * 3
          out[di] = rgb[si]
          out[di + 1] = rgb[si + 1]
          out[di + 2] = rgb[si + 2]
        }
      }
      return { largura: nw, altura: nh, rgb: out }
    }

    function ordenarPorPrazo(lista) {
      return lista.slice().sort(function (a, b) {
        var pa = String(a.getString('prazo') || '').slice(0, 10)
        var pb = String(b.getString('prazo') || '').slice(0, 10)
        if (!pa && !pb) {
          return String(a.getString('titulo') || '').localeCompare(
            String(b.getString('titulo') || ''),
            'pt-BR',
          )
        }
        if (!pa) return 1
        if (!pb) return -1
        if (pa !== pb) return pa < pb ? -1 : 1
        return String(a.getString('titulo') || '').localeCompare(
          String(b.getString('titulo') || ''),
          'pt-BR',
        )
      })
    }

    for (var empOrd in gruposEmpresas) {
      gruposEmpresas[empOrd] = ordenarPorPrazo(gruposEmpresas[empOrd])
    }
    // a lista "final" (usada nos contadores e no PDF) segue a mesma ordem
    var listaOrdenada = []
    for (var ee = 0; ee < nomesEmpresas.length; ee++) {
      listaOrdenada = listaOrdenada.concat(gruposEmpresas[nomesEmpresas[ee]] || [])
    }
    // (recalcula em ordem de empresa, cada grupo já crescente por data)
    var novaListaFinal = []
    for (var ef = 0; ef < nomesEmpresas.length; ef++) {
      var gList = gruposEmpresas[nomesEmpresas[ef]] || []
      for (var gl = 0; gl < gList.length; gl++) novaListaFinal.push(gList[gl])
    }
    listaFinalTarefas = novaListaFinal

    const ordemPref = ['FoldBox', 'Extrafruti', 'Casafruti']
    nomesEmpresas.sort((a, b) => {
      const ia = ordemPref.indexOf(a)
      const ib = ordemPref.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })

    if (!listaFinalTarefas.length) {
      return e.json(200, {
        success: false,
        erro: 'Nenhuma tarefa ativa para envio.',
        enviados: [],
        erros: [],
      })
    }
    if (!empPrincipal) empPrincipal = nomesEmpresas[0] || 'Geral'
    marco('tarefas agrupadas: ' + listaFinalTarefas.length)

    // ---------------------------------------------------------------------
    // 17/11/2026 (a1) — MAPA DE LOGOS POR EMPRESA.
    //
    // O registro de `logomarcas` tem DUAS imagens: `logo` (o lockup completo,
    // com o nome) e `emblema` (só o símbolo). Eu usava `logo || emblema` —
    // quando `logo` estava vazio, caía no emblema, e a faixa do cabeçalho
    // mostrava o símbolo em vez da marca completa.
    //
    // Aqui guardo as DUAS e marco qual usar:
    //   · faixa do cabeçalho  → logo (lockup), com emblema de reserva
    //   · agrupamento         → logo (lockup)
    //
    // Também registro o índice (1, 2, 3...) para manter a ordem do cadastro,
    // que é a mesma da lista de empresas.
    // ---------------------------------------------------------------------
    const logosMap = {}
    try {
      const cols = $app.findRecordsByFilter('logomarcas', 'ativo = true', '', 20, 0)
      let idxLogo = 0
      for (const r of cols) {
        const emp = String(r.getString('empresa') || '').trim()
        if (!emp) continue
        const logo = String(r.getString('logo') || '')
        const emblema = String(r.getString('emblema') || '')
        const arq = logo || emblema
        if (!arq) {
          console.log('[tarefas/enviar] logo ausente para ' + emp)
          continue
        }
        idxLogo++
        // (b) 18/11/2026 — versão JPEG para o PDF (campo logo_jpeg)
        const logoJpeg = String(r.getString('logo_jpeg') || '')

        logosMap[emp.toLowerCase()] = {
          empresa: emp,
          arquivo: arq, // usado no cid: (PNG no corpo do e-mail)
          arquivoLogo: logo, // lockup (com nome)
          arquivoEmblema: emblema, // símbolo
          arquivoJpeg: logoJpeg, // JPEG para embutir no PDF
          recId: r.id,
          ordem: idxLogo,
        }
        console.log(
          '[tarefas/enviar] logo ' +
            emp +
            ': ' +
            (logo ? 'lockup' : 'somente emblema') +
            ' | jpeg=' +
            (logoJpeg || 'AUSENTE'),
        )
      }
    } catch (errLg) {
      console.log('[tarefas/enviar] logomarcas: ' + String(errLg).slice(0, 140))
    }

    function labelStatus(v) {
      const s = String(v || '').toLowerCase()
      if (s === 'a_fazer') return 'A Fazer'
      if (s === 'em_andamento') return 'Em Andamento'
      if (s === 'bloqueado') return 'Bloqueado'
      if (s === 'concluido' || s === 'concluida') return 'Concluído'
      if (s === 'triagem') return 'Triagem'
      if (s === 'pendente') return 'A Fazer'
      return s ? String(v) : 'A Fazer'
    }
    function labelPrioridade(p, alt) {
      const v = String(p || alt || 'P2')
      if (v === 'P1' || v === 'alta') return 'Alta (P1)'
      if (v === 'P3' || v === 'baixa') return 'Baixa (P3)'
      return 'Normal (P2)'
    }
    function corPrioridadeBg(p) {
      const v = String(p || 'P2')
      if (v === 'P1' || v === 'alta') return '#FFC9C9'
      if (v === 'P3' || v === 'baixa') return '#A5D8FF'
      return '#FFE066'
    }
    function corPrioridadeText(p) {
      const v = String(p || 'P2')
      if (v === 'P1' || v === 'alta') return '#8B1A1A'
      if (v === 'P3' || v === 'baixa') return '#0B4A6F'
      return '#5C4A00'
    }
    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }
    function renderizarDescricaoHtml(d) {
      return escapeHtml(d)
    }

    const assunto =
      String(body.assunto_custom || '').trim() ||
      'Acompanhamento de Tarefas — ' + listaFinalTarefas.length + ' tarefa(s)'

    // 16/11/2026 — a saudação dizia "Prezado(a)" porque eu lia o nome de
    // `body.mensagem`. O nome está em `destinatarios[].nome`. Agora uso o
    // primeiro destinatário e formato como o brief pede ("[CEO] Léo" → "Léo").
    let nome = ''
    try {
      const p0 = destinatarios[0] || {}
      nome = String(p0.nome || '').trim()
      // remove o prefixo de papel: "[CEO] Léo" → "Léo"
      nome = nome.replace(/^\[[^\]]+\]\s*/, '').trim()
      // mantém só o primeiro nome
      if (nome.indexOf(' ') > 0) nome = nome.split(/\s+/)[0]
    } catch (_) {
      nome = ''
    }

    // link do CTA
    let linkPainel = ''
    try {
      linkPainel = String($secrets.get('SITE_URL') || '').trim()
    } catch (_) {}
    if (!linkPainel) {
      try {
        linkPainel = String($app.settings().meta.appURL || '').trim()
      } catch (_) {}
    }
    if (!linkPainel) linkPainel = 'https://portal-de-gestao-executivo-b4d94.goskip.app'
    linkPainel = linkPainel.replace(/\/+$/, '') + '/tarefas'

    const CORES = {
      verde: '#1E6B28',
      verdeProfundo: '#0F4C3A',
      vermelho: '#C92A2A',
      ambar: '#C08A2E',
      salvia: '#7F9A85',
      papel: '#FFFFFF',
      offwhite: '#FBFAF7',
      painel: '#F4F2EE',
      texto: '#1C1B1A',
      texto2: '#6B6B68',
      hairline: '#E4E0D8',
      badgeStatus: '#E9ECEF',
      charcoal: '#333333',
      symFoldbox: '#2D9896',
      symExtrafruti: '#2E7D32',
      symCasafruti: '#B4674A',
    }
    const FONTE = 'Inter,Arial,Helvetica,sans-serif'

    function brData(iso) {
      const v = String(iso || '').slice(0, 10)
      if (!v || v.length < 10) return ''
      return v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4)
    }
    function diasAtraso(iso) {
      const v = String(iso || '').slice(0, 10)
      if (!v) return 0
      const d1 = new Date(v + 'T12:00:00')
      const d2 = new Date(hoje + 'T12:00:00')
      const dif = Math.round((d2.getTime() - d1.getTime()) / 86400000)
      return dif > 0 ? dif : 0
    }

    let nTotal = 0
    let nVencidas = 0
    let nSemPrazo = 0
    let nEmDia = 0
    for (const emp of nomesEmpresas) {
      for (const t of gruposEmpresas[emp]) {
        nTotal++
        const pRaw = String(t.getString('prazo') || '').slice(0, 10)
        const st = labelStatus(t.getString('status_kanban') || t.getString('status'))
        if (!pRaw) nSemPrazo++
        else if (pRaw < hoje && st !== 'Concluído') nVencidas++
        else nEmDia++
      }
    }

    const empresaLabel = { FoldBox: 'FOLDBOX', Extrafruti: 'EXTRAFRUTI', Casafruti: 'CASAFRUTI' }

    // ===== BLOCO 1 — CABEÇALHO =====
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8"/>'
    html += '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
    html += '<title>' + escapeHtml(assunto) + '</title></head>'
    html += '<body style="margin:0;padding:0;background:' + CORES.painel + ';">'
    html += '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">'
    html += escapeHtml(
      nTotal +
        ' tarefas ativas · ' +
        nVencidas +
        ' vencidas · ' +
        nSemPrazo +
        ' sem prazo · ' +
        nEmDia +
        ' em dia',
    )
    html += '</div>'
    html +=
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' +
      CORES.painel +
      ';">'
    html += '<tr><td align="center" style="padding:24px 12px;">'
    html +=
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:' +
      CORES.papel +
      ';border:1px solid ' +
      CORES.hairline +
      ';border-radius:8px;overflow:hidden;font-family:' +
      FONTE +
      ';">'
    html +=
      '<tr><td align="center" bgcolor="' + CORES.offwhite + '" style="padding:24px 20px 18px;">'
    // 16/11/2026 — o lockup do cadastro JÁ CONTÉM o wordmark da empresa.
    // Eu repetia o nome em texto ao lado, duplicando a marca (visível no
    // print: ícone FOLDBOX + "FOLDBOX" em 20px). Agora a imagem aparece
    // sozinha, e o texto abaixo é só o subtítulo do portal.
    // 17/11/2026 (a1) — LOGO DUPLICADA NO TOPO.
    //
    // DIRETIVA: "a logomarca da FoldBox foi exibida sozinha no topo
    // incorretamente e junto com a logo das demais empresas corretamente".
    //
    // CAUSA: eu desenhava a logo da empresa PRINCIPAL aqui (44px) e DEPOIS a
    // faixa com as logos de todas as empresas (56px). Com mais de uma empresa,
    // a principal aparecia sozinha em cima e de novo na faixa.
    //
    // CORREÇÃO: com MAIS de uma empresa o topo não mostra logo isolada — só a
    // faixa. Com UMA empresa, a logo aparece aqui e a faixa é omitida.
    const lgPrinc = logosMap[String(empPrincipal).toLowerCase()]
    const mostrarLogoTopo = nomesEmpresas.length <= 1
    if (mostrarLogoTopo && lgPrinc && lgPrinc.arquivo) {
      html +=
        '<img src="cid:' +
        lgPrinc.arquivo +
        '" alt="' +
        escapeHtml(empPrincipal) +
        ' logomarca" height="44" style="display:inline-block;vertical-align:middle;border:0;height:44px;width:auto;max-width:220px;" />'
    } else if (mostrarLogoTopo) {
      // uma empresa e sem arquivo de logo: nome em texto
      html +=
        '<div style="font-family:' +
        FONTE +
        ';font-size:20px;font-weight:800;letter-spacing:1.5px;color:' +
        CORES.charcoal +
        ';text-transform:uppercase;">' +
        escapeHtml(empPrincipal) +
        '</div>'
    }
    // ---------------------------------------------------------------------
    // 17/11/2026 (d2) — LOGOS DE TODAS AS EMPRESAS NO CABEÇALHO DO CORPO.
    //
    // DIRETIVA: "no cabeçalho do corpo do e-mail deve-se exibir as logos das
    // empresas existentes na lista de tarefas".
    //
    // O cabeçalho mostrava SÓ a logo da empresa principal, embora o e-mail
    // traga tarefas de várias. Agora as logos das empresas presentes no envio
    // aparecem lado a lado (56px, o dobro do tamanho anterior), em faixa
    // própria. Se só houver uma empresa, a faixa é omitida — a logo do topo
    // já a representa.
    // ---------------------------------------------------------------------
    if (nomesEmpresas.length > 1) {
      html +=
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-top:14px;"><tr>'
      for (var le = 0; le < nomesEmpresas.length; le++) {
        var empLogo = nomesEmpresas[le]
        var lgE = logosMap[String(empLogo).toLowerCase()]
        if (!lgE || !lgE.arquivo) continue
        html +=
          '<td style="padding:0 10px;" valign="middle"><img src="cid:' +
          lgE.arquivo +
          '" alt="' +
          escapeHtml(empLogo) +
          ' logomarca" height="56" style="display:block;border:0;height:56px;width:auto;max-width:180px;" /></td>'
      }
      html += '</tr></table>'
    }

    // (a) 18/11/2026 — REMOVIDO o texto "PORTAL DE GESTÃO FOLDBOX".
    //
    // DIRETIVA: "remover do layout do envio de tarefas no corpo do e-mail o
    // texto 'PORTAL DE GESTÃO FOLDBOX' existente abaixo da logomarca".
    //
    // O subtítulo repetia o que a própria logo já informa, e aparecia duplicado
    // quando havia mais de uma empresa. O cabeçalho agora mostra SÓ a(s) logo(s).
    html += '</td></tr>'

    // ===== BLOCO 2 — FAIXA VERDE =====
    html += '<tr><td bgcolor="' + CORES.verde + '" style="padding:22px 24px;">'
    html +=
      '<h1 style="margin:0;font-family:' +
      FONTE +
      ';font-size:19px;line-height:1.3;font-weight:700;color:#FFFFFF;">Acompanhamento de Tarefas</h1>'
    html +=
      '<p style="margin:8px 0 0;font-family:' +
      FONTE +
      ';font-size:12.5px;line-height:1.5;color:#EAF3EB;">Olá, ' +
      escapeHtml(nome || 'Prezado(a)') +
      '. Segue o resumo das tarefas sob sua responsabilidade ou acompanhamento:</p>'
    html += '</td></tr>'

    // ===== BLOCO 3 — KPIs =====
    html += '<tr><td bgcolor="' + CORES.papel + '" style="padding:22px 14px 18px;">'
    html +=
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    const kpis = [
      { v: nTotal, l: 'TAREFAS ATIVAS', c: CORES.texto },
      { v: nVencidas, l: 'VENCIDAS', c: CORES.vermelho },
      { v: nSemPrazo, l: 'SEM PRAZO', c: CORES.ambar },
      { v: nEmDia, l: 'EM DIA', c: CORES.salvia },
    ]
    for (let k = 0; k < kpis.length; k++) {
      const borda = k > 0 ? 'border-left:1px solid ' + CORES.hairline + ';' : ''
      html += '<td align="center" width="25%" style="' + borda + 'padding:0 6px;">'
      html +=
        '<div style="font-family:' +
        FONTE +
        ';font-size:30px;font-weight:800;line-height:1;color:' +
        kpis[k].c +
        ';">' +
        kpis[k].v +
        '</div>'
      html +=
        '<div style="font-family:' +
        FONTE +
        ';font-size:9px;font-weight:700;letter-spacing:0.7px;color:' +
        CORES.texto2 +
        ';margin-top:7px;">' +
        kpis[k].l +
        '</div>'
      html += '</td>'
    }
    html += '</tr></table></td></tr>'

    // ===== BLOCO 4 — CTA =====
    html += '<tr><td align="center" bgcolor="' + CORES.papel + '" style="padding:4px 24px 26px;">'
    html +=
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center">'
    html +=
      '<a href="' +
      escapeHtml(linkPainel) +
      '" style="display:block;width:100%;box-sizing:border-box;background:' +
      CORES.verdeProfundo +
      ';color:#FFFFFF;font-family:' +
      FONTE +
      ';font-size:14px;font-weight:700;text-decoration:none;text-align:center;padding:14px 20px;min-height:44px;line-height:16px;border-radius:999px;">Abrir meu painel de tarefas</a>'
    html += '</td></tr></table>'
    html +=
      '<div style="font-family:' +
      FONTE +
      ';font-size:11px;color:' +
      CORES.texto2 +
      ';margin-top:10px;">ou baixe o PDF anexo</div>'
    html += '</td></tr>'
    html +=
      '<tr><td style="padding:0 24px;"><div style="height:1px;background:' +
      CORES.hairline +
      ';"></div></td></tr>'

    // ===== BLOCO 5 — SEÇÕES =====
    html += '<tr><td bgcolor="' + CORES.papel + '" style="padding:22px 24px 6px;">'
    const tarefasParaPdf = []

    for (let g = 0; g < nomesEmpresas.length; g++) {
      const empNome = nomesEmpresas[g]
      const tList = gruposEmpresas[empNome] || []
      const num = g + 1
      const rotulo = empresaLabel[empNome] || String(empNome).toUpperCase()
      const corSimbolo =
        empNome === 'FoldBox'
          ? CORES.symFoldbox
          : empNome === 'Extrafruti'
            ? CORES.symExtrafruti
            : CORES.symCasafruti

      html +=
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 12px;"><tr>'
      html += '<td bgcolor="' + CORES.offwhite + '" style="padding:12px 14px;border-radius:6px;">'
      // o logo do cadastro já traz o wordmark: a célula mostra SÓ a imagem.
      const lgSec = logosMap[String(empNome).toLowerCase()]
      html += '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
      html += '<td valign="middle">'
      if (lgSec && lgSec.arquivo) {
        // 17/11/2026 (d2) — LOGO DO GRUPO 100% MAIOR (28px → 56px).
        // DIRETIVA: "exibir e aumentar em 100% a logo da empresa no cabeçalho
        // do agrupamento de tarefas por empresa".
        html +=
          '<img src="cid:' +
          lgSec.arquivo +
          '" alt="' +
          escapeHtml(empNome) +
          ' logomarca" height="56" style="display:block;border:0;height:56px;width:auto;max-width:280px;" />'
      } else {
        html +=
          '<div style="display:inline-block;width:26px;height:26px;border-radius:4px;background:' +
          corSimbolo +
          ';vertical-align:middle;"></div>'
        html +=
          '<span style="font-family:' +
          FONTE +
          ';font-size:14px;font-weight:800;letter-spacing:0.8px;color:' +
          CORES.charcoal +
          ';text-transform:uppercase;vertical-align:middle;margin-left:8px;">' +
          escapeHtml(rotulo) +
          '</span>'
      }
      html += '</td>'
      html += '</tr></table>'
      html += '</td>'
      html += '<td align="right" valign="middle" width="90" style="padding-left:8px;">'
      html +=
        '<span style="font-family:' +
        FONTE +
        ';font-size:9px;font-weight:700;letter-spacing:0.6px;color:' +
        CORES.texto2 +
        ';">' +
        num +
        ' · ' +
        escapeHtml(rotulo) +
        '</span> '
      html +=
        '<span style="display:inline-block;min-width:20px;padding:3px 7px;border-radius:999px;background:' +
        CORES.verdeProfundo +
        ';color:#FFFFFF;font-family:' +
        FONTE +
        ';font-size:11px;font-weight:800;">' +
        tList.length +
        '</span>'
      html += '</td></tr></table>'

      // 17/11/2026 (a) — LAYOUT DE TABELA IGUAL AO PDF.
      //
      // DIRETIVA: "o layout da lista/tabela de tarefas do corpo do e-mail deve
      // ser igual ao layout da tabela do PDF em anexo".
      //
      // O PDF usa 5 colunas: TAREFA | PRIOR. | STATUS | VENC. | RESP.
      // O e-mail usava CARDS empilhados. Agora o corpo repete a mesma grade,
      // com as mesmas colunas e a mesma ordem, e cada tarefa é UMA LINHA.
      html +=
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 6px;">'
      html += '<tr>'
      const TH_COL =
        'padding:0 0 4px;border-bottom:1px solid ' +
        CORES.hairline +
        ';font-family:' +
        FONTE +
        ';font-size:8px;font-weight:700;letter-spacing:0.4px;color:' +
        CORES.texto2 +
        ';text-transform:uppercase;'
      html += '<td width="52%" style="' + TH_COL + '">Tarefa</td>'
      html += '<td width="10%" style="' + TH_COL + '">Prior.</td>'
      html += '<td width="16%" style="' + TH_COL + '">Status</td>'
      html += '<td width="12%" style="' + TH_COL + '">Venc.</td>'
      html += '<td width="10%" style="' + TH_COL + '">Resp.</td>'
      html += '</tr>'

      for (let i = 0; i < tList.length; i++) {
        const t = tList[i]
        const titulo = t.getString('titulo') || 'Sem título'
        const desc = t.getString('descricao') || ''
        const status = labelStatus(t.getString('status_kanban') || t.getString('status'))
        const prioP = t.getString('prioridade_p') || 'P2'
        const prioLabel = labelPrioridade(prioP, t.getString('prioridade'))
        const prioBg = corPrioridadeBg(prioP)
        const prioColor = corPrioridadeText(prioP)
        const resp = t.getString('responsavel') || 'Não atribuído'
        const prazoRaw = t.getString('prazo')
        const prazoBR = brData(prazoRaw)
        const atrasada = Boolean(
          prazoRaw && String(prazoRaw).slice(0, 10) < hoje && status !== 'Concluído',
        )
        const dias = atrasada ? diasAtraso(prazoRaw) : 0
        const vinculoTipo = t.getString('vinculo_tipo') || ''
        const recorrencia = t.getString('recorrencia') || ''

        tarefasParaPdf.push({
          titulo: titulo,
          descricao: desc,
          status: status,
          prioLabel: prioLabel,
          responsavel: resp,
          prazoFormatado: prazoBR || 'sem prazo',
          prazoAtrasado: atrasada,
          diasAtraso: dias,
          vinculoTipo: vinculoTipo,
          recorrencia: recorrencia,
          empresa: rotulo,
          empNome: empNome,
          num: num,
        })

        // 17/11/2026 (a) — LINHA DA TABELA, igual ao PDF.
        // Antes daqui saía um CARD; agora sai UMA LINHA com as 5 colunas:
        // TAREFA | PRIOR. | STATUS | VENC. | RESP.
        const TD =
          'padding:7px 0;border-bottom:1px solid ' + CORES.hairline + ';vertical-align:top;'
        html += '<tr>'
        html +=
          '<td width="52%" style="' +
          TD +
          'font-family:' +
          FONTE +
          ';font-size:10.5px;line-height:1.35;color:' +
          CORES.texto +
          ';' +
          (atrasada ? 'border-left:3px solid ' + CORES.vermelho + ';padding-left:7px;' : '') +
          '">' +
          escapeHtml(titulo) +
          (desc
            ? '<div style="font-size:9px;color:' +
              CORES.texto2 +
              ';margin-top:2px;">' +
              escapeHtml(String(desc).split('\\n')[0].slice(0, 90)) +
              '</div>'
            : '') +
          '</td>'
        html +=
          '<td width="10%" style="' +
          TD +
          'font-family:' +
          FONTE +
          ';font-size:9px;color:' +
          CORES.texto2 +
          ';white-space:nowrap;">' +
          escapeHtml(prioLabel.replace(' (P', ' P').replace(')', '')) +
          '</td>'
        html +=
          '<td width="16%" style="' +
          TD +
          'font-family:' +
          FONTE +
          ';font-size:9px;color:#495057;white-space:nowrap;">' +
          escapeHtml(status) +
          '</td>'
        // (c) 17/11/2026 — NÃO exibir "ATRASADA" na coluna VENC.
        html +=
          '<td width="12%" style="' +
          TD +
          'font-family:' +
          FONTE +
          ';font-size:9px;white-space:nowrap;color:' +
          (atrasada ? CORES.vermelho : CORES.texto) +
          ';">' +
          escapeHtml(prazoBR || '—') +
          '</td>'
        html +=
          '<td width="10%" style="' +
          TD +
          'font-family:' +
          FONTE +
          ';font-size:9px;color:' +
          CORES.texto2 +
          ';white-space:nowrap;">' +
          escapeHtml(String(resp).slice(0, 14)) +
          '</td>'
        html += '</tr>'
        if (false) {
          html += '<div style="margin-bottom:7px;">'
          html +=
            '<span style="display:inline-block;padding:3px 8px;border-radius:4px;background:' +
            prioBg +
            ';color:' +
            prioColor +
            ';font-family:' +
            FONTE +
            ';font-size:9.5px;font-weight:800;letter-spacing:0.3px;">' +
            escapeHtml(prioLabel) +
            '</span> <span style="display:inline-block;padding:3px 8px;border-radius:4px;background:' +
            CORES.badgeStatus +
            ';color:#495057;font-family:' +
            FONTE +
            ';font-size:9.5px;font-weight:600;">' +
            escapeHtml(status) +
            '</span>'
          html += '</div>'
          html +=
            '<h3 style="margin:0 0 7px;font-family:' +
            FONTE +
            ';font-size:13.5px;font-weight:700;line-height:1.35;color:' +
            CORES.texto +
            ';">' +
            escapeHtml(titulo) +
            '</h3>'
          if (desc) {
            html +=
              '<div style="margin:0 0 9px;padding:8px 10px;background:' +
              CORES.painel +
              ';border-radius:4px;font-family:' +
              FONTE +
              ';font-size:11.5px;line-height:1.5;color:' +
              CORES.texto2 +
              ';white-space:pre-wrap;">' +
              renderizarDescricaoHtml(desc) +
              '</div>'
          }
          if (vinculoTipo || (recorrencia && recorrencia !== 'Nenhuma')) {
            html += '<div style="margin-bottom:8px;">'
            if (vinculoTipo) {
              html +=
                '<span style="display:inline-block;padding:2px 7px;border-radius:999px;border:1px solid ' +
                CORES.hairline +
                ';font-family:' +
                FONTE +
                ';font-size:9px;color:' +
                CORES.texto2 +
                ';font-weight:600;">' +
                escapeHtml(vinculoTipo) +
                '</span> '
            }
            if (recorrencia && recorrencia !== 'Nenhuma') {
              html +=
                '<span style="display:inline-block;padding:2px 7px;border-radius:999px;border:1px solid ' +
                CORES.hairline +
                ';font-family:' +
                FONTE +
                ';font-size:9px;color:' +
                CORES.texto2 +
                ';font-weight:600;">' +
                escapeHtml(String(recorrencia).toLowerCase()) +
                '</span>'
            }
            html += '</div>'
          }
          // ---------------------------------------------------------------------
          // 17/11/2026 (d1) — RESPONSÁVEL E DATA À DIREITA DO STATUS.
          //
          // DIRETIVA: "mover responsável pela tarefa e depois data para a
          // direita da tag do status no final da linha".
          //
          // Antes: o status ficava numa linha própria no topo e prazo/responsável
          // numa linha separada embaixo. Agora a ÚLTIMA linha do card tem
          //     [prioridade] [status]              responsável · data
          // alinhados na mesma linha, com o texto à direita.
          // A descrição e os vínculos continuam acima.
          // ---------------------------------------------------------------------
          html +=
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
          // bloco esquerdo: prazo em vermelho quando atrasado (sem o rótulo
          // do responsável, que passou para a direita)
          html += '<td valign="bottom" style="font-family:' + FONTE + ';font-size:10.5px;">'
          // (c) 17/11/2026 — removido: a coluna VENC. não exibe mais "ATRASADA".
          // O atraso continua visível pela cor vermelha da data e pela borda
          // esquerda da linha.
          html += '</td>'
          // bloco direito: RESPONSÁVEL e depois DATA
          html +=
            '<td align="right" valign="bottom" style="font-family:' + FONTE + ';font-size:10.5px;">'
          html +=
            '<span style="color:' +
            CORES.texto2 +
            ';font-weight:600;">' +
            escapeHtml(resp) +
            '</span>'
          html += '<span style="color:#D0D0CE;">&nbsp;·&nbsp;</span>'
          if (prazoBR) {
            html +=
              '<span style="color:' +
              (atrasada ? CORES.vermelho : CORES.texto2) +
              ';' +
              (atrasada ? 'font-weight:700;' : '') +
              '">' +
              escapeHtml(prazoBR) +
              '</span>'
          } else {
            html += '<span style="color:' + CORES.ambar + ';font-weight:600;">sem prazo</span>'
          }
          html += '</td>'
          html += '</tr></table>'
          html += '</td></tr></table>'
        } // fim do bloco desativado (layout antigo em card)
      }

      // fecha a tabela de tarefas do agrupamento
      html += '</table>'
    }
    html += '</td></tr>'

    // ===== BLOCO 6 — RODAPÉ =====
    html +=
      '<tr><td style="padding:0 24px;"><div style="height:1px;background:' +
      CORES.hairline +
      ';"></div></td></tr>'
    html +=
      '<tr><td align="center" bgcolor="' + CORES.offwhite + '" style="padding:18px 24px 22px;">'
    html +=
      '<div style="font-family:' +
      FONTE +
      ';font-size:10.5px;line-height:1.6;color:' +
      CORES.texto2 +
      ';">Portal de Gestão Executivo — Extrafruti · Casafruti · FoldBox<br/>Documento gerado para ciência e acompanhamento operacional</div>'
    html += '</td></tr>'
    html += '</table></td></tr></table></body></html>'

    // ===== TEXTO PLANO =====
    let textoPlano = 'ACOMPANHAMENTO DE TAREFAS\n'
    textoPlano +=
      nTotal +
      ' tarefas ativas · ' +
      nVencidas +
      ' vencidas · ' +
      nSemPrazo +
      ' sem prazo · ' +
      nEmDia +
      ' em dia\n\n'
    for (const emp of nomesEmpresas) {
      textoPlano +=
        '=== ' + (empresaLabel[emp] || emp) + ' (' + gruposEmpresas[emp].length + ') ===\n'
      for (const t of gruposEmpresas[emp]) {
        textoPlano += '• ' + (t.getString('titulo') || 'Sem título') + '\n'
        textoPlano +=
          '  ' +
          labelPrioridade(t.getString('prioridade_p'), t.getString('prioridade')) +
          ' · ' +
          labelStatus(t.getString('status_kanban') || t.getString('status')) +
          '\n'
        const p = brData(t.getString('prazo'))
        textoPlano +=
          '  ' + (p || 'Sem prazo definido') + ' · ' + (t.getString('responsavel') || '—') + '\n'
      }
      textoPlano += '\n'
    }
    textoPlano += 'Portal de Gestão Executivo — Extrafruti · Casafruti · FoldBox\n'

    // ================================================================
    // PDF — MESMO BLUEPRINT, A4 RETRATO, 6 BLOCOS
    // Diferença permitida: densidade (tabela) e ausência do CTA.
    // ================================================================
    function gerarPdf(dados) {
      const W = 595.28
      const H = 841.89
      const ML = 34
      const CW = W - ML * 2
      const ops = []
      let y = H
      // 16/11/2026 — BUG CORRIGIDO: `destNome` não existe neste escopo (é da
      // função externa). O ReferenceError matava gerarPdf e o PDF não era
      // anexado (o catch só logava). Agora vem em `dados.destNome`.
      const destNome = String(dados.destNome || 'Prezado(a)')
      const empPrincipal = String(dados.empPrincipal || 'Extrafruti')
      const hoje = String(dados.hoje || new Date().toISOString().slice(0, 10))
      function brData(iso) {
        const v = String(iso || '').slice(0, 10)
        if (!v || v.length < 10) return ''
        return v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4)
      }

      function esc(t) {
        return String(t == null ? '' : t)
          .replace(/\\/g, '\\\\')
          .replace(/\(/g, '\\(')
          .replace(/\)/g, '\\)')
      }
      // WinAnsi: acentos via escape octal (mesmo tratamento já validado)
      const AC = {
        Á: '\\301',
        À: '\\300',
        Â: '\\302',
        Ã: '\\303',
        Ä: '\\304',
        á: '\\341',
        à: '\\340',
        â: '\\342',
        ã: '\\343',
        ä: '\\344',
        É: '\\311',
        Ê: '\\312',
        é: '\\351',
        ê: '\\352',
        Í: '\\315',
        í: '\\355',
        Ó: '\\323',
        Ô: '\\324',
        Õ: '\\325',
        ó: '\\363',
        ô: '\\364',
        õ: '\\365',
        Ú: '\\332',
        ú: '\\372',
        Ç: '\\307',
        ç: '\\347',
        Ñ: '\\321',
        ñ: '\\361',
        '·': '\\267',
        '—': '\\227',
        '–': '\\226',
        '“': '\\223',
        '”': '\\224',
        '’': '\\222',
        '…': '\\205',
        '•': '\\225',
      }
      function txt(s) {
        let out = ''
        for (let i = 0; i < s.length; i++) {
          const ch = s[i]
          out += AC[ch] !== undefined ? AC[ch] : ch
        }
        return out
      }
      function hexCor(h) {
        const v = String(h).replace('#', '')
        return [
          parseInt(v.substring(0, 2), 16) / 255,
          parseInt(v.substring(2, 4), 16) / 255,
          parseInt(v.substring(4, 6), 16) / 255,
        ]
      }
      function rect(x, yy, w, h, cor) {
        const c = hexCor(cor)
        ops.push(c[0].toFixed(4) + ' ' + c[1].toFixed(4) + ' ' + c[2].toFixed(4) + ' rg')
        ops.push(
          x.toFixed(2) + ' ' + yy.toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re f',
        )
      }
      function linha(x1, y1, x2, y2, cor, esp) {
        const c = hexCor(cor)
        ops.push(c[0].toFixed(4) + ' ' + c[1].toFixed(4) + ' ' + c[2].toFixed(4) + ' RG')
        ops.push((esp || 0.6).toFixed(2) + ' w')
        ops.push(
          x1.toFixed(2) +
            ' ' +
            y1.toFixed(2) +
            ' m ' +
            x2.toFixed(2) +
            ' ' +
            y2.toFixed(2) +
            ' l S',
        )
      }
      function texto(x, yy, s, tam, cor, bold) {
        const c = hexCor(cor)
        ops.push('BT')
        ops.push('/' + (bold ? 'F2' : 'F1') + ' ' + tam.toFixed(2) + ' Tf')
        ops.push(c[0].toFixed(4) + ' ' + c[1].toFixed(4) + ' ' + c[2].toFixed(4) + ' rg')
        ops.push(x.toFixed(2) + ' ' + yy.toFixed(2) + ' Td')
        ops.push('(' + txt(s) + ') Tj')
        ops.push('ET')
      }
      function larguraTexto(s, tam, bold) {
        return String(s).length * tam * (bold ? 0.56 : 0.5)
      }
      function quebrar(s, larg, tam, bold) {
        const palavras = String(s).split(/\s+/)
        const linhas = []
        let atual = ''
        for (const p of palavras) {
          const teste = atual ? atual + ' ' + p : p
          if (larguraTexto(teste, tam, bold) > larg) {
            if (atual) linhas.push(atual)
            atual = p
          } else {
            atual = teste
          }
        }
        if (atual) linhas.push(atual)
        return linhas
      }

      // ---------- BLOCO 1 — CABEÇALHO ----------
      // ------------------------------------------------------------------
      // 17/11/2026 (b) — CABEÇALHO DO PDF COM AS LOGOS DAS EMPRESAS LISTADAS.
      //
      // DIRETIVA: "no cabeçalho deve exibir a logomarca das empresas com
      // tarefas listadas ao invés do nome FOLDBOX".
      //
      // Desenho cada logo disponível lado a lado (56pt de altura). As que não
      // puderem ser embutidas (PNG) aparecem como texto, logo abaixo, para
      // nenhuma empresa ficar sem identificação.
      // ------------------------------------------------------------------
      rect(0, H - 96, W, 96, '#FBFAF7')

      const empComImagem = Object.keys(dados.imagensPorEmpresa || {})
      let xLogo = ML
      let alturasMax = 0
      if (empComImagem.length) {
        for (let li = 0; li < dados.secoes.length; li++) {
          const secL = dados.secoes[li]
          const imgL = dados.imagensPorEmpresa[secL.empNome]
          if (!imgL) continue
          // 56pt de altura, largura proporcional à imagem, limitada a 150pt
          const altL = 56
          const largL = Math.min(150, (imgL.largura / imgL.altura) * altL)
          ops.push(
            'q ' +
              largL.toFixed(2) +
              ' 0 0 ' +
              altL.toFixed(2) +
              ' ' +
              xLogo.toFixed(2) +
              ' ' +
              (H - 84).toFixed(2) +
              ' cm /' +
              imgL.nome +
              ' Do Q',
          )
          xLogo += largL + 14
          alturasMax = altL
        }
      }

      // nomes das empresas que não têm imagem no PDF
      const semImagem = []
      for (let si = 0; si < dados.secoes.length; si++) {
        if (!dados.imagensPorEmpresa[dados.secoes[si].empNome]) {
          semImagem.push(dados.secoes[si].rotulo)
        }
      }
      if (semImagem.length) {
        texto(ML, H - 34, semImagem.join(' · '), 11, '#333333', true)
        if (empComImagem.length) {
          texto(ML, H - 70, 'Painel de Tarefas', 7.5, '#6B6B68', false)
        }
      }
      if (!empComImagem.length && !semImagem.length) {
        texto(ML, H - 34, empPrincipal.toUpperCase(), 17, '#333333', true)
      }
      // 18/11/2026 — o subtítulo "PORTAL DE GESTÃO <EMPRESA>" saiu do PDF
      // também: a logo já identifica. Fica só a identificação do documento.
      texto(W - ML - 110, H - 34, 'Painel de Tarefas', 8.5, '#6B6B68', false)
      texto(W - ML - 110, H - 47, brData(hoje), 8.5, '#6B6B68', false)

      // ---------- BLOCO 2 — FAIXA VERDE ----------
      rect(0, H - 148, W, 52, '#1E6B28')
      texto(ML, H - 118, 'Acompanhamento de Tarefas', 13, '#FFFFFF', true)
      const saud =
        'Olá, ' +
        (destNome || 'Prezado(a)') +
        '. Segue o resumo das tarefas sob sua responsabilidade ou acompanhamento:'
      const ls = quebrar(saud, CW, 8.5, false)
      for (let i = 0; i < ls.length && i < 2; i++) {
        texto(ML, H - 133 - i * 10, ls[i], 8.5, '#EAF3EB', false)
      }
      y = H - 168

      // ---------- BLOCO 3 — KPIs ----------
      const kp = [
        { v: String(dados.nTotal), l: 'TAREFAS ATIVAS', c: '#1C1B1A' },
        { v: String(dados.nVencidas), l: 'VENCIDAS', c: '#C92A2A' },
        { v: String(dados.nSemPrazo), l: 'SEM PRAZO', c: '#C08A2E' },
        { v: String(dados.nEmDia), l: 'EM DIA', c: '#7F9A85' },
      ]
      const colW = CW / 4
      for (let i = 0; i < 4; i++) {
        const cx = ML + colW * i + colW / 2
        texto(cx - larguraTexto(kp[i].v, 20, true) / 2, y - 16, kp[i].v, 20, kp[i].c, true)
        texto(cx - larguraTexto(kp[i].l, 6.2, true) / 2, y - 28, kp[i].l, 6.2, '#6B6B68', true)
        if (i > 0) linha(ML + colW * i, y - 4, ML + colW * i, y - 30, '#E4E0D8', 0.6)
      }
      y -= 44
      linha(ML, y, W - ML, y, '#E4E0D8', 0.7)
      y -= 14

      // ---------- BLOCO 5 — SEÇÕES (bloco 4 não existe no PDF) ----------
      for (let g = 0; g < dados.secoes.length; g++) {
        const sec = dados.secoes[g]

        // faixa clara da empresa — 17/11/2026 (d2): a faixa cresceu para
        // acomodar a LOGO EM 56px (o dobro do tamanho anterior), como no
        // corpo do e-mail. Sem a imagem disponível, cai no texto de sempre.
        const imgSec = dados.imagensPorEmpresa && dados.imagensPorEmpresa[sec.empNome]
        const altFaixa = imgSec ? 54 : 26
        rect(ML - 6, y - altFaixa, CW + 12, altFaixa, '#FBFAF7')
        if (imgSec) {
          // logo 56pt de altura, largura proporcional (limitada a 150pt)
          const largSec = Math.min(150, (imgSec.largura / imgSec.altura) * 56)
          ops.push(
            'q ' +
              largSec.toFixed(2) +
              ' 0 0 56.00 ' +
              ML.toFixed(2) +
              ' ' +
              (y - altFaixa + 4).toFixed(2) +
              ' cm /' +
              imgSec.nome +
              ' Do Q',
          )
          texto(
            ML + largSec + 10,
            y - altFaixa + 24,
            sec.num + ' · ' + sec.rotulo,
            10,
            '#333333',
            true,
          )
        } else {
          texto(ML, y - 17, sec.num + ' · ' + sec.rotulo, 10, '#333333', true)
        }
        texto(W - ML - 26, y - altFaixa / 2 - 4, String(sec.tarefas.length), 11, '#0F4C3A', true)
        y -= altFaixa + 6

        // cabeçalho da tabela
        const colX = [ML, ML + 232, ML + 296, ML + 372, ML + 440]
        texto(colX[0], y, 'TAREFA', 6, '#6B6B68', true)
        texto(colX[1], y, 'PRIOR.', 6, '#6B6B68', true)
        texto(colX[2], y, 'STATUS', 6, '#6B6B68', true)
        texto(colX[3], y, 'VENC.', 6, '#6B6B68', true)
        texto(colX[4], y, 'RESP.', 6, '#6B6B68', true)
        y -= 6
        linha(ML, y, W - ML, y, '#E4E0D8', 0.5)
        y -= 11

        for (const t of sec.tarefas) {
          const tl = quebrar(t.titulo, 222, 7.8, false)
          const alt = Math.max(1, tl.length) * 9.5 + 4

          for (let li = 0; li < tl.length; li++) {
            texto(colX[0], y - li * 9.5, tl[li], 7.8, '#1C1B1A', false)
          }
          texto(
            colX[1],
            y,
            t.prioLabel.replace(' (P', ' P').replace(')', ''),
            6.8,
            '#1C1B1A',
            false,
          )
          texto(colX[2], y, t.status, 6.8, '#495057', false)
          // (c) 18/11/2026 — NÃO exibir "ATRASADA" na coluna VENC. do PDF.
          // A data em vermelho já sinaliza o atraso.
          if (t.prazoAtrasado) {
            texto(colX[3], y, t.prazoFormatado, 6.8, '#C92A2A', true)
          } else {
            texto(colX[3], y, t.prazoFormatado, 6.8, '#1C1B1A', false)
          }
          texto(colX[4], y, String(t.responsavel).substring(0, 12), 6.8, '#6B6B68', false)

          y -= alt
          linha(ML, y + 3, W - ML, y + 3, '#F0EDE7', 0.4)
        }
        y -= 10
      }

      // ---------- BLOCO 6 — RODAPÉ ----------
      linha(ML, 62, W - ML, 62, '#E4E0D8', 0.7)
      texto(
        ML,
        48,
        'Portal de Gestão Executivo — Extrafruti · Casafruti · FoldBox',
        7,
        '#6B6B68',
        false,
      )
      texto(
        ML,
        38,
        'Documento gerado para ciência e acompanhamento operacional',
        7,
        '#6B6B68',
        false,
      )
      const pag = 'Página 1 de 1'
      texto(W - ML - larguraTexto(pag, 7, false), 38, pag, 7, '#6B6B68', false)

      // ---------- montagem do PDF ----------
      //
      // 17/11/2026 (d2) — imagens como XObject.
      // A numeração é fixa: 1 catálogo, 2 páginas, 3 página, 4-5 fontes,
      // 6 conteúdo, e as LOGOS a partir de 7. O dicionário /XObject da
      // página lista cada logo pelo nome usado no operador Do.
      const content = ops.join('\n')
      const imgsLista = dados.imagensPorEmpresa
        ? Object.keys(dados.imagensPorEmpresa).map(function (k) {
            return dados.imagensPorEmpresa[k]
          })
        : []

      const objs = []
      objs.push('<< /Type /Catalog /Pages 2 0 R >>')
      objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')

      let xobjDict = ''
      for (let ii = 0; ii < imgsLista.length; ii++) {
        xobjDict += '/' + imgsLista[ii].nome + ' ' + (7 + ii) + ' 0 R '
      }

      objs.push(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
          W.toFixed(2) +
          ' ' +
          H.toFixed(2) +
          '] ' +
          '/Resources << /Font << /F1 4 0 R /F2 5 0 R >>' +
          (xobjDict ? ' /XObject << ' + xobjDict + '>>' : '') +
          ' >> /Contents 6 0 R >>',
      )
      objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
      objs.push(
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      )
      objs.push('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream')

      // ------------------------------------------------------------------
      // 17/11/2026 (b) — IMAGENS JPEG COMO XOBJECT.
      //
      // JPEG entra com /Filter /DCTDecode: o stream É o próprio arquivo, sem
      // precisar decodificar pixels. Isso funciona em qualquer leitor de PDF.
      // PNG continua de fora (exigiria descompressão + desfazer filtros).
      // ------------------------------------------------------------------
      for (let ii = 0; ii < imgsLista.length; ii++) {
        const img = imgsLista[ii]
        let bin = ''

        if (img.tipo === 'rgb') {
          // PNG já decodificado → pixels RGB crus, sem filtro
          const arr = img.rgb
          for (let bi = 0; bi < arr.length; bi++) bin += String.fromCharCode(arr[bi])
          objs.push(
            '<< /Type /XObject /Subtype /Image /Width ' +
              img.largura +
              ' /Height ' +
              img.altura +
              ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ' +
              bin.length +
              ' >>\nstream\n' +
              bin +
              '\nendstream',
          )
        } else {
          // JPEG: o stream É o arquivo; o leitor decodifica
          for (let bi = 0; bi < img.bytes.length; bi++) {
            bin += String.fromCharCode(img.bytes[bi] & 0xff)
          }
          objs.push(
            '<< /Type /XObject /Subtype /Image /Width ' +
              img.largura +
              ' /Height ' +
              img.altura +
              ' /ColorSpace /' +
              (img.canais === 1 ? 'DeviceGray' : 'DeviceRGB') +
              ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
              bin.length +
              ' >>\nstream\n' +
              bin +
              '\nendstream',
          )
        }
      }

      let pdf = '%PDF-1.4\n'
      const offs = []
      for (let i = 0; i < objs.length; i++) {
        offs.push(pdf.length)
        pdf += i + 1 + ' 0 obj\n' + objs[i] + '\nendobj\n'
      }
      const xref = pdf.length
      pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n'
      for (const o of offs) {
        pdf += String(o).padStart(10, '0') + ' 00000 n \n'
      }
      pdf +=
        'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF'
      return pdf
    }

    // ---------------------------------------------------------------------
    // 17/11/2026 (d2) — LOGOS DENTRO DO PDF.
    //
    // O PDF era gerado SÓ com fontes: nenhuma imagem era embutida, então as
    // logos nunca apareciam no anexo. Aqui as logos das empresas do envio são
    // lidas do storage e embutidas como XObject de imagem (PNG).
    //
    // O bloco 5 consulta `imagensPorEmpresa` para desenhar a logo no cabeçalho
    // de cada agrupamento, no dobro do tamanho anterior (56pt).
    // ---------------------------------------------------------------------
    // LIMITAÇÃO: o PDF mantém o cabeçalho por empresa em TEXTO. Embutir PNG
    // exigiria decodificar para RGB e recomprimir em zlib; fazer isso "na mão"
    // corromperia o arquivo. A logo aparece no CORPO DO E-MAIL (cid:).
    // Quando houver decodificador de PNG no runtime, este mapa passa a ser
    // preenchido e o bloco 5 desenha a imagem automaticamente.
    // ---------------------------------------------------------------------
    // 17/11/2026 (b) — LOGOS NO PDF.
    //
    // DIRETIVA: "o pdf anexado não está exibindo a logomarca das empresas no
    // agrupamento de tarefas por empresa e, no cabeçalho, deve exibir a
    // logomarca das empresas com tarefas listadas ao invés do nome FOLDBOX".
    //
    // O PDF era gerado SÓ com fontes. Para embutir imagem o formato precisa
    // ser aceito pelo leitor SEM conversão:
    //   · JPEG → /Filter /DCTDecode: o stream É o próprio arquivo, com
    //            largura/altura lidas do marcador SOF. Funciona direto.
    //   · PNG  → exigiria descomprimir e desfazer os filtros de scanline
    //            (não disponível no JSVM) — fica de fora e cai no texto.
    //
    // Leio o arquivo e classifico; só JPEG entra em imagensPorEmpresa.
    // ---------------------------------------------------------------------
    const imagensPorEmpresa = {}
    try {
      for (const empLogo of nomesEmpresas) {
        const lg = logosMap[String(empLogo).toLowerCase()]
        if (!lg) continue

        // ------------------------------------------------------------------
        // (b) 18/11/2026 — USAR O ARQUIVO JPEG, NÃO O PNG.
        //
        // O cadastro de logomarcas passou a ter `logo_jpeg` (migração 130).
        // A ordem de preferência é:
        //   1. logo_jpeg  → já é JPEG, entra direto no PDF
        //   2. logo       → se por acaso já for JPEG, também serve
        // Sem nenhum dos dois em JPEG, a empresa cai no cabeçalho em texto.
        // ------------------------------------------------------------------
        const nomeJpeg = String(lg.arquivoJpeg || '')
        const nomeOriginal = String(lg.arquivo || '')
        let arquivoUsado = nomeJpeg || nomeOriginal
        if (!arquivoUsado) continue

        try {
          const caminho = $filepath.join(
            $app.dataDir(),
            'storage',
            'pbc_3701359284',
            String(lg.recId),
            arquivoUsado,
          )
          let b = null
          try {
            b = $os.readFile(caminho)
          } catch (_) {
            b = null
          }

          // se o arquivo preferido não abriu, tenta o original
          if ((!b || b.length < 4) && nomeOriginal && arquivoUsado !== nomeOriginal) {
            try {
              const caminho2 = $filepath.join(
                $app.dataDir(),
                'storage',
                'pbc_3701359284',
                String(lg.recId),
                nomeOriginal,
              )
              b = $os.readFile(caminho2)
              arquivoUsado = nomeOriginal
            } catch (_) {}
          }
          if (!b || b.length < 4) continue

          // ---- 18/11/2026: PNG passa a ser decodificado ----
          const ehPngL = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
          if (ehPngL) {
            // 18/11/2026 — decodificador INLINE.
            // O `require(__hooks + '/png_decoder.js')` dava
            // "GoError: Invalid module": o JSVM não carrega módulo externo
            // dessa forma. As funções vivem dentro deste callback.
            const decL = decodificarPngLocal(new Uint8Array(b))
            const redL = reduzirRgbLocal(decL, 200)
            imagensPorEmpresa[empLogo] = {
              nome: 'Logo' + Object.keys(imagensPorEmpresa).length,
              tipo: 'rgb',
              rgb: redL.rgb,
              largura: redL.largura,
              altura: redL.altura,
              larguraPdf: 56,
              alturaPdf: 56,
            }
            console.log(
              '[tarefas/enviar] logo PDF ' +
                empLogo +
                ': PNG ' +
                decL.largura +
                'x' +
                decL.altura +
                ' -> ' +
                redL.largura +
                'x' +
                redL.altura,
            )
            continue
          }

          // JPEG: FF D8
          if (!(b[0] === 0xff && b[1] === 0xd8)) {
            console.log('[tarefas/enviar] logo ' + empLogo + ': não é JPEG (PDF usa texto)')
            continue
          }

          // dimensões: varre os marcadores até um SOFn
          let larg = 0
          let alt = 0
          let i2 = 2
          while (i2 < b.length - 9) {
            if (b[i2] !== 0xff) {
              i2++
              continue
            }
            const mk = b[i2 + 1]
            if (
              (mk >= 0xc0 && mk <= 0xc3) ||
              (mk >= 0xc5 && mk <= 0xc7) ||
              (mk >= 0xc9 && mk <= 0xcb) ||
              (mk >= 0xcd && mk <= 0xcf)
            ) {
              alt = (b[i2 + 5] << 8) | b[i2 + 6]
              larg = (b[i2 + 7] << 8) | b[i2 + 8]
              break
            }
            const tam = (b[i2 + 2] << 8) | b[i2 + 3]
            i2 += 2 + tam
          }
          if (!larg || !alt) continue

          // cada canal: JPEG pode ser grayscale ou YCbCr (3 canais)
          let canais = 3
          let j3 = 2
          while (j3 < b.length - 9) {
            if (b[j3] !== 0xff) {
              j3++
              continue
            }
            const mk3 = b[j3 + 1]
            if (
              (mk3 >= 0xc0 && mk3 <= 0xc3) ||
              (mk3 >= 0xc5 && mk3 <= 0xc7) ||
              (mk3 >= 0xc9 && mk3 <= 0xcb) ||
              (mk3 >= 0xcd && mk3 <= 0xcf)
            ) {
              canais = b[j3 + 9]
              break
            }
            j3 += 2 + ((b[j3 + 2] << 8) | b[j3 + 3])
          }

          imagensPorEmpresa[empLogo] = {
            nome: 'Logo' + Object.keys(imagensPorEmpresa).length,
            bytes: b,
            largura: larg,
            altura: alt,
            canais: canais === 1 ? 1 : 3,
            larguraPdf: 56,
            alturaPdf: 56,
          }
          console.log('[tarefas/enviar] logo PDF ' + empLogo + ': JPEG ' + larg + 'x' + alt)
        } catch (errIg) {
          console.log('[tarefas/enviar] logo ' + empLogo + ': ' + String(errIg).slice(0, 100))
        }
      }
    } catch (_) {}
    marco('logos no PDF: ' + Object.keys(imagensPorEmpresa).length)

    // ---- dados do PDF ----
    const secoesPdf = []
    for (let g = 0; g < nomesEmpresas.length; g++) {
      const empNome = nomesEmpresas[g]
      const tList = gruposEmpresas[empNome] || []
      const arr = []
      for (const t of tList) {
        const status = labelStatus(t.getString('status_kanban') || t.getString('status'))
        const prazoRaw = t.getString('prazo')
        const prazoBR = brData(prazoRaw)
        const atrasada = Boolean(
          prazoRaw && String(prazoRaw).slice(0, 10) < hoje && status !== 'Concluído',
        )
        arr.push({
          titulo: t.getString('titulo') || 'Sem título',
          prioLabel: labelPrioridade(t.getString('prioridade_p'), t.getString('prioridade')),
          status: status,
          prazoFormatado: prazoBR || 'sem prazo',
          prazoAtrasado: atrasada,
          responsavel: t.getString('responsavel') || '—',
        })
      }
      secoesPdf.push({
        num: g + 1,
        empNome: empNome,
        rotulo: empresaLabel[empNome] || String(empNome).toUpperCase(),
        tarefas: arr,
      })
    }

    let pdfStr = null
    try {
      pdfStr = gerarPdf({
        nTotal: nTotal,
        nVencidas: nVencidas,
        nSemPrazo: nSemPrazo,
        nEmDia: nEmDia,
        secoes: secoesPdf,
        imagensPorEmpresa: imagensPorEmpresa,
        destNome: nome || destinatarios[0] ? String(destinatarios[0].nome || nome || '') : '',
        empPrincipal: empPrincipal,
        hoje: hoje,
      })
      marco('PDF gerado: ' + (pdfStr ? pdfStr.length : 0) + ' bytes')
    } catch (errPdf) {
      console.warn('[tarefas/enviar] PDF falhou: ' + String(errPdf).slice(0, 180))
    }

    // ================================================================
    // ENVIO
    // ================================================================
    let senderFallback = 'portalpge@extrafruti.com.br'
    try {
      const cfgRem = $app.findFirstRecordByFilter(
        'integracoes_config',
        'integracao = "email_remetente"',
      )
      const c = cfgRem.get('config') || {}
      if (c && (c.remetente || c.email_remetente)) {
        senderFallback = String(c.remetente || c.email_remetente)
      }
    } catch (_) {}
    try {
      const ss = $app.settings()
      if (!senderFallback && ss.meta.senderAddress) senderFallback = String(ss.meta.senderAddress)
    } catch (_) {}

    const senderName = 'PGE - Portal Gestão ' + empPrincipal

    // logos inline (cid) para as seções
    const inlineMap = {}
    const readers = []
    for (const chave of Object.keys(logosMap)) {
      const lg = logosMap[chave]
      if (!lg || !lg.arquivo) continue
      try {
        const caminho = $filepath.join(
          $app.dataDir(),
          'storage',
          'pbc_3701359284',
          String(lg.recId),
          String(lg.arquivo),
        )
        const f = $filesystem.fileFromPath(caminho)
        if (!f) continue
        const rd = f.reader.open()
        inlineMap[String(lg.arquivo)] = rd
        readers.push(rd)
      } catch (_) {}
    }

    const enviados = []
    const erros = []
    const pdfNome =
      'Tarefas_' +
      empPrincipal.replace(/[^a-zA-Z0-9]/g, '_') +
      '_' +
      hoje.replace(/-/g, '') +
      '.pdf'

    marco('logos inline: ' + Object.keys(inlineMap).length)

    for (const d of destinatarios) {
      const email = String(d.email || '').trim()
      if (!email || email.indexOf('@') < 0) {
        erros.push({ email: email || '(vazio)', erro: 'E-mail inválido' })
        continue
      }
      marco('enviando para ' + email)
      let pdfReader = null
      try {
        // ----------------------------------------------------------------
        // 16/11/2026 — CAUSA DO 500 (provada no log):
        //   [PANIC RECOVER] assignment to entry in nil map
        //
        // No JSVM do PocketBase, `new MailerMessage({...})` cria os maps
        // `attachments` e `inlineAttachments` NIL. Fazer depois:
        //     msg.attachments[nome] = reader
        // estoura o panic do Go ("assignment to entry in nil map") e o
        // servidor devolve 500 genérico.
        //
        // CORREÇÃO: os maps vão JÁ PREENCHIDOS no construtor. Nada de
        // atribuir chave depois de criar a mensagem.
        // ----------------------------------------------------------------
        const anexosMap = {}
        if (pdfStr) {
          try {
            const fo = $filesystem.fileFromBytes(pdfStr, pdfNome)
            if (fo && fo.reader) {
              pdfReader = fo.reader.open()
              anexosMap[pdfNome] = pdfReader
            } else {
              console.log('[tarefas/enviar] fileFromBytes não devolveu reader')
            }
          } catch (errAnexo) {
            console.log('[tarefas/enviar] anexo do PDF falhou: ' + String(errAnexo).slice(0, 180))
          }
        } else {
          console.log('[tarefas/enviar] pdfStr vazio — PDF não gerado')
        }

        const msg = new MailerMessage({
          from: { address: senderFallback, name: senderName },
          to: [{ address: email }],
          subject: assunto,
          html: html,
          text: textoPlano,
          attachments: anexosMap,
          inlineAttachments: inlineMap,
        })
        $app.newMailClient().send(msg)
        marco('enviado para ' + email)
        enviados.push({ email: email, ok: true })
        try {
          const colE = $app.findCollectionByNameOrId('emails')
          const rE = new Record(colE)
          rE.set('para', email)
          rE.set('assunto', assunto)
          rE.set('corpo', textoPlano.slice(0, 20000))
          rE.set('status', 'enviado')
          rE.set('erro', '')
          $app.save(rE)
        } catch (_) {}
      } catch (err) {
        const m = String(err).slice(0, 300)
        console.log('[tarefas/enviar] FALHA para ' + email + ': ' + m)
        erros.push({ email: email, erro: m })
        try {
          const colE = $app.findCollectionByNameOrId('emails')
          const rE = new Record(colE)
          rE.set('para', email)
          rE.set('assunto', assunto)
          rE.set('corpo', textoPlano.slice(0, 20000))
          rE.set('status', 'erro')
          rE.set('erro', m)
          $app.save(rE)
        } catch (_) {}
      } finally {
        try {
          if (pdfReader) pdfReader.close()
        } catch (_) {}
      }
    }

    for (const rd of readers) {
      try {
        rd.close()
      } catch (_) {}
    }

    // 16/11/2026 — A UI lê `ok` (TarefasEnviarPopover). Eu devolvia só
    // `success`, então o toast era SEMPRE "Falha no envio" mesmo quando os
    // e-mails saíam (o print mostra o e-mail chegando e o toast vermelho
    // ao mesmo tempo). Agora devolvo os dois campos.
    return e.json(200, {
      ok: erros.length === 0 && enviados.length > 0,
      success: erros.length === 0 && enviados.length > 0,
      enviados: enviados.length,
      detalhe_enviados: enviados,
      erros: erros,
      total_tarefas: listaFinalTarefas.length,
      kpis: { total: nTotal, vencidas: nVencidas, semPrazo: nSemPrazo, emDia: nEmDia },
      secoes: secoesPdf.map((s) => ({ empresa: s.rotulo, qtd: s.tarefas.length })),
      html_bytes: html.length,
      pdf_bytes: pdfStr ? pdfStr.length : 0,
      pdf_gerado: !!pdfStr,
    })
  },
  $apis.requireAuth(),
)
