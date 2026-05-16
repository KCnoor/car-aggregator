'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Lang } from '@/lib/translations'

// Shared language state across the entire (modes) tree. The sticky header
// owns the toggle UI; every page consumes the current value via useLang().
// Persisted to localStorage so a refresh preserves the user's choice.

type Ctx = { lang: Lang; setLang: (l: Lang) => void }

const LangContext = createContext<Ctx>({ lang: 'ar', setLang: () => {} })

export function LangProvider ({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ar')

  // Hydrate from localStorage on mount (avoid SSR hydration mismatch by
  // starting with 'ar' and only updating after hydration).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('siyara_lang')
      if (stored === 'ar' || stored === 'en') setLangState(stored)
    } catch { /* localStorage may be blocked */ }
  }, [])

  // Keep <html lang/dir> in sync so RTL-only CSS still applies.
  useEffect(() => {
    document.documentElement.dir  = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])

  function setLang (l: Lang) {
    setLangState(l)
    try { window.localStorage.setItem('siyara_lang', l) } catch { /* ignore */ }
  }

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export function useLang () {
  return useContext(LangContext)
}
