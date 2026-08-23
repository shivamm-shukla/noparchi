/**
 * The single place snake_case database rows become camelCase domain objects.
 *
 * Keeping every mapping here means a column rename is a one-file change, and it
 * is where the embedded-relation ambiguity is resolved once: PostgREST returns
 * an embedded to-one relation as an object when it can detect the uniqueness
 * constraint and as an array when it cannot. The previous code handled it one
 * way in the Edge Function and the other way in the client service, so an empty
 * array - which is truthy in JavaScript - made every unscanned pass render as
 * "already used".
 */
import { normalizePermissions } from '../config/permissions';
import type { TicketType } from '../config/pricing';
import type {
  MerchantRow,
  MerchantUserRow,
  TicketTypeRow,
  TransactionRow,
  TicketValidationRow,
  PassExtensionRow,
} from '../types/db';
import type {
  Merchant,
  StaffMember,
  Transaction,
  TicketValidation,
  MerchantBranding,
} from '../types';

/** Normalises PostgREST's object-or-array embed into a single row or null. */
export function firstEmbedded<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null;
  return value;
}

/** What a merchant gets before anyone has named their exits. */
export const DEFAULT_EXIT_GATES = ['Main Exit'];

export function toMerchant(row: MerchantRow): Merchant {
  const branding = (row.settings?.branding ?? {}) as MerchantBranding;
  const rawGates = row.settings?.gates;
  const exitGates =
    Array.isArray(rawGates) && rawGates.length > 0
      ? rawGates.map(String).filter(Boolean)
      : DEFAULT_EXIT_GATES;
  return {
    id: row.id,
    businessName: row.business_name,
    location: row.location,
    upiId: row.upi_id,
    currency: row.currency,
    paymentProvider: row.payment_provider,
    messagingProvider: row.messaging_provider,
    branding,
    exitGates,
    createdAt: row.created_at,
  };
}

export function toStaffMember(row: MerchantUserRow): StaffMember {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    authUserId: row.auth_user_id,
    isOwner: row.is_owner,
    name: row.name,
    phone: row.phone,
    // Resolved against the registry here so no screen ever sees a partial set.
    permissions: normalizePermissions(row.permissions, row.is_owner),
    isActive: row.is_active,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
  };
}

export function toTicketType(row: TicketTypeRow): TicketType {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    code: row.code,
    label: row.label,
    icon: (row.icon as TicketType['icon']) ?? 'ticket',
    // NUMERIC arrives as a JSON number, but coerce defensively: a string here
    // would silently turn revenue sums into string concatenation.
    amount: Number(row.amount),
    validForMinutes: row.valid_for_minutes ?? null,
    extensionAmount: row.extension_amount === null ? null : Number(row.extension_amount),
    extensionMinutes: row.extension_minutes ?? null,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export function toValidation(
  row: TicketValidationRow,
  scannedByName?: string
): TicketValidation {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    scannedByUserId: row.scanned_by_user_id,
    scannedByName: scannedByName ?? row.scanned_by_name ?? undefined,
    exitGate: row.exit_gate,
    notes: row.notes,
    scannedAt: row.scanned_at,
  };
}

type TransactionRowWithEmbed = TransactionRow & {
  validation?: TicketValidationRow | TicketValidationRow[] | null;
  extensions?: PassExtensionRow[] | null;
};

export function toTransaction(row: TransactionRowWithEmbed): Transaction {
  const validationRow = firstEmbedded(row.validation);
  return {
    id: row.id,
    merchantId: row.merchant_id,
    ticketTypeCode: row.ticket_type_code,
    ticketTypeLabel: row.ticket_type_label,
    amount: Number(row.amount),
    vehicleNumber: row.vehicle_number,
    customerPhone: row.customer_phone,
    status: row.status,
    paymentProvider: row.payment_provider,
    paymentRef: row.payment_ref,
    paymentVerifiedAt: row.payment_verified_at,
    issuedByUserId: row.issued_by_user_id,
    ticketCode: row.ticket_code,
    activatedAt: row.activated_at ?? null,
    expiresAt: row.expires_at,
    extensionCount: row.extension_count ?? 0,
    overstayAmount: Number(row.overstay_amount ?? 0),
    overstayCollectedAt: row.overstay_collected_at ?? null,
    createdAt: row.created_at,
    validation: validationRow ? toValidation(validationRow) : null,
    pendingExtension: (() => {
      // Filtered here rather than in the query so the same embed can serve any
      // caller that later wants the full extension history.
      const pending = (row.extensions ?? []).find((e) => e.status === 'pending');
      return pending
        ? {
            id: pending.id,
            amount: Number(pending.amount),
            minutes: pending.minutes,
            extendsTo: pending.extends_to,
          }
        : null;
    })(),
  };
}
