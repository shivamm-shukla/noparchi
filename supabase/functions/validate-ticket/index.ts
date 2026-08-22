import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { corsHeaders } from '../_shared/cors.ts';

interface ValidateTicketRequest {
  ticketCode?: string;
  transactionId?: string;
  scannedByUserId: string;
  exitGate?: string;
  notes?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: ValidateTicketRequest = await req.json();
    const { ticketCode, transactionId, scannedByUserId, exitGate = 'Main Exit', notes } = body;

    if ((!ticketCode && !transactionId) || !scannedByUserId) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'INVALID',
          message: 'ticketCode/transactionId and scannedByUserId are required.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Verify User and RBAC Permissions
    const { data: user, error: userError } = await supabaseClient
      .from('users')
      .select('id, name, isOwner, merchantId, permission:staff_permissions(*)')
      .eq('id', scannedByUserId)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'UNAUTHORIZED',
          message: 'Staff user not found.',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const hasPermission =
      user.isOwner ||
      (user.permission &&
        (user.permission.can_verify_tickets ?? (user.permission as any)[0]?.can_verify_tickets));

    if (!hasPermission) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'UNAUTHORIZED',
          message: 'You do not have permission to verify exit tickets. Contact merchant owner.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Query Transaction by ticketCode or transactionId
    let query = supabaseClient.from('transactions').select('*, validation:ticket_validations(*)');

    if (ticketCode) {
      // Allow raw ticketCode or parsed JSON string
      let cleanedCode = ticketCode.trim();
      try {
        if (cleanedCode.startsWith('{') && cleanedCode.endsWith('}')) {
          const parsed = JSON.parse(cleanedCode);
          if (parsed.ticketCode) {
            cleanedCode = parsed.ticketCode;
          }
        }
      } catch {
        // use raw string
      }
      query = query.eq('ticketCode', cleanedCode);
    } else if (transactionId) {
      query = query.eq('id', transactionId);
    }

    const { data: transaction, error: txError } = await query.maybeSingle();

    if (txError || !transaction) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'INVALID',
          message: 'Ticket not found. Invalid or unrecognized QR code.',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if merchant matches staff's merchant
    if (transaction.merchantId !== user.merchantId) {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'INVALID',
          message: 'This ticket belongs to a different merchant facility.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check existing validation (Pre-check)
    if (transaction.validation && (Array.isArray(transaction.validation) ? transaction.validation.length > 0 : true)) {
      const existingVal = Array.isArray(transaction.validation) ? transaction.validation[0] : transaction.validation;
      return new Response(
        JSON.stringify({
          success: false,
          status: 'ALREADY_USED',
          message: `Ticket already verified on ${new Date(existingVal.timestamp).toLocaleTimeString()}`,
          transaction,
          validation: existingVal,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Atomic Insert with Concurrency Lock via Unique Constraint
    const { data: newValidation, error: insertValError } = await supabaseClient
      .from('ticket_validations')
      .insert({
        transactionId: transaction.id,
        scannedByUserId: user.id,
        exitGate,
        notes: notes || null,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertValError) {
      // Check for unique constraint violation (duplicate scan race condition)
      if (insertValError.code === '23505' || insertValError.message.includes('unique')) {
        return new Response(
          JSON.stringify({
            success: false,
            status: 'ALREADY_USED',
            message: 'Ticket was just verified by another staff member!',
            transaction,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          status: 'INVALID',
          message: 'Failed to record validation: ' + insertValError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: 'VERIFIED',
        message: 'Pass verified! Customer exit cleared.',
        transaction,
        validation: newValidation,
        scannedAt: newValidation.timestamp,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return new Response(
      JSON.stringify({
        success: false,
        status: 'INVALID',
        message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
