// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { ADMIN_NAV, canSeeNav, ADMIN_ONLY_PAGES, STAFF_FALLBACK, canSeeCosts, canManageProductLifecycle } from '../lib/permissions';

describe('permissions - admin navigation', () => {
  it('exposes orders, payments, products, support to staff but not customers/audit-logs', () => {
    const staffVisible = ADMIN_NAV.filter((l) => canSeeNav(l, 'staff')).map((l) => l.to);
    expect(staffVisible).toEqual([
      '/admin/products',
      '/admin/orders',
      '/admin/payments',
      '/admin/support',
    ]);
  });

  it('includes every admin nav tab for admin role', () => {
    const adminVisible = ADMIN_NAV.filter((l) => canSeeNav(l, 'admin')).map((l) => l.to);
    expect(adminVisible).toEqual(ADMIN_NAV.map((l) => l.to));
  });

  it('excludes every tab for the user role', () => {
    const userVisible = ADMIN_NAV.filter((l) => canSeeNav(l, 'user'));
    expect(userVisible).toHaveLength(0);
  });

  it('provides an iconKey on every nav link so AdminLayout can render icons', () => {
    ADMIN_NAV.forEach((l) => {
      expect(typeof l.iconKey).toBe('string');
      expect(l.iconKey.length).toBeGreaterThan(0);
    });
  });
});

describe('permissions - role redirects', () => {
  it('staff falls back to the orders tab', () => {
    expect(STAFF_FALLBACK).toBe('/admin/orders');
  });

  it('marks audit-logs and customers as admin-only', () => {
    expect(ADMIN_ONLY_PAGES).toContain('/audit-logs');
    expect(ADMIN_ONLY_PAGES).toContain('/customers');
  });

  it('does not include staff-accessible pages in the admin-only list', () => {
    expect(ADMIN_ONLY_PAGES).not.toContain('/orders');
    expect(ADMIN_ONLY_PAGES).not.toContain('/payments');
    expect(ADMIN_ONLY_PAGES).not.toContain('/products');
  });
});

describe('permissions - costing and lifecycle gates', () => {
  it('shows costs and lifecycle actions to admin only', () => {
    expect(canSeeCosts('admin')).toBe(true);
    expect(canSeeCosts('staff')).toBe(false);
    expect(canSeeCosts('user')).toBe(false);
    expect(canManageProductLifecycle('admin')).toBe(true);
    expect(canManageProductLifecycle('staff')).toBe(false);
    expect(canManageProductLifecycle('user')).toBe(false);
  });
});
