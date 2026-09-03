import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="gate" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--md-surface)' }}>
      <div className="m3-card" style={{ maxWidth: 420, textAlign: 'center' }}>
        <div className="t-title">Page not found</div>
        <div className="t-body t-muted mt8">The page you’re looking for doesn’t exist or has moved.</div>
        <Link href="/" className="m3-btn m3-btn--filled mt16">
          Back to home
        </Link>
      </div>
    </div>
  );
}
