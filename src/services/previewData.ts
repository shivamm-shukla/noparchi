/**
 * Sample data for preview mode.
 *
 * Turned on ONLY by EXPO_PUBLIC_PREVIEW=1, never by a failed network call. That
 * distinction is the whole point: the inherited codebase fell back to mock data
 * whenever a request errored, so a completely unconfigured app looked like a
 * working one and nobody noticed nothing ever reached a database. Preview mode
 * is something you switch on deliberately, and the app says so on screen the
 * entire time it is on.
 *
 * It exists to look at layout, copy and theming before committing to a backend.
 * Nothing here is written anywhere, and every action is a no-op.
 */
import type {
  DashboardStats,
  ExpiringPass,
  Merchant,
  PublicTicket,
  StaffMember,
  Transaction,
} from '../types';
import type { TicketType } from '../config/pricing';
import { defaultStaffPermissions, ownerPermissions } from '../config/permissions';
import type { CheckoutInfo } from './checkoutService';

const MERCHANT_ID = 'preview-merchant';
const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const minutesAhead = (m: number) => new Date(Date.now() + m * 60000).toISOString();

export const previewMerchant: Merchant = {
  id: MERCHANT_ID,
  businessName: 'Metro Hub Parking',
  location: 'Connaught Place, New Delhi',
  upiId: 'metrohub@icici',
  currency: 'INR',
  paymentProvider: 'upi_intent',
  messagingProvider: 'wa_deeplink',
  branding: {},
  createdAt: minutesAgo(60 * 24 * 30),
};

export const previewOwner: StaffMember = {
  id: 'preview-owner',
  merchantId: MERCHANT_ID,
  authUserId: 'preview-auth',
  isOwner: true,
  name: 'Rajesh Sharma',
  phone: '98765 43210',
  permissions: ownerPermissions(),
  isActive: true,
  lastSeenAt: minutesAgo(2),
  createdAt: minutesAgo(60 * 24 * 30),
};

export const previewStaff: StaffMember[] = [
  previewOwner,
  {
    id: 'preview-staff-1',
    merchantId: MERCHANT_ID,
    authUserId: 'preview-auth-2',
    isOwner: false,
    name: 'Amit Kumar',
    phone: '98111 22233',
    permissions: defaultStaffPermissions(),
    isActive: true,
    lastSeenAt: minutesAgo(11),
    createdAt: minutesAgo(60 * 24 * 12),
  },
  {
    id: 'preview-staff-2',
    merchantId: MERCHANT_ID,
    authUserId: 'preview-auth-3',
    isOwner: false,
    name: 'Sunita Devi',
    phone: '99887 76655',
    permissions: { ...defaultStaffPermissions(), can_view_ledger: true, can_issue_passes: true },
    isActive: true,
    lastSeenAt: minutesAgo(140),
    createdAt: minutesAgo(60 * 24 * 4),
  },
];

export const previewTicketTypes: TicketType[] = [
  {
    id: 'tt-1', merchantId: MERCHANT_ID, code: 'TWO_WHEELER', label: '2-Wheeler / Bike',
    icon: 'bike', amount: 20, validForMinutes: 720, extensionAmount: 10,
    extensionMinutes: 360, sortOrder: 1, isActive: true,
  },
  {
    id: 'tt-2', merchantId: MERCHANT_ID, code: 'FOUR_WHEELER', label: '4-Wheeler / Car',
    icon: 'car', amount: 50, validForMinutes: 360, extensionAmount: 30,
    extensionMinutes: 180, sortOrder: 2, isActive: true,
  },
  {
    id: 'tt-3', merchantId: MERCHANT_ID, code: 'HEAVY_VEHICLE', label: 'Bus / Commercial',
    icon: 'truck', amount: 100, validForMinutes: 360, extensionAmount: 60,
    extensionMinutes: 180, sortOrder: 3, isActive: true,
  },
  {
    id: 'tt-4', merchantId: MERCHANT_ID, code: 'GENERAL_ENTRY', label: 'General Entry Pass',
    icon: 'ticket', amount: 40, validForMinutes: null, extensionAmount: null,
    extensionMinutes: null, sortOrder: 4, isActive: true,
  },
];

function pass(overrides: Partial<Transaction> & { id: string; ticketCode: string }): Transaction {
  return {
    merchantId: MERCHANT_ID,
    ticketTypeCode: 'FOUR_WHEELER',
    ticketTypeLabel: '4-Wheeler / Car',
    amount: 50,
    vehicleNumber: null,
    customerPhone: null,
    status: 'paid',
    paymentProvider: 'upi_intent',
    paymentRef: null,
    paymentVerifiedAt: minutesAgo(60),
    issuedByUserId: null,
    activatedAt: minutesAgo(60),
    expiresAt: minutesAhead(300),
    extensionCount: 0,
    overstayAmount: 0,
    overstayCollectedAt: null,
    createdAt: minutesAgo(60),
    validation: null,
    pendingExtension: null,
    ...overrides,
  };
}

/** Deliberately covers every state the ledger and dashboard can render. */
export const previewTransactions: Transaction[] = [
  pass({
    id: 'tx-1', ticketCode: 'NP-K4RT-8WQZ', vehicleNumber: 'DL 01 AB 1234',
    customerPhone: '99887 76655', createdAt: minutesAgo(22), activatedAt: minutesAgo(22),
    expiresAt: minutesAhead(338),
  }),
  pass({
    id: 'tx-2', ticketCode: 'NP-M7YB-2XKD', ticketTypeCode: 'TWO_WHEELER',
    ticketTypeLabel: '2-Wheeler / Bike', amount: 20, vehicleNumber: 'DL 04 CD 5678',
    createdAt: minutesAgo(48), activatedAt: minutesAgo(48), expiresAt: minutesAhead(24),
    customerPhone: '98120 33445',
  }),
  pass({
    id: 'tx-3', ticketCode: 'NP-Q9WE-5HJN', vehicleNumber: 'HR 26 EF 9012',
    createdAt: minutesAgo(400), activatedAt: minutesAgo(400), expiresAt: minutesAgo(40),
    extensionCount: 1, customerPhone: '98450 11223',
  }),
  pass({
    id: 'tx-4', ticketCode: 'NP-B3ZC-7PLM', vehicleNumber: 'UP 16 GH 3456',
    createdAt: minutesAgo(180), activatedAt: minutesAgo(180), expiresAt: minutesAgo(15),
    validation: {
      id: 'val-1', transactionId: 'tx-4', scannedByUserId: 'preview-staff-1',
      scannedByName: 'Amit Kumar', exitGate: 'Main Exit', notes: null,
      scannedAt: minutesAgo(12),
    },
    overstayAmount: 30, overstayCollectedAt: minutesAgo(12),
  }),
  pass({
    id: 'tx-5', ticketCode: 'NP-T6NX-4RVB', ticketTypeCode: 'GENERAL_ENTRY',
    ticketTypeLabel: 'General Entry Pass', amount: 40, status: 'pending',
    paymentVerifiedAt: null, activatedAt: null, expiresAt: null,
    createdAt: minutesAgo(3), customerPhone: '90045 67890',
  }),
  pass({
    id: 'tx-6', ticketCode: 'NP-F2HK-9DSW', vehicleNumber: 'DL 08 IJ 7890',
    createdAt: minutesAgo(95), activatedAt: minutesAgo(95), expiresAt: minutesAhead(45),
    customerPhone: '97654 32100',
    pendingExtension: {
      id: 'ext-1', amount: 30, minutes: 180, extendsTo: minutesAhead(225),
    },
  }),
];

export const previewStats: DashboardStats = {
  canViewRevenue: true,
  revenue: 2480,
  extensionRevenue: 180,
  overstayRevenue: 90,
  previousRevenue: 2110,
  growthPercent: 18,
  passesIssued: 47,
  pendingPayments: 1,
  scans: 31,
  myScans: 9,
  openPasses: 16,
  expiringSoon: 3,
  from: minutesAgo(60 * 12),
  to: new Date().toISOString(),
};

export const previewExpiring: ExpiringPass[] = [
  {
    ticketCode: 'NP-M7YB-2XKD', typeLabel: '2-Wheeler / Bike', vehicleNumber: 'DL 04 CD 5678',
    customerPhone: '98120 33445', expiresAt: minutesAhead(24), reminderSentAt: minutesAgo(6),
    isExpired: false, overstayDue: 0,
  },
  {
    ticketCode: 'NP-F2HK-9DSW', typeLabel: '4-Wheeler / Car', vehicleNumber: 'DL 08 IJ 7890',
    customerPhone: '97654 32100', expiresAt: minutesAhead(45), reminderSentAt: null,
    isExpired: false, overstayDue: 0,
  },
  {
    ticketCode: 'NP-Q9WE-5HJN', typeLabel: '4-Wheeler / Car', vehicleNumber: 'HR 26 EF 9012',
    customerPhone: '98450 11223', expiresAt: minutesAgo(40), reminderSentAt: minutesAgo(70),
    isExpired: true, overstayDue: 30,
  },
];

export const previewCheckout: CheckoutInfo = {
  merchant: {
    id: MERCHANT_ID,
    businessName: previewMerchant.businessName,
    location: previewMerchant.location,
    upiId: previewMerchant.upiId,
    currency: 'INR',
    paymentProvider: 'upi_intent',
    messagingProvider: 'wa_deeplink',
    branding: {},
  },
  ticketTypes: previewTicketTypes.map((t) => ({
    code: t.code,
    label: t.label,
    icon: t.icon,
    amount: t.amount,
    sortOrder: t.sortOrder,
    validForMinutes: t.validForMinutes,
    extensionAmount: t.extensionAmount,
    extensionMinutes: t.extensionMinutes,
  })),
};

/** Shapes the sample pass page around whatever code was typed into the URL. */
export function previewTicket(ticketCode: string): PublicTicket {
  const code = ticketCode.toUpperCase();
  const match = previewTransactions.find((t) => t.ticketCode === code);
  const source = match ?? previewTransactions[0];

  return {
    ticketCode: code,
    status: source.status,
    amount: source.amount,
    typeLabel: source.ticketTypeLabel,
    vehicleNumber: source.vehicleNumber,
    issuedAt: source.createdAt,
    activatedAt: source.activatedAt,
    expiresAt: source.expiresAt,
    isUsed: Boolean(source.validation),
    usedAt: source.validation?.scannedAt ?? null,
    extensionCount: source.extensionCount,
    overstayDue:
      source.expiresAt && new Date(source.expiresAt).getTime() < Date.now() ? 30 : 0,
    canExtend: source.status === 'paid' && !source.validation && Boolean(source.expiresAt),
    extensionAmount: 30,
    extensionMinutes: 180,
    pendingExtension: source.pendingExtension
      ? {
          extensionId: source.pendingExtension.id,
          amount: source.pendingExtension.amount,
          minutes: source.pendingExtension.minutes,
          extendsTo: source.pendingExtension.extendsTo,
        }
      : null,
    merchant: {
      id: MERCHANT_ID,
      businessName: previewMerchant.businessName,
      location: previewMerchant.location,
      upiId: previewMerchant.upiId,
      currency: 'INR',
      paymentProvider: 'upi_intent',
    },
  };
}
