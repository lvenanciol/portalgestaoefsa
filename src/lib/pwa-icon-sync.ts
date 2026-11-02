// Garante que /apple-touch-icon.png, /icon-192.png e /icon-512.png
// sirvam o logo oficial da Extrafruti registrado em logomarcas

async function carregarIconesPwa() {
  if (typeof window === 'undefined') return

  try {
    // 1. Busca URL do emblema da Extrafruti
    const res = await fetch('/backend/v1/public/logos')
    if (!res.ok) return
    const logos = await res.json()
    const extrafruti = logos.find((l: { empresa: string; emblemaUrl?: string; logoUrl?: string }) =>
      l.empresa?.toLowerCase().includes('extrafruti'),
    )
    const iconUrl = extrafruti?.emblemaUrl || extrafruti?.logoUrl
    if (!iconUrl) return

    // 2. Atualiza elementos <link rel="apple-touch-icon"> no DOM dinamicamente
    const appleLink = document.querySelector(
      'link[rel="apple-touch-icon"]',
    ) as HTMLLinkElement | null
    if (appleLink) {
      appleLink.href = iconUrl
    } else {
      const link = document.createElement('link')
      link.rel = 'apple-touch-icon'
      link.href = iconUrl
      document.head.appendChild(link)
    }

    // 3. Atualiza favicon / shortcut icon
    const iconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null
    if (iconLink) {
      iconLink.href = iconUrl
    }
  } catch (err) {
    console.warn('[pwa-icon-sync] Falha ao sincronizar ícone PWA:', err)
  }
}

export function sincronizarPwaIcons() {
  if (typeof window !== 'undefined') {
    carregarIconesPwa()
  }
}
