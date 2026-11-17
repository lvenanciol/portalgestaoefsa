/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// DIAGNÓSTICO DAS LOGOMARCAS (17/11/2026)
//
// Objetivo: saber o FORMATO REAL de cada logo (PNG ou JPEG) e as dimensões,
// porque isso decide como embutir a imagem no PDF:
//   · JPEG → embutir direto com /Filter /DCTDecode (o leitor decodifica)
//   · PNG  → exigiria descomprimir e desfazer os filtros de scanline; o JSVM
//            não tem biblioteca para isso
//
// Só registra no log — não altera nada.
// ============================================================================
migrate(
  (app) => {
    let logos = []
    try {
      logos = app.findRecordsByFilter('logomarcas', "id != ''", '', 50, 0)
    } catch (err) {
      console.log('[logos] falha ao listar: ' + String(err).slice(0, 160))
      return
    }

    console.log('[logos] registros: ' + logos.length)

    for (const r of logos) {
      const empresa = String(r.getString('empresa') || '?')
      const arquivo = String(r.getString('logo') || '')
      const emblema = String(r.getString('emblema') || '')
      const ativo = r.getBool('ativo')

      if (!arquivo) {
        console.log('[logos] ' + empresa + ' → SEM arquivo de logo (emblema=' + emblema + ')')
        continue
      }

      let formato = 'desconhecido'
      let largura = 0
      let altura = 0
      let bytes = 0

      try {
        const caminho = $filepath.join(
          $app.dataDir(),
          'storage',
          'pbc_3701359284',
          String(r.id),
          arquivo,
        )
        const b = $os.readFile(caminho)
        bytes = b.length

        // PNG: 89 50 4E 47
        if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
          formato = 'PNG'
          // largura/altura no IHDR: bytes 16-23
          largura = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]
          altura = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]
        } else if (b[0] === 0xff && b[1] === 0xd8) {
          formato = 'JPEG'
          // varre os marcadores até SOF0/SOF2 para pegar as dimensões
          let i = 2
          while (i < b.length - 9) {
            if (b[i] !== 0xff) {
              i++
              continue
            }
            const marcador = b[i + 1]
            // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
            if (
              (marcador >= 0xc0 && marcador <= 0xc3) ||
              (marcador >= 0xc5 && marcador <= 0xc7) ||
              (marcador >= 0xc9 && marcador <= 0xcb) ||
              (marcador >= 0xcd && marcador <= 0xcf)
            ) {
              altura = (b[i + 5] << 8) | b[i + 6]
              largura = (b[i + 7] << 8) | b[i + 8]
              break
            }
            const tam = (b[i + 2] << 8) | b[i + 3]
            i += 2 + tam
          }
        }
      } catch (err) {
        console.log('[logos] ' + empresa + ' → arquivo ilegível: ' + String(err).slice(0, 100))
        continue
      }

      console.log(
        '[logos] ' +
          empresa +
          ' | ' +
          arquivo +
          ' | ' +
          formato +
          ' ' +
          largura +
          'x' +
          altura +
          ' | ' +
          Math.round(bytes / 1024) +
          ' KB | ativo=' +
          ativo,
      )
    }

    console.log('[logos] CONCLUÍDO')
  },
  (app) => {
    console.log('[logos] rollback: nenhuma alteração')
  },
)
