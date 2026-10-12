export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`mark ${className}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <g className="mark-lid">
        <rect x="4" y="5" width="24" height="3.4" rx="1.4" fill="currentColor" />
        <rect x="12.5" y="2.2" width="7" height="3.4" rx="1.4" fill="currentColor" />
      </g>
      <path d="M6.5 11h19l-1.7 16.1a2.6 2.6 0 0 1-2.6 2.3H10.8a2.6 2.6 0 0 1-2.6-2.3L6.5 11Z" fill="currentColor" />
      <rect className="mark-pod" x="14.2" y="16.6" width="3.6" height="3.6" rx="0.6" fill="var(--bg)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`} aria-label="binwala">
      b<span className="wordmark-i">ı<span className="wordmark-dot" /></span>nwala
    </span>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <Mark />
      <Wordmark />
    </span>
  );
}
