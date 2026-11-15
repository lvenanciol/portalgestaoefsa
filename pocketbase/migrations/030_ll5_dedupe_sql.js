/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — DEDUPE (v3, 15/11/2026)
//
// v2 falhou com "nil pointer dereference": `db.newQuery(...).one()` devolveu
// nil no JSVM e o `.get('n')` estourou. Nesta versão:
//   · usamos `app.findRecordsByFilter` para LER (API segura do PocketBase);
//   · agrupamos e apagamos pelo modelo de records, sem SQL bruto;
//   · toleramos os getters que podem devolver valores inesperados.
//
// Regra de dedupe: mesma data (minuto), mesmo tipo e mesma distância (100 m)
// = mesma atividade. Mantém a de melhor qualidade.
// ============================================================================
migrate(
  (app) => {
    let todas = []
    try {
      todas = app.findRecordsByFilter('ll5_activity', "id != ''", 'created', 0, 0)
    } catch (err) {
      console.log('[dedupe-v3] falha ao listar: ' + String(err).slice(0, 160))
      return
    }

    console.log('[dedupe-v3] lidas: ' + todas.length)
    if (todas.length === 0) return

    // ---------- monta os grupos ----------
    const grupos = {}
    for (const r of todas) {
      let dataStr = ''
      try {
        dataStr = String(r.get('data_hora_inicio') || '')
      } catch (_) {
        dataStr = ''
      }

      // normaliza para minutos: aceita "2026-11-13 09:11:57.000Z" ou ISO
      let minuto = '0'
      try {
        const ms = new Date(dataStr.replace(' ', 'T')).getTime()
        if (isFinite(ms) && ms > 0) minuto = String(Math.floor(ms / 60000))
      } catch (_) {
        minuto = '0'
      }

      let tipo = 'outro'
      try {
        tipo = String(r.get('tipo') || 'outro')
      } catch (_) {}

      let dist = 0
      try {
        const d = r.get('distancia_m')
        if (d != null) dist = Math.round(Number(d) / 100)
      } catch (_) {}

      const chave = minuto + '|' + tipo + '|' + dist

      if (!grupos[chave]) grupos[chave] = []
      grupos[chave].push(r)
    }

    // ---------- pontuação de qualidade ----------
    const pontuar = (r) => {
      let p = 0
      try {
        const z = r.get('zonas_fc_seg')
        if (z) {
          if (typeof z === 'object' && Object.keys(z).length > 0) p += 100
          else if (typeof z === 'string' && z.length > 5 && z !== '{}') p += 100
        }
      } catch (_) {}
      try {
        if (r.get('tem_streams') === true) p += 50
      } catch (_) {}
      try {
        if (String(r.get('fonte') || '').indexOf('csv') >= 0) p += 30
      } catch (_) {}
      try {
        const fc = r.get('fc_media')
        if (fc != null && Number(fc) > 0) p += 10
      } catch (_) {}
      try {
        const cad = r.get('cadencia_spm')
        if (cad != null && Number(cad) > 0) p += 5
      } catch (_) {}
      return p
    }

    // ---------- apaga os excedentes ----------
    let removidas = 0
    const chaves = Object.keys(grupos)
    for (const k of chaves) {
      const lista = grupos[k]
      if (!lista || lista.length < 2) continue

      lista.sort((a, b) => {
        const pa = pontuar(a)
        const pb = pontuar(b)
        if (pa !== pb) return pb - pa
        // empate: mantém o mais antigo
        return String(a.id).localeCompare(String(b.id))
      })

      for (let i = 1; i < lista.length; i++) {
        try {
          app.delete(lista[i])
          removidas++
        } catch (err) {
          console.log('[dedupe-v3] falha ao apagar ' + lista[i].id)
        }
      }
    }

    console.log('[dedupe-v3] grupos=' + chaves.length + ' removidas=' + removidas)

    // ---------- grava a chave canônica nos sobreviventes ----------
    let marcados = 0
    try {
      const restantes = app.findRecordsByFilter('ll5_activity', "id != ''", 'created', 0, 0)
      for (const r of restantes) {
        try {
          const dataStr = String(r.get('data_hora_inicio') || '')
          const ms = new Date(dataStr.replace(' ', 'T')).getTime()
          const minuto = isFinite(ms) && ms > 0 ? Math.floor(ms / 60000) : 0
          const tipo = String(r.get('tipo') || 'outro')
          const d = r.get('distancia_m')
          const dist = d != null ? Math.round(Number(d) / 100) : 0
          r.set('chave_canonica', minuto + '|' + tipo + '|' + dist)
          app.save(r)
          marcados++
        } catch (_) {}
      }
    } catch (_) {}

    console.log('[dedupe-v3] sobreviventes marcados: ' + marcados)
  },
  (app) => {
    console.log('[dedupe-v3] rollback: duplicatas não são recriadas')
  },
)
