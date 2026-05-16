import { redirect } from 'next/navigation'

// Root / always lands the user in Browse mode. The other three modes
// (Match, Analyze, Pulse) are reachable from the ModeTabs row but never
// the default destination.
export default function RootIndex () {
  redirect('/browse')
}
