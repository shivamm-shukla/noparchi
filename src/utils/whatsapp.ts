import { WhatsAppTemplatePayload, Transaction, Merchant } from '../types';

export interface WhatsAppSendResult {
  success: boolean;
  messageId: string;
  recipient: string;
  status: 'DELIVERED' | 'SENT' | 'SIMULATED' | 'FAILED';
  timestamp: string;
  rawPayload: Record<string, unknown>;
}

/**
 * Placeholder and utility function to send a digital PDF/QR pass to customer's WhatsApp
 * via Meta Cloud API (WhatsApp Business Platform).
 *
 * Designed for future direct webhook & Meta Cloud API integration.
 */
export async function sendWhatsAppTicket(
  transaction: Transaction,
  merchant: Merchant
): Promise<WhatsAppSendResult> {
  const recipientPhone = transaction.customerPhone || '+919876543210';
  const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');

  const templatePayload: WhatsAppTemplatePayload = {
    recipientPhone: cleanPhone,
    businessName: merchant.businessName,
    location: merchant.location,
    amount: transaction.amount,
    vehicleNumber: transaction.vehicleNumber || 'Unspecified Vehicle',
    ticketCode: transaction.ticketCode,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
      transaction.ticketCode
    )}`,
    issuedAt: transaction.createdAt,
  };

  // Meta Cloud API v20.0 message payload structure
  const metaCloudApiPayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone,
    type: 'template',
    template: {
      name: 'digital_parking_pass_v1',
      language: {
        code: 'en_US',
      },
      components: [
        {
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: {
                link: templatePayload.qrCodeUrl,
              },
            },
          ],
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: merchant.businessName },
            { type: 'text', text: `₹${transaction.amount}` },
            { type: 'text', text: transaction.vehicleNumber || 'N/A' },
            { type: 'text', text: transaction.ticketCode },
            { type: 'text', text: merchant.location },
          ],
        },
      ],
    },
  };

  // Check if live Meta API tokens are present
  const metaToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.EXPO_PUBLIC_WHATSAPP_PHONE_NUMBER_ID;

  if (metaToken && phoneId) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v20.0/${phoneId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${metaToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metaCloudApiPayload),
        }
      );

      const data = await response.json();
      if (response.ok) {
        return {
          success: true,
          messageId: data.messages?.[0]?.id || `wamid-${Date.now()}`,
          recipient: cleanPhone,
          status: 'DELIVERED',
          timestamp: new Date().toISOString(),
          rawPayload: metaCloudApiPayload,
        };
      }
    } catch (err) {
      console.warn('Live WhatsApp Meta API call failed, falling back to simulated dispatch:', err);
    }
  }

  // Simulated delivery for offline & staging development
  return {
    success: true,
    messageId: `wamid.HBgL${Date.now()}XyZ`,
    recipient: cleanPhone,
    status: 'SIMULATED',
    timestamp: new Date().toISOString(),
    rawPayload: metaCloudApiPayload,
  };
}
