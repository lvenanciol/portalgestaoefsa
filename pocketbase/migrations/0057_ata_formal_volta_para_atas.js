/**
 * Migração 0057 — Correção da classificação da migração 0056
 *
 * O critério da 0056 (participantes preenchidos = reunião) classificou como
 * reunião também a ATA FORMAL "Ata de AGE - Casafruti Conde de Bonfim" (ela
 * lista participantes, mas é ata contábil: mesa_diretora, deliberações e
 * assinatura_eletronica preenchidos e SEM modalidade/áudio/link de reunião).
 *
 * Esta migração devolve para 'atas' (fonte exclusiva das atas contábeis/
 * formais em /documentos) todo registro de 'atas_reunioes' que seja
 * claramente ata formal:
 *   - mesa_diretora OU deliberacoes OU assinatura_eletronica preenchidos, E
 *   - modalidade, link_reuniao e audio vazios.
 *
 * Idempotente: no-op em banco vazio e na re-execução (só move o que está
 * classificado errado); preserva o id original.
 */
migrate(
  (app) => {
    let reunioes
    try {
      reunioes = app.findCollectionByNameOrId('atas_reunioes')
    } catch (_) {
      reunioes = null
    }
    if (!reunioes) return

    const origem = app.findCollectionByNameOrId('atas')
    const regs = app.findRecordsByFilter('atas_reunioes', '', '-created', 500, 0)
    for (const r of regs) {
      const formal =
        (r.getString('mesa_diretora').trim() !== '' ||
          r.getString('deliberacoes').trim() !== '' ||
          r.getString('assinatura_eletronica').trim() !== '') &&
        r.getString('modalidade').trim() === '' &&
        r.getString('link_reuniao').trim() === '' &&
        r.getString('audio').trim() === ''
      if (!formal) continue

      // Nunca duplicar: se já existir em 'atas' com o mesmo id, só apaga aqui.
      let jaExiste = false
      try {
        app.findRecordById('atas', r.id)
        jaExiste = true
      } catch (_) {
        jaExiste = false
      }

      if (!jaExiste) {
        const novo = new Record(origem)
        novo.set('id', r.id) // preserva o id original
        const campos = [
          'titulo',
          'data',
          'participantes',
          'resumo',
          'decisoes',
          'modalidade',
          'link_reuniao',
          'pauta',
          'pauta_itens',
          'empresa',
          'action_items',
          'audio',
          'anexo',
          'criado_por',
          'tipo_ata',
          'mesa_diretora',
          'deliberacoes',
          'assinatura_eletronica',
          'assinaturas',
          'status',
          'pendencias',
          'erratas',
          'publicada_em',
          'publicada_por',
        ]
        for (const c of campos) {
          try {
            novo.set(c, r.get(c))
          } catch (_e) {
            /* campo não existe na coleção destino — ignora */
          }
        }
        app.save(novo)
      }
      app.delete(r)
      console.log('ata formal devolvida para atas: ' + r.getString('titulo'))
    }
  },
  (app) => {
    // Down: no-op seguro — não recopia formais para 'atas_reunioes'
    // (a 0056 up já as classificaria como reunião novamente).
  },
)
