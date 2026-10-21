import type { InviteRole, TeamRole } from '@/api/types';

/** Pure helpers for team roles (no imports from the app, so they run under plain node). */

export const ROLE_LABEL: Record<TeamRole, string> = {
  owner: 'Proprietario',
  editor: 'Editor',
  viewer: 'Sola lettura',
};

export const ROLE_HINT: Record<TeamRole, string> = {
  owner: 'Gestisce team e membri, legge e scrive',
  editor: 'Legge e scrive i file',
  viewer: 'Può solo leggere',
};

export const INVITE_ROLES: InviteRole[] = ['editor', 'viewer'];

const RANK: Record<TeamRole, number> = { viewer: 1, editor: 2, owner: 3 };

export const canWrite = (role: TeamRole) => RANK[role] >= RANK.editor;
export const canManage = (role: TeamRole) => role === 'owner';

/** Owners first, then editors, then viewers; people with the same role by name. */
export function sortMembers<T extends { role: TeamRole; name: string | null; email: string | null }>(members: T[]): T[] {
  const label = (m: T) => (m.name ?? m.email ?? '').toLowerCase();
  return [...members].sort((a, b) => RANK[b.role] - RANK[a.role] || label(a).localeCompare(label(b)));
}

/** True when the string looks like an email address (the server validates for real). */
export const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

/** The roles a member can be switched to from their current one. */
export const otherRoles = (current: TeamRole): TeamRole[] => (['owner', 'editor', 'viewer'] as const).filter((r) => r !== current);
