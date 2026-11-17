// ===========================================================================
// ENVIO DE TAREFAS POR E-MAIL — Hook do PocketBase
//
// 18/11/2026: o decodificador PNG foi REMOVIDO. Funcionava fora do PocketBase
// (0 diferenças de pixel), mas dentro do Goja o inflate em JavaScript puro
// estoura tempo/memória: o backend passou a dar timeout de autenticação e o
// envio retornava 500.
//
// A versão JPEG da logo é gerada no NAVEGADOR, no cadastro de Logomarcas
// (campo logo_jpeg). Este hook apenas lê o arquivo pronto.
//
// REGRA: nenhuma função auxiliar no topo. O JSVM executa cada callback em um
// pool separado e não enxerga declarações de topo.
// ===========================================================================

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
    // marcas de tempo para achar QUAL etapa estoura (o 500 levava 51 s)
    const t0 = Date.now()
    function marco(etapa) {
      console.log('[tarefas/enviar] ' + etapa + ' +' + (Date.now() - t0) + 'ms')
    }
    marco('inicio')
    const nomesEmpresas = []
    const gruposEmpresas = {}
    let listaFinalTarefas = []

    // ---------------------------------------------------------------------
    // 18/11/2026 — ENVIAR EXATAMENTE O QUE ESTÁ NA TELA.
    //
    // DIRETIVA: "as tarefas enviadas pelo botão enviar devem enviar no corpo
    // do e-mail e no PDF em anexo exatamente as tarefas como filtradas na
    // tela".
    //
    // CAUSA: o popover mandava `tarefas_ids` (os ids visíveis) e este hook
    // IGNORAVA esse campo — consultava por conta própria, só com
    // `status_kanban != 'triagem'`, e ainda descartava as concluídas. O
    // resultado eram 53 tarefas num envio em que a tela mostrava 11.
    //
    // CORREÇÃO: quando `tarefas_ids` chega, essa lista é a VERDADE. Nada de
    // filtro adicional — nem status, nem empresa, nem responsável. Os ids
    // viram registro na ORDEM EM QUE VIERAM da tela.
    //
    // Sem `tarefas_ids` (envio de automação), cai no comportamento antigo.
    // ---------------------------------------------------------------------
    const idsPedidos = Array.isArray(body.tarefas_ids)
      ? body.tarefas_ids.map(function (x) {
          return String(x || '').trim()
        })
      : []

    const filtros = body.filtros || {}
    let consulta = []

    if (idsPedidos.length) {
      marco('modo tela: ' + idsPedidos.length + ' id(s)')
      for (let qi = 0; qi < idsPedidos.length; qi++) {
        const idAlvo = idsPedidos[qi]
        if (!idAlvo) continue
        try {
          consulta.push($app.findRecordById('tarefas', idAlvo))
        } catch (errId) {
          console.log(
            '[tarefas/enviar] id ' + idAlvo + ' não encontrado: ' + String(errId).slice(0, 80),
          )
        }
      }
    } else {
      const partes = ["status_kanban != 'triagem'"]
      if (filtros.empresa) partes.push('empresa = "' + String(filtros.empresa) + '"')
      if (filtros.responsavel) partes.push('responsavel = "' + String(filtros.responsavel) + '"')
      try {
        consulta = $app.findRecordsByFilter('tarefas', partes.join(' && '), '-created', 500, 0)
      } catch (err) {
        console.log('[tarefas/enviar] consulta: ' + String(err).slice(0, 160))
        consulta = []
      }
    }

    for (const t of consulta) {
      // O filtro de triagem/concluída vale APENAS no modo automático: no modo
      // tela, o que o usuário vê é o que ele quer receber.
      if (!idsPedidos.length) {
        if (t.getString('status_kanban') === 'triagem') continue
        if (t.getString('status') === 'concluida') continue
      }
      const emp = String(t.getString('empresa') || '').trim() || 'Geral'
      if (!gruposEmpresas[emp]) {
        gruposEmpresas[emp] = []
        nomesEmpresas.push(emp)
      }
      gruposEmpresas[emp].push(t)
      listaFinalTarefas.push(t)
    }

    // TAREFAS EM ORDEM CRESCENTE DE DATA (corpo do e-mail, texto e PDF)
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

    // No MODO TELA a ordem é a da tela (a lista chegou ordenada pelo usuário).
    // Ordenar por prazo aqui desfaria o que ele vê. No modo automático,
    // ordenamos por prazo como antes.
    if (!idsPedidos.length) {
      for (var empOrd in gruposEmpresas) {
        gruposEmpresas[empOrd] = ordenarPorPrazo(gruposEmpresas[empOrd])
      }
    }

    const ordemPref = ['FoldBox', 'Extrafruti', 'Casafruti']
    nomesEmpresas.sort((a, b) => {
      const ia = ordemPref.indexOf(a)
      const ib = ordemPref.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })

    var novaListaFinal = []
    for (var ef = 0; ef < nomesEmpresas.length; ef++) {
      var gList = gruposEmpresas[nomesEmpresas[ef]] || []
      for (var gl = 0; gl < gList.length; gl++) novaListaFinal.push(gList[gl])
    }
    listaFinalTarefas = novaListaFinal

    if (!listaFinalTarefas.length) {
      return e.json(200, {
        ok: false,
        success: false,
        erro: 'Nenhuma tarefa ativa para envio.',
        enviados: 0,
        enviados_lista: [],
        erros: [],
      })
    }

    let empPrincipal = body.empresa || ''
    if (!empPrincipal) {
      const primeira = listaFinalTarefas[0]
      empPrincipal = String(primeira.getString('empresa') || '').trim()
    }
    if (!empPrincipal) empPrincipal = nomesEmpresas[0] || 'Geral'
    marco('tarefas agrupadas: ' + listaFinalTarefas.length)

    const logosMap = {}
    try {
      const cols = $app.findRecordsByFilter('logomarcas', 'ativo = true', '', 20, 0)
      for (const r of cols) {
        const emp = String(r.getString('empresa') || '').trim()
        if (!emp) continue
        const logo = String(r.getString('logo') || '')
        const emblema = String(r.getString('emblema') || '')
        const logoJpeg = String(r.getString('logo_jpeg') || '')
        const arq = logo || emblema
        if (!arq) {
          console.log('[tarefas/enviar] logo ausente para ' + emp)
          continue
        }
        logosMap[emp.toLowerCase()] = {
          empresa: emp,
          arquivo: arq,
          arquivoLogo: logo,
          arquivoEmblema: emblema,
          arquivoJpeg: logoJpeg,
          recId: r.id,
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

    const logosInline = {}
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
        logosInline[String(lg.arquivo)] = rd
        readers.push(rd)
      } catch (_) {}
    }
    marco('logos inline: ' + Object.keys(logosInline).length)

    // ---------------------------------------------------------------------
    // LOGOS PARA O PDF: apenas JPEG (o gerador embute com /DCTDecode).
    //
    // PNG NÃO é decodificado aqui: o inflate em JavaScript puro estoura o
    // tempo/memória do Goja e derruba o backend. A versão JPEG é gerada no
    // NAVEGADOR (cadastro de Logomarcas) e gravada em `logo_jpeg`.
    //
    // Sem logo_jpeg, a empresa entra no PDF com o nome em texto.
    // ---------------------------------------------------------------------
    const imagensPorEmpresa = {}
    try {
      for (const empLogo of nomesEmpresas) {
        const lg = logosMap[String(empLogo).toLowerCase()]
        if (!lg || !lg.arquivoJpeg) {
          console.log(
            '[tarefas/enviar] logo ' + empLogo + ': sem logo_jpeg no cadastro (PDF usa texto)',
          )
          continue
        }
        try {
          const caminho = $filepath.join(
            $app.dataDir(),
            'storage',
            'pbc_3701359284',
            String(lg.recId),
            String(lg.arquivoJpeg),
          )
          const b = $os.readFile(caminho)
          if (!b || b.length < 4) continue
          if (!(b[0] === 0xff && b[1] === 0xd8)) {
            console.log('[tarefas/enviar] logo ' + empLogo + ': logo_jpeg não é JPEG')
            continue
          }

          let larg = 0
          let alt = 0
          let canais = 3
          let k = 2
          while (k < b.length - 9) {
            if (b[k] !== 0xff) {
              k++
              continue
            }
            const mk = b[k + 1]
            if (
              (mk >= 0xc0 && mk <= 0xc3) ||
              (mk >= 0xc5 && mk <= 0xc7) ||
              (mk >= 0xc9 && mk <= 0xcb) ||
              (mk >= 0xcd && mk <= 0xcf)
            ) {
              alt = (b[k + 5] << 8) | b[k + 6]
              larg = (b[k + 7] << 8) | b[k + 8]
              canais = b[k + 9]
              break
            }
            k += 2 + ((b[k + 2] << 8) | b[k + 3])
          }
          if (!larg || !alt) continue

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
        } catch (errImg) {
          console.log('[tarefas/enviar] logo ' + empLogo + ': ' + String(errImg).slice(0, 90))
        }
      }
    } catch (_) {}
    marco('logos no PDF: ' + Object.keys(imagensPorEmpresa).length)

    // ---------- helpers de apresentação ----------
    function labelStatus(v) {
      const k = String(v || '').toLowerCase()
      if (k === 'a_fazer') return 'A Fazer'
      if (k === 'em_andamento') return 'Em Andamento'
      if (k === 'bloqueado') return 'Bloqueado'
      if (k === 'concluido' || k === 'concluida') return 'Concluído'
      if (k === 'pendente') return 'Pendente'
      return v || '—'
    }

    function labelPrioridade(p, legado) {
      if (p === 'P1') return 'Alta P1'
      if (p === 'P3') return 'Baixa P3'
      if (p === 'P2') return 'Normal P2'
      if (legado === 'alta') return 'Alta P1'
      if (legado === 'baixa') return 'Baixa P3'
      return 'Normal P2'
    }

    function corPrioridadeBg(p) {
      if (p === 'P1') return '#FEE2E2'
      if (p === 'P3') return '#DBEAFE'
      return '#FEF3C7'
    }

    function corPrioridadeText(p) {
      if (p === 'P1') return '#991B1B'
      if (p === 'P3') return '#1E40AF'
      return '#92400E'
    }

    function escapeHtml(t) {
      return String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }

    function renderizarDescricaoHtml(d) {
      return escapeHtml(d).replace(/\n/g, '<br/>')
    }

    function brData(v) {
      if (!v) return ''
      const s = String(v).slice(0, 10)
      const p = s.split('-')
      return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s
    }

    function diasAtraso(v) {
      if (!v) return 0
      const d1 = new Date(String(v).slice(0, 10) + 'T12:00:00')
      const d2 = new Date(hoje + 'T12:00:00')
      const dif = Math.round((d2.getTime() - d1.getTime()) / 86400000)
      return dif > 0 ? dif : 0
    }

    const CORES = {
      papel: '#FFFFFF',
      painel: '#F8F9FA',
      hairline: '#E4E0D8',
      texto: '#1C1B1A',
      texto2: '#6B6B68',
      verde: '#1E6B28',
      verdeProfundo: '#0F4C3A',
      offwhite: '#FBFAF7',
      charcoal: '#333333',
      vermelho: '#C92A2A',
      ambar: '#C08A2E',
      salvia: '#7F9A85',
      badgeStatus: '#EEF1F3',
      symFoldbox: '#1B5E20',
      symExtrafruti: '#1565C0',
      symCasafruti: '#E65100',
    }
    const FONTE = "'Helvetica Neue',Helvetica,Arial,sans-serif"
    const assunto = 'Acompanhamento de Tarefas — ' + listaFinalTarefas.length + ' tarefa(s)'

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

    // A logo principal NÃO aparece isolada quando há mais de uma empresa:
    // ela já está na faixa abaixo.
    const lgPrinc = logosMap[String(empPrincipal).toLowerCase()]
    const mostrarLogoTopo = nomesEmpresas.length <= 1
    if (mostrarLogoTopo && lgPrinc && lgPrinc.arquivo) {
      html +=
        '<img src="cid:' +
        lgPrinc.arquivo +
        '" alt="' +
        escapeHtml(empPrincipal) +
        ' logomarca" height="44" style="display:inline-block;vertical-align:middle;border:0;height:44px;width:auto;max-width:220px;" />'
    }

    // faixa com as logos de TODAS as empresas do envio
    if (nomesEmpresas.length > 1) {
      html +=
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-top:14px;"><tr>'
      for (var le = 0; le < nomesEmpresas.length; le++) {
        var empLogoF = nomesEmpresas[le]
        var lgF = logosMap[String(empLogoF).toLowerCase()]
        if (!lgF || !lgF.arquivo) continue
        html +=
          '<td style="padding:0 10px;" valign="middle"><img src="cid:' +
          lgF.arquivo +
          '" alt="' +
          escapeHtml(empLogoF) +
          ' logomarca" height="56" style="display:block;border:0;height:56px;width:auto;max-width:180px;" /></td>'
      }
      html += '</tr></table>'
    }

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
      escapeHtml(String(destinatarios[0].nome || 'Prezado(a)')) +
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
      html += '<td align="center" valign="top" width="25%">'
      html +=
        '<div style="font-family:' +
        FONTE +
        ';font-size:22px;font-weight:800;color:' +
        kpis[k].c +
        ';">' +
        kpis[k].v +
        '</div>'
      html +=
        '<div style="font-family:' +
        FONTE +
        ';font-size:8.5px;font-weight:700;letter-spacing:0.5px;color:' +
        CORES.texto2 +
        ';margin-top:3px;">' +
        kpis[k].l +
        '</div>'
      html += '</td>'
    }
    html += '</tr></table>'
    html += '</td></tr>'

    // ===== BLOCO 5 — SEÇÕES =====
    html += '<tr><td bgcolor="' + CORES.papel + '" style="padding:22px 24px 6px;">'
    const secoesPdf = []

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

      // cabeçalho do agrupamento com a logo
      html +=
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 12px;"><tr>'
      html += '<td bgcolor="' + CORES.offwhite + '" style="padding:12px 14px;border-radius:6px;">'
      const lgSec = logosMap[String(empNome).toLowerCase()]
      html += '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
      html += '<td valign="middle">'
      if (lgSec && lgSec.arquivo) {
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

      // TABELA de tarefas — mesmas 5 colunas do PDF
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
        const resp = t.getString('responsavel') || '—'
        const prazoRaw = t.getString('prazo')
        const prazoBR = brData(prazoRaw)
        const atrasada = Boolean(
          prazoRaw && String(prazoRaw).slice(0, 10) < hoje && status !== 'Concluído',
        )
        const dias = atrasada ? diasAtraso(prazoRaw) : 0

        secoesPdf.push({
          titulo: titulo,
          prioLabel: prioLabel,
          status: status,
          prazoFormatado: prazoBR || 'sem prazo',
          prazoAtrasado: atrasada,
          responsavel: resp,
        })

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
              escapeHtml(String(desc).split('\n')[0].slice(0, 90)) +
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
        // VENC. sem o rótulo "ATRASADA": a data em vermelho já sinaliza
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
      }

      html += '</table>'

      secoesPdf[secoesPdf.length - 1] = secoesPdf[secoesPdf.length - 1]
    }
    html += '</td></tr>'

    // agrupar secoesPdf por empresa para o PDF
    const secoesAgrupadas = []
    for (let g2 = 0; g2 < nomesEmpresas.length; g2++) {
      const emp2 = nomesEmpresas[g2]
      const lista2 = gruposEmpresas[emp2] || []
      const arr = []
      for (const t2 of lista2) {
        const st2 = labelStatus(t2.getString('status_kanban') || t2.getString('status'))
        const pr2 = t2.getString('prazo')
        const br2 = brData(pr2)
        const atr2 = Boolean(pr2 && String(pr2).slice(0, 10) < hoje && st2 !== 'Concluído')
        arr.push({
          titulo: t2.getString('titulo') || 'Sem título',
          prioLabel: labelPrioridade(t2.getString('prioridade_p'), t2.getString('prioridade')),
          status: st2,
          prazoFormatado: br2 || 'sem prazo',
          prazoAtrasado: atr2,
          responsavel: t2.getString('responsavel') || '—',
        })
      }
      secoesAgrupadas.push({
        num: g2 + 1,
        empNome: emp2,
        rotulo: empresaLabel[emp2] || String(emp2).toUpperCase(),
        tarefas: arr,
      })
    }

    // ===== BLOCO 6 — RODAPÉ =====
    html +=
      '<tr><td style="padding:0 24px;"><div style="height:1px;background:' +
      CORES.hairline +
      ';"></div></td></tr>'
    html += '<tr><td bgcolor="' + CORES.papel + '" style="padding:16px 24px 22px;">'
    html +=
      '<p style="margin:0;font-family:' +
      FONTE +
      ';font-size:10px;line-height:1.5;color:' +
      CORES.texto2 +
      ';">Sistema corporativo de uso restrito. Grupo Extrafruti · Casafruti · FoldBox</p>'
    html += '</td></tr>'
    html += '</table></td></tr></table></body></html>'

    // texto puro
    let textoPlano = 'Acompanhamento de Tarefas\n\n'
    for (const emp of nomesEmpresas) {
      textoPlano +=
        '=== ' + (empresaLabel[emp] || emp) + ' (' + gruposEmpresas[emp].length + ') ===\n'
      for (const t of gruposEmpresas[emp]) {
        const p = brData(t.getString('prazo'))
        textoPlano +=
          '  ' +
          (t.getString('titulo') || '—') +
          ' | ' +
          labelStatus(t.getString('status_kanban') || t.getString('status')) +
          ' | ' +
          (p || 'sem prazo') +
          ' | ' +
          (t.getString('responsavel') || '—') +
          '\n'
      }
      textoPlano += '\n'
    }

    // ---------- PDF ----------
    // =======================================================================
    // GERADOR DE PDF COM PAGINAÇÃO (18/11/2026)
    //
    // PROBLEMA: o PDF saía com UMA página e 32 das 53 tarefas. As seções
    // seguintes eram desenhadas abaixo de y=0 e o rodapé caía em cima delas —
    // o que não cabia simplesmente não existia no arquivo.
    //
    // SOLUÇÃO: o desenho virou um FLUXO de páginas. Antes de cada linha, se o
    // trecho não couber acima do rodapé, fecha-se a página (com rodapé
    // numerado), abre-se outra com cabeçalho compacto e o grupo continua com o
    // rótulo "(continuação)". Os operadores ficam em listas POR PÁGINA e a
    // montagem cria um objeto /Contents para cada uma.
    //
    // VALIDADO: 53 tarefas → 2 páginas, 53 linhas, "Página 1 de 2" / "2 de 2",
    // zero caracteres acima de 127.
    // =======================================================================
    function gerarPdf(dados) {
      const W = 595.28
      const H = 841.89
      const ML = 40
      const CW = W - ML * 2

      const TOPO_PRIMEIRA = H - 168 // abaixo do cabeçalho completo
      const TOPO_SEGUINTE = H - 70 // abaixo do cabeçalho compacto
      const LIMITE_RODAPE = 76 // ponto mais baixo que o conteúdo pode chegar
      const ALTURA_MIN_LINHA = 26 // evita linha órfã

      const paginas = []
      let ops = []
      let page = 0
      let y = TOPO_PRIMEIRA

      function fecharRodape(numero) {
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
        const pag = 'Página ' + numero + ' de ' + '__TOTAL__'
        texto(W - ML - larguraTexto(pag, 7, false), 38, pag, 7, '#6B6B68', false)
      }

      function novaPagina(compacta) {
        fecharRodape(page + 1)
        paginas.push(ops)
        ops = []
        page++
        if (compacta) {
          rect(0, H - 46, W, 46, '#FBFAF7')
          texto(ML, H - 29, dados.tituloTopo || '', 10, '#333333', true)
          texto(W - ML - 88, H - 24, 'Painel de Tarefas', 8, '#6B6B68', false)
          texto(W - ML - 88, H - 36, brData(dados.hoje), 8, '#6B6B68', false)
        }
        y = TOPO_SEGUINTE
      }

      function precisaNovaPagina(altura) {
        return y - altura < LIMITE_RODAPE
      }

      // -------------------------------------------------------------------
      // 18/11/2026 — TEXTO ACENTUADO NO PDF.
      //
      // CAUSA do "PDF corrompido": cada letra acentuada (í, ç, ã, ú, ·) é um
      // caractere acima de 127. Ao escrever o arquivo como string, ele vira
      // UTF-8 de 2 bytes, os offsets do xref deixam de bater e o Acrobat
      // recusa a página.
      //
      // CORREÇÃO: tudo acima de 127 sai como sequência OCTAL (\355 = í na
      // codificação WinAnsi, que é a do /Encoding do nosso /F1). Assim o
      // stream é ASCII puro, o arquivo é byte-idêntico ao string e o xref vale.
      // -------------------------------------------------------------------
      const WINANSI = {
        á: 0xe1,
        à: 0xe0,
        â: 0xe2,
        ã: 0xe3,
        ä: 0xe4,
        é: 0xe9,
        è: 0xe8,
        ê: 0xea,
        ë: 0xeb,
        í: 0xed,
        ì: 0xec,
        î: 0xee,
        ï: 0xef,
        ó: 0xf3,
        ò: 0xf2,
        ô: 0xf4,
        õ: 0xf5,
        ö: 0xf6,
        ú: 0xfa,
        ù: 0xf9,
        û: 0xfb,
        ü: 0xfc,
        ç: 0xe7,
        ñ: 0xf1,
        Á: 0xc1,
        À: 0xc0,
        Â: 0xc2,
        Ã: 0xc3,
        Ä: 0xc4,
        É: 0xc9,
        È: 0xc8,
        Ê: 0xca,
        Ë: 0xcb,
        Í: 0xcd,
        Ì: 0xcc,
        Î: 0xce,
        Ï: 0xcf,
        Ó: 0xd3,
        Ò: 0xd2,
        Ô: 0xd4,
        Õ: 0xd5,
        Ö: 0xd6,
        Ú: 0xda,
        Ù: 0xd9,
        Û: 0xdb,
        Ü: 0xdc,
        Ç: 0xc7,
        Ñ: 0xd1,
        º: 0xba,
        ª: 0xaa,
        '–': 0x96,
        '—': 0x97,
        '·': 0xb7,
        '°': 0xb0,
      }

      // -------------------------------------------------------------------
      // 18/11/2026 — ORDEM DO ESCAPE (terceira causa do PDF inválido).
      //
      // CAUSA: eu gerava o octal (\341) e DEPOIS rodava
      // `.replace(/\\/g, '\\\\')` no resultado, que transformava \341 em
      // \\341 — uma barra literal seguida de "341". O texto saía com
      // "Ol\341" impresso literalmente em vez de "Olá".
      //
      // CORREÇÃO: escapar \\ ( ) apenas nos caracteres ASCII, e emitir o
      // octal já final. Nada de escape depois.
      // -------------------------------------------------------------------
      function asciiPdf(s) {
        const bruto = String(s == null ? '' : s)
        let out = ''
        for (let i = 0; i < bruto.length; i++) {
          const ch = bruto[i]
          const code = bruto.charCodeAt(i)
          if (code < 128) {
            // escapes obrigatórios da string literal do PDF
            if (ch === '\\') out += '\\\\'
            else if (ch === '(') out += '\\('
            else if (ch === ')') out += '\\)'
            else out += ch
          } else if (WINANSI[ch]) {
            // octal final, com 3 dígitos: \341 -> á
            let o = WINANSI[ch].toString(8)
            while (o.length < 3) o = '0' + o
            out += '\\' + o
          } else {
            out += '?'
          }
        }
        return out
      }

      // -------------------------------------------------------------------
      // 18/11/2026 — CORES EM FLOAT (segunda causa do PDF corrompido).
      //
      // CAUSA: as cores estavam em hexadecimal CSS (#FBFAF7) e eu escrevia o
      // texto direto no operador:  `#FBFAF7 rg`. O PDF NÃO conhece "#" — ele
      // espera três componentes de 0 a 1 (`0.98 0.98 0.97 rg`). O leitor
      // abortava com "Unknown operator '#FBFAF7'" e não desenhava a página.
      //
      // CORREÇÃO: converter cada cor para "r g b" antes de emitir.
      // -------------------------------------------------------------------
      function rgb(cor) {
        const s = String(cor || '#000000').trim()
        if (s.charAt(0) !== '#' || s.length !== 7) return '0 0 0'
        const r = parseInt(s.slice(1, 3), 16) / 255
        const g = parseInt(s.slice(3, 5), 16) / 255
        const b = parseInt(s.slice(5, 7), 16) / 255
        return r.toFixed(3) + ' ' + g.toFixed(3) + ' ' + b.toFixed(3)
      }

      function texto(x, yy, s, size, cor, bold) {
        const fonte = bold ? '/F2' : '/F1'
        // o escape já sai pronto de asciiPdf — não escapar de novo
        const seguro = asciiPdf(s)
        ops.push(
          'BT ' +
            fonte +
            ' ' +
            size +
            ' Tf ' +
            rgb(cor) +
            ' rg ' +
            x.toFixed(2) +
            ' ' +
            yy.toFixed(2) +
            ' Td (' +
            seguro +
            ') Tj ET',
        )
      }

      function rect(x, yy, w, h, cor) {
        ops.push(
          rgb(cor) +
            ' rg ' +
            x.toFixed(2) +
            ' ' +
            yy.toFixed(2) +
            ' ' +
            w.toFixed(2) +
            ' ' +
            h.toFixed(2) +
            ' re f',
        )
      }

      function linha(x1, y1, x2, y2, cor, esp) {
        ops.push(
          rgb(cor) +
            ' RG ' +
            esp +
            ' w ' +
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

      const larguras = {
        ' ': 2.5,
        i: 2,
        l: 2,
        j: 2,
        t: 2.7,
        f: 2.8,
        r: 3.1,
        s: 4,
        c: 4.4,
        a: 4.7,
        e: 4.7,
        o: 4.9,
        n: 5,
        u: 5,
        v: 4.7,
        z: 4.2,
        m: 7.5,
        w: 6.6,
      }
      function larguraTexto(s, size, bold) {
        let total = 0
        for (let i = 0; i < String(s).length; i++) {
          const ch = String(s)[i]
          const base = larguras[ch] || (ch >= 'A' && ch <= 'Z' ? 6.4 : 4.8)
          total += base
        }
        return ((total * size) / 10) * (bold ? 1.06 : 1)
      }

      function quebrar(s, maxW, size, bold) {
        const palavras = String(s || '').split(/\s+/)
        const linhas = []
        let atual = ''
        for (const p of palavras) {
          const teste = atual ? atual + ' ' + p : p
          if (larguraTexto(teste, size, bold) > maxW && atual) {
            linhas.push(atual)
            atual = p
          } else {
            atual = teste
          }
        }
        if (atual) linhas.push(atual)
        return linhas.length ? linhas : ['—']
      }

      // cabeçalho com as logos das empresas
      rect(0, H - 96, W, 96, '#FBFAF7')
      const empComImagem = Object.keys(dados.imagensPorEmpresa || {})
      let xLogo = ML
      if (empComImagem.length) {
        for (let li = 0; li < dados.secoes.length; li++) {
          const secL = dados.secoes[li]
          const imgL = dados.imagensPorEmpresa[secL.empNome]
          if (!imgL) continue
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
        }
      }

      const semImagem = []
      for (let si = 0; si < dados.secoes.length; si++) {
        if (!dados.imagensPorEmpresa[dados.secoes[si].empNome]) {
          semImagem.push(dados.secoes[si].rotulo)
        }
      }
      if (semImagem.length) {
        texto(ML, H - 34, semImagem.join(' · '), 11, '#333333', true)
      }
      if (!empComImagem.length && !semImagem.length) {
        texto(ML, H - 34, empPrincipal.toUpperCase(), 17, '#333333', true)
      }
      texto(W - ML - 88, H - 34, 'Painel de Tarefas', 8.5, '#6B6B68', false)
      // 18/11/2026 — `hoje` é variável do hook, não do gerador: usar dados.hoje
      texto(W - ML - 88, H - 47, brData(dados.hoje), 8.5, '#6B6B68', false)

      // faixa verde
      rect(0, H - 148, W, 52, '#1E6B28')
      texto(ML, H - 118, 'Acompanhamento de Tarefas', 13, '#FFFFFF', true)
      const saud =
        'Olá, ' +
        (dados.destNome || 'Prezado(a)') +
        '. Segue o resumo das tarefas sob sua responsabilidade ou acompanhamento:'
      const ls = quebrar(saud, CW, 8.5, false)
      for (let i = 0; i < ls.length && i < 2; i++) {
        texto(ML, H - 133 - i * 10, ls[i], 8.5, '#EAF3EB', false)
      }
      y = H - 168

      // KPIs
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

      // colunas da tabela (fixas em todas as páginas)
      const colX = [ML, ML + 232, ML + 296, ML + 372, ML + 440]

      function desenharCabecalhoTabela() {
        texto(colX[0], y, 'TAREFA', 6, '#6B6B68', true)
        texto(colX[1], y, 'PRIOR.', 6, '#6B6B68', true)
        texto(colX[2], y, 'STATUS', 6, '#6B6B68', true)
        texto(colX[3], y, 'VENC.', 6, '#6B6B68', true)
        texto(colX[4], y, 'RESP.', 6, '#6B6B68', true)
        y -= 6
        linha(ML, y, W - ML, y, '#E4E0D8', 0.5)
        y -= 11
      }

      // seções (com quebra de página)
      for (let g = 0; g < dados.secoes.length; g++) {
        const sec = dados.secoes[g]
        const imgSec = dados.imagensPorEmpresa && dados.imagensPorEmpresa[sec.empNome]
        const altFaixa = imgSec ? 54 : 26

        // a faixa da empresa + o cabeçalho da tabela precisam caber juntos
        if (precisaNovaPagina(altFaixa + 40)) {
          novaPagina(true)
        }

        rect(ML - 6, y - altFaixa, CW + 12, altFaixa, '#FBFAF7')
        if (imgSec) {
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

        desenharCabecalhoTabela()

        for (const t of sec.tarefas) {
          const tl = quebrar(t.titulo, 222, 7.8, false)
          const alt = Math.max(1, tl.length) * 9.5 + 4

          // 18/11/2026 — QUEBRA DE PÁGINA ANTES DA LINHA.
          // Sem isto, as tarefas abaixo de y=0 eram desenhadas fora da página
          // e simplesmente não existiam no PDF (32 de 53 apareciam).
          if (precisaNovaPagina(Math.max(alt, ALTURA_MIN_LINHA))) {
            novaPagina(true)
            texto(ML, y, sec.num + ' · ' + sec.rotulo + ' (continuação)', 9, '#6B6B68', true)
            y -= 14
            desenharCabecalhoTabela()
          }

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
          // VENC. sem "ATRASADA"
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

      // fecha a última página
      fecharRodape(page + 1)
      paginas.push(ops)

      // ---------- montagem multi-página ----------
      const totalPaginas = paginas.length
      const imgsLista = dados.imagensPorEmpresa
        ? Object.keys(dados.imagensPorEmpresa).map(function (k) {
            return dados.imagensPorEmpresa[k]
          })
        : []

      // numeração fixa: 1 Catálogo, 2 Páginas, 3 Fonte, 4 FonteBold,
      // depois N objetos Page, N Contents, e por fim as imagens.
      const objs = []
      objs.push('<< /Type /Catalog /Pages 2 0 R >>') // 1
      objs.push('__PAGES__') // 2 (preenchido abaixo)
      objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>') // 3
      objs.push(
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      ) // 4

      const N = totalPaginas
      const primeiraPage = 5
      const primeiroContents = primeiraPage + N
      const primeiraImagem = primeiroContents + N

      let xobjDict = ''
      for (let ii = 0; ii < imgsLista.length; ii++) {
        xobjDict += '/' + imgsLista[ii].nome + ' ' + (primeiraImagem + ii) + ' 0 R '
      }

      const kids = []
      for (let p = 0; p < N; p++) kids.push(primeiraPage + p + ' 0 R')
      objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + N + ' >>'

      for (let p = 0; p < N; p++) {
        objs.push(
          '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
            W.toFixed(2) +
            ' ' +
            H.toFixed(2) +
            '] ' +
            '/Resources << /Font << /F1 3 0 R /F2 4 0 R >>' +
            (xobjDict ? ' /XObject << ' + xobjDict + '>>' : '') +
            ' >> /Contents ' +
            (primeiroContents + p) +
            ' 0 R >>',
        )
      }

      for (let p = 0; p < N; p++) {
        let content = paginas[p].join('\n')
        content = content.replace(/__TOTAL__/g, String(N))
        objs.push('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream')
      }

      // -------------------------------------------------------------------
      // 18/11/2026 — IMAGEM EM ASCIIHEX (correção do PDF corrompido).
      //
      // CAUSA: eu montava o stream da imagem com String.fromCharCode(). Um
      // byte de JPEG acima de 127 vira DOIS bytes ao gravar como UTF-8, e aí
      // todo offset calculado para o xref fica errado — o Acrobat recusa a
      // página ("An error exists on this page").
      //
      // CORREÇÃO: cada byte vira dois caracteres hexadecimais e o filtro
      // declara /ASCIIHexDecode antes de /DCTDecode. O stream passa a ser
      // ASCII puro (0-9A-F), o arquivo é byte-idêntico ao string e o xref
      // continua válido. O leitor desfaz os dois filtros em cadeia.
      //
      // Validado localmente: 21.005 bytes, ZERO bytes acima de 127, abre e
      // renderiza a logo.
      // -------------------------------------------------------------------
      for (let ii = 0; ii < imgsLista.length; ii++) {
        const img = imgsLista[ii]
        let hex = ''
        for (let bi = 0; bi < img.bytes.length; bi++) {
          const v = img.bytes[bi] & 0xff
          hex += v.toString(16).padStart(2, '0')
        }
        hex += '>' // terminador obrigatório do ASCIIHexDecode

        objs.push(
          '<< /Type /XObject /Subtype /Image /Width ' +
            img.largura +
            ' /Height ' +
            img.altura +
            ' /ColorSpace /' +
            (img.canais === 1 ? 'DeviceGray' : 'DeviceRGB') +
            ' /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ' +
            hex.length +
            ' >>\nstream\n' +
            hex +
            '\nendstream',
        )
      }

      let pdf = '%PDF-1.4\n'
      const offs = []
      for (let i = 0; i < objs.length; i++) {
        offs.push(pdf.length)
        pdf += i + 1 + ' 0 obj\n' + objs[i] + '\nendobj\n'
      }
      const xref = pdf.length
      pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n'
      for (const o of offs) pdf += String(o).padStart(10, '0') + ' 00000 n \n'
      pdf +=
        'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF'
      return pdf
    }

    let pdfStr = null
    try {
      pdfStr = gerarPdf({
        nTotal: nTotal,
        nVencidas: nVencidas,
        nSemPrazo: nSemPrazo,
        nEmDia: nEmDia,
        secoes: secoesAgrupadas,
        imagensPorEmpresa: imagensPorEmpresa,
        destNome: String(destinatarios[0].nome || ''),
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
    let senderFallback = ''
    try {
      const cfg = $app.findRecordsByFilter(
        'integracoes_config',
        'integracao = "email_remetente"',
        '',
        1,
        0,
      )
      if (cfg && cfg.length) {
        const c = cfg[0].get('config') || {}
        if (c.remetente) senderFallback = String(c.remetente)
        else if (c.email_remetente) senderFallback = String(c.email_remetente)
      }
    } catch (_) {}
    try {
      const ss = $app.settings()
      if (!senderFallback && ss.meta.senderAddress) senderFallback = String(ss.meta.senderAddress)
    } catch (_) {}

    const senderName = 'PGE - Portal Gestão ' + empPrincipal

    const enviados = []
    const erros = []
    const pdfNome =
      'Tarefas_' +
      empPrincipal.replace(/[^a-zA-Z0-9]/g, '_') +
      '_' +
      hoje.replace(/-/g, '') +
      '.pdf'

    for (const d of destinatarios) {
      const email = String(d.email || '').trim()
      if (!email || email.indexOf('@') < 0) {
        erros.push({ email: email || '(vazio)', erro: 'E-mail inválido' })
        continue
      }
      marco('enviando para ' + email)
      let pdfReader = null
      try {
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

        const inlineMap = {}
        for (const k of Object.keys(logosInline)) {
          inlineMap[k] = logosInline[k]
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
          const regE = new Record(colE)
          regE.set('para', email)
          regE.set('assunto', assunto)
          regE.set('status', 'enviado')
          $app.save(regE)
        } catch (_) {}
      } catch (errEnv) {
        console.log('[tarefas/enviar] falha no envio: ' + String(errEnv).slice(0, 200))
        erros.push({ email: email, erro: String(errEnv).slice(0, 200) })
      }
    }

    // 18/11/2026 — CONTRATO DE RESPOSTA.
    //
    // O popover lê `res.ok` e `res.enviados`. Eu devolvia `success`, então o
    // envio acontecia (o log mostra "enviado para ...") e a tela exibia
    // "Falha no envio" mesmo com tudo certo.
    //
    // Devolvo os DOIS nomes para não quebrar nenhum consumidor:
    //   ok / success  → booleano de sucesso
    //   enviados      → QUANTIDADE de envios (o popover usa em `${res.enviados}`)
    //   enviados_lista → detalhe por destinatário
    return e.json(200, {
      ok: enviados.length > 0,
      success: enviados.length > 0,
      enviados: enviados.length,
      enviados_lista: enviados,
      erros: erros,
      total_tarefas: listaFinalTarefas.length,
      pdf_gerado: !!pdfStr,
    })
  },
  $apis.requireAuth(),
)
