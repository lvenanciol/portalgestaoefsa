// Fase 3 — Diagnóstico: rota mínima sem middleware.
routerAdd('GET', '/backend/v1/ping', (e) => {
  return e.json(200, { ok: true, ts: new DateTime().string() })
})
