/**
 * The dynamic RBAC registry.
 *
 * Permissions are stored in the database as a single JSONB column
 * (`users.permissions`), NOT as one boolean column per permission. That choice
 * is deliberate: adding a new toggle must never require a migration. To add a
 * permission, add one entry to PERMISSION_REGISTRY below - the Settings UI, the
 * defaults applied to new staff, the TypeScript types, and the server-side
 * normaliser all derive from this object automatically.
 *
 * Server-side enforcement lives in the SQL policies and RPCs (see
 * supabase/migrations). This file is the shared vocabulary both sides use; it
 * is NOT itself a security boundary.
 *
 * The English label and description on each entry are the fallback wording, not
 * the wording the app shows. Screens read permissionLabel()/permissionDescription()
 * below, which prefer the translation and fall back to what is written here - so
 * a permission added to the registry appears immediately in English and is
 * translated afterwards, rather than blocking on a locale edit.
 */
import i18n from '../i18n';

export const PERMISSION_REGISTRY = {
  can_verify_tickets: {
    label: 'Verify exit passes',
    description: 'Scan customer QR passes at the gate and clear vehicles for exit.',
    /** Granted to a newly created staff member unless the owner says otherwise. */
    staffDefault: true,
  },
  can_view_ledger: {
    label: 'View ledger & revenue',
    description: 'See transaction history, daily revenue totals and payment references.',
    staffDefault: false,
  },
  can_issue_passes: {
    label: 'Issue passes manually',
    description: 'Create an entry pass from the merchant app for walk-in cash customers.',
    staffDefault: false,
  },
  can_edit_settings: {
    label: 'Edit business settings',
    description: 'Change business profile, UPI ID, pricing and ticket types.',
    staffDefault: false,
  },
  can_manage_staff: {
    label: 'Manage staff',
    description: 'Add or remove gatekeepers and change what they are allowed to do.',
    staffDefault: false,
  },
  can_issue_refund: {
    label: 'Issue refunds',
    description: 'Reverse a completed transaction and mark it refunded.',
    staffDefault: false,
  },
} as const;

export type PermissionKey = keyof typeof PERMISSION_REGISTRY;

/** A complete, resolved permission set. Every key is always present. */
export type PermissionSet = Record<PermissionKey, boolean>;

export const PERMISSION_KEYS = Object.keys(PERMISSION_REGISTRY) as PermissionKey[];

/** Defaults applied to a brand new gatekeeper: scanner access only. */
export function defaultStaffPermissions(): PermissionSet {
  return PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = PERMISSION_REGISTRY[key].staffDefault;
    return acc;
  }, {} as PermissionSet);
}

/** The owner is root and implicitly holds every permission, present and future. */
export function ownerPermissions(): PermissionSet {
  return PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {} as PermissionSet);
}

/**
 * Turn whatever came back from the database into a complete PermissionSet.
 *
 * Why this exists: the JSONB column may be missing keys that were added to the
 * registry after the row was written. Rather than migrate every row on every
 * registry change, unknown-to-the-row keys resolve to their staff default here.
 * Owners always resolve to all-true so a new permission is never accidentally
 * locked away from the account that is supposed to grant it.
 */
export function normalizePermissions(raw: unknown, isOwner: boolean): PermissionSet {
  if (isOwner) return ownerPermissions();

  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return PERMISSION_KEYS.reduce((acc, key) => {
    const value = source[key];
    acc[key] = typeof value === 'boolean' ? value : PERMISSION_REGISTRY[key].staffDefault;
    return acc;
  }, {} as PermissionSet);
}

/**
 * The wording a person sees for a permission, in the language they are reading.
 *
 * The Settings toggles and the access-denied screen previously rendered the
 * registry's English strings directly, so switching the app to Hindi left the
 * one screen that decides what a gatekeeper may do sitting in English.
 */
export function permissionLabel(key: PermissionKey): string {
  return i18n.t(`permissions.${key}.label`, {
    defaultValue: PERMISSION_REGISTRY[key].label,
  });
}

export function permissionDescription(key: PermissionKey): string {
  return i18n.t(`permissions.${key}.description`, {
    defaultValue: PERMISSION_REGISTRY[key].description,
  });
}

/** Client-side convenience check. Never the only check - the server re-verifies. */
export function hasPermission(
  permissions: PermissionSet | null | undefined,
  key: PermissionKey,
  isOwner = false
): boolean {
  if (isOwner) return true;
  return permissions?.[key] === true;
}
