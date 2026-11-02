// Garante que /apple-touch-icon.png, /icon-192.png e /icon-512.png
// sirvam o logo oficial da Extrafruti registrado em logomarcas
// PWA icons are statically served from /apple-touch-icon.png, /icon-192.png, /icon-512.png
// Dynamic replacement by pwa-icon-sync is disabled to ensure iOS and browser manifest icons
// remain strictly pinned to the official Extrafruti PNG assets without canvas manipulation.

export function sincronizarPwaIcons() {
  // Mantido para compatibilidade sem sobrescrever os links declarados no index.html
}
