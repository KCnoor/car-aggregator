import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading skeleton. The (modes) shell (StickyHeader +
// ModeTabs) already paints above this — we only render the content area.
export default function ListingLoading () {
  return (
    <div style={{ background: 'var(--bg-page)' }}>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
          <div className="flex flex-col gap-6">
            <Skeleton className="w-full aspect-[16/10]" style={{ borderRadius: 20 }} />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-2/3" />
            </div>
            <div className="flex flex-col gap-3 p-5" style={{ background: 'var(--bg-card)', borderRadius: 20, border: '1px solid var(--hairline)' }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4 h-fit p-5" style={{ background: 'var(--bg-card)', borderRadius: 20, border: '1px solid var(--hairline)' }}>
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-16 w-full" style={{ borderRadius: 12 }} />
            <Skeleton className="h-11 w-full" style={{ borderRadius: 12 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
