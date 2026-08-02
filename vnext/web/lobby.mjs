const VALID_ROLES = new Set(['p1', 'p2', 'observer']);

export function normalizeRole(role) {
  const value = typeof role === 'string' ? role.toLowerCase() : '';
  return VALID_ROLES.has(value) ? value : null;
}

export function readLaunchParams(search) {
  const params = new URLSearchParams(search || '');
  const matchId = params.get('matchId') || params.get('match') || '';
  const role = normalizeRole(params.get('role'));
  if (!matchId || !role) return null;
  return { matchId, role };
}

export function matchUrl({ origin, pathname, matchId, role }) {
  const normalizedRole = normalizeRole(role);
  if (!matchId || !normalizedRole) return '';
  const url = new URL(pathname || '/', origin);
  url.searchParams.set('matchId', matchId);
  url.searchParams.set('role', normalizedRole);
  return url.toString();
}

export function inviteUrl({ origin, pathname, matchId }) {
  return matchUrl({ origin, pathname, matchId, role: 'p2' });
}
