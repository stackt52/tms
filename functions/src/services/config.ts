import type { Location, PolicyConfig, Rate, WorkflowDefinition } from '@tms/shared';
import { DEFAULT_POLICY } from '@tms/shared';
import { COL, db } from '../lib/firebase';
import { getAllDocs } from '../lib/query';

export const POLICY_DOC_ID = 'current';

export interface Config {
  policy: PolicyConfig;
  rates: Rate[];
  workflows: WorkflowDefinition[];
  locations: Location[];
  locationById: Map<string, Location>;
}

let cache: { at: number; value: Config } | null = null;
const TTL_MS = 15_000;

export function invalidateConfig(): void {
  cache = null;
}

export async function loadPolicy(): Promise<PolicyConfig> {
  const snap = await db.collection(COL.policies).doc(POLICY_DOC_ID).get();
  return snap.exists ? ({ ...DEFAULT_POLICY, ...(snap.data() as Partial<PolicyConfig>), toggles: { ...DEFAULT_POLICY.toggles, ...((snap.data() as PolicyConfig).toggles ?? {}) } } as PolicyConfig) : DEFAULT_POLICY;
}

/** Policy, rates, workflows and locations are small; load together with a short in-process cache. */
export async function loadConfig(force = false): Promise<Config> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const [policy, rates, workflows, locations] = await Promise.all([loadPolicy(), getAllDocs<Rate>(COL.rates), getAllDocs<WorkflowDefinition>(COL.workflows), getAllDocs<Location>(COL.locations)]);
  const value: Config = { policy, rates, workflows, locations, locationById: new Map(locations.map((l) => [l.id, l])) };
  cache = { at: Date.now(), value };
  return value;
}
