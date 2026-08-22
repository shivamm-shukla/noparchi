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

  /**
   * How long the pass stays valid once paid, in minutes.
   *
   * null means it never expires - correct for a mela day pass or a stall token,
   * where timing the customer would be noise. Parking types should set it.
   */
  validForMinutes: number | null;
  /** Price of one extension. null falls back to `amount`. */
  extensionAmount: number | null;
  /** Length of one extension. null falls back to `validForMinutes`. */
  extensionMinutes: number | null;

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
  // Vehicle passes are timed, with a cheaper extension than the first window -
  // the first stretch covers the cost of the space, later ones are pure margin
  // and should be easy to say yes to. The general entry pass is untimed, since
  // a mela ticket has no meaningful checkout time.
  {
    code: 'TWO_WHEELER', label: '2-Wheeler / Bike', icon: 'bike', amount: 20,
    validForMinutes: 12 * 60, extensionAmount: 10, extensionMinutes: 6 * 60,
    sortOrder: 1, isActive: true,
  },
  {
    code: 'FOUR_WHEELER', label: '4-Wheeler / Car', icon: 'car', amount: 50,
    validForMinutes: 6 * 60, extensionAmount: 30, extensionMinutes: 3 * 60,
    sortOrder: 2, isActive: true,
  },
  {
    code: 'HEAVY_VEHICLE', label: 'Bus / Commercial', icon: 'truck', amount: 100,
    validForMinutes: 6 * 60, extensionAmount: 60, extensionMinutes: 3 * 60,
    sortOrder: 3, isActive: true,
  },
  {
    code: 'GENERAL_ENTRY', label: 'General Entry Pass', icon: 'ticket', amount: 40,
    validForMinutes: null, extensionAmount: null, extensionMinutes: null,
    sortOrder: 4, isActive: true,
  },
];

/** Fallback used only when a merchant somehow has no active types at all. */
export const FALLBACK_TICKET_TYPE: TicketTypeDraft = {
  code: 'GENERAL_ENTRY',
  label: 'Entry Pass',
  icon: 'ticket',
  amount: 0,
  validForMinutes: null,
  extensionAmount: null,
  extensionMinutes: null,
  sortOrder: 0,
  isActive: true,
};

/**
 * Common validity windows offered in Settings.
 *
 * A short list of real choices beats a free-text minutes box: nobody running a
 * parking lot wants to type 360, and a typo there silently expires every pass
 * six minutes after it is sold.
 */
export const VALIDITY_PRESETS: { label: string; minutes: number | null }[] = [
  { label: 'No expiry', minutes: null },
  { label: '1 hour', minutes: 60 },
  { label: '3 hours', minutes: 180 },
  { label: '6 hours', minutes: 360 },
  { label: '12 hours', minutes: 720 },
  { label: '24 hours', minutes: 1440 },
];

/** Human-readable duration: 90 -> "1 hr 30 min". */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'No expiry';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} hr ${rest} min` : `${hours} hr`;

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days} day${days > 1 ? 's' : ''}`;
}

/** What one extension of this type costs and buys, with the fallbacks applied. */
export function extensionTerms(
  type: Pick<TicketType, 'amount' | 'validForMinutes' | 'extensionAmount' | 'extensionMinutes'>
): { amount: number; minutes: number } | null {
  if (type.validForMinutes === null) return null;
  return {
    amount: type.extensionAmount ?? type.amount,
    minutes: type.extensionMinutes ?? type.validForMinutes,
  };
}

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
  if (draft.validForMinutes !== null && draft.validForMinutes !== undefined) {
    if (!Number.isFinite(draft.validForMinutes) || draft.validForMinutes <= 0) {
      return 'Validity must be more than zero minutes, or set to no expiry.';
    }
  }
  if (draft.extensionAmount !== null && draft.extensionAmount !== undefined) {
    if (!Number.isFinite(draft.extensionAmount) || draft.extensionAmount < 0) {
      return 'Extension price must be zero or more.';
    }
  }
  // An extension longer than the original window is not wrong, but an extension
  // on a pass that never expires is meaningless and would confuse the UI.
  if (
    (draft.extensionAmount !== null && draft.extensionAmount !== undefined) &&
    (draft.validForMinutes === null || draft.validForMinutes === undefined)
  ) {
    return 'A pass with no expiry cannot be extended - clear the extension price.';
  }
  return null;
}
