/**
 * Create, update or deactivate a gatekeeper account.
 *
 * This needs the Auth admin API to create the staff member's login, which
 * requires the service role key - and that key must never reach a browser. So
 * staff creation lives here rather than in the client, and merchant_users has
 * no INSERT policy at all.
 *
 * The caller's own JWT is forwarded and checked against can_manage_staff before
 * anything happens: holding the service role key server-side does not mean the
 * caller is allowed to use it.
 *
 * Deploy:  supabase functions deploy staff-provision
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { derivePassword, isValidPin, staffEmail } from '../_shared/staff-credentials.ts';

type Action = 'create' | 'reset_pin' | 'deactivate';

interface ProvisionRequest {
  action: Action;
  name?: string;
  phone?: string;
  pin?: string;
  permissions?: Record<string, boolean>;
  /** merchant_users.id, for reset_pin and deactivate. */
  userId?: string;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ message: 'Not signed in.' }, 401);

    // A client bound to the CALLER's JWT. Every permission check runs through
    // this one, so the database applies the caller's own rights.
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: allowed, error: permError } = await caller.rpc('app_has_permission', {
      p_key: 'can_manage_staff',
    });
    if (permError) throw permError;
    if (allowed !== true) {
      return json({ message: 'You do not have permission to manage staff.' }, 403);
    }

    const { data: merchantId, error: merchantError } = await caller.rpc(
      'app_current_merchant_id'
    );
    if (merchantError) throw merchantError;
    if (!merchantId) return json({ message: 'No business found for this account.' }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const body: ProvisionRequest = await req.json();

    // -------------------------------------------------------------------------
    if (body.action === 'create') {
      const name = (body.name ?? '').trim();
      const phone = (body.phone ?? '').trim();
      const pin = (body.pin ?? '').trim();

      if (!name) return json({ message: 'Staff name is required.' }, 400);
      if (!phone) return json({ message: 'Phone number is required.' }, 400);
      if (!isValidPin(pin)) return json({ message: 'PIN must be 4 to 8 digits.' }, 400);

      // The row is created first because the derived password is bound to its
      // id, which makes the same PIN produce a different password for every
      // staff member - two gatekeepers picking "1234" do not share a secret.
      const { data: created, error: insertError } = await admin
        .from('merchant_users')
        .insert({
          merchant_id: merchantId,
          is_owner: false,
          name,
          phone,
          permissions: body.permissions ?? {},
        })
        .select('id')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          return json({ message: 'Someone with that phone number already works here.' }, 409);
        }
        throw insertError;
      }

      const { data: authUser, error: authError } = await admin.auth.admin.createUser({
        email: staffEmail(created.id),
        password: await derivePassword(created.id, pin),
        email_confirm: true,
        user_metadata: { merchant_id: merchantId, merchant_user_id: created.id, role: 'staff' },
      });

      if (authError || !authUser.user) {
        // Never leave a staff row that can never be signed into.
        await admin.from('merchant_users').delete().eq('id', created.id);
        throw authError ?? new Error('Could not create the staff login.');
      }

      const { error: linkError } = await admin
        .from('merchant_users')
        .update({ auth_user_id: authUser.user.id })
        .eq('id', created.id);

      if (linkError) {
        await admin.auth.admin.deleteUser(authUser.user.id);
        await admin.from('merchant_users').delete().eq('id', created.id);
        throw linkError;
      }

      return json({ success: true, userId: created.id });
    }

    // -------------------------------------------------------------------------
    if (body.action === 'reset_pin') {
      const pin = (body.pin ?? '').trim();
      if (!body.userId) return json({ message: 'Which staff member?' }, 400);
      if (!isValidPin(pin)) return json({ message: 'PIN must be 4 to 8 digits.' }, 400);

      // Scoped to the caller's own merchant so a manager cannot reset the PIN
      // of someone at another business by guessing an id.
      const { data: target, error: targetError } = await admin
        .from('merchant_users')
        .select('id, auth_user_id, is_owner')
        .eq('id', body.userId)
        .eq('merchant_id', merchantId)
        .single();

      if (targetError || !target) return json({ message: 'Staff member not found.' }, 404);
      if (target.is_owner) {
        return json({ message: 'The owner signs in with an email and password.' }, 400);
      }
      if (!target.auth_user_id) return json({ message: 'This account has no login yet.' }, 409);

      const { error: updateError } = await admin.auth.admin.updateUserById(target.auth_user_id, {
        password: await derivePassword(target.id, pin),
      });
      if (updateError) throw updateError;

      await admin.rpc('clear_pin_failures', { p_user_id: target.id });
      return json({ success: true });
    }

    // -------------------------------------------------------------------------
    if (body.action === 'deactivate') {
      if (!body.userId) return json({ message: 'Which staff member?' }, 400);

      const { data: target, error: targetError } = await admin
        .from('merchant_users')
        .select('id, auth_user_id, is_owner')
        .eq('id', body.userId)
        .eq('merchant_id', merchantId)
        .single();

      if (targetError || !target) return json({ message: 'Staff member not found.' }, 404);
      if (target.is_owner) return json({ message: 'The owner cannot be removed.' }, 400);

      // Deactivated, not deleted: ticket_validations references staff with ON
      // DELETE RESTRICT precisely so that who scanned what stays answerable
      // after someone leaves.
      const { error: deactivateError } = await admin
        .from('merchant_users')
        .update({ is_active: false })
        .eq('id', target.id);
      if (deactivateError) throw deactivateError;

      // Revoking the login is what actually ends their access; is_active alone
      // would leave an existing JWT usable until it expired.
      if (target.auth_user_id) {
        await admin.auth.admin.updateUserById(target.auth_user_id, {
          ban_duration: '876000h',
        });
      }

      return json({ success: true });
    }

    return json({ message: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('staff-provision failed:', err);
    return json({ message: 'Could not update staff right now. Please try again.' }, 500);
  }
});
