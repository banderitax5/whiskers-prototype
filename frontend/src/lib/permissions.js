// single source of truth for back-office role permissions.
// the server (backend/src/middleware/auth.js) is always authoritative —
// these client-side gates only shape navigation and default landing pages.
// keep this file in sync with the staff/admin split documented in the paper:
// staff = orders, products, payments view, support;
// admin-only = analytics dashboard, customers, audit logs.

export const ADMIN_ONLY_PAGES = ['/', '/customers', '/audit-logs']

// sidebar entries for the back office, filtered by role at render time.
// `group` drives the section headings in AdminLayout; groups render in the
// order of ADMIN_NAV_GROUPS, and a group is hidden when the role can't see
// any of its links.
export const ADMIN_NAV_GROUPS = ['Overview', 'Catalog', 'Sales', 'Customers', 'Content', 'System']

export const ADMIN_NAV = [
  { to: '/admin', label: 'Data Analytics', iconKey: 'barChart', group: 'Overview', end: true, roles: ['admin'] },
  { to: '/admin/products', label: 'Product Management', iconKey: 'boxSeam', group: 'Catalog', roles: ['admin', 'staff'] },
  { to: '/admin/orders', label: 'Orders', iconKey: 'receipt', group: 'Sales', roles: ['admin', 'staff'] },
  { to: '/admin/payments', label: 'Payments', iconKey: 'creditCard', group: 'Sales', roles: ['admin', 'staff'] },
  { to: '/admin/promos', label: 'Promos', iconKey: 'gift', group: 'Sales', roles: ['admin'] },
  { to: '/admin/customers', label: 'Customers', iconKey: 'people', group: 'Customers', roles: ['admin'] },
  { to: '/admin/support', label: 'Customer Support', iconKey: 'chatDots', group: 'Customers', roles: ['admin', 'staff'] },
  { to: '/admin/media', label: 'Media Library', iconKey: 'images', group: 'Content', roles: ['admin'] },
  { to: '/admin/banners', label: 'Banners', iconKey: 'cardImage', group: 'Content', roles: ['admin'] },
  { to: '/admin/home-sections', label: 'Home Sections', iconKey: 'grid', group: 'Content', roles: ['admin'] },
  { to: '/admin/navigation', label: 'Navigation', iconKey: 'listUl', group: 'Content', roles: ['admin'] },
  { to: '/admin/settings', label: 'Site Settings', iconKey: 'gear', group: 'System', roles: ['admin'] },
  { to: '/admin/audit-logs', label: 'Audit Logs', iconKey: 'clockHistory', group: 'System', roles: ['admin'] },
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
// matrix; staff edit text/images/stock on existing products.
export function canManageProductLifecycle(role) {
  return role === 'admin'
}

// selling price is owner-only. Server enforces the same split (a staff PATCH
// carrying a price field is 403-ed), so this gate just keeps the input honest.
export function canEditPrice(role) {
  return role === 'admin'
}

export function canSeeNav(item, role) {
  return item.roles.includes(role)
}

export function isAdminOnlyPage(pathname) {
  return ADMIN_ONLY_PAGES.includes(pathname)
}
