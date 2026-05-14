import { Skeleton } from '@/components/ui/skeleton'

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <Skeleton className="w-full h-52" />
      <div className="px-4 pt-3.5 pb-4 flex flex-col gap-2.5">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-8 w-1/2" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800 px-4 pt-6 pb-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-24 bg-white/20" />
              <Skeleton className="h-3 w-48 bg-white/10" />
            </div>
            <Skeleton className="h-8 w-20 bg-white/20 rounded-xl" />
          </div>
          <Skeleton className="h-14 w-full bg-white/10 rounded-2xl" />
        </div>
      </div>

      {/* Filter bar skeleton */}
      <div className="bg-white border-b border-border px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex gap-2">
          {[130, 130, 120, 140, 130, 160].map((w, i) => (
            <Skeleton key={i} className="h-9 rounded-xl" style={{ width: w }} />
          ))}
        </div>
      </div>

      {/* Grid skeleton */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Skeleton className="h-5 w-32 mb-5" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  )
}
