/**
 * Deliver a pass over WhatsApp (Evolution API or Meta Cloud API).
 *
 * Supported providers:
 * 1. evolution_api: Free self-hosted WhatsApp Web Gateway (No Meta approval/fees needed).
 * 2. meta_cloud: Official Meta WhatsApp Cloud API.
 *
 * Setup for Evolution API:
 *   supabase secrets set EVOLUTION_API_URL=https://your-evolution-api.domain.com
 *   supabase secrets set EVOLUTION_API_KEY=your_evolution_global_or_instance_key
 *   supabase secrets set EVOLUTION_INSTANCE_NAME=noparchi_main
 *
 * Setup for Meta Cloud API:
 *   supabase secrets set WHATSAPP_ACCESS_TOKEN=...
 *   supabase secrets set WHATSAPP_PHONE_NUMBER_ID=...
 *   supabase secrets set WHATSAPP_TEMPLATE_NAME=noparchi_pass
 */
import { corsHeaders, json } from '../_shared/cors.ts';

interface SendPassRequest {
  provider?: 'evolution_api' | 'meta_cloud';
  recipientPhone: string;
  businessName: string;
  location: string;
  ticketCode: string;
  typeLabel: string;
  amount: number;
  currency: string;
  vehicleNumber?: string | null;
  passUrl: string;
}

// Evolution API Secrets
const EVO_URL = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/+$/, '');
const EVO_KEY = Deno.env.get('EVOLUTION_API_KEY');
const EVO_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE_NAME') ?? 'noparchi_main';

// Meta Cloud Secrets
const META_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
const META_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
const META_TEMPLATE = Deno.env.get('WHATSAPP_TEMPLATE_NAME') ?? 'noparchi_pass';
const META_LANG = Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? 'en';
const META_API_VERSION = 'v21.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);

  try {
    const body: SendPassRequest = await req.json();
    const to = (body.recipientPhone ?? '').replace(/\D/g, '');
    if (!to) return json({ success: false, message: 'No phone number given.' }, 400);

    const provider = body.provider ?? (EVO_URL && EVO_KEY ? 'evolution_api' : 'meta_cloud');

    // -------------------------------------------------------------------------
    // Evolution API Handler (Zero-Cost Self-Hosted Gateway)
    // -------------------------------------------------------------------------
    if (provider === 'evolution_api') {
      if (!EVO_URL || !EVO_KEY) {
        return json(
          {
            success: false,
            message:
              'Evolution API is not configured. Set EVOLUTION_API_URL and EVOLUTION_API_KEY in Supabase secrets.',
          },
          400
        );
      }

      const formattedText = [
        `🎫 *${body.businessName}* — Digital Pass`,
        body.location ? `📍 ${body.location}` : null,
        '',
        `Pass Code: *${body.ticketCode}*`,
        `Type: ${body.typeLabel}`,
        body.vehicleNumber ? `Vehicle: ${body.vehicleNumber}` : null,
        `Paid: ${body.currency === 'INR' ? '₹' : ''}${body.amount}`,
        '',
        `👉 *Show this pass at exit gate:*`,
        body.passUrl,
        '',
        `_No paper. No queue. — Powered by NoParchi_`,
      ]
        .filter(Boolean)
        .join('\n');

      const evoEndpoint = `${EVO_URL}/message/sendText/${EVO_INSTANCE}`;
      const evoRes = await fetch(evoEndpoint, {
        method: 'POST',
        headers: {
          apikey: EVO_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: to,
          text: formattedText,
          delay: 1000,
          linkPreview: true,
        }),
      });

      const evoData = await evoRes.json().catch(() => ({}));
      if (!evoRes.ok) {
        console.error('Evolution API error:', evoData);
        return json(
          {
            success: false,
            message: evoData?.response?.message || evoData?.error || 'Evolution API delivery failed.',
          },
          502
        );
      }

      return json({
        success: true,
        provider: 'evolution_api',
        messageId: evoData?.key?.id || evoData?.messageId || 'sent',
      });
    }

    // -------------------------------------------------------------------------
    // Meta Cloud API Handler (Official Graph API)
    // -------------------------------------------------------------------------
    if (!META_TOKEN || !META_PHONE_ID) {
      return json(
        {
          success: false,
          message:
            'WhatsApp Cloud API is not configured. Set WHATSAPP_ACCESS_TOKEN and ' +
            'WHATSAPP_PHONE_NUMBER_ID, or configure EVOLUTION_API_URL in secrets.',
        },
        400
      );
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: META_TEMPLATE,
        language: { code: META_LANG },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: body.businessName },
              { type: 'text', text: body.typeLabel },
              { type: 'text', text: `${body.currency === 'INR' ? '₹' : ''}${body.amount}` },
              { type: 'text', text: body.ticketCode },
              { type: 'text', text: body.vehicleNumber || '-' },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: body.ticketCode }],
          },
        ],
      },
    };

    const response = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${META_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Meta WhatsApp send failed:', data);
      return json(
        { success: false, message: data?.error?.message ?? 'Meta WhatsApp rejected the message.' },
        502
      );
    }

    return json({ success: true, provider: 'meta_cloud', messageId: data?.messages?.[0]?.id ?? null });
  } catch (err) {
    console.error('send-pass error:', err);
    return json({ success: false, message: 'Could not send the pass right now.' }, 500);
  }
});
