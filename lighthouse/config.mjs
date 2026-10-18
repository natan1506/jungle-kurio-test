// mobile = padrão do Lighthouse (Moto G Power, 4G lento, CPU 4x); desktop = preset oficial.
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

export const PAGES = [
  { name: 'inicio', path: '/' },
  { name: 'detalhe', path: '/nft/emerald-ape-042' },
]

export const RUNS = 3
export const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']

export const PROFILES = {
  mobile: { extends: 'lighthouse:default', settings: { onlyCategories: CATEGORIES } },
  desktop: { ...desktopConfig, settings: { ...desktopConfig.settings, onlyCategories: CATEGORIES } },
}

export const TARGETS = { performance: 90, accessibility: 95, 'best-practices': 95, seo: 90 }
