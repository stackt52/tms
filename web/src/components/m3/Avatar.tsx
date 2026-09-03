import type { UserProfile } from '@tms/shared';

export function Avatar({ initials, tone = 'deep', size = 'md' }: { initials: string; tone?: UserProfile['avatarTone'] | 'neutral'; size?: 'xs' | 'sm' | 'md' }) {
  return (
    <div className={`m3-avatar m3-avatar--${tone} ${size !== 'md' ? `m3-avatar--${size}` : ''}`} aria-hidden>
      {initials}
    </div>
  );
}
