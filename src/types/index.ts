/**
 * Domain types used by screens and components.
 *
 * camelCase, deliberately decoupled from the snake_case database rows in
 * ./db.ts. Services own the mapping in one place so a column rename does not
 * ripple through the UI.
 */
import type { PermissionSet } from '../config/permissions';
import type { TicketType } from '../config/pricing';
import type { TransactionStatus } from './db';

export type { TransactionStatus, TicketType, PermissionSet };
export type { PermissionKey } from '../config/permissions';

export interface Merchant {
  id: string;
  businessName: string;
  location: string;
  upiId: string;
  currency: string;
  paymentProvider: string;
  messagingProvider: string;
  branding: MerchantBranding;
  createdAt: string;
}

export interface MerchantBranding {
  logoUrl?: string;
  welcomeMessage?: string;
}

/** A signed-in owner or gatekeeper. */
export interface StaffMember {
  id: string;
  merchantId: string;
  authUserId: string | null;
  isOwner: boolean;
  name: string;
  phone: string;
  /** Always fully resolved via normalizePermissions - never partial. */
  permissions: PermissionSet;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface Transaction {
  id: string;
  merchantId: string;
  ticketTypeCode: string;
  ticketTypeLabel: string;
  amount: number;
  vehicleNumber: string | null;
  customerPhone: string | null;
  status: TransactionStatus;
  paymentProvider: string;
  paymentRef: string | null;
  paymentVerifiedAt: string | null;
  issuedByUserId: string | null;
  ticketCode: string;
  activatedAt: string | null;
  expiresAt: string | null;
  extensionCount: number;
  overstayAmount: number;
  overstayCollectedAt: string | null;
  createdAt: string;
  /** Present only when the caller joined validations; null means not scanned. */
  validation: TicketValidation | null;
  /**
   * An extension the customer started but has not paid for yet. Staff confirm
   * it from the ledger, the same way they confirm the original payment.
   */
  pendingExtension: { id: string; amount: number; minutes: number; extendsTo: string } | null;
}

export interface TicketValidation {
  id: string;
  transactionId: string;
  scannedByUserId: string;
  scannedByName?: string;
  exitGate: string;
  notes: string | null;
  scannedAt: string;
}

/**
 * Result of a scan.
 *
 * UNPAID is distinct from INVALID on purpose: a gatekeeper needs to know the
 * difference between "this QR is fake" and "this is a real pass whose payment
 * never landed", because the second one usually means the customer is standing
 * right there and can be asked to pay.
 */
export type ScanStatus =
  | 'VERIFIED'
  | 'ALREADY_USED'
  | 'UNPAID'
  /**
   * A real, paid pass whose time ran out. Distinct from INVALID because the
   * customer is standing there with money owed, not trying to cheat - the
   * gatekeeper collects the overstay and clears them through.
   */
  | 'EXPIRED'
  | 'INVALID'
  | 'UNAUTHORIZED';

export interface ScanResult {
  success: boolean;
  status: ScanStatus;
  message: string;
  ticket?: Transaction | null;
  validation?: TicketValidation | null;
  scannedAt?: string | null;
  /** True when the scan was recorded on-device and has not reached the server. */
  queuedOffline?: boolean;
  /** Set on EXPIRED: what the gatekeeper should collect before opening the gate. */
  overstayDue?: number;
  expiresAt?: string | null;
}

export interface DashboardStats {
  canViewRevenue: boolean;
  revenue: number | null;
  previousRevenue: number | null;
  growthPercent: number | null;
  passesIssued: number | null;
  pendingPayments: number | null;
  extensionRevenue: number | null;
  overstayRevenue: number | null;
  scans: number;
  myScans: number;
  openPasses: number;
  /** Paid, unused passes expiring within the hour. */
  expiringSoon: number;
  from: string;
  to: string;
}

/** A pass about to run out, for the merchant's "expiring soon" list. */
export interface ExpiringPass {
  ticketCode: string;
  typeLabel: string;
  vehicleNumber: string | null;
  customerPhone: string | null;
  expiresAt: string;
  reminderSentAt: string | null;
  isExpired: boolean;
  overstayDue: number;
}

export type DateRangeKey = 'today' | 'yesterday' | 'week' | 'month' | 'all';

/** Public checkout view of a merchant - no staff, no ledger, no settings. */
export interface CheckoutMerchant {
  id: string;
  businessName: string;
  location: string;
  upiId: string;
  currency: string;
  paymentProvider: string;
  messagingProvider: string;
  branding: MerchantBranding;
}

export interface CheckoutTicketType {
  code: string;
  label: string;
  icon: string;
  amount: number;
  sortOrder: number;
  validForMinutes: number | null;
  extensionAmount: number | null;
  extensionMinutes: number | null;
}

export interface PendingExtension {
  extensionId: string;
  amount: number;
  minutes: number;
  extendsTo: string;
}

/** Public pass view shown on /ticket/[ticketCode]. */
export interface PublicTicket {
  ticketCode: string;
  status: TransactionStatus;
  amount: number;
  typeLabel: string;
  vehicleNumber: string | null;
  issuedAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  isUsed: boolean;
  usedAt: string | null;
  extensionCount: number;
  /** Owed right now if the pass has already run out. Zero otherwise. */
  overstayDue: number;
  canExtend: boolean;
  extensionAmount: number | null;
  extensionMinutes: number | null;
  pendingExtension: PendingExtension | null;
  merchant: {
    id: string;
    businessName: string;
    location: string;
    upiId: string;
    currency: string;
    paymentProvider: string;
  };
}
