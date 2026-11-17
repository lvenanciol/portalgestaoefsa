// ============================================================================
// DECODIFICADOR PNG EM JAVASCRIPT PURO (18/11/2026)
//
// POR QUE ESTE ARQUIVO EXISTE SEPARADO:
// O JSVM do PocketBase executa cada callback em um pool de VM separado e NÃO
// enxerga declarações de topo do arquivo de hook (o QA do build acusa "Hook
// scoping error"). A solução suportada é um módulo CommonJS carregado com
// require(__hooks + '/png_decoder.js') de dentro do callback.
//
// PARA QUE SERVE:
// O PDF gerado em tarefas_enviar embute imagem como stream de pixels. As
// logomarcas do cadastro são PNG, e um PNG não pode ser jogado cru no PDF: o
// conteúdo é comprimido em zlib e cada linha tem filtro de scanline. Aqui:
//   inflate (blocos armazenado / fixo / dinâmico) + unfilter (None/Sub/Up/
//   Average/Paeth) + transparência achatada sobre branco → RGB.
//
// VALIDADO localmente contra RGB, RGBA, tons de cinza, paleta e uma imagem
// real de 2996x1600: 0 diferenças de pixel contra a referência.
// ============================================================================

function buildHuffman(lengths) {
  var max = 0
  for (var i = 0; i < lengths.length; i++) if (lengths[i] > max) max = lengths[i]
  var offs = new Array(max + 1).fill(0)
  for (var j = 0; j < lengths.length; j++) offs[lengths[j]]++
  offs[0] = 0
  var sum = new Array(max + 1).fill(0)
  for (var k = 1; k <= max; k++) sum[k] = sum[k - 1] + offs[k - 1]
  var symbol = new Array(lengths.length)
  for (var m = 0; m < lengths.length; m++) {
    if (lengths[m]) symbol[sum[lengths[m]]++] = m
  }
  return { symbol: symbol, offs: offs, max: max }
}

function inflateRaw(data) {
  var pos = 0
  var bitBuf = 0
  var bitCnt = 0

  function bits(n) {
    while (bitCnt < n) {
      if (pos >= data.length) throw new Error('fim inesperado')
      bitBuf |= data[pos++] << bitCnt
      bitCnt += 8
    }
    var v = bitBuf & ((1 << n) - 1)
    bitBuf >>>= n
    bitCnt -= n
    return v
  }

  function decodeSym(h) {
    var code = 0
    var first = 0
    var index = 0
    for (var len = 1; len <= h.max; len++) {
      code |= bits(1)
      var count = h.offs[len]
      if (code - first < count) return h.symbol[index + (code - first)]
      index += count
      first = (first + count) << 1
      code <<= 1
    }
    throw new Error('simbolo invalido')
  }

  var LBASE = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
    163, 195, 227, 258,
  ]
  var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
  var DBASE = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
    3073, 4097, 6145, 8193, 12289, 16385, 24577,
  ]
  var DEXT = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13,
    13,
  ]

  var out = []
  var final = 0

  function lerBloco(litH, distH) {
    for (;;) {
      var sym = decodeSym(litH)
      if (sym === 256) break
      if (sym < 256) {
        out.push(sym)
      } else {
        var li = sym - 257
        var len = LBASE[li] + (LEXT[li] ? bits(LEXT[li]) : 0)
        var ds = decodeSym(distH)
        var dist = DBASE[ds] + (DEXT[ds] ? bits(DEXT[ds]) : 0)
        var start = out.length - dist
        for (var i = 0; i < len; i++) out.push(out[start + i])
      }
    }
  }

  while (!final) {
    final = bits(1)
    var type = bits(2)

    if (type === 0) {
      bitBuf = 0
      bitCnt = 0
      var lenArm = data[pos] | (data[pos + 1] << 8)
      pos += 4
      for (var a = 0; a < lenArm; a++) out.push(data[pos++])
    } else if (type === 1) {
      var ll = new Array(288)
      for (var b1 = 0; b1 < 144; b1++) ll[b1] = 8
      for (var b2 = 144; b2 < 256; b2++) ll[b2] = 9
      for (var b3 = 256; b3 < 280; b3++) ll[b3] = 7
      for (var b4 = 280; b4 < 288; b4++) ll[b4] = 8
      var dl = new Array(30).fill(5)
      lerBloco(buildHuffman(ll), buildHuffman(dl))
    } else if (type === 2) {
      var hlit = bits(5) + 257
      var hdist = bits(5) + 1
      var hclen = bits(4) + 4
      var ordem = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
      var cl = new Array(19).fill(0)
      for (var c1 = 0; c1 < hclen; c1++) cl[ordem[c1]] = bits(3)
      var clH = buildHuffman(cl)
      var lengths = []
      while (lengths.length < hlit + hdist) {
        var s2 = decodeSym(clH)
        if (s2 < 16) lengths.push(s2)
        else if (s2 === 16) {
          var prev = lengths[lengths.length - 1]
          var rep1 = 3 + bits(2)
          for (var d1 = 0; d1 < rep1; d1++) lengths.push(prev)
        } else if (s2 === 17) {
          var rep2 = 3 + bits(3)
          for (var d2 = 0; d2 < rep2; d2++) lengths.push(0)
        } else {
          var rep3 = 11 + bits(7)
          for (var d3 = 0; d3 < rep3; d3++) lengths.push(0)
        }
      }
      lerBloco(buildHuffman(lengths.slice(0, hlit)), buildHuffman(lengths.slice(hlit)))
    } else {
      throw new Error('bloco invalido')
    }
  }

  return Uint8Array.from(out)
}

function paeth(a, b, c) {
  var p = a + b - c
  var pa = Math.abs(p - a)
  var pb = Math.abs(p - b)
  var pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** PNG → { largura, altura, rgb } com transparência sobre fundo branco. */
function decodificarPng(bytes) {
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) {
    throw new Error('nao e PNG')
  }

  var pos = 8
  var largura = 0
  var altura = 0
  var bitDepth = 8
  var colorType = 6
  var interlace = 0
  var idat = []
  var paleta = null
  var trnsPaleta = null

  while (pos < bytes.length) {
    var len = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]
    var tipo = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7])
    var inicio = pos + 8

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
      for (var p1 = 0; p1 < len; p1++) paleta[p1] = bytes[inicio + p1]
    } else if (tipo === 'tRNS') {
      if (colorType === 3) {
        trnsPaleta = new Uint8Array(len)
        for (var t1 = 0; t1 < len; t1++) trnsPaleta[t1] = bytes[inicio + t1]
      }
    } else if (tipo === 'IDAT') {
      for (var d4 = 0; d4 < len; d4++) idat.push(bytes[inicio + d4])
    } else if (tipo === 'IEND') {
      break
    }
    pos = inicio + len + 4
  }

  if (interlace !== 0) throw new Error('PNG entrelacado nao suportado')
  if (bitDepth !== 8) throw new Error('bitDepth ' + bitDepth + ' nao suportado')

  var cru = inflateRaw(Uint8Array.from(idat.slice(2)))

  var canais =
    colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4
  var bpp = canais
  var stride = largura * bpp
  if (cru.length < (stride + 1) * altura) throw new Error('dados insuficientes')

  var linhas = new Uint8Array(stride * altura)
  var prev = new Uint8Array(stride)

  for (var y = 0; y < altura; y++) {
    var filtro = cru[y * (stride + 1)]
    var off = y * (stride + 1) + 1
    var atual = new Uint8Array(stride)
    for (var x = 0; x < stride; x++) {
      var bruto = cru[off + x]
      var aV = x >= bpp ? atual[x - bpp] : 0
      var bV = prev[x]
      var cV = x >= bpp ? prev[x - bpp] : 0
      var val
      if (filtro === 0) val = bruto
      else if (filtro === 1) val = bruto + aV
      else if (filtro === 2) val = bruto + bV
      else if (filtro === 3) val = bruto + ((aV + bV) >> 1)
      else if (filtro === 4) val = bruto + paeth(aV, bV, cV)
      else throw new Error('filtro ' + filtro)
      atual[x] = val & 0xff
    }
    linhas.set(atual, y * stride)
    prev = atual
  }

  var rgb = new Uint8Array(largura * altura * 3)
  for (var y2 = 0; y2 < altura; y2++) {
    for (var x2 = 0; x2 < largura; x2++) {
      var si = y2 * stride + x2 * bpp
      var di = (y2 * largura + x2) * 3
      var r = 0
      var g = 0
      var bCol = 0
      var al = 255

      if (colorType === 0) {
        r = g = bCol = linhas[si]
      } else if (colorType === 4) {
        r = g = bCol = linhas[si]
        al = linhas[si + 1]
      } else if (colorType === 2) {
        r = linhas[si]
        g = linhas[si + 1]
        bCol = linhas[si + 2]
      } else if (colorType === 6) {
        r = linhas[si]
        g = linhas[si + 1]
        bCol = linhas[si + 2]
        al = linhas[si + 3]
      } else if (colorType === 3) {
        var idx = linhas[si]
        if (paleta && idx * 3 + 2 < paleta.length) {
          r = paleta[idx * 3]
          g = paleta[idx * 3 + 1]
          bCol = paleta[idx * 3 + 2]
        } else {
          r = g = bCol = idx
        }
        if (trnsPaleta && idx < trnsPaleta.length) al = trnsPaleta[idx]
      } else {
        r = g = bCol = linhas[si]
      }

      if (al < 255) {
        var af = al / 255
        r = Math.round(r * af + 255 * (1 - af))
        g = Math.round(g * af + 255 * (1 - af))
        bCol = Math.round(bCol * af + 255 * (1 - af))
      }

      rgb[di] = r
      rgb[di + 1] = g
      rgb[di + 2] = bCol
    }
  }

  return { largura: largura, altura: altura, rgb: rgb }
}

/** Reduz por amostragem: logo em 56pt não precisa de 3000px de lado. */
function reduzirRgb(dec, maxLado) {
  var largura = dec.largura
  var altura = dec.altura
  var rgb = dec.rgb
  var maior = Math.max(largura, altura)
  if (maior <= maxLado) return dec

  var passo = Math.ceil(maior / maxLado)
  var nw = Math.max(1, Math.floor(largura / passo))
  var nh = Math.max(1, Math.floor(altura / passo))
  var out = new Uint8Array(nw * nh * 3)

  for (var y = 0; y < nh; y++) {
    for (var x = 0; x < nw; x++) {
      var si = (y * passo * largura + x * passo) * 3
      var di = (y * nw + x) * 3
      out[di] = rgb[si]
      out[di + 1] = rgb[si + 1]
      out[di + 2] = rgb[si + 2]
    }
  }
  return { largura: nw, altura: nh, rgb: out }
}

module.exports = {
  inflateRaw: inflateRaw,
  decodificarPng: decodificarPng,
  reduzirRgb: reduzirRgb,
}
