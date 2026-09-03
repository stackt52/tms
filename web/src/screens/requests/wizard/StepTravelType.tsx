'use client';
import type { TravelCategory } from '@tms/shared';
import { Chip, Icon } from '@/components/m3';
import type { StepProps } from './wizard-state';

const TYPES: { key: TravelCategory; icon: string; title: string; desc: string; note?: string }[] = [
  { key: 'LOCAL', icon: 'location_city', title: 'Local travel', desc: 'Within Zambia, close to the duty station — day trips or short stays. Approval: Supervisor → HOD / Cost centre → Finance → Finance Director.' },
  { key: 'FIELD', icon: 'forest', title: 'Project / field travel', desc: 'Project activities away from the duty station. Adds Project Director / CEO final approval after Finance.' },
  { key: 'INTERNATIONAL', icon: 'flight', title: 'International', desc: 'Travel outside Zambia. Adds Procurement after executive approval; economy class only.', note: 'Requires at least 2 weeks’ (14 days) notice before departure.' },
];

export function StepTravelType({ view, set }: StepProps) {
  return (
    <div className="wiz-types" role="radiogroup" aria-label="Travel type">
      {TYPES.map((t) => {
        const selected = view.category === t.key;
        return (
          <button key={t.key} type="button" role="radio" aria-checked={selected} className={`wiz-opt ${selected ? 'wiz-opt--selected' : ''}`} onClick={() => set({ category: t.key })}>
            <div className="wiz-opt__icon">
              <Icon name={t.icon} filled={selected} size={24} />
            </div>
            <div>
              <div className="wiz-opt__title">{t.title}</div>
              <div className="wiz-opt__desc">{t.desc}</div>
              {t.note ? (
                <div className="mt8">
                  <Chip tone="info" size="xs" icon="schedule">
                    {t.note}
                  </Chip>
                </div>
              ) : null}
            </div>
            <span className="wiz-opt__radio" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
