/**
 * Merchant profile, ticket types and staff.
 *
 * Every read here relies on row level security for tenant scoping rather than
 * on a .eq('merchant_id', ...) filter. That is the point of the RLS work: the
 * database decides what this session may see, so a missing filter can no longer
 * turn into a cross-tenant leak. Explicit merchant_id filters remain only where
 * they narrow within the caller's own tenant.
 */
import { requireSupabase } from '../lib/supabase';
import { isPreview } from '../config/env';
import { previewMerchant, previewStaff, previewTicketTypes } from './previewData';
import { toMerchant, toStaffMember, toTicketType } from './mappers';
import type { MerchantRow, MerchantUserRow, TicketTypeRow } from '../types/db';
import type { Merchant, StaffMember, MerchantBranding } from '../types';
import type { TicketType, TicketTypeDraft } from '../config/pricing';
import type { PermissionSet } from '../config/permissions';

class MerchantService {
  async getMerchant(merchantId: string): Promise<Merchant> {
    if (isPreview) return previewMerchant;
    const client = requireSupabase();
    const { data, error } = await client
      .from('merchants')
      .select('*')
      .eq('id', merchantId)
      .single();
    if (error) throw error;
    return toMerchant(data as MerchantRow);
  }

  async updateMerchant(
    merchantId: string,
    patch: {
      businessName?: string;
      location?: string;
      operatingMode?: import('../types').OperatingMode;
      upiId?: string;
      paymentProvider?: string;
      messagingProvider?: string;
      branding?: MerchantBranding;
      printSettings?: Record<string, unknown>;
      exitGates?: string[];
    }
  ): Promise<Merchant> {
    // Preview writes go nowhere by design - the point is to look at the screens,
    // and a change that appeared to save but did not would be worse than one
    // that plainly does nothing.
    if (isPreview) return { ...previewMerchant, ...patch } as Merchant;
    const client = requireSupabase();

    const update: Record<string, unknown> = {};
    if (patch.businessName !== undefined) update.business_name = patch.businessName.trim();
    if (patch.location !== undefined) update.location = patch.location.trim();
    if (patch.operatingMode !== undefined) update.operating_mode = patch.operatingMode;
    if (patch.upiId !== undefined) update.upi_id = patch.upiId.trim();
    if (patch.paymentProvider !== undefined) update.payment_provider = patch.paymentProvider;
    if (patch.messagingProvider !== undefined) update.messaging_provider = patch.messagingProvider;

    const settingsPatch: Record<string, unknown> = {};
    if (patch.branding !== undefined) settingsPatch.branding = patch.branding;
    if (patch.printSettings !== undefined) settingsPatch.printSettings = patch.printSettings;
    if (patch.exitGates !== undefined) {
      settingsPatch.gates = patch.exitGates.map((gate) => gate.trim()).filter(Boolean);
    }

    if (Object.keys(settingsPatch).length > 0) {
      const { data: current, error: readError } = await client
        .from('merchants')
        .select('settings')
        .eq('id', merchantId)
        .single();
      if (readError) throw readError;
      update.settings = { ...((current?.settings ?? {}) as Record<string, unknown>), ...settingsPatch };
    }

    const { data, error } = await client
      .from('merchants')
      .update(update)
      .eq('id', merchantId)
      .select()
      .single();

    // The update policy requires can_edit_settings, so an unauthorised caller
    // matches no row rather than being told off. Say so plainly.
    if (error) throw error;
    if (!data) throw new Error('You do not have permission to change these settings.');
    return toMerchant(data as MerchantRow);
  }

  async uploadLogo(merchantId: string, uri: string, mimeType?: string): Promise<Merchant> {
    if (isPreview) {
      previewMerchant.branding = { ...previewMerchant.branding, logoUrl: uri };
      return previewMerchant;
    }
    const client = requireSupabase();
    const ext = mimeType?.split('/')[1]?.replace('svg+xml', 'svg') || 'jpg';
    const filePath = `${merchantId}/logo-${Date.now()}.${ext}`;

    const res = await fetch(uri);
    const blob = await res.blob();

    const { error: uploadError } = await client.storage
      .from('merchant-assets')
      .upload(filePath, blob, {
        contentType: mimeType || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = client.storage
      .from('merchant-assets')
      .getPublicUrl(filePath);

    return this.setBranding(merchantId, (current) => ({ ...current, logoUrl: publicUrl }));
  }

  async removeLogo(merchantId: string): Promise<Merchant> {
    if (isPreview) {
      previewMerchant.branding = { ...previewMerchant.branding, logoUrl: undefined };
      return previewMerchant;
    }
    return this.setBranding(merchantId, ({ logoUrl: _dropped, ...rest }) => rest);
  }

  /**
   * Change one part of branding without losing the rest.
   *
   * branding is a nested object inside the settings JSONB column, so a write
   * replaces it wholesale. Both callers here previously built the replacement
   * from scratch: uploadLogo spread `previewMerchant.branding` - the sample
   * data - over a real tenant's record, and removeLogo wrote a bare object.
   * Either way welcomeMessage was dropped on the floor. Read the live value and
   * derive the new one from it.
   */
  private async setBranding(
    merchantId: string,
    derive: (current: MerchantBranding) => MerchantBranding
  ): Promise<Merchant> {
    const current = await this.getMerchant(merchantId);
    return this.updateMerchant(merchantId, { branding: derive(current.branding ?? {}) });
  }

  // ---------------------------------------------------------------------------
  // Ticket types
  // ---------------------------------------------------------------------------

  async listTicketTypes(merchantId: string, includeInactive = false): Promise<TicketType[]> {
    if (isPreview) return previewTicketTypes;
    const client = requireSupabase();
    let query = client
      .from('ticket_types')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('sort_order', { ascending: true });
    if (!includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return (data as TicketTypeRow[]).map(toTicketType);
  }

  async createTicketType(merchantId: string, draft: TicketTypeDraft): Promise<TicketType> {
    if (isPreview) return { ...draft, id: 'preview', merchantId } as TicketType;
    const client = requireSupabase();
    const { data, error } = await client
      .from('ticket_types')
      .insert({
        merchant_id: merchantId,
        code: draft.code.toUpperCase(),
        label: draft.label.trim(),
        icon: draft.icon,
        amount: draft.amount,
        valid_for_minutes: draft.validForMinutes,
        extension_amount: draft.extensionAmount,
        extension_minutes: draft.extensionMinutes,
        sort_order: draft.sortOrder,
        is_active: draft.isActive,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') throw new Error(`A pass type with code ${draft.code} already exists.`);
      throw error;
    }
    return toTicketType(data as TicketTypeRow);
  }

  async updateTicketType(id: string, patch: Partial<TicketTypeDraft>): Promise<TicketType> {
    if (isPreview) return { ...previewTicketTypes[0], ...patch, id };
    const client = requireSupabase();
    const update: Record<string, unknown> = {};
    if (patch.label !== undefined) update.label = patch.label.trim();
    if (patch.icon !== undefined) update.icon = patch.icon;
    if (patch.amount !== undefined) update.amount = patch.amount;
    // Explicit undefined checks throughout: null is a meaningful value here
    // (no expiry, fall back to the base price), so `if (patch.x)` would quietly
    // refuse to ever clear one of these.
    if (patch.validForMinutes !== undefined) update.valid_for_minutes = patch.validForMinutes;
    if (patch.extensionAmount !== undefined) update.extension_amount = patch.extensionAmount;
    if (patch.extensionMinutes !== undefined) update.extension_minutes = patch.extensionMinutes;
    if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
    if (patch.isActive !== undefined) update.is_active = patch.isActive;

    const { data, error } = await client
      .from('ticket_types')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toTicketType(data as TicketTypeRow);
  }

  /**
   * Deactivates rather than deletes.
   *
   * Transactions reference the type by id, and a pass issued last month must
   * keep reporting under the type it was sold as. Retiring a type hides it from
   * checkout without rewriting history.
   */
  async retireTicketType(id: string): Promise<void> {
    if (isPreview) return;
    const client = requireSupabase();
    const { error } = await client.from('ticket_types').update({ is_active: false }).eq('id', id);
    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // Staff
  // ---------------------------------------------------------------------------

  async listStaff(merchantId: string): Promise<StaffMember[]> {
    if (isPreview) return previewStaff;
    const client = requireSupabase();
    const { data, error } = await client
      .from('merchant_users')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('is_owner', { ascending: false })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data as MerchantUserRow[]).map(toStaffMember);
  }

  /**
   * Writes the whole permission set, not a patch.
   *
   * The column is JSONB, and a partial write would drop the keys it omits. The
   * caller always holds a complete PermissionSet - normalizePermissions
   * guarantees that on the way in - so sending all of it is both correct and
   * simpler than a merge.
   */
  async setStaffPermissions(userId: string, permissions: PermissionSet): Promise<StaffMember> {
    if (isPreview) {
      return { ...(previewStaff.find((s) => s.id === userId) ?? previewStaff[1]), permissions };
    }
    const client = requireSupabase();
    const { data, error } = await client
      .from('merchant_users')
      .update({ permissions })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('You do not have permission to change staff access.');
    return toStaffMember(data as MerchantUserRow);
  }

  /**
   * Staff creation, PIN resets and removal all need the Auth admin API, so they
   * run in the staff-provision Edge Function where the service role key stays
   * server-side.
   */
  async createStaff(params: {
    name: string;
    phone: string;
    pin: string;
    permissions: PermissionSet;
  }): Promise<string> {
    return this.invokeProvision<{ userId: string }>({ action: 'create', ...params }).then(
      (r) => r.userId
    );
  }

  async resetStaffPin(userId: string, pin: string): Promise<void> {
    await this.invokeProvision({ action: 'reset_pin', userId, pin });
  }

  async deactivateStaff(userId: string): Promise<void> {
    await this.invokeProvision({ action: 'deactivate', userId });
  }

  private async invokeProvision<T = unknown>(body: Record<string, unknown>): Promise<T> {
    if (isPreview) return { userId: 'preview-new-staff' } as T;
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke('staff-provision', { body });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const parsed = await ctx.json();
          if (parsed?.message) throw new Error(parsed.message);
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message) throw parseErr;
        }
      }
      throw error;
    }
    return data as T;
  }
}

export const merchantService = new MerchantService();
