'use client'

import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { LangProvider } from '@/app/components/LangContext'
import StickyHeader from '@/app/components/StickyHeader'

// Client wrapper around the four mode routes. Renders the sticky header at
// the top (always visible) and wraps page content in an AnimatePresence
// cross-fade keyed by pathname. Owns the LangProvider so header + page
// share language state.
export default function ModesShell ({
  totalCount,
  newDealsCount,
  children,
}: {
  totalCount: number
  newDealsCount: number
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <LangProvider>
      <StickyHeader totalCount={totalCount} newDealsCount={newDealsCount} />

      {/* Soft 40px fade where the sky header ends and the page surface
          begins, so the content doesn't slam against the sky gradient. */}
      <div
        aria-hidden
        className="w-full"
        style={{
          height: 40,
          background: 'linear-gradient(180deg, #DBEAFE 0%, var(--bg-page) 100%)',
        }}
      />

      <AnimatePresence mode="wait">
        <motion.main
          key={pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="flex-1"
          style={{ background: 'var(--bg-page)' }}
        >
          {children}
        </motion.main>
      </AnimatePresence>
    </LangProvider>
  )
}
