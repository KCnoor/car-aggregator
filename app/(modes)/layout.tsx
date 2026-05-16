'use client'

import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import ModeTabs from '@/app/components/ModeTabs'

// Shared shell for the four CarSa modes. The ModeTabs row sits above the
// page content. Each page transition runs a 300ms cross-fade. The fade is
// keyed by pathname so AnimatePresence treats every route as a fresh subtree.
export default function ModesLayout ({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <>
      <ModeTabs />
      <AnimatePresence mode="wait">
        <motion.main
          key={pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex-1"
        >
          {children}
        </motion.main>
      </AnimatePresence>
    </>
  )
}
