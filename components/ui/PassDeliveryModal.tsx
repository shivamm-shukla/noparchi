import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { MessageSquare, X, Send, CheckCircle2, AlertCircle, Link2 } from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Button } from './Button';
import { messagingProvider } from '../../src/services/messaging';
import { MESSAGING_PROVIDERS, type MessagingProviderId } from '../../src/config/providers';
import { passUrl } from '../../src/utils/links';
import { formatCurrency, formatDateTime } from '../../src/utils/formatters';
import type { Merchant, Transaction } from '../../src/types';

interface PassDeliveryModalProps {
  merchant: Merchant;
  transaction: Transaction | null;
  visible: boolean;
  onClose: () => void;
}

/**
 * Send a customer their pass.
 *
 * The delivery mechanism is whatever the merchant has configured - resolved
 * through the MessagingProvider seam, so this component contains no vendor
 * payload shapes and no API tokens. The previous modal inlined Meta's Cloud API
 * template structure and read the access token from process.env on the client.
 *
 * The wording of the result matters: the free provider hands off to the
 * customer's own WhatsApp rather than sending anything, and saying "delivered"
 * when it only opened a compose window would be a lie the owner acts on.
 */
export const PassDeliveryModal: React.FC<PassDeliveryModalProps> = ({
  merchant,
  transaction,
  visible,
  onClose,
}) => {
  const colors = useThemeColors();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<'sent' | 'handed_off' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!transaction) return null;

  const url = passUrl(transaction.ticketCode);
  const providerId = (merchant.messagingProvider ?? 'wa_deeplink') as MessagingProviderId;
  const providerMeta = MESSAGING_PROVIDERS[providerId] ?? MESSAGING_PROVIDERS.wa_deeplink;

  const send = async () => {
    if (!url) {
      setError('Set EXPO_PUBLIC_WEB_URL so the pass link points somewhere reachable.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await messagingProvider(providerId).sendPass({
        recipientPhone: phone.trim() || transaction.customerPhone || '',
        businessName: merchant.businessName,
        location: merchant.location,
        ticketCode: transaction.ticketCode,
        typeLabel: transaction.ticketTypeLabel,
        amount: transaction.amount,
        currency: merchant.currency,
        vehicleNumber: transaction.vehicleNumber,
        issuedAt: transaction.createdAt,
        passUrl: url,
      });

      if (result.outcome === 'failed') setError(result.error ?? 'Could not send the pass.');
      else setOutcome(result.outcome);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the pass.');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setOutcome(null);
    setError(null);
    setPhone('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View className="flex-1 bg-brand-scrim items-center justify-center p-4">
        <View className="bg-brand-surface border border-brand-border rounded-3xl w-full max-w-lg p-5 sm:p-6">
          <View className="flex-row items-center justify-between pb-4 border-b border-brand-border">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-brand-accent/10 border border-brand-accent/30 items-center justify-center">
                <MessageSquare size={20} color={colors['accent']} />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold text-brand-text">Send the pass</Text>
                <Text className="text-xs text-brand-text-muted">{providerMeta.label}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={close}
              className="w-8 h-8 rounded-full bg-brand-surface-raised items-center justify-center"
            >
              <X size={16} color={colors['text-muted']} />
            </TouchableOpacity>
          </View>

          <ScrollView className="max-h-[26rem] my-4">
            <View className="items-center mb-4">
              <View className="p-3 bg-brand-paper rounded-2xl">
                <QRCode
                  value={url ?? transaction.ticketCode}
                  size={140}
                  color={colors['on-paper']}
                  backgroundColor={colors['paper']}
                />
              </View>
              <Text className="text-sm font-mono font-extrabold text-brand-text mt-3 tracking-wider">
                {transaction.ticketCode}
              </Text>
            </View>

            <View className="rounded-2xl bg-brand-bg/70 border border-brand-border p-4 gap-2.5 mb-4">
              <Row label="Type" value={transaction.ticketTypeLabel} />
              {transaction.vehicleNumber ? (
                <Row label="Vehicle" value={transaction.vehicleNumber} />
              ) : null}
              <Row label="Amount" value={formatCurrency(transaction.amount, merchant.currency)} />
              <Row label="Issued" value={formatDateTime(transaction.createdAt)} />
            </View>

            {outcome === null && (
              <>
                <Text className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider mb-2">
                  Customer WhatsApp number
                </Text>
                <View className="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
                  <TextInput
                    value={phone || transaction.customerPhone || ''}
                    onChangeText={setPhone}
                    placeholder="98765 43210"
                    placeholderTextColor={colors['text-faint']}
                    keyboardType="phone-pad"
                    className="text-brand-text text-sm font-semibold"
                  />
                </View>
                <Text className="text-[11px] text-brand-text-faint mt-2 leading-4">
                  {providerMeta.note}
                </Text>
              </>
            )}

            {outcome !== null && (
              <View className="items-center p-4 rounded-2xl bg-brand-accent/10 border border-brand-accent/30">
                <CheckCircle2 size={28} color={colors['accent']} />
                <Text className="text-sm font-bold text-brand-accent mt-2 text-center">
                  {outcome === 'sent'
                    ? 'Pass sent to the customer.'
                    : 'WhatsApp opened with the pass ready to send.'}
                </Text>
                {outcome === 'handed_off' && (
                  <Text className="text-[11px] text-brand-text-muted mt-1.5 text-center leading-4">
                    Press send in WhatsApp to finish. Nothing was sent automatically.
                  </Text>
                )}
              </View>
            )}

            {error && (
              <View className="flex-row items-start gap-2 mt-3 p-3 rounded-xl bg-brand-danger/10 border border-brand-danger/30">
                <AlertCircle size={14} color={colors['danger']} />
                <Text className="text-xs text-brand-danger flex-1 leading-4">{error}</Text>
              </View>
            )}
          </ScrollView>

          {outcome === null ? (
            <Button
              title="Send pass on WhatsApp"
              variant="primary"
              size="lg"
              fullWidth
              loading={busy}
              icon={<Send size={16} color={colors['on-accent']} />}
              onPress={send}
            />
          ) : (
            <Button title="Done" variant="secondary" size="lg" fullWidth onPress={close} />
          )}

          {url && (
            <View className="flex-row items-center justify-center gap-1.5 mt-3">
              <Link2 size={11} color={colors['text-faint']} />
              <Text numberOfLines={1} className="text-[10px] font-mono text-brand-text-faint">
                {url}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View className="flex-row items-center justify-between gap-3">
    <Text className="text-xs text-brand-text-muted">{label}</Text>
    <Text numberOfLines={1} className="text-sm font-bold text-brand-text">
      {value}
    </Text>
  </View>
);
