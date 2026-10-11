export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || 'indianthakran@gmail.com').trim().toLowerCase();

export function normalizeUserRole(user) {
  if (!user) return null;
  const isAdminEmail = user.email?.trim().toLowerCase() === ADMIN_EMAIL;
  return { ...user, role: isAdminEmail ? 'admin' : (user.role || 'researcher') };
}

export function isAdminUser(user) {
  return user?.email?.trim().toLowerCase() === ADMIN_EMAIL || user?.role === 'admin';
}
