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

// 14/11/2026 — versão sincronizada manualmente a cada publicação.
// A sidebar mostrava 0.0.409 enquanto o app já estava em 0.0.436.
// 15/11/2026 — SINCRONIZADO com o build atual.
// O número estava congelado em 0.0.441 há 46 versões: a cada build a sidebar
// continuava mostrando 0.0.441, o que fazia o dono concluir (corretamente)
// que o navegador estava servindo bundle antigo — quando na verdade o código
// novo estava no ar. Este era o único ponto que não acompanhava o pipe.
// 15/11/2026 — REGRA (memorizada): escrever aqui o número que o build VAI
// produzir (package.json + 1), não o atual. O apply_changes incrementa o
// package.json a cada commit; escrever o atual deixa a sidebar 1 atrás.
// 18/11/2026 — SINCRONIZADO no REBUILD (v0.0.663, commit 90b293f).
// Estava em 0.0.635 enquanto o app já rodava 0.0.661/0.0.663: o dono via
// "v0.0.635" na sidebar e concluía (com razão) que o navegador servia bundle
// antigo. O número vai aqui com +1 do package.json atual, porque este commit
// incrementa o package.json mais uma vez antes do build.
export const APP_VERSION = '0.0.664'
export const APP_BUILD = '90b293f'
