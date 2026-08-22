import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { corsHeaders } from '../_shared/cors.ts';

interface CreateTransactionRequest {
  merchantId: string;
  amount: number;
  vehicleNumber?: string;
  vehicleType?: 'TWO_WHEELER' | 'FOUR_WHEELER' | 'HEAVY_VEHICLE' | 'GENERAL_ENTRY';
  customerPhone?: string;
  paymentRef?: string;
}

function generateTicketCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let randomPart = '';
  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  return `NP-${timestamp}-${randomPart}`;
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

    const body: CreateTransactionRequest = await req.json();
    const {
      merchantId,
      amount,
      vehicleNumber,
      vehicleType = 'FOUR_WHEELER',
      customerPhone,
      paymentRef,
    } = body;

    if (!merchantId || amount === undefined || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'merchantId and positive amount are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Verify merchant exists
    const { data: merchant, error: merchantError } = await supabaseClient
      .from('merchants')
      .select('id, businessName, upiId, configSettings')
      .eq('id', merchantId)
      .single();

    if (merchantError || !merchant) {
      return new Response(
        JSON.stringify({ error: 'Merchant not found.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Generate unique ticket code
    const ticketCode = generateTicketCode();
    const cleanVehicleNumber = vehicleNumber ? vehicleNumber.trim().toUpperCase() : null;
    const finalPaymentRef = paymentRef || `UPI-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const qrPayload = JSON.stringify({
      app: 'NoParchi',
      ticketCode,
      merchantId,
      amount,
      vehicleNumber: cleanVehicleNumber,
      issuedAt: new Date().toISOString(),
    });

    // 3. Insert transaction
    const { data: transaction, error: insertError } = await supabaseClient
      .from('transactions')
      .insert({
        merchantId,
        amount,
        vehicleNumber: cleanVehicleNumber,
        vehicleType,
        status: 'SUCCESS',
        paymentRef: finalPaymentRef,
        customerPhone: customerPhone?.trim() || null,
        ticketCode,
        qrPayload,
      })
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: 'Failed to create transaction', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        transaction,
        ticketCode,
        qrPayload,
        merchantName: merchant.businessName,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
