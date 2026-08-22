/**
 * The app-less customer flow.
 *
 * Every call here goes through a SECURITY DEFINER RPC that anon may execute,
 * rather than through a table. That is what lets a stranger at the gate load a
 * checkout page without opening any merchant's ledger to the internet.
 */
import { requireSupabase } from '../lib/supabase';
import { isPreview } from '../config/env';
import { previewCheckout, previewTicket } from './previewData';
import type { CheckoutMerchant, CheckoutTicketType, PublicTicket } from '../types';

export interface CheckoutInfo {
  merchant: CheckoutMerchant;
  ticketTypes: CheckoutTicketType[];
}

class CheckoutService {
  /**
   * Load the merchant named in the URL.
   *
   * This is what makes /pay/[merchantId] genuinely multi-tenant. The previous
   * screen destructured merchantId from the route and then never used it,
   * rendering the app's single hardcoded merchant instead - so every business's
   * gate QR led to the same shop at the same prices, paying the same UPI ID.
   */
  async loadCheckout(merchantId: string): Promise<CheckoutInfo> {
    if (isPreview) return previewCheckout;
    const client = requireSupabase();
    const { data, error } = await client.rpc('public_checkout_info', {
      p_merchant_id: merchantId,
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message ?? 'This gate QR is not active.');

    return {
      merchant: data.merchant as CheckoutMerchant,
      ticketTypes: ((data.ticketTypes ?? []) as Array<Record<string, unknown>>).map((t) => ({
        code: String(t.code),
        label: String(t.label),
        icon: String(t.icon ?? 'ticket'),
        amount: Number(t.amount),
        sortOrder: Number(t.sort_order ?? 0),
        validForMinutes: t.valid_for_minutes === null || t.valid_for_minutes === undefined
          ? null
          : Number(t.valid_for_minutes),
        extensionAmount: t.extension_amount === null || t.extension_amount === undefined
          ? null
          : Number(t.extension_amount),
        extensionMinutes: t.extension_minutes === null || t.extension_minutes === undefined
          ? null
          : Number(t.extension_minutes),
      })),
    };
  }

  /**
   * Create the pass as pending.
   *
   * The amount is read from the merchant's own ticket type row inside the
   * database, never taken from this request, so a customer cannot price their
   * own ticket. The pass stays unusable until a verified payment promotes it.
   */
  async startCheckout(params: {
    merchantId: string;
    ticketTypeCode: string;
    vehicleNumber?: string;
    customerPhone?: string;
  }): Promise<{ ticketCode: string; amount: number; ticketTypeLabel: string }> {
    if (isPreview) {
      const type = previewCheckout.ticketTypes.find((t) => t.code === params.ticketTypeCode);
      return {
        ticketCode: 'NP-PREV-1234',
        amount: type?.amount ?? 0,
        ticketTypeLabel: type?.label ?? 'Preview pass',
      };
    }
    const client = requireSupabase();
    const { data, error } = await client.rpc('public_start_checkout', {
      p_merchant_id: params.merchantId,
      p_ticket_type_code: params.ticketTypeCode,
      p_vehicle_number: params.vehicleNumber ?? null,
      p_customer_phone: params.customerPhone ?? null,
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message ?? 'Could not start the checkout.');

    return {
      ticketCode: data.ticketCode as string,
      amount: Number(data.amount),
      ticketTypeLabel: String(data.ticketTypeLabel),
    };
  }

  /** The customer's own pass page. Works with no session on any device. */
  async loadTicket(ticketCode: string): Promise<PublicTicket> {
    if (isPreview) return previewTicket(ticketCode);
    const client = requireSupabase();
    const { data, error } = await client.rpc('public_ticket_status', {
      p_ticket_code: ticketCode,
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message ?? 'Pass not found.');

    const t = data.ticket as Record<string, unknown>;
    const pending = t.pendingExtension as Record<string, unknown> | null;

    return {
      ticketCode: String(t.ticketCode),
      status: t.status as PublicTicket['status'],
      amount: Number(t.amount),
      typeLabel: String(t.typeLabel),
      vehicleNumber: (t.vehicleNumber as string | null) ?? null,
      issuedAt: String(t.issuedAt),
      activatedAt: (t.activatedAt as string | null) ?? null,
      expiresAt: (t.expiresAt as string | null) ?? null,
      isUsed: Boolean(t.isUsed),
      usedAt: (t.usedAt as string | null) ?? null,
      extensionCount: Number(t.extensionCount ?? 0),
      overstayDue: Number(t.overstayDue ?? 0),
      canExtend: Boolean(t.canExtend),
      extensionAmount: t.extensionAmount === null || t.extensionAmount === undefined
        ? null
        : Number(t.extensionAmount),
      extensionMinutes: t.extensionMinutes === null || t.extensionMinutes === undefined
        ? null
        : Number(t.extensionMinutes),
      pendingExtension: pending
        ? {
            extensionId: String(pending.extensionId),
            amount: Number(pending.amount),
            minutes: Number(pending.minutes),
            extendsTo: String(pending.extendsTo),
          }
        : null,
      merchant: data.merchant as PublicTicket['merchant'],
    };
  }

  /**
   * The customer taps Extend, usually straight from the WhatsApp reminder.
   *
   * Creates a PENDING extension and nothing more. The extra time only lands
   * once the money is confirmed, so tapping this cannot by itself buy time -
   * the same rule that governs the original checkout.
   */
  async startExtension(ticketCode: string): Promise<{
    extensionId: string;
    amount: number;
    minutes: number;
    extendsTo: string;
    merchant: { businessName: string; upiId: string; currency: string; paymentProvider: string };
  }> {
    if (isPreview) {
      return {
        extensionId: 'preview-extension',
        amount: 30,
        minutes: 180,
        extendsTo: new Date(Date.now() + 180 * 60000).toISOString(),
        merchant: previewCheckout.merchant,
      };
    }
    const client = requireSupabase();
    const { data, error } = await client.rpc('public_start_extension', {
      p_ticket_code: ticketCode,
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message ?? 'Could not start the extension.');

    return {
      extensionId: String(data.extensionId),
      amount: Number(data.amount),
      minutes: Number(data.minutes),
      extendsTo: String(data.extendsTo),
      merchant: data.merchant,
    };
  }
}

export const checkoutService = new CheckoutService();
