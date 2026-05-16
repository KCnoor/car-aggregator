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
      <AnimatePresence mode="wait">
        <motion.main
          key={pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="flex-1"
        >
          {children}
        </motion.main>
      </AnimatePresence>
    </LangProvider>
  )
}
