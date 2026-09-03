'use client';
import { Button, Card, Icon } from '@/components/m3';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page">
      <Card style={{ maxWidth: 520 }}>
        <Icon name="error" filled size={30} color="var(--md-error)" />
        <div className="t-headline mt8">Something went wrong</div>
        <div className="t-body t-muted mt6">{error.message}</div>
        <div className="row g8 mt16">
          <Button variant="tonal" icon="refresh" onClick={reset}>
            Try again
          </Button>
          <Button variant="text" href="/">
            Go home
          </Button>
        </div>
      </Card>
    </div>
  );
}
