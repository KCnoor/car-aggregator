import { Skeleton } from '@/components/ui/skeleton'

export default function ListingLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-14 border-b border-border bg-white/95" />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
          <div className="flex flex-col gap-6">
            <Skeleton className="w-full aspect-[16/10] rounded-2xl" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-2/3" />
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-4 h-fit">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  )
}
