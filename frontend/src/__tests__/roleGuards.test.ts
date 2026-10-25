import { describe, it, expect } from 'vitest';
import { resolveHomeForRole, isRoleAllowed } from '../App';
import type { UserRole } from '../types/database.types';

const ALL_ROLES: UserRole[] = ['customer', 'store_owner', 'doctor', 'nurse', 'admin'];

describe('resolveHomeForRole', () => {
  it('sends every known role to its own dashboard, not a shared one', () => {
    const destinations = new Set(ALL_ROLES.map(resolveHomeForRole));
    expect(destinations.size).toBe(ALL_ROLES.length); // no two roles collide on the same route
  });

  it('sends a customer to the patient/marketplace dashboard specifically', () => {
    expect(resolveHomeForRole('customer')).toBe('/app/store');
  });

  it('falls back to the landing page when there is no role (logged out / still loading)', () => {
    expect(resolveHomeForRole(null)).toBe('/');
  });
});

describe('isRoleAllowed', () => {
  it('allows any authenticated role when no allow-list is given', () => {
    for (const role of ALL_ROLES) expect(isRoleAllowed(role, undefined)).toBe(true);
  });

  it('denies access with no role at all, even with no allow-list', () => {
    expect(isRoleAllowed(null, undefined)).toBe(false);
  });

  it('allows a role that is on the allow-list', () => {
    expect(isRoleAllowed('admin', ['admin'])).toBe(true);
  });

  it('denies a role that is not on the allow-list — the core cross-role access-control guarantee', () => {
    expect(isRoleAllowed('customer', ['admin'])).toBe(false);
    expect(isRoleAllowed('nurse', ['doctor', 'admin'])).toBe(false);
  });

  it('denies every other role from every single-role dashboard', () => {
    for (const owner of ALL_ROLES) {
      for (const other of ALL_ROLES) {
        if (other === owner) continue;
        expect(isRoleAllowed(other, [owner])).toBe(false);
      }
    }
  });
});
