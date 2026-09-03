import type { NextFunction, Request, Response } from 'express';
import type { UserProfile } from '@tms/shared';
import { initialsOf } from '@tms/shared';
import { auth, db, COL, nowIso } from './firebase';
import { unauthorized, forbidden } from './errors';
import type { AuthedRequest } from './context';

/**
 * Verifies the Firebase ID token and loads the Firestore profile (roles, org placement).
 * A signed-in user without a profile gets a minimal TRAVELLER profile created on first call so
 * SSO-provisioned staff can start a request; admins then assign roles.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer (.+)$/.exec(header);
    if (!match) throw unauthorized();
    const decoded = await auth.verifyIdToken(match[1]!);
    const ref = db.collection(COL.users).doc(decoded.uid);
    const snap = await ref.get();
    let profile: UserProfile;
    if (snap.exists) {
      profile = snap.data() as UserProfile;
    } else {
      const displayName = decoded.name ?? decoded.email?.split('@')[0] ?? 'New user';
      profile = {
        id: decoded.uid,
        email: decoded.email ?? '',
        displayName,
        initials: initialsOf(displayName),
        avatarTone: 'deep',
        roles: ['TRAVELLER'],
        active: true,
        createdAt: nowIso(),
      };
      await ref.set(profile);
    }
    if (!profile.active) throw forbidden('Account is deactivated');
    (req as AuthedRequest).actor = { uid: decoded.uid, profile, roles: profile.roles ?? [] };
    next();
  } catch (e) {
    next(e);
  }
}
