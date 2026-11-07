/**
 * Migração 0058 — Correção final da classificação (após 0056/0057)
 *
 * A 0057 não movimentou nada porque a coleção 'atas_reunioes' não tem os
 * campos de ata formal (mesa_diretora, deliberacoes, assinatura_eletronica
 * não fazem parte dela) — o critério da 0057 lia sempre vazio.
 *
 * Critério desta 0058, usando apenas campos que EXISTEM em 'atas_reunioes':
 * ata formal = empresa preenchida E modalidade vazia E link_reuniao vazio
 * E audio vazio. As reuniões reais ("ORÇAMENTO VENDAS EXTRABOM 2027" e
 * "RDE") têm modalidade 'Presencial' → permanecem em 'atas_reunioes'.
 * A ata formal "Ata de AGE - Casafruti Conde de Bonfim" (empresa Casafruti,
 * sem modalidade) volta para 'atas', fonte exclusiva das atas contábeis.
 *
 * Idempotente: no-op em banco vazio e na re-execução (nunca duplica:
 * se o id já existe em 'atas', apenas remove daqui).
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
        r.getString('empresa').trim() !== '' &&
        r.getString('modalidade').trim() === '' &&
        r.getString('link_reuniao').trim() === '' &&
        r.getString('audio').trim() === ''
      if (!formal) continue

      // Nunca duplicar: se já existir em 'atas' com o mesmo id, só remove aqui.
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
        for (const c of [
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
        ]) {
          novo.set(c, r.get(c))
        }
        // Campos exclusivos de ata formal existentes só em 'atas'
        novo.set('tipo_ata', 'AGE')
        novo.set('status', 'rascunho')
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
