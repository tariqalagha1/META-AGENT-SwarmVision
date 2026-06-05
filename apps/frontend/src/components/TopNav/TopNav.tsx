import { useTranslation } from 'react-i18next'
import type { AppMode } from '../../App'
import './TopNav.css'

interface TopNavProps {
  mode: AppMode
  onModeChange: (m: AppMode) => void
  streamStatus?: string
  scopeLabel?: string
  channelSummary?: string
}

const TABS: { key: AppMode; i18nKey: string }[] = [
  { key: 'observe',   i18nKey: 'nav.observe'   },
  { key: 'visualize', i18nKey: 'nav.visualize'  },
  { key: 'command',   i18nKey: 'nav.command'    },
]

export function TopNav({ mode, onModeChange, streamStatus, scopeLabel, channelSummary }: TopNavProps) {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language ?? 'en'

  const toggleLang = () => {
    const next = currentLang.startsWith('ar') ? 'en' : 'ar'
    void i18n.changeLanguage(next)
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = next
  }

  return (
    <nav className="top-command-bar top-nav" aria-label="Swarm Vision command bar">
      <div className="top-nav-brand">
        <span className="top-nav-hex">⬡</span>
        <div className="top-nav-brand-copy">
          <span className="top-nav-title">{t('header.title')}</span>
          <div className="top-nav-meta">
            {streamStatus ? <span className="top-nav-meta-pill">{streamStatus}</span> : null}
            {channelSummary ? <span className="top-nav-meta-pill">{channelSummary}</span> : null}
            {scopeLabel ? <span className="top-nav-meta-text">{scopeLabel}</span> : null}
          </div>
        </div>
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
        {currentLang.startsWith('ar') ? 'EN' : 'عربي'}
      </button>
    </nav>
  )
}
