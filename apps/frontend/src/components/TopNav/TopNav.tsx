import { useTranslation } from 'react-i18next'
import type { AppMode } from '../../App'
import './TopNav.css'

interface TopNavProps {
  mode: AppMode
  onModeChange: (m: AppMode) => void
}

const TABS: { key: AppMode; i18nKey: string }[] = [
  { key: 'observe',   i18nKey: 'nav.observe'   },
  { key: 'visualize', i18nKey: 'nav.visualize'  },
  { key: 'command',   i18nKey: 'nav.command'    },
]

export function TopNav({ mode, onModeChange }: TopNavProps) {
  const { t, i18n } = useTranslation()

  const toggleLang = () => {
    const next = i18n.language.startsWith('ar') ? 'en' : 'ar'
    void i18n.changeLanguage(next)
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = next
  }

  return (
    <nav className="top-nav">
      <div className="top-nav-brand">
        <span className="top-nav-hex">⬡</span>
        <span className="top-nav-title">{t('header.title')}</span>
      </div>

      <div className="top-nav-tabs" role="tablist">
        {TABS.map(({ key, i18nKey }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            className={`top-nav-tab ${mode === key ? 'is-active' : ''}`}
            onClick={() => onModeChange(key)}
          >
            {t(i18nKey)}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="top-nav-lang-btn"
        onClick={toggleLang}
        title="Switch language / تغيير اللغة"
      >
        {i18n.language.startsWith('ar') ? 'EN' : 'عربي'}
      </button>
    </nav>
  )
}
