// Service Worker mínimo para suporte PWA estável
// Estratégia Network-First: nunca prende versões antigas nem atrapalha deploys,
// garantindo que novos builds sejam carregados imediatamente em refresh.

const CACHE_NAME = 'pge-pwa-v1'

self.addEventListener('install', (event) => {
  // Ativação imediata da nova versão sem esperar fechamento das abas
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Reivindica controle imediato de todas as páginas abertas
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        )
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
    url.pathname.includes('/realtime')
  ) {
    return
  }

  // Tenta rede primeiro, permitindo que a aplicação sempre receba as atualizações mais recentes
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request)
    }),
  )
})
