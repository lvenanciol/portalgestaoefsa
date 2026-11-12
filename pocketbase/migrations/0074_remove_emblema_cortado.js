/// Correção do bug da logomarca cortada (Extrafruti): o emblema (ícone 512×512)
/// do registro foi gerado no modo "Preencher Espaço" (cover) pelo modal antigo
/// e o texto "extrafrut" saiu cortado nas laterais. A exibição agora prioriza a
/// LOGOMARCA (campo `logo`, arte completa) e o modal só gera encaixe completo
/// (contain), então este backfill remove o emblema cortado para que o ícone
/// exibido seja a logomarca inteira. Idempotente: só limpa quando o registro
/// tem os dois arquivos e o emblema é o PNG cortado legado (nome icon_512_...);
/// não remove emblemas enviados manualmente pelo usuário (outros nomes).

migrate(
  (app) => {
    const alvos = ['extrafruti', 'casafruti', 'foldbox', 'll5']
    let removidos = 0

    for (const nome of alvos) {
      let rec
      try {
        rec = app.findFirstRecordByFilter('logomarcas', 'empresa ~ {:n}', { n: nome })
      } catch (_) {
        continue
      }
      if (!rec) continue

      const logo = rec.getString('logo')
      const emblema = rec.getString('emblema')
      if (!logo || !emblema) continue
      // Só derruba o emblema legado gerado pelo modal (icon_512_*.png); preserva
      // arquivos originais enviados pelo usuário.
      if (!/^icon_512_.*\.png$/i.test(emblema)) continue

      rec.set('emblema', null)
      app.save(rec)
      removidos++
    }

    console.log('[0074] emblemas cortados removidos: ' + removidos)
  },
  (app) => {
    // Down: não há como restaurar o arquivo cortado (e não vale a pena — era o bug).
  },
)
