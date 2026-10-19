/* Main entry point for the application - renders the root React component */
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './main.css'
// COR-2: aplica o idioma persistido na 1ª renderização (tradutor de DOM)
import { idiomaSalvo, aplicarIdiomaNoDOM } from '@/lib/i18n'

// @skip-protected: Do not remove. Required for React rendering.
aplicarIdiomaNoDOM(idiomaSalvo())
createRoot(document.getElementById('root')!).render(<App />)
