'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EDITABLE_STATUSES, STATUS_META, WIZARD_STEPS, WIZARD_STEP_LABELS, fmtTime, type TravelRequest, type WizardStep } from '@tms/shared';
import { Button, CardSkeleton, Chip, EmptyState, ErrorState, Icon, IconButton, ProgressSegments, Skeleton, useToast } from '@/components/m3';
import { ApiClientError } from '@/lib/api';
import { useMe } from '@/lib/auth-context';
import { useIsMobile } from '@/lib/hooks';
import { useMasterData, useSubmitTravelRequest, useTravelRequest, useUpdateTravelRequest } from '@/lib/queries';
import { CATEGORY_SHORT, STEP_COPY, applyPatch, detailLines, mergePatch, validateStep, type Patch, type StepProps } from './wizard-state';
import { StepTravelType } from './StepTravelType';
import { StepTripDetails } from './StepTripDetails';
import { StepItinerary } from './StepItinerary';
import { StepTravellers } from './StepTravellers';
import { StepTransport } from './StepTransport';
import { StepAccommodation } from './StepAccommodation';
import { StepAllowances } from './StepAllowances';
import { StepCosting } from './StepCosting';
import { StepAttachments } from './StepAttachments';
import { StepReview } from './StepReview';
import './wizard.css';

const STEP_COMPONENTS: Record<WizardStep, (p: StepProps) => React.JSX.Element> = {
  travel_type: StepTravelType,
  trip_details: StepTripDetails,
  itinerary: StepItinerary,
  travellers: StepTravellers,
  transport: StepTransport,
  accommodation: StepAccommodation,
  allowances: StepAllowances,
  costing: StepCosting,
  attachments: StepAttachments,
  review: StepReview,
};

function errLines(e: unknown): string[] {
  if (e instanceof ApiClientError) return [e.message, ...detailLines(e.details)];
  return [e instanceof Error ? e.message : 'Something went wrong'];
}

const isEmpty = (p: Patch) => Object.keys(p).length === 0;

export function RequestWizardScreen() {
  const { id } = useParams<{ id: string }>();
  const q = useTravelRequest(id);
  if (q.isLoading) {
    return (
      <div className="page">
        <Skeleton h={20} w={320} />
        <div className="wiz">
          <div className="wiz__stepper">
            <div className="col g12">
              {WIZARD_STEPS.map((s) => (
                <Skeleton key={s} h={18} />
              ))}
            </div>
          </div>
          <div className="grow">
            <CardSkeleton h={420} lines={6} />
          </div>
        </div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="page">
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      </div>
    );
  }
  if (!EDITABLE_STATUSES.includes(q.data.request.status)) {
    return (
      <div className="page">
        <div className="m3-card" style={{ maxWidth: 560, margin: '40px auto' }}>
          <EmptyState icon="lock" title="This request can no longer be edited" body={`${q.data.request.id} is ${STATUS_META[q.data.request.status].label.toLowerCase()}. Open the request to follow its progress.`} action={<Button variant="tonal" size="sm" href={`/requests/${id}`}>Open request</Button>} />
        </div>
      </div>
    );
  }
  return <Wizard server={q.data.request} />;
}

function Wizard({ server }: { server: TravelRequest }) {
  const id = server.id;
  const router = useRouter();
  const params = useSearchParams();
  const mobile = useIsMobile();
  const me = useMe();
  const md = useMasterData();
  const update = useUpdateTravelRequest(id);
  const submit = useSubmitTravelRequest(id);
  const { success, error } = useToast();

  const stepParam = params.get('step') as WizardStep | null;
  const step: WizardStep = stepParam && WIZARD_STEPS.includes(stepParam) ? stepParam : (WIZARD_STEPS.includes(server.wizard?.lastStep) ? server.wizard.lastStep : 'travel_type');
  const stepIdx = WIZARD_STEPS.indexOf(step);
  const prev = WIZARD_STEPS[stepIdx - 1];
  const next = WIZARD_STEPS[stepIdx + 1];
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Unsaved edits (pending), edits currently being PATCHed (inflight) and the merged view.
  const [pending, setPending] = useState<Patch>({});
  const pendingRef = useRef<Patch>({});
  const [inflight, setInflight] = useState<Patch>({});
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  const view = useMemo(() => applyPatch(applyPatch(server, inflight), pending), [server, inflight, pending]);
  const dirty = !isEmpty(pending) || !isEmpty(inflight);

  const set = useCallback((p: Patch) => {
    pendingRef.current = mergePatch(pendingRef.current, p);
    setPending(pendingRef.current);
    setStepError(null);
  }, []);

  const flush = useCallback(
    async (extra: Patch = {}) => {
      const body = mergePatch(pendingRef.current, extra);
      if (isEmpty(body)) return null;
      pendingRef.current = {};
      setPending({});
      setInflight((prev) => mergePatch(prev, body));
      try {
        const res = await update.mutateAsync({ ...body, wizardStep: body.wizardStep ?? stepRef.current });
        setSaveErrors([]);
        return res;
      } catch (e) {
        // Keep the user's edits so nothing is lost; surface the error.
        pendingRef.current = mergePatch(body, pendingRef.current);
        setPending(pendingRef.current);
        setSaveErrors(errLines(e));
        throw e;
      } finally {
        setInflight((prev) => {
          const n: Patch = { ...prev };
          for (const k of Object.keys(body) as (keyof Patch)[]) delete n[k];
          return n;
        });
      }
    },
    [update],
  );

  // Debounced autosave (600 ms after the last edit).
  useEffect(() => {
    if (isEmpty(pending)) return;
    const t = setTimeout(() => {
      flush().catch(() => undefined);
    }, 600);
    return () => clearTimeout(t);
  }, [pending, flush]);

  const goTo = useCallback(
    (s: WizardStep) => {
      if (!isEmpty(pendingRef.current)) flush({ wizardStep: s }).catch(() => undefined);
      setStepError(null);
      router.push(`/requests/${id}/edit?step=${s}`);
    },
    [flush, id, router],
  );

  const completed = view.wizard?.completedSteps ?? [];
  const maxReach = Math.max(stepIdx, ...completed.map((s) => WIZARD_STEPS.indexOf(s) + 1));

  const onContinue = async () => {
    const v = validateStep(step, view);
    if (v) {
      setStepError(v);
      return;
    }
    try {
      await flush({ completeStep: step, wizardStep: next ?? step });
      if (next) {
        setStepError(null);
        router.push(`/requests/${id}/edit?step=${next}`);
      }
    } catch {
      /* shown inline */
    }
  };

  const onSubmit = async () => {
    setSubmitErrors([]);
    for (const s of WIZARD_STEPS) {
      const v = validateStep(s, view);
      if (v) {
        setSubmitErrors([`${WIZARD_STEP_LABELS[s]}: ${v}`]);
        return;
      }
    }
    try {
      await flush({ completeStep: 'review' });
    } catch {
      return;
    }
    submit.mutate(undefined, {
      onSuccess: () => {
        success('Request submitted for approval');
        router.push(`/requests/${id}`);
      },
      onError: (e) => {
        setSubmitErrors(errLines(e));
        error(e, 'Could not submit');
      },
    });
  };

  const saving = update.isPending;
  const savedLabel = `${STATUS_META[server.status].label} — autosaved ${server.wizard?.savedAt ? fmtTime(server.wizard.savedAt) : fmtTime(server.updatedAt)}`;
  const StepBody = STEP_COMPONENTS[step];
  const copy = STEP_COPY[step];
  const stepProps: StepProps = { view, server, dirty, set, md: md.data, me, mobile, goTo };
  const isLast = step === 'review';
  const busy = saving || submit.isPending;

  const errors = (
    <>
      {stepError ? <div className="wiz-errors">{stepError}</div> : null}
      {saveErrors.length ? (
        <div className="wiz-errors">
          <b>Could not save.</b>
          {saveErrors.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      ) : null}
      {submitErrors.length ? (
        <div className="wiz-errors" role="alert">
          <b>Not submitted.</b>
          {submitErrors.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      ) : null}
    </>
  );

  if (mobile) {
    return (
      <div className="page">
        <div className="wizm-top">
          <IconButton icon="arrow_back" label="Back to request" onClick={() => router.push(`/requests/${id}`)} />
          <div className="grow">
            <div className="wizm-top__title">New travel request</div>
            <div className="wizm-top__sub">
              Step {stepIdx + 1} of {WIZARD_STEPS.length} · {WIZARD_STEP_LABELS[step]}
            </div>
          </div>
          <Chip tone="neutral" size="xs" icon={saving ? 'progress_activity' : undefined}>
            {saving ? 'Saving…' : dirty ? 'Unsaved' : 'Draft saved'}
          </Chip>
        </div>
        <div className="mt14">
          <ProgressSegments total={WIZARD_STEPS.length} done={stepIdx + 1} />
        </div>
        <div className="wizm-title">{copy.title}</div>
        <div className="mt16">
          <StepBody {...stepProps} />
        </div>
        {errors}
        <div className="wizm-footer">
          {prev ? (
            <Button variant="outlined" onClick={() => goTo(prev)} style={{ minWidth: 96 }}>
              Back
            </Button>
          ) : (
            <Button variant="outlined" href={`/requests/${id}`} style={{ minWidth: 96 }}>
              Back
            </Button>
          )}
          {isLast ? (
            <Button icon="send" onClick={onSubmit} loading={busy} style={{ flex: 1 }}>
              Submit for approval
            </Button>
          ) : (
            <Button onClick={onContinue} loading={busy} style={{ flex: 1 }}>
              Continue
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ paddingTop: 22 }}>
      <div className="wiz-head">
        <Link href={`/requests/${id}`} className="row g8" style={{ color: 'inherit' }} aria-label="Back to request">
          <Icon name="arrow_back" size={20} />
          <span>New travel request · {id}</span>
        </Link>
        <Chip tone="neutral" icon={saving ? 'progress_activity' : undefined}>
          {saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedLabel}
        </Chip>
      </div>

      <div className="wiz">
        <nav className="wiz__stepper" aria-label="Wizard steps">
          <div className="m3-stepper">
            {WIZARD_STEPS.map((s, i) => {
              const done = completed.includes(s) && s !== step;
              const current = s === step;
              const clickable = !current && (done || i <= maxReach);
              const state = current ? 'current' : done ? 'done' : 'upcoming';
              return (
                <button key={s} type="button" disabled={!clickable} aria-current={current ? 'step' : undefined} className={`m3-stepper__item m3-stepper__item--${state} ${clickable ? 'm3-stepper__item--clickable' : ''}`} onClick={() => clickable && goTo(s)} style={!clickable && !current ? { cursor: 'default' } : undefined}>
                  {done ? <Icon name="check_circle" filled size={19} color="var(--md-primary)" /> : <span className={`m3-stepper__dot m3-stepper__dot--${current ? 'current' : 'upcoming'}`} />}
                  <span>{WIZARD_STEP_LABELS[s]}</span>
                  {s === 'travel_type' && done && view.category ? (
                    <span className="m3-stepper__tag">
                      <Chip tone="approved" size="xs">
                        {CATEGORY_SHORT[view.category]}
                      </Chip>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>

        <section className="wiz__main">
          <div className="wiz__title">{copy.title}</div>
          <div className="wiz__sub">{copy.sub}</div>
          <div className="wiz__body">
            <StepBody {...stepProps} />
          </div>
          {errors}
          <div className="wiz__footer">
            {prev ? (
              <Button variant="text" icon="arrow_back" onClick={() => goTo(prev)} style={{ paddingLeft: 4 }}>
                {WIZARD_STEP_LABELS[prev]}
              </Button>
            ) : (
              <Button variant="text" icon="arrow_back" href={`/requests/${id}`} style={{ paddingLeft: 4 }}>
                My requests
              </Button>
            )}
            <div className="spacer" />
            {isLast ? (
              <Button size="lg" icon="send" onClick={onSubmit} loading={busy}>
                Submit for approval
              </Button>
            ) : (
              <Button size="lg" trailingIcon="arrow_forward" onClick={onContinue} loading={busy}>
                Continue to {next ? WIZARD_STEP_LABELS[next].toLowerCase() : 'next'}
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
