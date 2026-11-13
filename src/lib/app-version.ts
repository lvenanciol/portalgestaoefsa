// Versão do app usada pela sidebar (item j).
//
// POR QUE ESTE ARQUIVO EXISTE:
// A sidebar mostrava a versão a partir de um literal fixo ('0.0.188') que
// nunca acompanhava os builds — o app chegou à 0.0.394 e a tela seguia
// exibindo 0.0.188. As duas alternativas naturais estão bloqueadas neste
// projeto:
//   · import do package.json  -> tsconfig sem resolveJsonModule e o
//     tsconfig.app.json não é gravável pelo agente;
//   · import.meta.env.VITE_APP_VERSION -> exigiria injetar o valor no
//     vite.config.ts, que também não é gravável.
//
// Solução: um módulo TS com a versão, mantido em sincronia por este comentário.
// A cada apply_changes o Skip incrementa o package.json; a versão abaixo deve
// ser atualizada junto. Enquanto não houver injeção no build, este é o único
// ponto que precisa ser tocado — e a sidebar nunca mais mostra um número
// congelado de várias versões atrás.
//
// ÚLTIMA SINCRONIA: v0.0.394 (commit 1f54043)

export const APP_VERSION = '0.0.397'
export const APP_BUILD = 'sw-v65'
