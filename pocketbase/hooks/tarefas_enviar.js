// Envio de tarefas para ciência e acompanhamento de responsáveis e parceiros/contatos.
// POST /backend/v1/tarefas/enviar
// Recebe:
//   destinatarios: Array<{ id?: string, nome: string, email: string, tipo?: string }>
//   tarefas_ids?: string[] (ou tarefas diretas / filtros)
//   assunto_custom?: string
// Para cada destinatário com e-mail válido:
//   - Identifica as tarefas associadas a ele dentro da lista de tarefas_ids fornecidas
//   - Agrupa as tarefas por empresa
//   - Obtém a logo da empresa (de logomarcas ou logos_publicas)
//   - Monta layout HTML profissional:
//       * Topo com LOGO DA EMPRESA centralizada
//       * Título dinâmico: "PORTAL DE GESTÃO {NOME DA EMPRESA}"
//       * Bloco verde com "Acompanhamento de Tarefas" centralizado
//       * Card de tarefa sem nome da empresa duplicado, com rótulos "Prioridade:" e "Status:"
//       * Descrição preservando quebras de linha e formatação digitada
//       * Remetente personalizado por empresa: {empresa_slug}@{empresa_slug}.com.br (com fallback)
//       * Geração de PDF estruturado com o mesmo layout e anexado ao e-mail
//   - Envia e-mail via $app.newMailClient() com attachment do PDF
//   - Grava histórico em emails e auditoria

routerAdd(
  'POST',
  '/backend/v1/tarefas/enviar',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')

    const body = e.requestInfo().body || {}
    const destinatarios = Array.isArray(body.destinatarios) ? body.destinatarios : []
    const tarefaIds = Array.isArray(body.tarefas_ids) ? body.tarefas_ids : []
    const assuntoCustom = String(body.assunto || '').trim()

    if (destinatarios.length === 0) {
      return e.badRequestError('Nenhum destinatário informado para envio.')
    }
    if (tarefaIds.length === 0) {
      return e.badRequestError('Nenhuma tarefa selecionada/filtrada para envio.')
    }

    // ===== PNG COM CANAL ALFA -> RGB EMBUTÍVEL NO PDF (Goja, sem zlib) =====
    // O gerador usa /Filter /FlateDecode + /Predictor 15, formato que o PDF aceita
    // nativamente — não é preciso recomprimir. O problema é o CANAL ALFA (colorType
    // 4/6): o PDF não tem transparência e o Goja não tem zlib para separar o alfa,
    // então a logo caía no badge textual. Aqui: inflate puro em JS, composição sobre
    // branco (fundo do cabeçalho) e re-emissão dos pixels como DEFLATE "stored"
    // embrulhado em zlib, que qualquer leitor de PDF entende.

    function inflatePuro(bytes) {
      var pos = 0,
        bitBuf = 0,
        bitCnt = 0,
        out = []
      function getBit() {
        if (bitCnt === 0) {
          bitBuf = bytes[pos++] & 0xff
          bitCnt = 8
        }
        var b = bitBuf & 1
        bitBuf >>= 1
        bitCnt--
        return b
      }
      function getBits(n) {
        var v = 0
        for (var i = 0; i < n; i++) v |= getBit() << i
        return v
      }
      var LBASE = [
        3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115,
        131, 163, 195, 227, 258,
      ]
      var LEXT = [
        0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
      ]
      var DBASE = [
        1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537,
        2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
      ]
      var DEXT = [
        0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12,
        13, 13,
      ]
      function buildTree(lens) {
        var maxLen = 1,
          i
        for (i = 0; i < lens.length; i++) if (lens[i] > maxLen) maxLen = lens[i]
        var blCount = [],
          nextCode = []
        for (i = 0; i <= maxLen; i++) {
          blCount.push(0)
          nextCode.push(0)
        }
        for (i = 0; i < lens.length; i++) if (lens[i]) blCount[lens[i]]++
        var code = 0
        for (var bits = 1; bits <= maxLen; bits++) {
          code = (code + blCount[bits - 1]) << 1
          nextCode[bits] = code
        }
        var table = {}
        for (i = 0; i < lens.length; i++) {
          var l = lens[i]
          if (!l) continue
          table[l + ':' + nextCode[l]] = i
          nextCode[l]++
        }
        return { table: table, maxLen: maxLen }
      }
      function decodeSym(tree) {
        var code = 0
        for (var len = 1; len <= tree.maxLen; len++) {
          code = (code << 1) | getBit()
          var s = tree.table[len + ':' + code]
          if (s !== undefined) return s
        }
        throw new Error('Huffman invalido')
      }
      var last = 0
      while (!last) {
        last = getBit()
        var type = getBits(2)
        if (type === 0) {
          bitCnt = 0
          var len = (bytes[pos] & 0xff) | ((bytes[pos + 1] & 0xff) << 8)
          pos += 4
          for (var k = 0; k < len; k++) out.push(bytes[pos++] & 0xff)
        } else if (type === 1 || type === 2) {
          var litTree, distTree, litLens, distLens, j
          if (type === 1) {
            litLens = []
            for (j = 0; j < 144; j++) litLens.push(8)
            for (j = 144; j < 256; j++) litLens.push(9)
            for (j = 256; j < 280; j++) litLens.push(7)
            for (j = 280; j < 288; j++) litLens.push(8)
            distLens = []
            for (j = 0; j < 30; j++) distLens.push(5)
            litTree = buildTree(litLens)
            distTree = buildTree(distLens)
          } else {
            var hlit = getBits(5) + 257
            var hdist = getBits(5) + 1
            var hclen = getBits(4) + 4
            var order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
            var clLens = []
            for (j = 0; j < 19; j++) clLens.push(0)
            for (j = 0; j < hclen; j++) clLens[order[j]] = getBits(3)
            var clTree = buildTree(clLens)
            var lens = []
            while (lens.length < hlit + hdist) {
              var sym = decodeSym(clTree)
              if (sym < 16) lens.push(sym)
              else if (sym === 16) {
                var prev = lens[lens.length - 1],
                  rep = 3 + getBits(2)
                for (j = 0; j < rep; j++) lens.push(prev)
              } else if (sym === 17) {
                var rep17 = 3 + getBits(3)
                for (j = 0; j < rep17; j++) lens.push(0)
              } else {
                var rep18 = 11 + getBits(7)
                for (j = 0; j < rep18; j++) lens.push(0)
              }
            }
            litTree = buildTree(lens.slice(0, hlit))
            distTree = buildTree(lens.slice(hlit))
          }
          for (;;) {
            var s2 = decodeSym(litTree)
            if (s2 === 256) break
            if (s2 < 256) out.push(s2)
            else {
              var li = s2 - 257
              var l2 = LBASE[li] + getBits(LEXT[li])
              var ds = decodeSym(distTree)
              var dist = DBASE[ds] + getBits(DEXT[ds])
              var start = out.length - dist
              for (j = 0; j < l2; j++) out.push(out[start + j])
            }
          }
        } else {
          throw new Error('BTYPE invalido')
        }
      }
      return out
    }

    // Deflate "stored" embrulhado em ZLIB (RFC 1950) — formato do /FlateDecode do PDF.
    function deflateZlibStored(bytes) {
      var out = [0x78, 0x01]
      var MAXB = 65535
      var total = bytes.length
      var p = 0
      if (total === 0) return [0x78, 0x01, 1, 0, 0, 255, 255, 0, 0, 0, 1]
      while (p < total) {
        var bloco = Math.min(MAXB, total - p)
        var ultimo = p + bloco >= total ? 1 : 0
        out.push(ultimo)
        out.push(bloco & 0xff)
        out.push((bloco >> 8) & 0xff)
        var nlen = ~bloco & 0xffff
        out.push(nlen & 0xff)
        out.push((nlen >> 8) & 0xff)
        for (var i = 0; i < bloco; i++) out.push(bytes[p + i] & 0xff)
        p += bloco
      }
      var a = 1,
        b = 0
      for (var ai = 0; ai < total; ai++) {
        a = (a + (bytes[ai] & 0xff)) % 65521
        b = (b + a) % 65521
      }
      var adler = ((b << 16) | a) >>> 0
      out.push((adler >>> 24) & 0xff)
      out.push((adler >>> 16) & 0xff)
      out.push((adler >>> 8) & 0xff)
      out.push(adler & 0xff)
      return out
    }

    // PNG (string binária) -> objeto pronto para o XObject do PDF.
    function pngRgbaParaEmbutivel(raw) {
      try {
        if (!raw || raw.length < 33) return null
        var sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
        for (var i = 0; i < 8; i++) if ((raw.charCodeAt(i) & 0xff) !== sig[i]) return null
        function u32(o) {
          return (
            (((raw.charCodeAt(o) & 0xff) << 24) |
              ((raw.charCodeAt(o + 1) & 0xff) << 16) |
              ((raw.charCodeAt(o + 2) & 0xff) << 8) |
              (raw.charCodeAt(o + 3) & 0xff)) >>>
            0
          )
        }
        var p = 8,
          w = 0,
          h = 0,
          bd = 0,
          ct = -1,
          il = 0,
          idat = []
        while (p + 8 <= raw.length) {
          var len = u32(p)
          var type = String.fromCharCode(
            raw.charCodeAt(p + 4) & 0xff,
            raw.charCodeAt(p + 5) & 0xff,
            raw.charCodeAt(p + 6) & 0xff,
            raw.charCodeAt(p + 7) & 0xff,
          )
          var d = p + 8
          if (type === 'IHDR') {
            w = u32(d)
            h = u32(d + 4)
            bd = raw.charCodeAt(d + 8) & 0xff
            ct = raw.charCodeAt(d + 9) & 0xff
            il = raw.charCodeAt(d + 12) & 0xff
          } else if (type === 'IDAT') {
            var chunk = []
            for (var q = 0; q < len; q++) chunk.push(raw.charCodeAt(d + q) & 0xff)
            idat.push(chunk)
          } else if (type === 'IEND') break
          p = d + len + 4
        }
        if (!w || !h || !idat.length || bd !== 8 || il !== 0) return null
        var canais = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : ct === 4 ? 2 : 0
        if (!canais) return null
        var comp = []
        for (var ci = 0; ci < idat.length; ci++) comp = comp.concat(idat[ci])
        var descomprimido = inflatePuro(comp.slice(2, comp.length - 4))
        var bpp = canais
        var stride = w * bpp
        var filtrado = []
        var prev = []
        for (var z = 0; z < stride; z++) prev.push(0)
        var rp = 0
        for (var y = 0; y < h; y++) {
          var filtro = descomprimido[rp++]
          var linha = []
          for (var x = 0; x < stride; x++) linha.push(descomprimido[rp++] & 0xff)
          var cur = []
          for (var xx = 0; xx < stride; xx++) {
            var a = xx >= bpp ? cur[xx - bpp] : 0
            var b = prev[xx]
            var c = xx >= bpp ? prev[xx - bpp] : 0
            var v = linha[xx]
            if (filtro === 1) v = (v + a) & 0xff
            else if (filtro === 2) v = (v + b) & 0xff
            else if (filtro === 3) v = (v + ((a + b) >> 1)) & 0xff
            else if (filtro === 4) {
              var pp = a + b - c
              var pa = pp > a ? pp - a : a - pp
              var pb = pp > b ? pp - b : b - pp
              var pc = pp > c ? pp - c : c - pp
              var pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
              v = (v + pr) & 0xff
            }
            cur[xx] = v & 0xff
          }
          var linhaRgb = [0]
          for (var px = 0; px < w; px++) {
            var o = px * bpp
            var r,
              g,
              bl,
              al = 255
            if (canais === 1) {
              r = g = bl = cur[o]
            } else if (canais === 2) {
              r = g = bl = cur[o]
              al = cur[o + 1]
            } else if (canais === 3) {
              r = cur[o]
              g = cur[o + 1]
              bl = cur[o + 2]
            } else {
              r = cur[o]
              g = cur[o + 1]
              bl = cur[o + 2]
              al = cur[o + 3]
            }
            if (al < 255) {
              r = Math.round((r * al + 255 * (255 - al)) / 255)
              g = Math.round((g * al + 255 * (255 - al)) / 255)
              bl = Math.round((bl * al + 255 * (255 - al)) / 255)
            }
            linhaRgb.push(r & 0xff, g & 0xff, bl & 0xff)
          }
          for (var zz = 0; zz < linhaRgb.length; zz++) filtrado.push(linhaRgb[zz])
          prev = cur
        }
        // ── REDUÇÃO DE ESCALA ───────────────────────────────────────────────
        // A logo vai no cabeçalho com no máximo 150pt de largura (≈208px a 100dpi).
        // As imagens do portal são grandes (FoldBox 1920x1080, Casafruti 692x982):
        // embutir nessa resolução inflava o PDF para ~6 MB. Aqui reduzimos por
        // AMOSTRAGEM (nearest neighbor), que preserva bordas de logotipo e é O(n)
        // — decodificar de novo em escala menor exigiria refazer o filtro por linha.
        var MAXLADO = 400
        var passoX = 1
        var passoY = 1
        if (w > MAXLADO || h > MAXLADO) {
          // ceil (não round): 512/400 = 1.28 daria round(1.28)=1 e NADA seria
          // reduzido. Com ceil garantimos passo >= 2 e o lado cai abaixo do limite.
          var esc = Math.max(w, h) / MAXLADO
          passoX = Math.max(1, Math.ceil(esc))
          passoY = passoX
        }
        var wFinal = Math.floor((w + passoX - 1) / passoX)
        var hFinal = Math.floor((h + passoY - 1) / passoY)
        var reduzido = []
        if (passoX > 1 || passoY > 1) {
          // filtrado está em linhas RGB (3 bytes/pixel) já sem alfa
          for (var ry = 0; ry < hFinal; ry++) {
            var ly = Math.min(h - 1, ry * passoY)
            var base = ly * (w * 3)
            reduzido.push(0) // filtro "None" da linha
            for (var rx = 0; rx < wFinal; rx++) {
              var lx = Math.min(w - 1, rx * passoX)
              var oo = base + lx * 3
              reduzido.push(filtrado[oo] & 0xff, filtrado[oo + 1] & 0xff, filtrado[oo + 2] & 0xff)
            }
          }
          w = wFinal
          h = hFinal
          filtrado = reduzido
        }

        var deflated = deflateZlibStored(filtrado)
        var partes = []
        var CH = 4096
        for (var ii = 0; ii < deflated.length; ii += CH) {
          partes.push(
            String.fromCharCode.apply(null, deflated.slice(ii, Math.min(ii + CH, deflated.length))),
          )
        }
        return {
          tipo: 'png_flate',
          width: w,
          height: h,
          bitDepth: 8,
          colorSpace: '/DeviceRGB',
          colors: 3,
          data: partes.join(''),
        }
      } catch (errConv) {
        console.warn('[PDF tarefas] Falha ao converter PNG com alfa: ' + errConv)
        return null
      }
    }

    // --- PARSERS DE IMAGEM PARA EMBEDDING NATIVO NO PDF ---
    function parsePngData(raw) {
      if (!raw || raw.length < 8) return null
      // Assinatura PNG: 89 50 4E 47 0D 0A 1A 0A
      const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      for (let i = 0; i < 8; i++) {
        if (raw.charCodeAt(i) !== sig[i]) return null
      }

      let pos = 8
      let width = 0
      let height = 0
      let bitDepth = 0
      let colorType = -1
      let interlace = 0
      let idatChunks = []

      function readU32(p) {
        return (
          (((raw.charCodeAt(p) & 0xff) << 24) |
            ((raw.charCodeAt(p + 1) & 0xff) << 16) |
            ((raw.charCodeAt(p + 2) & 0xff) << 8) |
            (raw.charCodeAt(p + 3) & 0xff)) >>>
          0
        )
      }

      while (pos + 8 <= raw.length) {
        const len = readU32(pos)
        const type = raw.slice(pos + 4, pos + 8)
        const dataStart = pos + 8
        const nextPos = dataStart + len + 4 // +4 para CRC

        if (type === 'IHDR' && len >= 13) {
          width = readU32(dataStart)
          height = readU32(dataStart + 4)
          bitDepth = raw.charCodeAt(dataStart + 8) & 0xff
          colorType = raw.charCodeAt(dataStart + 9) & 0xff
          interlace = raw.charCodeAt(dataStart + 12) & 0xff
        } else if (type === 'IDAT') {
          idatChunks.push(raw.slice(dataStart, dataStart + len))
        } else if (type === 'IEND') {
          break
        }
        pos = nextPos
      }

      if (!width || !height || idatChunks.length === 0) return null
      // PDF nativo suporta FlateDecode com Predictor 15 diretamente para
      // Greyscale (0) e Truecolor RGB (2) sem interlace.
      // Se tiver canal alfa (4 ou 6), sem decompressor zlib na JSVM do Goja,
      // não é possível separar o canal alfa sem distorcer as cores.
      if (interlace === 0 && (colorType === 0 || colorType === 2) && bitDepth === 8) {
        return {
          tipo: 'png_flate',
          width: width,
          height: height,
          bitDepth: bitDepth,
          colorSpace: colorType === 0 ? '/DeviceGray' : '/DeviceRGB',
          colors: colorType === 0 ? 1 : 3,
          data: idatChunks.join(''),
        }
      }

      return {
        tipo: 'png_nao_embutivel_direto',
        width: width,
        height: height,
        colorType: colorType,
      }
    }

    function parseJpegData(raw) {
      if (!raw || raw.length < 4) return null
      // Assinatura JPEG: FF D8
      if ((raw.charCodeAt(0) & 0xff) !== 0xff || (raw.charCodeAt(1) & 0xff) !== 0xd8) {
        return null
      }

      let pos = 2
      let width = 0
      let height = 0
      let channels = 3

      while (pos + 4 <= raw.length) {
        if ((raw.charCodeAt(pos) & 0xff) !== 0xff) {
          pos++
          continue
        }
        const marker = raw.charCodeAt(pos + 1) & 0xff
        if (marker === 0xd9 || marker === 0xda) break // SOS ou EOI

        const len =
          (((raw.charCodeAt(pos + 2) & 0xff) << 8) | (raw.charCodeAt(pos + 3) & 0xff)) >>> 0
        // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          if (pos + 9 <= raw.length) {
            height =
              (((raw.charCodeAt(pos + 5) & 0xff) << 8) | (raw.charCodeAt(pos + 6) & 0xff)) >>> 0
            width =
              (((raw.charCodeAt(pos + 7) & 0xff) << 8) | (raw.charCodeAt(pos + 8) & 0xff)) >>> 0
            channels = raw.charCodeAt(pos + 9) & 0xff
          }
          break
        }
        pos += 2 + len
      }

      if (width && height) {
        return {
          tipo: 'jpeg_dct',
          width: width,
          height: height,
          bitDepth: 8,
          colorSpace: channels === 1 ? '/DeviceGray' : '/DeviceRGB',
          colors: channels,
          data: raw,
        }
      }
      return null
    }

    // --- GERADOR DE PDF 1.4 PURO INLINE (GOJA / POCKETBASE) ---
    function gerarPdfTarefas(dados) {
      const empPrincipal = dados.empPrincipal || 'Extrafruti'
      const destNome = dados.destinatarioNome || 'Prezado(a)'
      const tarefas = dados.listaTarefas || []
      const logoInfo = dados.logoInfo || null

      // Dimensões A4 em pontos (72 pt / pol)
      const W = 595.28
      const H = 841.89
      const marginLeft = 36
      const marginRight = 36
      const contentWidth = W - marginLeft - marginRight

      // ACENTOS NESTE PDF — usar ESCAPE OCTAL do PDF, nunca o byte cru.
      // O anexo é gravado por $filesystem.fileFromBytes(pdfStr), que serializa a
      // string como UTF-8: um "Ã" literal (U+00C3) chega ao arquivo como C3 83 e
      // o leitor, com /WinAnsiEncoding, mostra "GESTÃƒO" (comprovado no PDF real
      // de 02/11/2026). A saída é o escape octal do próprio PDF: "\303" é um
      // 0xC3 que o leitor decodifica DEPOIS de ler o texto, e como "\303" é
      // composto só por caracteres ASCII (5C 33 30 33), a serialização UTF-8
      // não altera nada. Resultado: acento correto e texto do PDF íntegro.
      const WINANSI_OCTAL = {
        Á: '\\301',
        À: '\\300',
        Â: '\\302',
        Ã: '\\303',
        Ä: '\\304',
        É: '\\311',
        È: '\\310',
        Ê: '\\312',
        Ë: '\\313',
        Í: '\\315',
        Ì: '\\314',
        Î: '\\316',
        Ï: '\\317',
        Ó: '\\323',
        Ò: '\\322',
        Ô: '\\324',
        Õ: '\\325',
        Ö: '\\326',
        Ú: '\\332',
        Ù: '\\331',
        Û: '\\333',
        Ü: '\\334',
        Ç: '\\307',
        Ñ: '\\321',
        á: '\\341',
        à: '\\340',
        â: '\\342',
        ã: '\\343',
        ä: '\\344',
        é: '\\351',
        è: '\\350',
        ê: '\\352',
        ë: '\\353',
        í: '\\355',
        ì: '\\354',
        î: '\\356',
        ï: '\\357',
        ó: '\\363',
        ò: '\\362',
        ô: '\\364',
        õ: '\\365',
        ö: '\\366',
        ú: '\\372',
        ù: '\\371',
        û: '\\373',
        ü: '\\374',
        ç: '\\347',
        ñ: '\\361',
        º: '\\272',
        ª: '\\252',
      }
      // Devolve o texto já escapado em octal para o operador Tj. O conteúdo NÃO
      // deve passar de novo por escapePdfStr (ele escaparia a barra invertida).
      function sanitizeAscii(s) {
        if (!s) return ''
        const str = String(s)
        let out = ''
        for (let i = 0; i < str.length; i++) {
          const ch = str.charAt(i)
          if (WINANSI_OCTAL[ch] !== undefined) {
            out += WINANSI_OCTAL[ch]
          } else if (ch >= '\x20' && ch <= '\x7E') {
            out += ch
          } else if (ch === '\n' || ch === '\r' || ch === '\t') {
            out += ch
          } else {
            const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            out += /^[\x20-\x7E]$/.test(base) ? base : ' '
          }
        }
        return out
      }

      function escapePdfStr(s) {
        return String(s || '')
          .replace(/\\/g, '\\\\')
          .replace(/\(/g, '\\(')
          .replace(/\)/g, '\\)')
      }

      function wrapText(text, maxChars) {
        const lines = []
        const rawParagraphs = String(text || '').split(/\r?\n/)
        for (let p = 0; p < rawParagraphs.length; p++) {
          const pText = rawParagraphs[p]
          if (!pText) {
            lines.push('')
            continue
          }
          const words = pText.split(/\s+/)
          let cur = ''
          for (let w = 0; w < words.length; w++) {
            const word = words[w]
            if (!word) continue
            if ((cur + (cur ? ' ' : '') + word).length <= maxChars) {
              cur += (cur ? ' ' : '') + word
            } else {
              if (cur) lines.push(cur)
              if (word.length > maxChars) {
                let rem = word
                while (rem.length > maxChars) {
                  lines.push(rem.slice(0, maxChars))
                  rem = rem.slice(maxChars)
                }
                cur = rem
              } else {
                cur = word
              }
            }
          }
          if (cur) lines.push(cur)
        }
        return lines
      }

      // Analisa e valida os bytes da imagem se houver
      let parsedImage = null
      // PNG já convertido de RGBA para RGB no carregamento da logo (fora do gerador,
      // onde o inflate puro roda uma única vez por empresa).
      if (logoInfo && logoInfo.imgConvertida) {
        parsedImage = logoInfo.imgConvertida
      }
      if (!parsedImage && logoInfo && logoInfo.rawBytes) {
        try {
          const fn = String(logoInfo.fileName || '').toLowerCase()
          if (fn.endsWith('.jpg') || fn.endsWith('.jpeg')) {
            parsedImage = parseJpegData(logoInfo.rawBytes)
          } else {
            parsedImage = parsePngData(logoInfo.rawBytes)
            if (!parsedImage) {
              parsedImage = parseJpegData(logoInfo.rawBytes)
            }
            if (!parsedImage) {
              parsedImage = pngRgbaParaEmbutivel(logoInfo.rawBytes)
            }
          }
        } catch (errParse) {
          console.warn('Erro ao processar stream da imagem para o PDF:', errParse)
        }
      }

      const pagesOps = []
      let curOps = []

      function novaPagina() {
        if (curOps.length > 0) {
          pagesOps.push(curOps)
        }
        curOps = []
      }

      function drawRect(x, y, w, h, fillRgb, strokeRgb, lineWidth) {
        let s = 'q '
        if (lineWidth) s += lineWidth + ' w '
        if (strokeRgb) s += strokeRgb.r + ' ' + strokeRgb.g + ' ' + strokeRgb.b + ' RG '
        if (fillRgb) s += fillRgb.r + ' ' + fillRgb.g + ' ' + fillRgb.b + ' rg '
        s += x.toFixed(2) + ' ' + y.toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re '
        if (fillRgb && strokeRgb) s += 'B'
        else if (fillRgb) s += 'f'
        else if (strokeRgb) s += 'S'
        s += ' Q'
        curOps.push(s)
      }

      function drawText(x, y, text, size, fontName, rgb) {
        const fn = fontName || '/F1'
        const color = rgb || { r: 0.1, g: 0.1, b: 0.1 }
        // ORDEM IMPORTA: sanitizeAscii JÁ devolve escapes octais (\303) e a
        // barra invertida deles não pode ser re-escapada — por isso tratamos
        // só os delimitadores da string PDF aqui. Texto puro nunca contém
        // barra invertida de escape; se contiver, vira \\ antes da sanitização.
        const clean = sanitizeAscii(String(text || '').replace(/\\/g, '\\\\'))
          .replace(/\(/g, '\\(')
          .replace(/\)/g, '\\)')
        let s = 'BT '
        s += color.r + ' ' + color.g + ' ' + color.b + ' rg '
        s += fn + ' ' + size + ' Tf '
        s += x.toFixed(2) + ' ' + y.toFixed(2) + ' Td '
        s += '(' + clean + ') Tj '
        s += 'ET'
        curOps.push(s)
      }

      function drawLine(x1, y1, x2, y2, strokeRgb, lineWidth) {
        const c = strokeRgb || { r: 0.8, g: 0.8, b: 0.8 }
        const lw = lineWidth || 1
        let s = 'q ' + lw + ' w '
        s += c.r + ' ' + c.g + ' ' + c.b + ' RG '
        s += x1.toFixed(2) + ' ' + y1.toFixed(2) + ' m '
        s += x2.toFixed(2) + ' ' + y2.toFixed(2) + ' l S Q'
        curOps.push(s)
      }

      function drawImageXObject(imgName, x, y, w, h) {
        const s =
          'q ' +
          w.toFixed(2) +
          ' 0 0 ' +
          h.toFixed(2) +
          ' ' +
          x.toFixed(2) +
          ' ' +
          y.toFixed(2) +
          ' cm /' +
          imgName +
          ' Do Q'
        curOps.push(s)
      }

      let curY = H - 36

      function desenharCabecalho() {
        // Altura do topo branco com logomarca e título centralizados
        // Layout espelho do topo do e-mail HTML:
        // [ Logomarca Centralizada ]
        // PORTAL DE GESTÃO {EMPRESA}
        // Faixa verde "Acompanhamento de Tarefas"
        const temImagemEmbutivel =
          parsedImage && (parsedImage.tipo === 'jpeg_dct' || parsedImage.tipo === 'png_flate')

        const topHeaderH = temImagemEmbutivel ? 82 : 72
        drawRect(
          marginLeft,
          curY - topHeaderH,
          contentWidth,
          topHeaderH,
          { r: 1, g: 1, b: 1 },
          null,
          null,
        )

        // Título dinâmico exigido pelo dono: "PORTAL DE GESTÃO {EMPRESA}"
        // (antes era "PAINEL DE GESTAO" — nome errado, e sem o acento).
        const subText = 'PORTAL DE GESTÃO ' + empPrincipal.toUpperCase()

        if (temImagemEmbutivel) {
          // Calcula dimensões proporcionais da logomarca (máx 150pt larg, 42pt alt)
          const maxImgW = 150
          const maxImgH = 42
          let imgW = parsedImage.width
          let imgH = parsedImage.height
          const ratio = Math.min(maxImgW / imgW, maxImgH / imgH, 1)
          const dispW = imgW * ratio
          const dispH = imgH * ratio
          const imgX = (W - dispW) / 2
          const imgY = curY - 12 - dispH

          drawImageXObject('LogoImg', imgX, imgY, dispW, dispH)

          // Título dinâmico centralizado abaixo da imagem
          const subW = subText.length * 6.0
          const subX = Math.max(marginLeft + 10, (W - subW) / 2)
          drawText(subX, curY - topHeaderH + 12, subText, 9.5, '/F2', { r: 0.42, g: 0.45, b: 0.5 })
        } else {
          // Fallback: sem imagem embutível (logo ausente ou formato com canal alfa
          // que o Goja não consegue separar). Registra o motivo para diagnóstico.
          console.warn(
            '[PDF tarefas] logo não embutível para "' +
              empPrincipal +
              '" — usando badge textual. (arquivo: ' +
              (logoInfo && (logoInfo.fileNameOriginal || logoInfo.fileName)) +
              ')',
          )
          // Bloco centralizado de marca com o nome/sigla da empresa + título dinâmico
          const badgeText = empPrincipal.toUpperCase()
          const badgeW = Math.max(120, badgeText.length * 9.5 + 24)
          const badgeH = 28
          const badgeX = (W - badgeW) / 2
          const badgeY = curY - 34

          drawRect(badgeX, badgeY, badgeW, badgeH, { r: 0.11, g: 0.37, b: 0.13 }, null, null)
          const textW = badgeText.length * 7.5
          drawText((W - textW) / 2, badgeY + 8, badgeText, 13, '/F2', { r: 1, g: 1, b: 1 })

          const subW = subText.length * 6.0
          const subX = Math.max(marginLeft + 10, (W - subW) / 2)
          drawText(subX, curY - topHeaderH + 12, subText, 9.5, '/F2', { r: 0.42, g: 0.45, b: 0.5 })
        }

        curY -= topHeaderH + 6

        // Faixa verde "Acompanhamento de Tarefas" idêntica ao HTML
        const bannerH = 46
        drawRect(
          marginLeft,
          curY - bannerH,
          contentWidth,
          bannerH,
          { r: 0.11, g: 0.37, b: 0.13 },
          null,
          null,
        )
        const titBanner = 'Acompanhamento de Tarefas'
        const titW = titBanner.length * 7.8
        const titX = Math.max(marginLeft + 10, (W - titW) / 2)
        drawText(titX, curY - 18, titBanner, 13, '/F2', { r: 1, g: 1, b: 1 })

        const subBanner =
          'Ola, ' +
          destNome +
          '. Segue o resumo das tarefas sob sua responsabilidade ou acompanhamento:'
        const subW = subBanner.length * 4.6
        const subX = Math.max(marginLeft + 10, (W - subW) / 2)
        drawText(subX, curY - 34, subBanner, 8.5, '/F1', { r: 0.82, g: 0.98, b: 0.9 })

        curY -= bannerH + 16
      }

      desenharCabecalho()

      for (let idx = 0; idx < tarefas.length; idx++) {
        const t = tarefas[idx]
        const titulo = t.titulo || 'Sem titulo'
        const desc = t.descricao || ''
        const status = t.status || 'Pendente'
        const prioLabel = t.prioLabel || 'Normal (P2)'
        const prazo = t.prazoFormatado || 'Sem prazo'
        const prazoAtrasado = Boolean(t.prazoAtrasado)
        const resp = t.responsavel || 'Nao atribuido'
        const vinculo = String(t.vinculoTipo || '').trim()
        const recorrencia = t.recorrencia || ''

        const descLines = desc ? wrapText(desc, 78) : []
        const tituloLines = wrapText(titulo, 62)

        let cardH = 14 + 16 + tituloLines.length * 15 + 8
        if (descLines.length > 0) {
          cardH += descLines.length * 12 + 16
        }
        // Linhas de detalhe: Prazo + Responsável (+ Vínculo se houver + Recorrência se houver)
        let numDetailLines = 2
        if (vinculo) numDetailLines++
        if (recorrencia && recorrencia !== 'Nenhuma') numDetailLines++
        cardH += numDetailLines * 14 + 10
        cardH += 12

        if (curY - cardH < 50) {
          novaPagina()
          curY = H - 36
          desenharCabecalho()
        }

        const cardTop = curY
        const cardBottom = curY - cardH

        drawRect(
          marginLeft,
          cardBottom,
          contentWidth,
          cardH,
          { r: 0.97, g: 0.98, b: 0.98 },
          null,
          null,
        )
        // borda cinza do card
        drawLine(
          marginLeft,
          cardBottom,
          marginLeft + contentWidth,
          cardBottom,
          { r: 0.89, g: 0.91, b: 0.92 },
          0.8,
        )
        drawLine(
          marginLeft,
          cardTop,
          marginLeft + contentWidth,
          cardTop,
          { r: 0.89, g: 0.91, b: 0.92 },
          0.8,
        )
        drawLine(
          marginLeft + contentWidth,
          cardBottom,
          marginLeft + contentWidth,
          cardTop,
          { r: 0.89, g: 0.91, b: 0.92 },
          0.8,
        )

        const stripeRgb = prazoAtrasado
          ? { r: 0.86, g: 0.15, b: 0.15 }
          : { r: 0.11, g: 0.37, b: 0.13 }
        drawRect(marginLeft, cardBottom, 4, cardH, stripeRgb, null, null)

        let yInner = cardTop - 16

        // Rótulos à esquerda da Prioridade e do Status
        drawText(marginLeft + 12, yInner, 'Prioridade:', 8.5, '/F2', { r: 0.42, g: 0.45, b: 0.5 })
        drawText(marginLeft + 64, yInner, prioLabel, 8.5, '/F2', { r: 0.57, g: 0.25, b: 0.05 })

        drawText(marginLeft + 150, yInner, 'Status:', 8.5, '/F2', { r: 0.42, g: 0.45, b: 0.5 })
        drawText(marginLeft + 188, yInner, status, 8.5, '/F2', { r: 0.22, g: 0.25, b: 0.32 })

        yInner -= 16

        for (let tl = 0; tl < tituloLines.length; tl++) {
          drawText(marginLeft + 12, yInner, tituloLines[tl], 11, '/F2', {
            r: 0.07,
            g: 0.09,
            b: 0.15,
          })
          yInner -= 14
        }

        if (descLines.length > 0) {
          yInner -= 2
          const descBoxH = descLines.length * 12 + 10
          drawRect(
            marginLeft + 12,
            yInner - descBoxH + 4,
            contentWidth - 24,
            descBoxH,
            { r: 1, g: 1, b: 1 },
            null,
            null,
          )
          drawLine(
            marginLeft + 12,
            yInner - descBoxH + 4,
            marginLeft + contentWidth - 12,
            yInner - descBoxH + 4,
            { r: 0.89, g: 0.91, b: 0.92 },
            0.5,
          )
          drawLine(
            marginLeft + 12,
            yInner + 4,
            marginLeft + contentWidth - 12,
            yInner + 4,
            { r: 0.89, g: 0.91, b: 0.92 },
            0.5,
          )
          drawLine(
            marginLeft + 12,
            yInner - descBoxH + 4,
            marginLeft + 12,
            yInner + 4,
            { r: 0.89, g: 0.91, b: 0.92 },
            0.5,
          )
          drawLine(
            marginLeft + contentWidth - 12,
            yInner - descBoxH + 4,
            marginLeft + contentWidth - 12,
            yInner + 4,
            { r: 0.89, g: 0.91, b: 0.92 },
            0.5,
          )

          let yDesc = yInner - 8
          for (let dl = 0; dl < descLines.length; dl++) {
            drawText(marginLeft + 18, yDesc, descLines[dl], 8.5, '/F1', {
              r: 0.29,
              g: 0.33,
              b: 0.39,
            })
            yDesc -= 12
          }
          yInner -= descBoxH + 8
        } else {
          yInner -= 4
        }

        // Prazo
        drawText(marginLeft + 12, yInner, 'Prazo:', 8.5, '/F2', { r: 0.42, g: 0.45, b: 0.5 })
        if (prazoAtrasado) {
          drawText(marginLeft + 80, yInner, prazo + ' (ATRASADA)', 8.5, '/F2', {
            r: 0.73,
            g: 0.11,
            b: 0.11,
          })
        } else {
          drawText(marginLeft + 80, yInner, prazo, 8.5, '/F2', { r: 0.07, g: 0.09, b: 0.15 })
        }
        yInner -= 13

        // Responsável
        drawText(marginLeft + 12, yInner, 'Responsavel:', 8.5, '/F2', { r: 0.42, g: 0.45, b: 0.5 })
        drawText(marginLeft + 80, yInner, resp, 8.5, '/F1', { r: 0.15, g: 0.18, b: 0.22 })
        yInner -= 13

        // Vínculo (omite por completo se não houver ou se for vazio)
        if (vinculo) {
          drawText(marginLeft + 12, yInner, 'Vinculo:', 8.5, '/F2', { r: 0.42, g: 0.45, b: 0.5 })
          drawText(marginLeft + 80, yInner, vinculo, 8.5, '/F1', { r: 0.15, g: 0.18, b: 0.22 })
          yInner -= 13
        }

        // Recorrência
        if (recorrencia && recorrencia !== 'Nenhuma') {
          drawText(marginLeft + 12, yInner, 'Recorrencia:', 8.5, '/F2', {
            r: 0.42,
            g: 0.45,
            b: 0.5,
          })
          drawText(marginLeft + 80, yInner, recorrencia, 8.5, '/F1', { r: 0.15, g: 0.18, b: 0.22 })
          yInner -= 13
        }

        curY = cardBottom - 14
      }

      // Rodapé
      drawLine(marginLeft, curY, W - marginRight, curY, { r: 0.89, g: 0.91, b: 0.92 }, 0.6)
      curY -= 14
      const rod1 = 'Portal de Gestao Executivo - Grupo Extrafruti * Casafruti * FoldBox'
      drawText((W - rod1.length * 4.6) / 2, curY, rod1, 8, '/F2', { r: 0.42, g: 0.45, b: 0.5 })
      curY -= 10
      const rod2 = 'Documento gerado para ciencia e acompanhamento operacional.'
      drawText((W - rod2.length * 4.2) / 2, curY, rod2, 7.5, '/F1', { r: 0.6, g: 0.64, b: 0.69 })

      novaPagina()

      // Montagem do arquivo PDF 1.4
      const objects = []
      let nextId = 1
      function allocId() {
        return nextId++
      }

      const catalogId = allocId()
      const pagesId = allocId()
      const fontRegularId = allocId()
      const fontBoldId = allocId()

      let imageXObjectId = null
      const temImagemEmbutivel =
        parsedImage && (parsedImage.tipo === 'jpeg_dct' || parsedImage.tipo === 'png_flate')

      if (temImagemEmbutivel) {
        imageXObjectId = allocId()
        if (parsedImage.tipo === 'jpeg_dct') {
          objects.push({
            id: imageXObjectId,
            body:
              '<< /Type /XObject /Subtype /Image /Width ' +
              parsedImage.width +
              ' /Height ' +
              parsedImage.height +
              ' /ColorSpace ' +
              parsedImage.colorSpace +
              ' /BitsPerComponent ' +
              parsedImage.bitDepth +
              ' /Filter /DCTDecode /Length ' +
              parsedImage.data.length +
              ' >>\nstream\n' +
              parsedImage.data +
              '\nendstream',
          })
        } else if (parsedImage.tipo === 'png_flate') {
          objects.push({
            id: imageXObjectId,
            body:
              '<< /Type /XObject /Subtype /Image /Width ' +
              parsedImage.width +
              ' /Height ' +
              parsedImage.height +
              ' /ColorSpace ' +
              parsedImage.colorSpace +
              ' /BitsPerComponent ' +
              parsedImage.bitDepth +
              ' /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ' +
              parsedImage.colors +
              ' /BitsPerComponent ' +
              parsedImage.bitDepth +
              ' /Columns ' +
              parsedImage.width +
              ' >> /Length ' +
              parsedImage.data.length +
              ' >>\nstream\n' +
              parsedImage.data +
              '\nendstream',
          })
        }
      }

      const numPages = pagesOps.length
      const pageIds = []
      const contentIds = []
      for (let p = 0; p < numPages; p++) {
        pageIds.push(allocId())
        contentIds.push(allocId())
      }

      objects.push({ id: catalogId, body: '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>' })
      objects.push({
        id: pagesId,
        body:
          '<< /Type /Pages /Kids [' +
          pageIds.map((id) => id + ' 0 R').join(' ') +
          '] /Count ' +
          numPages +
          ' >>',
      })
      objects.push({
        id: fontRegularId,
        body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      })
      objects.push({
        id: fontBoldId,
        body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      })

      for (let p = 0; p < numPages; p++) {
        const streamContent = pagesOps[p].join('\n')
        const streamLen = streamContent.length

        let resourcesDict =
          '<< /Font << /F1 ' + fontRegularId + ' 0 R /F2 ' + fontBoldId + ' 0 R >>'
        if (imageXObjectId) {
          resourcesDict += ' /XObject << /LogoImg ' + imageXObjectId + ' 0 R >>'
        }
        resourcesDict += ' >>'

        objects.push({
          id: pageIds[p],
          body:
            '<< /Type /Page /Parent ' +
            pagesId +
            ' 0 R /MediaBox [0 0 ' +
            W.toFixed(2) +
            ' ' +
            H.toFixed(2) +
            '] /Resources ' +
            resourcesDict +
            ' /Contents ' +
            contentIds[p] +
            ' 0 R >>',
        })
        objects.push({
          id: contentIds[p],
          body: '<< /Length ' + streamLen + ' >>\nstream\n' + streamContent + '\nendstream',
        })
      }

      objects.sort((a, b) => a.id - b.id)

      let pdfStr = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
      const offsets = {}

      for (let o = 0; o < objects.length; o++) {
        const obj = objects[o]
        offsets[obj.id] = pdfStr.length
        pdfStr += obj.id + ' 0 obj\n' + obj.body + '\nendobj\n'
      }

      const xrefOffset = pdfStr.length
      const maxId = objects.length > 0 ? objects[objects.length - 1].id : 0

      pdfStr += 'xref\n0 ' + (maxId + 1) + '\n'
      pdfStr += '0000000000 65535 f \n'
      for (let id = 1; id <= maxId; id++) {
        const off = offsets[id]
        if (off === undefined) {
          pdfStr += '0000000000 00000 f \n'
        } else {
          const offStr = String(off)
          pdfStr += '0000000000'.slice(0, 10 - offStr.length) + offStr + ' 00000 n \n'
        }
      }

      pdfStr += 'trailer\n<< /Size ' + (maxId + 1) + ' /Root ' + catalogId + ' 0 R >>\n'
      pdfStr += 'startxref\n' + xrefOffset + '\n%%EOF\n'

      return pdfStr
    }

    // 1. Busca todas as tarefas pelos IDs fornecidos
    const tarefas = []
    for (let i = 0; i < tarefaIds.length; i++) {
      try {
        const rec = $app.findRecordById('tarefas', String(tarefaIds[i]))
        if (rec) tarefas.push(rec)
      } catch (_) {}
    }

    if (tarefas.length === 0) {
      return e.badRequestError('Nenhuma das tarefas informadas foi encontrada.')
    }

    // 2. Base URL para imagens/logos
    let base = ''
    try {
      base = String($app.settings().meta.appUrl || '')
    } catch (_) {}
    if (!base) {
      try {
        base = String($secrets.get('PB_INSTANCE_URL') || '')
      } catch (_) {}
    }
    base = base.replace(/\/_\/?$/, '').replace(/\/$/, '')

    // 3. Mapa de logomarcas das empresas ativas com leitura de bytes para o PDF
    const logosMap = {}
    let pbFsys = null
    try {
      if (typeof $app.newFilesystem === 'function') {
        pbFsys = $app.newFilesystem()
      }
    } catch (errFs) {
      console.warn('Não foi possível inicializar newFilesystem:', errFs)
    }

    try {
      const colLogo = $app.findCollectionByNameOrId('logomarcas')
      const recsLogos = $app.findRecordsByFilter('logomarcas', 'ativo = true', 'empresa', 50, 0)
      for (let j = 0; j < (recsLogos || []).length; j++) {
        const lrec = recsLogos[j]
        const empNome = String(lrec.getString('empresa') || '')
          .trim()
          .toLowerCase()
        const logoFile = lrec.getString('logo') || lrec.getString('emblema')
        if (empNome && logoFile) {
          let rawBytes = ''
          // Tenta ler os bytes brutos do arquivo da logomarca no storage do PocketBase
          if (pbFsys) {
            let rdr = null
            try {
              const fileKey = lrec.baseFilesPath() + '/' + logoFile
              rdr = pbFsys.getReader(fileKey)
              if (rdr) {
                // CRÍTICO: toString()/readerToString() convertem o conteúdo como
                // UTF-8 — a doc do PocketBase diz que readerToString "is superseded
                // by toString", ou seja, são o MESMO comportamento. Todo byte >= 0x80
                // vira U+FFFD: o 0x89 da assinatura PNG morre e a logo nunca é
                // reconhecida (log "logo nao converteu", badge textual sempre).
                // toBytes() devolve a fatia REAL de bytes como number[]; daí
                // remontamos uma string binária 1:1 (cada char = 1 byte, 0-255),
                // que é exatamente o que os parsers PNG/JPEG esperam.
                const arr = toBytes(rdr)
                let bin = ''
                const CHK = 8192
                for (let bi = 0; bi < arr.length; bi += CHK) {
                  const fim = Math.min(bi + CHK, arr.length)
                  const pedaco = []
                  for (let bj = bi; bj < fim; bj++) pedaco.push(arr[bj] & 0xff)
                  bin += String.fromCharCode.apply(null, pedaco)
                }
                rawBytes = bin
              }
            } catch (errRdr) {
              console.warn('Erro ao ler bytes da logo ' + logoFile + ':', errRdr)
            } finally {
              try {
                if (rdr && typeof rdr.close === 'function') rdr.close()
              } catch (_) {}
            }
          }

          // ── Fallback ESSENCIAL: PNG com canal alfa (colorType 4/6) NÃO é embutível
          // no PDF — o Goja não tem zlib para separar o canal alfa e o gerador caía
          // no badge verde "EXTRAFRUTI" em vez da logomarca real.
          // O PocketBase gera thumbs no SERVIDOR já em RGB (colorType 2, sem alfa):
          // ?thumb=100x100 devolve um PNG pequeno e embutível direto. Buscamos esse
          // thumbnail quando o arquivo original não for utilizável.
          let bytesParaPdf = rawBytes
          let nomeParaPdf = logoFile
          let imgJaConvertida = null
          function pngEmbutivel(bytes) {
            if (!bytes || bytes.length < 26) return false
            // assinatura PNG
            const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
            for (let i = 0; i < 8; i++) {
              if ((bytes.charCodeAt(i) & 0xff) !== sig[i]) return false
            }
            const ct = bytes.charCodeAt(25) & 0xff
            const bd = bytes.charCodeAt(24) & 0xff
            const il = bytes.charCodeAt(28) & 0xff
            return il === 0 && (ct === 0 || ct === 2) && bd === 8
          }
          // JPEG é sempre embutível (DCTDecode nativo)
          function ehJpeg(bytes) {
            if (!bytes || bytes.length < 2) return false
            return (bytes.charCodeAt(0) & 0xff) === 0xff && (bytes.charCodeAt(1) & 0xff) === 0xd8
          }
          // PNG com canal alfa: o Goja não tem zlib, então decodificamos com inflate
          // puro (JS), compomos sobre BRANCO e re-emitimos como DEFLATE "stored" em
          // zlib — formato aceito pelo /FlateDecode do PDF. Vale para QUALQUER logo
          // RGBA (Casafruti, Extrafruti, LL5, FoldBox), sem depender de thumb.
          // Diagnóstico: sem saber SE os bytes chegaram e QUAL é o colorType,
          // "logo nao converteu" não diz onde está o problema. Registra a
          // assinatura lida (f88 = PNG), o tamanho, o colorType e o bitDepth.
          try {
            const n = bytesParaPdf ? bytesParaPdf.length : 0
            const b0 = n > 0 ? bytesParaPdf.charCodeAt(0) & 0xff : -1
            const b1 = n > 1 ? bytesParaPdf.charCodeAt(1) & 0xff : -1
            const ctDiag = n > 25 ? bytesParaPdf.charCodeAt(25) & 0xff : -1
            const bdDiag = n > 24 ? bytesParaPdf.charCodeAt(24) & 0xff : -1
            const ilDiag = n > 28 ? bytesParaPdf.charCodeAt(28) & 0xff : -1
            console.log(
              '[PDF tarefas] diag ' +
                logoFile +
                ' bytes=' +
                n +
                ' b0=' +
                b0 +
                ' b1=' +
                b1 +
                ' colorType=' +
                ctDiag +
                ' bitDepth=' +
                bdDiag +
                ' interlace=' +
                ilDiag +
                ' jpeg=' +
                ehJpeg(bytesParaPdf) +
                ' pngDireto=' +
                pngEmbutivel(bytesParaPdf),
            )
          } catch (diagErr) {
            console.warn('[PDF tarefas] diag falhou: ' + diagErr)
          }

          if (!ehJpeg(bytesParaPdf) && !pngEmbutivel(bytesParaPdf)) {
            const convertido = pngRgbaParaEmbutivel(bytesParaPdf)
            if (convertido) {
              imgJaConvertida = convertido
              console.log(
                '[PDF tarefas] logo ' +
                  logoFile +
                  ' convertida RGBA->RGB (' +
                  convertido.width +
                  'x' +
                  convertido.height +
                  ')',
              )
            } else {
              console.warn('[PDF tarefas] logo nao converteu: ' + logoFile)
            }
          }

          logosMap[empNome] = {
            empresa: lrec.getString('empresa'),
            sigla: lrec.getString('sigla'),
            cor: lrec.getString('cor') || '#1B5E20',
            fileName: nomeParaPdf,
            rawBytes: bytesParaPdf,
            fileNameOriginal: logoFile,
            imgConvertida: imgJaConvertida,
            logoUrl: base
              ? base + '/api/files/' + colLogo.id + '/' + lrec.id + '/' + logoFile
              : '/api/files/' + colLogo.id + '/' + lrec.id + '/' + logoFile,
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao mapear logomarcas:', err)
    } finally {
      try {
        if (pbFsys && typeof pbFsys.close === 'function') pbFsys.close()
      } catch (_) {}
    }

    const hoje = new Date().toISOString().slice(0, 10)

    function formatarPrazo(prazoRaw) {
      if (!prazoRaw) return 'Sem prazo definido'
      try {
        const pStr = String(prazoRaw).slice(0, 10)
        const partes = pStr.split('-')
        if (partes.length === 3) {
          return partes[2] + '/' + partes[1] + '/' + partes[0]
        }
      } catch (_) {}
      return String(prazoRaw).slice(0, 10)
    }

    function labelStatus(s) {
      const val = String(s || '')
        .toLowerCase()
        .trim()
      if (val === 'triagem') return 'Triagem'
      if (val === 'a_fazer') return 'A Fazer'
      if (val === 'em_andamento') return 'Em Andamento'
      if (val === 'bloqueado') return 'Bloqueado'
      if (val === 'concluido' || val === 'concluida') return 'Concluído'
      return 'Pendente'
    }

    function labelPrioridade(p, alt) {
      const prio = String(p || '')
        .toUpperCase()
        .trim()
      if (prio === 'P1') return 'Alta (P1)'
      if (prio === 'P2') return 'Normal (P2)'
      if (prio === 'P3') return 'Baixa (P3)'
      const altStr = String(alt || '')
        .toLowerCase()
        .trim()
      if (altStr === 'alta') return 'Alta (P1)'
      if (altStr === 'baixa') return 'Baixa (P3)'
      return 'Normal (P2)'
    }

    function corPrioridadeBg(p) {
      const prio = String(p || '')
        .toUpperCase()
        .trim()
      if (prio === 'P1') return '#FEE2E2'
      if (prio === 'P2') return '#FEF3C7'
      return '#E0F2FE'
    }

    function corPrioridadeText(p) {
      const prio = String(p || '')
        .toUpperCase()
        .trim()
      if (prio === 'P1') return '#991B1B'
      if (prio === 'P2') return '#92400E'
      return '#075985'
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
    }

    // Item (e): Preserva formatação digitada da descrição convertendo quebras em <br/> após escape
    function renderizarDescricaoHtml(descRaw) {
      if (!descRaw) return ''
      const seguro = escapeHtml(descRaw)
      return seguro.replace(/\r?\n/g, '<br/>')
    }

    // Item (f): Deriva remetente da empresa (slug@slug.com.br)
    function derivarRemetenteEmpresa(nomeEmpresa) {
      const limpo = String(nomeEmpresa || 'Extrafruti')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
      const slug = limpo || 'extrafruti'
      return slug + '@' + slug + '.com.br'
    }

    const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const resultados = []

    for (let dIdx = 0; dIdx < destinatarios.length; dIdx++) {
      const dest = destinatarios[dIdx]
      const email = String(dest.email || '')
        .trim()
        .toLowerCase()
      const nome = String(dest.nome || '').trim() || 'Prezado(a)'
      const pId = String(dest.id || '').trim()

      if (!email || !reEmail.test(email)) {
        resultados.push({
          destinatario: nome,
          email: email,
          ok: false,
          erro: 'E-mail inválido ou ausente',
        })
        continue
      }

      // Filtra as tarefas pertinentes a este destinatário
      const tarefasDest = tarefas.filter((t) => {
        const resp = String(t.getString('responsavel') || '')
          .trim()
          .toLowerCase()
        const nomeDestNorm = nome.toLowerCase()
        if (
          resp &&
          (resp === nomeDestNorm || resp.includes(nomeDestNorm) || nomeDestNorm.includes(resp))
        ) {
          return true
        }
        if (pId) {
          try {
            const rawP = t.getString('parceiros')
            const pList = typeof rawP === 'string' ? JSON.parse(rawP || '[]') : rawP || []
            if (Array.isArray(pList) && pList.includes(pId)) return true
          } catch (_) {}
        }
        return false
      })

      const listaFinalTarefas = tarefasDest.length > 0 ? tarefasDest : tarefas

      // Agrupa tarefas por empresa
      const gruposEmpresas = {}
      for (let tIdx = 0; tIdx < listaFinalTarefas.length; tIdx++) {
        const t = listaFinalTarefas[tIdx]
        const empNome = String(t.getString('empresa') || '').trim() || 'Extrafruti'
        if (!gruposEmpresas[empNome]) gruposEmpresas[empNome] = []
        gruposEmpresas[empNome].push(t)
      }

      const nomesEmpresas = Object.keys(gruposEmpresas)
      const empPrincipal = nomesEmpresas[0] || 'Extrafruti'
      const logoPrincipalInfo =
        logosMap[empPrincipal.toLowerCase()] || logosMap['extrafruti'] || null

      const assunto =
        assuntoCustom ||
        'Tarefas & Acompanhamento — ' +
          (empPrincipal !== 'Geral' ? empPrincipal + ' · ' : '') +
          listaFinalTarefas.length +
          ' tarefa(s)'

      // Item (b): Título abaixo da logomarca dinâmico por empresa
      // Item (b): Título abaixo da logomarca dinâmico por empresa
      // Exigência do dono: "PORTAL DE GESTÃO {EMPRESA}"
      const tituloAbaixoLogo = 'PORTAL DE GESTÃO ' + empPrincipal.toUpperCase()

      // Monta HTML completo
      let html =
        '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>' +
        escapeHtml(assunto) +
        '</title></head>'
      html +=
        '<body style="margin:0;padding:24px 12px;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">'
      html +=
        '<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);border:1px solid #e5e7eb;">'

      // TOPO: LOGO CENTRALIZADA DA EMPRESA + TÍTULO DINÂMICO
      html +=
        '<div style="background-color:#ffffff;padding:28px 24px 20px;text-align:center;border-bottom:2px solid #f3f4f6;">'
      if (logoPrincipalInfo && logoPrincipalInfo.logoUrl) {
        html +=
          '<img src="' +
          escapeHtml(logoPrincipalInfo.logoUrl) +
          '" alt="' +
          escapeHtml(empPrincipal) +
          '" style="max-height:68px;max-width:220px;height:auto;display:inline-block;margin:0 auto;object-fit:contain;" />'
      } else {
        html +=
          '<div style="display:inline-block;padding:10px 22px;background:#1B5E20;color:#ffffff;border-radius:10px;font-weight:bold;font-size:18px;letter-spacing:-0.5px;">' +
          escapeHtml(empPrincipal) +
          '</div>'
      }
      // Item (b): Linha abaixo da logo dinâmica: PORTAL DE GESTÃO {EMPRESA}
      html +=
        '<div style="margin-top:10px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">' +
        escapeHtml(tituloAbaixoLogo) +
        '</div>'
      html += '</div>'

      // FAIXA DE APRESENTAÇÃO - Item (c): Título "Acompanhamento de Tarefas" centralizado e texto alinhado
      html +=
        '<div style="background:#1B5E20;color:#ffffff;padding:18px 24px;border-top:1px solid rgba(255,255,255,0.1);text-align:center;">'
      html +=
        '<h1 style="margin:0;font-size:18px;font-weight:700;line-height:1.3;color:#ffffff;text-align:center;">Acompanhamento de Tarefas</h1>'
      html +=
        '<p style="margin:6px 0 0;font-size:13px;color:#d1fae5;line-height:1.4;text-align:center;">Olá, <strong>' +
        escapeHtml(nome) +
        '</strong>. Segue o resumo das tarefas sob sua responsabilidade ou acompanhamento:</p>'
      html += '</div>'

      // CORPO DO E-MAIL: LISTA DE TAREFAS
      html += '<div style="padding:24px;">'

      const tarefasParaPdf = []

      for (let g = 0; g < nomesEmpresas.length; g++) {
        const empNome = nomesEmpresas[g]
        const tList = gruposEmpresas[empNome]

        if (nomesEmpresas.length > 1) {
          html +=
            '<div style="margin:20px 0 12px;padding-bottom:6px;border-bottom:2px solid #1B5E20;display:flex;align-items:center;justify-content:space-between;">'
          html +=
            '<span style="font-size:14px;font-weight:700;color:#1B5E20;text-transform:uppercase;letter-spacing:0.5px;">' +
            escapeHtml(empNome) +
            ' (' +
            tList.length +
            ')</span>'
          html += '</div>'
        }

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
          const prazoFormatado = formatarPrazo(prazoRaw)
          const prazoAtrasado = Boolean(
            prazoRaw && String(prazoRaw).slice(0, 10) < hoje && status !== 'Concluído',
          )
          const vinculoTipo = t.getString('vinculo_tipo') || ''
          const recorrencia = t.getString('recorrencia') || ''

          tarefasParaPdf.push({
            titulo: titulo,
            descricao: desc,
            status: status,
            prioLabel: prioLabel,
            responsavel: resp,
            prazoFormatado: prazoFormatado,
            prazoAtrasado: prazoAtrasado,
            vinculoTipo: vinculoTipo,
            recorrencia: recorrencia,
          })

          html +=
            '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-left:4px solid ' +
            (prazoAtrasado ? '#dc2626' : '#1B5E20') +
            ';border-radius:10px;padding:16px;margin-bottom:16px;">'

          // Item (d): Rótulos à esquerda da Prioridade e do Status, SEM o nome da empresa duplicado
          html += '<div style="margin-bottom:8px;font-size:11px;line-height:1.6;">'
          html += '<span style="color:#6b7280;font-weight:600;margin-right:4px;">Prioridade:</span>'
          html +=
            '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:' +
            prioBg +
            ';color:' +
            prioColor +
            ';font-weight:700;margin-right:12px;">' +
            escapeHtml(prioLabel) +
            '</span>'

          html += '<span style="color:#6b7280;font-weight:600;margin-right:4px;">Status:</span>'
          html +=
            '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#e5e7eb;color:#374151;font-weight:600;">' +
            escapeHtml(status) +
            '</span>'
          html += '</div>'

          // Título
          html +=
            '<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#111827;line-height:1.35;">' +
            escapeHtml(titulo) +
            '</h3>'

          // Item (e): Descrição preservando exatamente quebras de linha e formatação
          if (desc) {
            html +=
              '<div style="margin:0 0 12px;font-size:13px;line-height:1.55;color:#4b5563;white-space:pre-wrap;background:#ffffff;padding:10px 12px;border-radius:6px;border:1px solid #e5e7eb;">' +
              renderizarDescricaoHtml(desc) +
              '</div>'
          }

          // Grid de Detalhes
          html +=
            '<table style="width:100%;border-collapse:collapse;font-size:12px;color:#374151;margin-top:6px;">'

          // Prazo (destacado em vermelho se atrasado)
          html += '<tr>'
          html += '<td style="padding:4px 0;width:110px;color:#6b7280;font-weight:600;">Prazo:</td>'
          if (prazoAtrasado) {
            html +=
              '<td style="padding:4px 0;color:#b91c1c;font-weight:700;"><span style="background:#fee2e2;padding:2px 6px;border-radius:4px;">⚠️ ' +
              escapeHtml(prazoFormatado) +
              ' (ATRASADA)</span></td>'
          } else {
            html +=
              '<td style="padding:4px 0;font-weight:600;color:#111827;">📅 ' +
              escapeHtml(prazoFormatado) +
              '</td>'
          }
          html += '</tr>'

          // Responsável
          html += '<tr>'
          html += '<td style="padding:4px 0;color:#6b7280;font-weight:600;">Responsável:</td>'
          html += '<td style="padding:4px 0;font-weight:500;">👤 ' + escapeHtml(resp) + '</td>'
          html += '</tr>'

          // Vínculo / Origem (se houver e não for vazio/espaços)
          if (vinculoTipo && vinculoTipo.trim()) {
            html += '<tr>'
            html += '<td style="padding:4px 0;color:#6b7280;font-weight:600;">Vínculo:</td>'
            html +=
              '<td style="padding:4px 0;font-weight:500;text-transform:capitalize;">🔗 ' +
              escapeHtml(vinculoTipo.trim()) +
              '</td>'
            html += '</tr>'
          }

          // Recorrência (se houver)
          if (recorrencia && recorrencia !== 'Nenhuma') {
            html += '<tr>'
            html += '<td style="padding:4px 0;color:#6b7280;font-weight:600;">Recorrência:</td>'
            html +=
              '<td style="padding:4px 0;font-weight:500;">🔁 ' + escapeHtml(recorrencia) + '</td>'
            html += '</tr>'
          }

          html += '</table>'
          html += '</div>'
        }
      }

      html += '</div>'

      // RODAPÉ DO LAYOUT
      html +=
        '<div style="background:#f9fafb;padding:18px 24px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af;line-height:1.5;">'
      html +=
        '<strong style="color:#6b7280;">' +
        escapeHtml(tituloAbaixoLogo) +
        '</strong> · Grupo Extrafruti · Casafruti · FoldBox<br/>'
      html += 'Este e-mail foi gerado automaticamente para ciência e acompanhamento operacional.'
      html += '</div>'

      html += '</div></body></html>'

      // Versão texto plano alternativa
      let textoPlano = 'ACOMPANHAMENTO DE TAREFAS\n'
      textoPlano += tituloAbaixoLogo + '\n\n'
      textoPlano += 'Olá, ' + nome + '.\nSeguem as tarefas sob seu acompanhamento:\n\n'
      for (let i = 0; i < listaFinalTarefas.length; i++) {
        const t = listaFinalTarefas[i]
        textoPlano += i + 1 + ') ' + (t.getString('titulo') || 'Sem título') + '\n'
        textoPlano +=
          'Prioridade: ' +
          labelPrioridade(t.getString('prioridade_p'), t.getString('prioridade')) +
          '\n'
        textoPlano +=
          'Status: ' + labelStatus(t.getString('status_kanban') || t.getString('status')) + '\n'
        textoPlano += 'Prazo: ' + formatarPrazo(t.getString('prazo')) + '\n'
        textoPlano += 'Responsável: ' + (t.getString('responsavel') || '—') + '\n'
        if (t.getString('descricao')) {
          textoPlano += 'Descrição:\n' + t.getString('descricao') + '\n'
        }
        textoPlano += '-----------------------------------------\n\n'
      }

      // Item (a): GERAÇÃO DO MESMO LAYOUT EM PDF PARA ANEXAR
      let pdfFileName =
        'Tarefas_' +
        empPrincipal.replace(/[^a-zA-Z0-9]/g, '_') +
        '_' +
        hoje.replace(/-/g, '') +
        '.pdf'
      let pdfBytes = ''
      try {
        pdfBytes = gerarPdfTarefas({
          empPrincipal: empPrincipal,
          destinatarioNome: nome,
          listaTarefas: tarefasParaPdf,
          dataHoraStr: hoje,
          logoInfo: logoPrincipalInfo,
        })
      } catch (errPdf) {
        console.warn('Erro ao gerar PDF das tarefas:', errPdf)
      }

      // Item (f): Remetente derivado da empresa com fallback e log
      const remetenteDinamico = derivarRemetenteEmpresa(empPrincipal)
      const senderFallback = $app.settings().meta.senderAddress || 'gestao@extrafruti.com.br'
      const senderName = 'Painel de Gestão ' + empPrincipal

      let statusEnvio = 'enviado'
      let erroEnvio = ''
      let remetenteUsado = remetenteDinamico

      function dispararEmail(fromAddress) {
        let pdfReader = null
        try {
          const message = new MailerMessage({
            from: { address: fromAddress, name: senderName },
            to: [{ address: email }],
            subject: assunto,
            html: html,
            text: textoPlano,
            attachments: {},
          })

          // Anexa o PDF se tiver sido gerado com sucesso
          if (pdfBytes && typeof $filesystem !== 'undefined' && $filesystem.fileFromBytes) {
            try {
              const fileObj = $filesystem.fileFromBytes(pdfBytes, pdfFileName)
              if (fileObj && fileObj.reader) {
                pdfReader = fileObj.reader.open()
                message.attachments[pdfFileName] = pdfReader
              }
            } catch (errAnexo) {
              console.warn('Aviso: falha ao preparar leitor de anexo PDF:', errAnexo)
            }
          }

          $app.newMailClient().send(message)
          return { ok: true }
        } finally {
          try {
            if (pdfReader && typeof pdfReader.close === 'function') {
              pdfReader.close()
            }
          } catch (_) {}
        }
      }

      // Tenta primeiro com o From dinâmico (ex.: extrafruti@extrafruti.com.br, casafruti@casafruti.com.br)
      console.log(
        'Tentando envio de tarefas com From dinâmico: ' +
          remetenteDinamico +
          ' para ' +
          email +
          ' (empresa: ' +
          empPrincipal +
          ')',
      )

      try {
        dispararEmail(remetenteDinamico)
        console.log('Envio bem-sucedido com From dinâmico: ' + remetenteDinamico + ' para ' + email)
      } catch (errPrimario) {
        const errStr = String(errPrimario)
        console.warn(
          'Falha ao enviar com From dinâmico (' +
            remetenteDinamico +
            '): ' +
            errStr +
            '. Tentando fallback para ' +
            senderFallback,
        )

        // Se o From dinâmico foi recusado pelo relay de e-mail, tenta o fallback
        if (senderFallback && senderFallback !== remetenteDinamico) {
          try {
            remetenteUsado = senderFallback
            dispararEmail(senderFallback)
            console.log('Envio bem-sucedido com From de fallback: ' + senderFallback)
          } catch (errSecundario) {
            statusEnvio = 'erro'
            erroEnvio = String(errSecundario).slice(0, 500)
            console.error('Falha no envio com From de fallback:', errSecundario)
          }
        } else {
          statusEnvio = 'erro'
          erroEnvio = errStr.slice(0, 500)
        }
      }

      // Salva no histórico de emails
      try {
        const colEmails = $app.findCollectionByNameOrId('emails')
        const recEmail = new Record(colEmails)
        recEmail.set('para', email)
        recEmail.set('assunto', assunto)
        recEmail.set('corpo', textoPlano.slice(0, 20000))
        recEmail.set('status', statusEnvio)
        recEmail.set('erro', erroEnvio)
        recEmail.set('modelo', 'tarefas_acompanhamento')
        recEmail.set('criado_por', auth.getString('email'))
        $app.save(recEmail)
      } catch (_) {}

      // Grava auditoria com detalhes do remetente
      try {
        const aid = $security.randomString(15)
        $app
          .db()
          .newQuery(
            "INSERT INTO auditoria (id, usuario_id, usuario_email, acao, modulo, detalhe, created, updated) VALUES ({:id}, {:uid}, {:uemail}, 'enviar_tarefas_email', 'tarefas', {:det}, {:now}, {:now})",
          )
          .bind({
            id: aid,
            uid: auth.id,
            uemail: auth.getString('email'),
            det:
              'Tarefas (' +
              listaFinalTarefas.length +
              ') enviadas para ' +
              nome +
              ' <' +
              email +
              '> de <' +
              remetenteUsado +
              '> com anexo PDF ' +
              pdfFileName +
              (erroEnvio ? ' (ERRO: ' + erroEnvio.slice(0, 80) + ')' : ''),
            now: new DateTime().string(),
          })
          .execute()
      } catch (_) {}

      resultados.push({
        destinatario: nome,
        email: email,
        total_tarefas: listaFinalTarefas.length,
        remetente_tentado: remetenteDinamico,
        remetente_usado: remetenteUsado,
        anexo_pdf: pdfFileName,
        ok: statusEnvio === 'enviado',
        erro: erroEnvio || undefined,
      })
    }

    const totalEnviados = resultados.filter((r) => r.ok).length
    const totalFalhas = resultados.filter((r) => !r.ok).length

    if (totalEnviados === 0 && totalFalhas > 0) {
      return e.json(502, {
        ok: false,
        erro: resultados[0]?.erro || 'Falha no envio dos e-mails.',
        resultados: resultados,
      })
    }

    return e.json(200, {
      ok: true,
      enviados: totalEnviados,
      falhas: totalFalhas,
      resultados: resultados,
    })
  },
  $apis.requireAuth(),
)
