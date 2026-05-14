'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | 'idle'       // floating button only
  | 'open'       // overlay open, ready
  | 'recording'  // mic active
  | 'transcribing'
  | 'thinking'   // Claude responding
  | 'speaking'   // TTS playing
  | 'ready'      // turn complete, waiting for next input

type Message = {
  role: 'user' | 'assistant'
  content: string
  listings?: ListingCard[]
  wordIndex?: number   // for highlighting during playback
}

type ListingCard = {
  id: string
  source: string
  source_url: string
  make_en: string | null
  make_ar: string | null
  model_en: string | null
  model_ar: string | null
  year: number | null
  price_sar: number | null
  mileage_km: number | null
  city_ar: string | null
  city_en: string | null
  color_ar: string | null
  trim: string | null
  deal_score: number | null
  deal_score_label: string | null
  contact_for_price: boolean
  photo_urls: string[] | null
  transmission_slug: string | null
  fuel_type_slug: string | null
  body_type_slug: string | null
  seller_type: string | null
}

type SearchFilters = {
  make?: string
  model?: string
  year_min?: number
  year_max?: number
  price_max?: number
  price_min?: number
  mileage_max?: number
  city?: string
  body_type?: string
  transmission?: string
}

type Props = {
  onApplyFilters: (filters: SearchFilters) => void
  externalOpen?: boolean
  onExternalOpenHandled?: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SENTENCE_RE = /[.!?؟।\n]/

function splitSentences(text: string): string[] {
  const parts: string[] = []
  let current = ''
  for (const ch of text) {
    current += ch
    if (SENTENCE_RE.test(ch) && current.trim().length > 3) {
      parts.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function dealColor(score: number | null): string {
  if (score === null) return '#9ca3af'
  if (score >= 9)  return '#22c55e'
  if (score >= 7)  return '#10b981'
  if (score >= 5)  return '#f59e0b'
  if (score >= 3)  return '#f97316'
  return '#ef4444'
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VoiceAdvisor({ onApplyFilters, externalOpen, onExternalOpenHandled }: Props) {
  const [phase,       setPhase]       = useState<Phase>('idle')
  const [messages,    setMessages]    = useState<Message[]>([])
  const [transcript,  setTranscript]  = useState('')
  const [streamText,  setStreamText]  = useState('')
  const [error,       setError]       = useState<string | null>(null)
  const [micBlocked,  setMicBlocked]  = useState(false)
  const [waveData,    setWaveData]    = useState<number[]>(Array(32).fill(0))
  const [speakingIdx, setSpeakingIdx] = useState<number>(-1)
  const [wordIdx,     setWordIdx]     = useState<number>(-1)

  // keep last 10 turns (20 messages) for Claude history
  const historyRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])

  // recording
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null)
  const audioChunksRef    = useRef<Blob[]>([])
  const analyserRef       = useRef<AnalyserNode | null>(null)
  const audioCtxRef       = useRef<AudioContext | null>(null)
  const waveFrameRef      = useRef<number>(0)

  // TTS queue
  const ttsQueueRef       = useRef<string[]>([])
  const ttsPlayingRef     = useRef(false)
  const audioElemRef      = useRef<HTMLAudioElement | null>(null)
  const currentObjUrlRef  = useRef<string | null>(null)

  // latest search filters from Claude tool calls
  const lastFiltersRef    = useRef<SearchFilters>({})

  // accumulated assistant text during streaming
  const accTextRef        = useRef('')
  const streamMsgIdxRef   = useRef(-1)

  const messagesEndRef    = useRef<HTMLDivElement>(null)

  // External open trigger (from search bar mic button)
  useEffect(() => {
    if (externalOpen && phase === 'idle') {
      openOverlay()
      onExternalOpenHandled?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  // ── TTS queue player ───────────────────────────────────────────────────────

  const playNextTTS = useCallback(async () => {
    if (ttsPlayingRef.current || ttsQueueRef.current.length === 0) return
    const sentence = ttsQueueRef.current.shift()!
    ttsPlayingRef.current = true

    try {
      const res = await fetch('/api/voice/tts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: sentence, voice: 'shimmer' }),
      })
      if (!res.ok) throw new Error('TTS failed')

      const blob = await res.blob()

      // revoke previous
      if (currentObjUrlRef.current) URL.revokeObjectURL(currentObjUrlRef.current)
      const objUrl = URL.createObjectURL(blob)
      currentObjUrlRef.current = objUrl

      const audio = audioElemRef.current!
      audio.src = objUrl

      // word highlight timing — estimate based on sentence length
      const words = sentence.split(/\s+/).filter(Boolean)
      const startTime = Date.now()

      audio.onplay = () => {
        // schedule word highlights
        const durationEstimateMs = Math.max(words.length * 280, 800)
        words.forEach((_, i) => {
          setTimeout(() => {
            setWordIdx(i)
          }, (i / words.length) * durationEstimateMs)
        })
      }

      audio.onended = () => {
        void startTime
        ttsPlayingRef.current = false
        setWordIdx(-1)
        if (ttsQueueRef.current.length > 0) {
          playNextTTS()
        } else {
          setPhase('ready')
          setSpeakingIdx(-1)
        }
      }

      audio.onerror = () => {
        ttsPlayingRef.current = false
        if (ttsQueueRef.current.length > 0) playNextTTS()
        else { setPhase('ready'); setSpeakingIdx(-1) }
      }

      await audio.play().catch(() => {
        ttsPlayingRef.current = false
      })
    } catch {
      ttsPlayingRef.current = false
      if (ttsQueueRef.current.length > 0) playNextTTS()
      else { setPhase('ready'); setSpeakingIdx(-1) }
    }
  }, [])

  // ── Waveform animation ─────────────────────────────────────────────────────

  function startWaveform(analyser: AnalyserNode) {
    const buf = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      analyser.getByteFrequencyData(buf)
      const step = Math.floor(buf.length / 32)
      const bars = Array.from({ length: 32 }, (_, i) => buf[i * step] / 255)
      setWaveData(bars)
      waveFrameRef.current = requestAnimationFrame(tick)
    }
    waveFrameRef.current = requestAnimationFrame(tick)
  }

  function stopWaveform() {
    cancelAnimationFrame(waveFrameRef.current)
    setWaveData(Array(32).fill(0))
  }

  // ── Open overlay ───────────────────────────────────────────────────────────

  function openOverlay() {
    setPhase('open')
    setError(null)
    setMessages([{
      role:    'assistant',
      content: 'حياك! أنا مستشار كارسا. خبرني وش تدور وأنا أساعدك تلاقي أحسن سيارة.',
    }])
    historyRef.current = []
    lastFiltersRef.current = {}
  }

  // ── Start recording ────────────────────────────────────────────────────────

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // create AudioContext for waveform
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const source   = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      source.connect(analyser)
      analyserRef.current = analyser
      startWaveform(analyser)

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mr
      audioChunksRef.current   = []

      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.start(100)

      setPhase('recording')
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        setMicBlocked(true)
        setError('السماح بالمايك مطلوب — اضغط على أيقونة القفل في شريط العنوان وسمح بالمايك، ثم جرب من جديد.')
      } else {
        setError('ما قدرنا نفتح المايك. جرب من جديد.')
      }
    }
  }

  // ── Stop recording → transcribe → chat ────────────────────────────────────

  async function stopRecording() {
    const mr = mediaRecorderRef.current
    if (!mr) return
    setPhase('transcribing')

    // stop waveform + mic
    stopWaveform()
    mr.stop()
    mr.stream.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()

    await new Promise<void>(res => { mr.onstop = () => res() })

    const mimeType  = mr.mimeType || 'audio/webm'
    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
    const ext       = mimeType.includes('mp4') ? 'mp4' : 'webm'

    const formData = new FormData()
    formData.append('audio', audioBlob, `recording.${ext}`)

    try {
      const res = await fetch('/api/voice/transcribe', { method: 'POST', body: formData })
      const { text, error: err } = await res.json() as { text?: string; error?: string }
      if (err || !text?.trim()) throw new Error(err ?? 'فارغ')

      setTranscript(text)
      setMessages(prev => [...prev, { role: 'user', content: text }])
      await runChat(text)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`ما فهمنا الصوت — ${msg}. جرب مرة ثانية.`)
      setPhase('ready')
    }
  }

  // ── Run Claude chat ────────────────────────────────────────────────────────

  async function runChat(userText: string) {
    setPhase('thinking')
    setStreamText('')
    accTextRef.current   = ''
    ttsQueueRef.current  = []
    ttsPlayingRef.current = false

    // Add welcome message to history on first turn
    const history = historyRef.current

    try {
      const res = await fetch('/api/voice/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ transcript: userText, history }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body!.getReader()
      const dec    = new TextDecoder()

      let pendingSentence = ''
      let newMsgIdx       = -1
      let listings: ListingCard[] = []

      setPhase('speaking')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = dec.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue

          let event: { type: string; content?: string; data?: ListingCard[]; filters?: SearchFilters; message?: string }
          try { event = JSON.parse(raw) } catch { continue }

          if (event.type === 'text' && event.content) {
            accTextRef.current  += event.content
            pendingSentence     += event.content
            setStreamText(accTextRef.current)

            // pipe completed sentences to TTS
            const sentences = splitSentences(pendingSentence)
            if (sentences.length > 1) {
              // all but last are complete sentences
              for (let i = 0; i < sentences.length - 1; i++) {
                ttsQueueRef.current.push(sentences[i])
                if (!ttsPlayingRef.current) playNextTTS()
              }
              pendingSentence = sentences[sentences.length - 1]
            }
          } else if (event.type === 'listings' && event.data) {
            listings = event.data
            if (event.filters) lastFiltersRef.current = event.filters
          } else if (event.type === 'done') {
            // flush remaining sentence
            if (pendingSentence.trim()) {
              ttsQueueRef.current.push(pendingSentence.trim())
              if (!ttsPlayingRef.current) playNextTTS()
            }

            const fullText = accTextRef.current
            setStreamText('')
            setMessages(prev => {
              const msgs = [...prev]
              // replace any in-progress assistant message
              if (newMsgIdx >= 0) {
                msgs[newMsgIdx] = { role: 'assistant', content: fullText, listings: listings.length ? listings : undefined }
              } else {
                msgs.push({ role: 'assistant', content: fullText, listings: listings.length ? listings : undefined })
              }
              return msgs
            })

            // update history
            historyRef.current = [
              ...historyRef.current,
              { role: 'user'      as const, content: userText  },
              { role: 'assistant' as const, content: fullText  },
            ].slice(-20)

            if (!ttsPlayingRef.current && ttsQueueRef.current.length === 0) {
              setPhase('ready')
            }
          } else if (event.type === 'error') {
            setError(event.message ?? 'خطأ غير معروف')
            setPhase('ready')
          }
        }
      }

      // If we streamed text but never got 'done' (stream ended abruptly)
      if (accTextRef.current && phase !== 'ready') {
        const fullText = accTextRef.current
        if (pendingSentence.trim()) {
          ttsQueueRef.current.push(pendingSentence.trim())
          if (!ttsPlayingRef.current) playNextTTS()
        }
        setStreamText('')
        setMessages(prev => [...prev, { role: 'assistant', content: fullText, listings: listings.length ? listings : undefined }])
        historyRef.current = [...historyRef.current, { role: 'user' as const, content: userText }, { role: 'assistant' as const, content: fullText }].slice(-20)
        void newMsgIdx
        if (!ttsPlayingRef.current) setPhase('ready')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`حصل خطأ — ${msg}`)
      setPhase('ready')
    }
  }

  // ── Close overlay ──────────────────────────────────────────────────────────

  function closeOverlay() {
    // stop any playback
    if (audioElemRef.current) { audioElemRef.current.pause(); audioElemRef.current.src = '' }
    ttsQueueRef.current  = []
    ttsPlayingRef.current = false
    stopWaveform()
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop())

    // apply last known filters to grid
    const f = lastFiltersRef.current
    if (Object.keys(f).length > 0) onApplyFilters(f)

    setPhase('idle')
    setMessages([])
    setTranscript('')
    setStreamText('')
    setError(null)
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function WaveformBars() {
    return (
      <div className="flex items-center justify-center gap-[3px] h-12">
        {waveData.map((v, i) => (
          <div
            key={i}
            className="w-1 rounded-full bg-red-400 transition-all duration-75"
            style={{ height: `${Math.max(4, v * 44)}px` }}
          />
        ))}
      </div>
    )
  }

  function AssistantBubble({ msg, isStreaming }: { msg: Message; isStreaming?: boolean }) {
    const text   = isStreaming ? streamText : msg.content
    const words  = text.split(/(\s+)/)

    return (
      <div className="flex flex-col gap-3 max-w-[85%]">
        {/* text bubble */}
        <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
          <p className="text-sm text-gray-800 leading-relaxed" dir="rtl">
            {words.map((w, i) => (
              <span
                key={i}
                className={
                  isStreaming && wordIdx >= 0 && i === wordIdx * 2
                    ? 'bg-blue-100 rounded px-0.5 transition-colors duration-150'
                    : ''
                }
              >
                {w}
              </span>
            ))}
            {isStreaming && <span className="inline-block w-1 h-4 bg-blue-400 animate-pulse ml-1 align-middle" />}
          </p>
        </div>

        {/* listing cards */}
        {msg.listings && msg.listings.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-1 -mr-2 pr-2">
            {msg.listings.map(l => (
              <a
                key={l.id}
                href={l.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-none w-52 bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-lg transition-shadow"
              >
                {l.photo_urls?.[0] && (
                  <div className="h-28 bg-gray-100 overflow-hidden">
                    <img src={l.photo_urls[0]} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="p-3">
                  <p className="text-xs font-bold text-gray-900" dir="ltr">
                    {l.year} {l.make_en} {l.model_en}
                  </p>
                  {l.trim && <p className="text-[10px] text-gray-400 mt-0.5" dir="ltr">{l.trim}</p>}
                  <div className="flex items-center justify-between mt-2">
                    {l.contact_for_price || !l.price_sar ? (
                      <span className="text-[10px] text-gray-500">تواصل للسعر</span>
                    ) : (
                      <span className="text-sm font-black text-gray-900" dir="ltr">
                        {l.price_sar.toLocaleString()} <span className="text-[10px] font-normal text-gray-400">ريال</span>
                      </span>
                    )}
                    {l.deal_score != null && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: dealColor(l.deal_score) }}
                      >
                        {l.deal_score.toFixed(1)}
                      </span>
                    )}
                  </div>
                  {l.mileage_km != null && (
                    <p className="text-[10px] text-gray-400 mt-1" dir="ltr">{l.mileage_km.toLocaleString()} km</p>
                  )}
                  {l.city_ar && (
                    <p className="text-[10px] text-gray-400">📍 {l.city_ar}</p>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Idle: just the floating button ────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <button
        onClick={openOverlay}
        className="fixed bottom-6 left-6 z-50 w-16 h-16 rounded-full shadow-2xl flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-all"
        style={{ boxShadow: '0 0 0 0 rgba(59,130,246,0.5)' }}
        aria-label="مستشار كارسا الصوتي"
      >
        <style>{`
          @keyframes voice-pulse {
            0%   { box-shadow: 0 0 0 0 rgba(59,130,246,0.55); }
            70%  { box-shadow: 0 0 0 18px rgba(59,130,246,0); }
            100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
          }
          .voice-pulse { animation: voice-pulse 2.2s infinite; }
        `}</style>
        <span className="voice-pulse absolute inset-0 rounded-full" />
        <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z"/>
        </svg>
      </button>
    )
  }

  // ── Overlay ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* hidden audio element for TTS */}
      <audio ref={audioElemRef} style={{ display: 'none' }} />

      <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">مستشار كارسا</h2>
            <p className="text-xs text-blue-400">
              {phase === 'recording'    ? 'جاري التسجيل…'   :
               phase === 'transcribing' ? 'فاهم كلامك…'      :
               phase === 'thinking'     ? 'أفكر…'            :
               phase === 'speaking'     ? 'يرد عليك…'        :
               'جاهز — اضغط المايك'}
            </p>
          </div>
          <button
            onClick={closeOverlay}
            className="text-blue-300 hover:text-white transition-colors text-sm font-semibold flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl"
          >
            إنهاء
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'user' ? (
                <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]">
                  <p className="text-sm" dir="rtl">{msg.content}</p>
                </div>
              ) : (
                <AssistantBubble msg={msg} />
              )}
            </div>
          ))}

          {/* streaming assistant bubble */}
          {streamText && (
            <div className="flex justify-start">
              <AssistantBubble msg={{ role: 'assistant', content: '' }} isStreaming />
            </div>
          )}

          {/* thinking indicator */}
          {phase === 'thinking' && !streamText && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1.5 items-center">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          {/* error */}
          {error && (
            <div className="flex justify-center">
              <div className="bg-red-900/60 border border-red-700 rounded-xl px-4 py-2.5 max-w-xs text-center">
                <p className="text-sm text-red-200" dir="rtl">{error}</p>
                {micBlocked && (
                  <button
                    className="mt-2 text-xs text-red-300 underline"
                    onClick={() => { setError(null); setMicBlocked(false) }}
                  >
                    حسناً، فهمت
                  </button>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom controls */}
        <div className="shrink-0 px-4 pb-10 pt-4 flex flex-col items-center gap-4 border-t border-white/10">
          {/* waveform (visible during recording) */}
          {phase === 'recording' && <WaveformBars />}

          {/* transcript confirmation */}
          {phase === 'transcribing' && transcript && (
            <p className="text-xs text-blue-300 text-center" dir="rtl">"{transcript}"</p>
          )}

          {/* main mic button */}
          <button
            onClick={() => {
              if (phase === 'recording')   stopRecording()
              else if (phase === 'ready' || phase === 'open') startRecording()
            }}
            disabled={phase === 'transcribing' || phase === 'thinking' || phase === 'speaking'}
            className={[
              'w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 shadow-xl',
              phase === 'recording'
                ? 'bg-red-500 hover:bg-red-400 scale-110'
                : 'bg-blue-600 hover:bg-blue-500 active:scale-95',
              (phase === 'transcribing' || phase === 'thinking' || phase === 'speaking')
                ? 'opacity-40 cursor-not-allowed'
                : '',
            ].join(' ')}
            aria-label={phase === 'recording' ? 'أوقف التسجيل' : 'ابدأ التسجيل'}
          >
            {phase === 'recording' ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z"/>
              </svg>
            )}
          </button>

          <p className="text-xs text-blue-400/70 text-center">
            {phase === 'recording' ? 'اضغط مرة ثانية لما تخلص' : 'اضغط وتكلم'}
          </p>
        </div>
      </div>
    </>
  )
}
