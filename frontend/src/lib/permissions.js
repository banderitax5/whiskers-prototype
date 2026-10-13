// single source of truth for back-office role permissions.
// the server (backend/src/middleware/auth.js) is always authoritative —
// these client-side gates only shape navigation and default landing pages.
// keep this file in sync with the staff/admin split documented in the paper:
// staff = orders, products, payments view, support;
// admin-only = analytics dashboard, customers, audit logs.

export const ADMIN_ONLY_PAGES = ['/', '/customers', '/audit-logs']

// sidebar entries for the back office, filtered by role at render time
export const ADMIN_NAV = [
  { to: '/admin', label: 'Data Analytics', iconKey: 'barChart', end: true, roles: ['admin'] },
  { to: '/admin/products', label: 'Product Management', iconKey: 'boxSeam', roles: ['admin', 'staff'] },
  { to: '/admin/customers', label: 'Customers', iconKey: 'people', roles: ['admin'] },
  { to: '/admin/orders', label: 'Orders', iconKey: 'receipt', roles: ['admin', 'staff'] },
  { to: '/admin/payments', label: 'Payments', iconKey: 'creditCard', roles: ['admin', 'staff'] },
  { to: '/admin/promos', label: 'Promos', iconKey: 'gift', roles: ['admin'] },
  { to: '/admin/media', label: 'Media Library', iconKey: 'images', roles: ['admin'] },
  { to: '/admin/support', label: 'Customer Support', iconKey: 'chatDots', roles: ['admin', 'staff'] },
  { to: '/admin/audit-logs', label: 'Audit Logs', iconKey: 'clockHistory', roles: ['admin'] },
]

// staff land here when they hit an admin-only page
export const STAFF_FALLBACK = '/admin/orders'

// costing data (cost price, margin, supplier) is admin-only: staff manage
// products but must never see purchasing data. Server enforces the same split
// (admin.js strips cost fields from every non-admin response).
export function canSeeCosts(role) {
  return role === 'admin'
}

// product lifecycle (create, archive, delete) is admin-only per the same
// matrix; staff edit text/images/price/stock on existing products.
export function canManageProductLifecycle(role) {
  return role === 'admin'
}

export function canSeeNav(item, role) {
  return item.roles.includes(role)
}

export function isAdminOnlyPage(pathname) {
  return ADMIN_ONLY_PAGES.includes(pathname)
}
