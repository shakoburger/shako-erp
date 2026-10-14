export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  manager?: string;
  isMain?: boolean;
}

export const defaultBranches: Branch[] = [
  {
    id: 'main',
    name: 'الفرع الرئيسي',
    code: 'HQ',
    address: 'المقر الرئيسي للوكالة',
    isMain: true
  }
];

export function getAgencyBranches(settings?: { branches?: Branch[] }): Branch[] {
  if (settings?.branches && Array.isArray(settings.branches) && settings.branches.length > 0) {
    return settings.branches;
  }
  return defaultBranches;
}

export function getBranchName(branches?: Branch[], branchId?: string): string {
  if (!branchId || branchId === 'all') return 'جميع الفروع';
  const list = branches || defaultBranches;
  const found = list.find(b => b.id === branchId || b.code === branchId);
  return found ? found.name : 'الفرع الرئيسي';
}
