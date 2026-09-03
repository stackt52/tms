'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, ErrorState } from '@/components/m3';
import { useCreateTravelRequest } from '@/lib/queries';

/** /requests/new — creates a draft on mount and hands over to the wizard. */
export function NewRequestScreen() {
  const create = useCreateTravelRequest();
  const router = useRouter();
  const started = useRef(false);
  const [err, setErr] = useState<unknown>(null);

  const start = () => {
    setErr(null);
    create.mutate(
      {},
      {
        onSuccess: (d) => router.replace(`/requests/${d.request.id}/edit`),
        onError: (e) => setErr(e),
      },
    );
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <div className="m3-card" style={{ maxWidth: 520, margin: '40px auto' }}>
        {err ? (
          <ErrorState error={err} retry={start} />
        ) : (
          <div className="col g12" style={{ alignItems: 'center', textAlign: 'center', padding: '20px 0' }}>
            <span className="m3-btn__spinner" style={{ color: 'var(--md-primary)', width: 26, height: 26 }} />
            <div className="t-card-title">Creating your draft…</div>
            <div className="t-caption">You will be taken to the guided travel request in a moment.</div>
            <Button variant="text" size="sm" href="/requests">
              Back to my requests
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
