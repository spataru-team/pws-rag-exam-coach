import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { InterfaceLanguage } from '@/types'
import { useAppStore } from './store'
import { SUPPORTED_LANGUAGES } from '@/i18n'
import { SubjectSwitcher } from '@/components/SubjectSwitcher'

const NAV_ITEMS = [
  { to: '/', key: 'dashboard', end: true },
  { to: '/diagnostic', key: 'diagnostic' },
  { to: '/practice', key: 'practice' },
  { to: '/exam', key: 'exam' },
  { to: '/rescue', key: 'rescue' },
  { to: '/review', key: 'review' },
  { to: '/model-lab', key: 'modelLab' },
  { to: '/stats', key: 'stats' },
  { to: '/export', key: 'export' },
  { to: '/settings', key: 'settings' },
] as const

export function Layout() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const updateProfile = useAppStore((s) => s.updateProfile)

  return (
    <div>
      <a className="skip-link" href="#main">
        {t('nav.dashboard')}
      </a>
      <header
        style={{
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          padding: '0.6rem 1rem',
        }}
      >
        <div
          style={{
            maxWidth: 'var(--content-max)',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <strong>{t('app.title')}</strong>
          <SubjectSwitcher />
          <div className="row" role="group" aria-label="Appearance">
            <label className="visually-hidden" htmlFor="lang-select">
              {t('language.label')}
            </label>
            <select
              id="lang-select"
              value={profile?.interfaceLanguage ?? 'ru'}
              onChange={(e) =>
                void updateProfile({
                  interfaceLanguage: e.target.value as InterfaceLanguage,
                })
              }
              style={{ width: 'auto' }}
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {t(`language.${l}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={profile?.theme === 'dark'}
              onClick={() =>
                void updateProfile({
                  theme: profile?.theme === 'dark' ? 'light' : 'dark',
                })
              }
            >
              {profile?.theme === 'dark' ? '🌙' : '☀️'}{' '}
              {t(`theme.${profile?.theme ?? 'light'}`)}
            </button>
            <button
              type="button"
              aria-pressed={profile?.dyslexiaMode ?? false}
              onClick={() =>
                void updateProfile({ dyslexiaMode: !profile?.dyslexiaMode })
              }
            >
              {t('dyslexia.label')}: {profile?.dyslexiaMode ? t('common.yes') : t('common.no')}
            </button>
          </div>
        </div>
      </header>

      <nav
        aria-label="Main"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        <ul
          style={{
            maxWidth: 'var(--content-max)',
            margin: '0 auto',
            display: 'flex',
            gap: '0.25rem',
            listStyle: 'none',
            padding: '0 1rem',
            overflowX: 'auto',
          }}
        >
          {NAV_ITEMS.map((item) => (
            <li key={item.key}>
              <NavLink
                to={item.to}
                end={'end' in item ? item.end : false}
                style={({ isActive }) => ({
                  display: 'block',
                  padding: '0.7rem 0.8rem',
                  textDecoration: 'none',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                  borderBottom: isActive
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
                  fontWeight: isActive ? 700 : 400,
                })}
              >
                {t(`nav.${item.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main
        id="main"
        style={{ maxWidth: 'var(--content-max)', margin: '0 auto', padding: '1.2rem 1rem' }}
      >
        <Outlet />
      </main>
    </div>
  )
}
