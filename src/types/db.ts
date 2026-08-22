/**
 * Database row shapes, snake_case, mirroring supabase/migrations exactly.
 *
 * These are hand-written for now. Once a Supabase project exists, regenerate
 * them with `npm run db:types` so drift between the schema and these types
 * becomes impossible - having a second hand-maintained description of the
 * database is what let the old Prisma schema disagree with the real one.
 *
 * App code should prefer the camelCase domain types in ./index.ts; services own
 * the mapping between the two.
 */

export type TransactionStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'expired';

export interface MerchantRow {
  id: string;
  business_name: string;
  location: string;
  upi_id: string;
  currency: string;
  payment_provider: string;
  messaging_provider: string;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MerchantUserRow {
  id: string;
  merchant_id: string;
  auth_user_id: string | null;
  is_owner: boolean;
  name: string;
  phone: string;
  permissions: Record<string, boolean>;
  is_active: boolean;
  last_seen_at: string | null;
  /** Brute-force counters, maintained server-side. Not shown in the UI. */
  failed_pin_attempts?: number;
  pin_locked_until?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketTypeRow {
  id: string;
  merchant_id: string;
  code: string;
  label: string;
  icon: string;
  amount: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransactionRow {
  id: string;
  merchant_id: string;
  ticket_type_id: string | null;
  ticket_type_code: string;
  ticket_type_label: string;
  amount: number;
  vehicle_number: string | null;
  customer_phone: string | null;
  status: TransactionStatus;
  payment_provider: string;
  payment_ref: string | null;
  payment_verified_at: string | null;
  payment_verified_by: string | null;
  issued_by_user_id: string | null;
  ticket_code: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketValidationRow {
  id: string;
  transaction_id: string;
  merchant_id: string;
  scanned_by_user_id: string;
  exit_gate: string;
  notes: string | null;
  scanned_at: string;
}
