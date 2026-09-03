import type { CostCentre, Department, Location, Project, Unit, UserProfile, Vehicle, Vendor } from '@tms/shared';
import { COL } from '../lib/firebase';
import { getAllDocs, getDoc } from '../lib/query';

export interface MasterData {
  departments: Department[];
  units: Unit[];
  projects: Project[];
  costCentres: CostCentre[];
  locations: Location[];
  vendors: Vendor[];
}

export async function loadMasterData(): Promise<MasterData> {
  const [departments, units, projects, costCentres, locations, vendors] = await Promise.all([
    getAllDocs<Department>(COL.departments),
    getAllDocs<Unit>(COL.units),
    getAllDocs<Project>(COL.projects),
    getAllDocs<CostCentre>(COL.costCentres),
    getAllDocs<Location>(COL.locations),
    getAllDocs<Vendor>(COL.vendors),
  ]);
  return { departments, units, projects, costCentres, locations, vendors };
}

export const getDepartment = (id?: string | null) => (id ? getDoc<Department>(COL.departments, id) : Promise.resolve(null));
export const getUnit = (id?: string | null) => (id ? getDoc<Unit>(COL.units, id) : Promise.resolve(null));
export const getProject = (id?: string | null) => (id ? getDoc<Project>(COL.projects, id) : Promise.resolve(null));
export const getCostCentre = (id?: string | null) => (id ? getDoc<CostCentre>(COL.costCentres, id) : Promise.resolve(null));
export const getLocation = (id?: string | null) => (id ? getDoc<Location>(COL.locations, id) : Promise.resolve(null));
export const getVehicle = (id?: string | null) => (id ? getDoc<Vehicle>(COL.vehicles, id) : Promise.resolve(null));
export const getVendor = (id?: string | null) => (id ? getDoc<Vendor>(COL.vendors, id) : Promise.resolve(null));

export type UserPick = Pick<UserProfile, 'id' | 'displayName' | 'initials' | 'avatarTone' | 'roles' | 'unitId' | 'departmentId'>;
export function userPick(u: UserProfile): UserPick {
  return { id: u.id, displayName: u.displayName, initials: u.initials, avatarTone: u.avatarTone, roles: u.roles, unitId: u.unitId, departmentId: u.departmentId };
}
