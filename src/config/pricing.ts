/**
 * Ticket type and pricing configuration.
 *
 * Ticket types are DATA, not an enum. Each merchant owns rows in the
 * `ticket_types` table, so an owner can add "Cycle", "VIP Pass" or "Night Rate"
 * from the Settings screen without a migration or an app release. The constants
 * here are only the starter set seeded for a brand new merchant, plus the
 * helpers that resolve an amount at checkout.
 *
 * To change what a new merchant starts with, edit DEFAULT_TICKET_TYPES.
 * To change how money is displayed, edit CURRENCY / formatting in
 * src/utils/formatters.ts.
 */

/** Icon names are resolved to lucide components in src/config/icons.ts. */
export type TicketTypeIcon = 'bike' | 'car' | 'truck' | 'ticket' | 'bus' | 'person';

export interface TicketType {
  id: string;
  merchantId: string;
  /** Stable machine key, unique per merchant. Stored on the transaction. */
  code: string;
  label: string;
  icon: TicketTypeIcon;
  /** Price in whole rupees. */
  amount: number;
  sortOrder: number;
  isActive: boolean;
}

/** Shape used when seeding or creating a type; server assigns id/merchantId. */
export type TicketTypeDraft = Omit<TicketType, 'id' | 'merchantId'>;

export const CURRENCY = 'INR';

/**
 * Seeded for every new merchant. These mirror the four types the app shipped
 * with, so existing behaviour is preserved - but they are now editable rows
 * rather than a hardcoded Postgres enum.
 */
export const DEFAULT_TICKET_TYPES: TicketTypeDraft[] = [
  { code: 'TWO_WHEELER', label: '2-Wheeler / Bike', icon: 'bike', amount: 20, sortOrder: 1, isActive: true },
  { code: 'FOUR_WHEELER', label: '4-Wheeler / Car', icon: 'car', amount: 50, sortOrder: 2, isActive: true },
  { code: 'HEAVY_VEHICLE', label: 'Bus / Commercial', icon: 'truck', amount: 100, sortOrder: 3, isActive: true },
  { code: 'GENERAL_ENTRY', label: 'General Entry Pass', icon: 'ticket', amount: 40, sortOrder: 4, isActive: true },
];

/** Fallback used only when a merchant somehow has no active types at all. */
export const FALLBACK_TICKET_TYPE: TicketTypeDraft = {
  code: 'GENERAL_ENTRY',
  label: 'Entry Pass',
  icon: 'ticket',
  amount: 0,
  sortOrder: 0,
  isActive: true,
};

export function activeTicketTypes(types: TicketType[]): TicketType[] {
  return types.filter((t) => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function findTicketType(types: TicketType[], code: string): TicketType | undefined {
  return types.find((t) => t.code === code);
}

/**
 * Resolve the amount to charge for a ticket type code.
 *
 * Returns null rather than a guessed number when the code is unknown: silently
 * falling back to a hardcoded rate is how the previous implementation ended up
 * charging the wrong merchant's prices. Callers must handle null explicitly.
 */
export function resolveAmount(types: TicketType[], code: string): number | null {
  const type = findTicketType(types, code);
  return type && type.isActive ? type.amount : null;
}

/** Validation shared by the Settings editor and the server-side RPC. */
export function validateTicketTypeDraft(draft: Partial<TicketTypeDraft>): string | null {
  if (!draft.code || !/^[A-Z0-9_]{2,32}$/.test(draft.code)) {
    return 'Code must be 2-32 characters: A-Z, 0-9 and underscore only.';
  }
  if (!draft.label || draft.label.trim().length < 2) {
    return 'Label is required.';
  }
  if (draft.amount === undefined || draft.amount < 0 || !Number.isFinite(draft.amount)) {
    return 'Amount must be zero or more.';
  }
  return null;
}
