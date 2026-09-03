/** Roles per SRS §6. A user may hold several. */
export const ROLES = [
  'TRAVELLER',
  'EXTERNAL_TRAVELLER',
  'UNIT_SUPERVISOR',
  'PROJECT_MANAGER',
  'COST_CENTRE_OWNER',
  'HEAD_OF_DEPARTMENT',
  'FINANCE_ACCOUNTANT',
  'FINANCE_ASSISTANT',
  'FINANCE_DIRECTOR',
  'PROJECT_DIRECTOR',
  'CEO',
  'PROCUREMENT_OFFICER',
  'OFFICE_MANAGEMENT',
  'FLEET_ADMIN',
  'SYSTEM_ADMIN',
  'AUDITOR',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  TRAVELLER: 'Traveller / Requestor',
  EXTERNAL_TRAVELLER: 'External traveller',
  UNIT_SUPERVISOR: 'Unit Supervisor',
  PROJECT_MANAGER: 'Project Manager',
  COST_CENTRE_OWNER: 'Cost Centre Owner',
  HEAD_OF_DEPARTMENT: 'Head of Department',
  FINANCE_ACCOUNTANT: 'Finance Accountant',
  FINANCE_ASSISTANT: 'Finance Assistant',
  FINANCE_DIRECTOR: 'Finance Director',
  PROJECT_DIRECTOR: 'Project Director',
  CEO: 'CEO',
  PROCUREMENT_OFFICER: 'Procurement Officer',
  OFFICE_MANAGEMENT: 'Office Management',
  FLEET_ADMIN: 'Fleet Administrator',
  SYSTEM_ADMIN: 'System Administrator',
  AUDITOR: 'Auditor / Management viewer',
};

export const FINANCE_ROLES: Role[] = ['FINANCE_ACCOUNTANT', 'FINANCE_ASSISTANT', 'FINANCE_DIRECTOR'];
export const APPROVER_ROLES: Role[] = [
  'UNIT_SUPERVISOR',
  'PROJECT_MANAGER',
  'COST_CENTRE_OWNER',
  'HEAD_OF_DEPARTMENT',
  'FINANCE_ACCOUNTANT',
  'FINANCE_DIRECTOR',
  'PROJECT_DIRECTOR',
  'CEO',
  'PROCUREMENT_OFFICER',
];
export const FLEET_ROLES: Role[] = ['OFFICE_MANAGEMENT', 'FLEET_ADMIN'];
export const ADMIN_ROLES: Role[] = ['SYSTEM_ADMIN'];

export function hasAnyRole(userRoles: readonly Role[] | undefined, wanted: readonly Role[]): boolean {
  if (!userRoles) return false;
  return wanted.some((r) => userRoles.includes(r));
}
