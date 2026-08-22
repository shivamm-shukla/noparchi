/**
 * WhatsApp via a wa.me share link.
 *
 * Costs nothing, needs no Meta Business account, and no template approval - so
 * it works today, on the free tier, with no setup. What it does NOT do is send
 * anything automatically: it opens WhatsApp with the message prefilled and the
 * customer (or the gatekeeper handing back the phone) presses send.
 *
 * That limitation is why the outcome is 'handed_off' rather than 'sent'. The UI
 * must not claim a pass was delivered when it was only offered.
 */
import { Linking, Platform } from 'react-native';
import type { MessagingProvider, PassMessage, DeliveryResult } from './types';
import { normalisePhone, passMessageText } from './types';

class WaDeepLinkProvider implements MessagingProvider {
  readonly id = 'wa_deeplink' as const;

  isConfigured(): boolean {
    return true;
  }

  async sendPass(message: PassMessage): Promise<DeliveryResult> {
    const phone = normalisePhone(message.recipientPhone);
    const text = encodeURIComponent(passMessageText(message));
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;

    try {
      if (Platform.OS === 'web') {
        // A user-gesture-initiated open; blocked only if the caller is not in
        // one, which the calling button always is.
        globalThis.open?.(url, '_blank');
      } else {
        await Linking.openURL(url);
      }
      return { outcome: 'handed_off', provider: this.id, url };
    } catch (err) {
      return {
        outcome: 'failed',
        provider: this.id,
        url,
        error: err instanceof Error ? err.message : 'Could not open WhatsApp.',
      };
    }
  }
}

export const waDeepLinkProvider = new WaDeepLinkProvider();
