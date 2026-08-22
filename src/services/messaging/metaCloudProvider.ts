/**
 * WhatsApp Cloud API, automated.
 *
 * The request is made by the send-pass Edge Function, never here. Meta's access
 * token is a bearer credential for your business's WhatsApp number; anything
 * that reaches the client bundle is readable by every visitor, so the token
 * lives in Supabase secrets and this adapter only asks the server to act.
 *
 * Limits worth knowing before switching to this provider:
 *   - The message must use a template Meta has approved. Arbitrary text can
 *     only be sent inside a 24-hour window opened by the customer messaging
 *     you first, which never happens in this flow.
 *   - The free allowance is counted in conversations, not messages.
 *   - The sending number must not be registered on the consumer WhatsApp app.
 */
import { supabase } from '../../lib/supabase';
import type { MessagingProvider, PassMessage, DeliveryResult } from './types';
import { normalisePhone } from './types';

class MetaCloudProvider implements MessagingProvider {
  readonly id = 'meta_cloud' as const;

  /**
   * Whether the token is present can only be known server-side, so this reports
   * on what the client can check: that there is a backend to ask at all.
   */
  isConfigured(): boolean {
    return Boolean(supabase);
  }

  async sendPass(message: PassMessage): Promise<DeliveryResult> {
    if (!supabase) {
      return { outcome: 'failed', provider: this.id, error: 'Not connected to the server.' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-pass', {
        body: { ...message, recipientPhone: normalisePhone(message.recipientPhone) },
      });
      if (error) throw error;
      if (!data?.success) {
        return { outcome: 'failed', provider: this.id, error: data?.message ?? 'Send failed.' };
      }
      return { outcome: 'sent', provider: this.id, messageId: data.messageId };
    } catch (err) {
      return {
        outcome: 'failed',
        provider: this.id,
        error: err instanceof Error ? err.message : 'Could not send the pass.',
      };
    }
  }
}

export const metaCloudProvider = new MetaCloudProvider();
