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
const CACHE_NAME = 'pge-pwa-v7'

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
