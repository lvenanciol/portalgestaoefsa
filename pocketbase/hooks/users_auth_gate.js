// Fase 3 — Gate de login: recusa contas inativas (ativo=false).
// Regra crítica: reject = throw (nunca return sem e.next()).
onRecordAuthWithPasswordRequest((e) => {
  if (e.record && e.record.get('ativo') === false) {
    throw new BadRequestError('Conta inativa. Contate o administrador.')
  }
  return e.next()
}, 'users')
