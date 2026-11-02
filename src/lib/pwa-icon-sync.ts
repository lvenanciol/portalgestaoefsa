// Utilitário para garantir que os ícones do PWA (apple-touch-icon 180x180, pwa 192x192, 512x512)
// estejam sincronizados com a logomarca da Extrafruti cadastrada na tela de Logomarcas
// O script roda dinamicamente no frontend ao inicializar o app, buscando a imagem do PocketBase,
// desenhando-a num Canvas com o fundo verde institucional (#1B5E20)
// (sem cantos transparentes / sem alpha) e atualizando o <link rel="apple-touch-icon"> do documento em runtime.

import pb from '@/lib/pocketbase/client'

const APPLE_TOUCH_SIZE = 180
const BG_COLOR = '#1B5E20' // Verde oficial Extrafruti

export async function sincronizarPwaIcons() {
  if (typeof window === 'undefined') return

  try {
    // 1. Buscar a logomarca oficial da Extrafruti no banco
    const record = await pb.collection('logomarcas').getFirstListItem('empresa ~ "Extrafruti"', {
      requestKey: 'pwa-icon-sync',
    })

    const arquivo = record?.emblema || record?.logo
    if (!arquivo) return

    const imageUrl = pb.files.getURL(record, arquivo)
    if (!imageUrl) return

    // 2. Carregar a imagem em um HTMLImageElement com crossOrigin anônimo
    const img = new Image()
    img.crossOrigin = 'anonymous'

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Falha ao carregar imagem para o ícone PWA'))
      img.src = imageUrl
    })

    // 3. Renderizar no Canvas com fundo sólido (sem transparência - requisito iOS para apple-touch-icon)
    const canvas = document.createElement('canvas')
    canvas.width = APPLE_TOUCH_SIZE
    canvas.height = APPLE_TOUCH_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Fundo verde sólido #1B5E20
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, APPLE_TOUCH_SIZE, APPLE_TOUCH_SIZE)

    // Círculo branco de respiro
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(APPLE_TOUCH_SIZE / 2, APPLE_TOUCH_SIZE / 2, APPLE_TOUCH_SIZE * 0.425, 0, Math.PI * 2)
    ctx.fill()

    // Desenhar a logomarca da Extrafruti centralizada com margem segura
    const padding = Math.round(APPLE_TOUCH_SIZE * 0.12)
    const drawWidth = APPLE_TOUCH_SIZE - padding * 2
    const drawHeight = APPLE_TOUCH_SIZE - padding * 2

    const imgAspect = img.width / img.height
    let targetW = drawWidth
    let targetH = drawHeight

    if (imgAspect > 1) {
      targetH = drawWidth / imgAspect
    } else {
      targetW = drawHeight * imgAspect
    }

    const offsetX = (APPLE_TOUCH_SIZE - targetW) / 2
    const offsetY = (APPLE_TOUCH_SIZE - targetH) / 2

    ctx.drawImage(img, offsetX, offsetY, targetW, targetH)

    // 4. Exportar como Data URL PNG
    const dataUrl = canvas.toDataURL('image/png')

    // 5. Atualizar os links no <head>
    const appleIconLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
    if (appleIconLink) {
      appleIconLink.href = dataUrl
    }

    const faviconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (faviconLink) {
      faviconLink.href = dataUrl
    }
  } catch (err) {
    // Silencioso em caso de falha de rede/offline
    console.debug('[PWA] Usando ícones estáticos padrão:', err)
  }
}
