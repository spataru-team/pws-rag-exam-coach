import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from './store'
import { Layout } from './Layout'
import {
  Onboarding,
  Dashboard,
  Diagnostic,
  Practice,
  Review,
  ModelLab,
  Stats,
  ExportScreen,
  Settings,
  Exam,
  Rescue,
} from '@/screens'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'diagnostic', element: <Diagnostic /> },
      { path: 'practice', element: <Practice /> },
      { path: 'exam', element: <Exam /> },
      { path: 'rescue', element: <Rescue /> },
      { path: 'review', element: <Review /> },
      { path: 'model-lab', element: <ModelLab /> },
      { path: 'stats', element: <Stats /> },
      { path: 'export', element: <ExportScreen /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export function App() {
  const { t } = useTranslation()
  const loaded = useAppStore((s) => s.loaded)
  const profile = useAppStore((s) => s.profile)
  const load = useAppStore((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])

  if (!loaded) {
    return <p style={{ padding: '2rem', textAlign: 'center' }}>{t('common.loading')}</p>
  }
  if (!profile) {
    return <Onboarding />
  }
  return <RouterProvider router={router} />
}
