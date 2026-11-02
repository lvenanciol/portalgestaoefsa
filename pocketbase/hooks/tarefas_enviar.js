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
//       * Título dinâmico: "PAINEL DE GESTÃO {NOME DA EMPRESA}"
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

    // --- GERADOR DE PDF 1.4 PURO INLINE (GOJA / POCKETBASE) ---
    function gerarPdfTarefas(dados) {
      const empPrincipal = dados.empPrincipal || 'Extrafruti'
      const destNome = dados.destinatarioNome || 'Prezado(a)'
      const tarefas = dados.listaTarefas || []

      // Dimensões A4 em pontos (72 pt / pol)
      const W = 595.28
      const H = 841.89
      const marginLeft = 36
      const marginRight = 36
      const contentWidth = W - marginLeft - marginRight

      function sanitizeAscii(s) {
        if (!s) return ''
        return String(s)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
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
        const clean = escapePdfStr(sanitizeAscii(text))
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

      let curY = H - 36

      function desenharCabecalho() {
        drawRect(marginLeft, curY - 38, contentWidth, 38, { r: 1, g: 1, b: 1 }, null, null)

        const badgeText = empPrincipal.toUpperCase()
        drawText(marginLeft + 10, curY - 18, badgeText, 14, '/F2', { r: 0.11, g: 0.37, b: 0.13 })
        const subText = 'PAINEL DE GESTAO ' + empPrincipal.toUpperCase()
        drawText(marginLeft + 10, curY - 32, subText, 8.5, '/F2', { r: 0.42, g: 0.45, b: 0.5 })

        curY -= 44

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
        const vinculo = t.vinculoTipo || ''
        const recorrencia = t.recorrencia || ''

        const descLines = desc ? wrapText(desc, 78) : []
        const tituloLines = wrapText(titulo, 62)

        let cardH = 14 + 16 + tituloLines.length * 15 + 8
        if (descLines.length > 0) {
          cardH += descLines.length * 12 + 16
        }
        cardH += 4 * 14 + 10
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

        // Vínculo
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
        objects.push({
          id: pageIds[p],
          body:
            '<< /Type /Page /Parent ' +
            pagesId +
            ' 0 R /MediaBox [0 0 ' +
            W.toFixed(2) +
            ' ' +
            H.toFixed(2) +
            '] /Resources << /Font << /F1 ' +
            fontRegularId +
            ' 0 R /F2 ' +
            fontBoldId +
            ' 0 R >> >> /Contents ' +
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

    // 3. Mapa de logomarcas das empresas ativas
    const logosMap = {}
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
          logosMap[empNome] = {
            empresa: lrec.getString('empresa'),
            sigla: lrec.getString('sigla'),
            cor: lrec.getString('cor') || '#1B5E20',
            logoUrl: base
              ? base + '/api/files/' + colLogo.id + '/' + lrec.id + '/' + logoFile
              : '/api/files/' + colLogo.id + '/' + lrec.id + '/' + logoFile,
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao mapear logomarcas:', err)
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
      const tituloAbaixoLogo = 'PAINEL DE GESTÃO ' + empPrincipal.toUpperCase()

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
      // Item (b): Linha abaixo da logo dinâmica: PAINEL DE GESTÃO {EMPRESA}
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

          // Vínculo / Origem (se houver)
          if (vinculoTipo) {
            html += '<tr>'
            html += '<td style="padding:4px 0;color:#6b7280;font-weight:600;">Vínculo:</td>'
            html +=
              '<td style="padding:4px 0;font-weight:500;text-transform:capitalize;">🔗 ' +
              escapeHtml(vinculoTipo) +
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
