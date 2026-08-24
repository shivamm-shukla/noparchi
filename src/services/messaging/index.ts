/**
 * Resolves a merchant's configured messaging provider.
 *
 * To add a provider: implement MessagingProvider, add its id to
 * src/config/providers.ts, and register it here. Nothing else changes.
 */
import { DEFAULT_MESSAGING_PROVIDER, type MessagingProviderId } from '../../config/providers';
import { waDeepLinkProvider } from './waDeepLinkProvider';
import { metaCloudProvider } from './metaCloudProvider';
import { evolutionApiProvider } from './evolutionApiProvider';
import type { MessagingProvider } from './types';

const registry: Record<MessagingProviderId, MessagingProvider> = {
  wa_deeplink: waDeepLinkProvider,
  meta_cloud: metaCloudProvider,
  evolution_api: evolutionApiProvider,
};

export function messagingProvider(id?: string | null): MessagingProvider {
  const key = (id ?? DEFAULT_MESSAGING_PROVIDER) as MessagingProviderId;
  return registry[key] ?? registry[DEFAULT_MESSAGING_PROVIDER];
}

export * from './types';
