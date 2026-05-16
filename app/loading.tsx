// Route-level loading UI. The old skeleton tried to mimic the entire
// homepage (navy hero + pill tabs + listing card grid) and is wildly
// out of date now that the design uses a white surface + card-style
// tabs. Faithfully maintaining a multi-section skeleton through every
// design iteration is brittle, so this is a deliberate downgrade to a
// neutral spinner: small, coral, centered. The shell itself (sticky
// header + tabs) is already rendered by (modes)/layout.tsx so users
// still see the chrome — only the content area is replaced with this.

export default function Loading () {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        minHeight: '50vh',
        background: 'var(--bg-page)',
        color: 'var(--accent-primary)',
      }}
      role="status"
      aria-live="polite"
      aria-label="جاري التحميل"
    >
      <svg
        className="animate-spin"
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="3" />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
