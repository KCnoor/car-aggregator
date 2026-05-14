import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOSTS = ['img.gogomotor.com', 'cdn.soum.sa', 'images.soum.sa']

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse('Missing url', { status: 400 })

  let parsed: URL
  try { parsed = new URL(url) } catch { return new NextResponse('Invalid url', { status: 400 }) }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return new NextResponse('Host not allowed', { status: 403 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'Referer': `https://${parsed.hostname.replace('img.', 'www.')}/`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/avif,image/*,*/*',
      },
      // @ts-ignore
      next: { revalidate: 86400 },
    })

    if (!res.ok) return new NextResponse('Upstream error', { status: res.status })

    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    const buf = await res.arrayBuffer()

    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    })
  } catch {
    return new NextResponse('Fetch failed', { status: 502 })
  }
}
