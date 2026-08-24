/**
 * Evolution API WhatsApp Provider (Zero-Cost Automated Pass Delivery).
 *
 * Evolution API connects to regular WhatsApp / WhatsApp Business via QR code.
 * It sends automated text, media and ticket pass links without requiring
 * Meta Business verification or per-message conversation fees.
 */
import { supabase } from '../../lib/supabase';
import type { MessagingProvider, PassMessage, DeliveryResult } from './types';
import { normalisePhone } from './types';

class EvolutionApiProvider implements MessagingProvider {
  readonly id = 'evolution_api' as const;

  isConfigured(): boolean {
    return Boolean(supabase);
  }

  async sendPass(message: PassMessage): Promise<DeliveryResult> {
    if (!supabase) {
      return { outcome: 'failed', provider: this.id, error: 'Not connected to server.' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-pass', {
        body: {
          ...message,
          provider: this.id,
          recipientPhone: normalisePhone(message.recipientPhone),
        },
      });

      if (error) throw error;

      if (!data?.success) {
        return {
          outcome: 'failed',
          provider: this.id,
          error: data?.message ?? 'Evolution API delivery failed.',
        };
      }

      return { outcome: 'sent', provider: this.id, messageId: data.messageId };
    } catch (err) {
      return {
        outcome: 'failed',
        provider: this.id,
        error: err instanceof Error ? err.message : 'Could not deliver pass via Evolution API.',
      };
    }
  }
}

export const evolutionApiProvider = new EvolutionApiProvider();
