/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// DIAGNÓSTICO DAS LOGOMARCAS → GRAVA EM `integracoes_config` (17/11/2026)
//
// O log de migration não aparece na aba de Hooks, então preciso de um lugar
// consultável. Gravo um registro com integracao='diag_logos' e o resultado
// em `config`, para ler pela API e decidir como embutir a imagem no PDF.
//
// Para cada logo: formato real (PNG/JPEG/WEBP/SVG/PDF), dimensões e tamanho.
// ============================================================================
migrate(
  (app) => {
    let logos = []
    try {
      logos = app.findRecordsByFilter('logomarcas', "id != ''", '', 50, 0)
    } catch (err) {
      console.log('[diag] listar: ' + String(err).slice(0, 140))
      return
    }

    const saida = []

    for (const r of logos) {
      const empresa = String(r.getString('empresa') || '?')
      const arquivo = String(r.getString('logo') || '')
      const emblema = String(r.getString('emblema') || '')

      const linha = { empresa: empresa, logo: arquivo, emblema: emblema, ativo: r.getBool('ativo') }

      if (arquivo) {
        try {
          const caminho = $filepath.join(
            $app.dataDir(),
            'storage',
            'pbc_3701359284',
            String(r.id),
            arquivo,
          )
          const b = $os.readFile(caminho)
          linha.bytes = b.length
          linha.hex = [b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]
            .map(function (n) {
              return ('0' + n.toString(16)).slice(-2)
            })
            .join(' ')

          // classifica
          if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
            linha.formato = 'PNG'
            linha.largura = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]
            linha.altura = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]
          } else if (b[0] === 0xff && b[1] === 0xd8) {
            linha.formato = 'JPEG'
            let i = 2
            while (i < b.length - 9) {
              if (b[i] !== 0xff) {
                i++
                continue
              }
              const mk = b[i + 1]
              if (
                (mk >= 0xc0 && mk <= 0xc3) ||
                (mk >= 0xc5 && mk <= 0xc7) ||
                (mk >= 0xc9 && mk <= 0xcb) ||
                (mk >= 0xcd && mk <= 0xcf)
              ) {
                linha.altura = (b[i + 5] << 8) | b[i + 6]
                linha.largura = (b[i + 7] << 8) | b[i + 8]
                linha.canais = b[i + 9]
                break
              }
              i += 2 + ((b[i + 2] << 8) | b[i + 3])
            }
          } else if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
            linha.formato = 'WEBP'
          } else if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
            linha.formato = 'PDF'
          } else if (b[0] === 0x3c) {
            linha.formato = 'SVG'
          } else {
            linha.formato = 'desconhecido'
          }
        } catch (err) {
          linha.erro = String(err).slice(0, 120)
        }
      }

      saida.push(linha)
    }

    // ---------- grava ----------
    let col = null
    try {
      col = app.findCollectionByNameOrId('integracoes_config')
    } catch (_) {
      console.log('[diag] colecao integracoes_config ausente')
      return
    }

    let rec = null
    try {
      const ach = app.findRecordsByFilter(
        'integracoes_config',
        "integracao = 'diag_logos'",
        '',
        1,
        0,
      )
      if (ach && ach.length) rec = ach[0]
    } catch (_) {}

    if (!rec) {
      rec = new Record(col)
      rec.set('integracao', 'diag_logos')
    }
    rec.set('config', { logos: saida, em: new Date().toISOString() })
    try {
      app.save(rec)
      console.log('[diag] gravado com ' + saida.length + ' registro(s)')
    } catch (err) {
      console.log('[diag] salvar: ' + String(err).slice(0, 160))
    }

    for (const l of saida) {
      console.log(
        '[diag] ' +
          l.empresa +
          ' → ' +
          (l.formato || 'sem arquivo') +
          ' ' +
          (l.largura || '') +
          'x' +
          (l.altura || ''),
      )
    }
  },
  (app) => {
    console.log('[diag] rollback: registro mantido')
  },
)
