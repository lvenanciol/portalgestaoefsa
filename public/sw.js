// Service Worker mínimo para suporte PWA estável
// Estratégia Network-First: nunca prende versões antigas nem atrapalha deploys,
// garantindo que novos builds sejam carregados imediatamente em refresh.

// v3 (02/11/2026): bump para forçar a purga do cache antigo no PWA instalado.
// O SW já é network-first + skipWaiting, mas sem trocar o CACHE_NAME um cliente
// que ficou com o offline cache de uma versão anterior podia continuar servindo
// assets velhos. Subir a versão garante que o activate limpe tudo e o preview
// passe a exibir sempre o bundle do último build.
// v4 (03/11/2026): novo bump junto do rebuild do preview — garante que nenhum
// cliente continue servindo o bundle anterior por cache do service worker.
// v5 (03/11/2026): rebuild para purgar caches anteriores e servir bundle atualizado.
// v6 (04/11/2026): rebuild para garantir exibição imediata do bundle mais recente no preview.
// v7 (04/11/2026): rebuild tela /documentos (grade com título, empresa com ícone, botão excluir, anexo viewer blob).
// v8 (04/11/2026): rebuild evolução de documentos e persistência de dados.
// v9 (04/11/2026): bump de versão para forçar purga de caches antigos e servir bundle mais recente no preview.
// v10 (04/11/2026): rebuild evolução aba Jurídico (importação de relatórios PDF/XLSX, histórico de versões e módulo de audiências).
// v11 (04/11/2026): correção de importação em lote jurídica defensiva e módulo de audiências resiliente a células vazias.
// v12 (04/11/2026): grade Jurídicos com 13 colunas exatas e Parecer/Excluir como ícones com tooltip nas 5 abas.
// v14 (05/11/2026): bump de versão para forçar purga de caches antigos (grade 13 colunas, seletor de colunas visíveis, timeline de observações por data).
// v15 (05/11/2026): rebuild com filtros Natureza e Probabilidade na aba Jurídicos, busca sem acentos/pontuação em todas as abas, coluna Natureza com categoria pura e parser de observações completo.
// v16 (05/11/2026): rebuild com reset limpo e importação de PDF em Novo Contrato Comercial,
// parser de observações e cronologia processual estendida com relatório detalhado de erros em PT-BR.
const CACHE_NAME = 'pge-pwa-v16'

self.addEventListener('install', (event) => {
  // Ativação imediata da nova versão sem esperar fechamento das abas
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Limpa todos os caches antigos, inclusive eventuais caches de ícones
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(keys.map((key) => caches.delete(key)))
      })
      .then(() => self.clients.claim()),
  )
})

// Network-First com fallback de rede puro
self.addEventListener('fetch', (event) => {
  // Ignora chamadas de API, websockets, realtime e uploads para nunca interferir no backend
  const url = new URL(event.request.url)
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/backend') ||
    url.pathname.includes('/realtime') ||
    url.pathname.includes('apple-touch-icon') ||
    url.pathname.includes('icon-192') ||
    url.pathname.includes('icon-512') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('manifest.json')
  ) {
    return
  }

  // Tenta rede primeiro, garantindo que o app sempre receba a versão mais recente
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request)
    }),
  )
})
