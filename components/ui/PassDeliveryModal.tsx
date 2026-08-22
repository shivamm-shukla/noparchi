import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { MessageSquare, X, Send, CheckCircle2, AlertCircle, Link2 } from 'lucide-react-native';
import theme from '../../src/config/theme';
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
      <View className="flex-1 bg-black/80 items-center justify-center p-4">
        <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-5 sm:p-6">
          <View className="flex-row items-center justify-between pb-4 border-b border-slate-800">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 items-center justify-center">
                <MessageSquare size={20} color={theme.semantic.accent} />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold text-slate-100">Send the pass</Text>
                <Text className="text-xs text-slate-400">{providerMeta.label}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={close}
              className="w-8 h-8 rounded-full bg-slate-800 items-center justify-center"
            >
              <X size={16} color={theme.semantic.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView className="max-h-[26rem] my-4">
            <View className="items-center mb-4">
              <View className="p-3 bg-white rounded-2xl">
                <QRCode
                  value={url ?? transaction.ticketCode}
                  size={140}
                  color={theme.semantic.onPaper}
                  backgroundColor={theme.semantic.paper}
                />
              </View>
              <Text className="text-sm font-mono font-extrabold text-slate-100 mt-3 tracking-wider">
                {transaction.ticketCode}
              </Text>
            </View>

            <View className="rounded-2xl bg-slate-950/70 border border-slate-800 p-4 gap-2.5 mb-4">
              <Row label="Type" value={transaction.ticketTypeLabel} />
              {transaction.vehicleNumber ? (
                <Row label="Vehicle" value={transaction.vehicleNumber} />
              ) : null}
              <Row label="Amount" value={formatCurrency(transaction.amount, merchant.currency)} />
              <Row label="Issued" value={formatDateTime(transaction.createdAt)} />
            </View>

            {outcome === null && (
              <>
                <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Customer WhatsApp number
                </Text>
                <View className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3">
                  <TextInput
                    value={phone || transaction.customerPhone || ''}
                    onChangeText={setPhone}
                    placeholder="98765 43210"
                    placeholderTextColor={theme.semantic.textFaint}
                    keyboardType="phone-pad"
                    className="text-slate-100 text-sm font-semibold"
                  />
                </View>
                <Text className="text-[11px] text-slate-500 mt-2 leading-4">
                  {providerMeta.note}
                </Text>
              </>
            )}

            {outcome !== null && (
              <View className="items-center p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle2 size={28} color={theme.semantic.accent} />
                <Text className="text-sm font-bold text-emerald-300 mt-2 text-center">
                  {outcome === 'sent'
                    ? 'Pass sent to the customer.'
                    : 'WhatsApp opened with the pass ready to send.'}
                </Text>
                {outcome === 'handed_off' && (
                  <Text className="text-[11px] text-slate-400 mt-1.5 text-center leading-4">
                    Press send in WhatsApp to finish. Nothing was sent automatically.
                  </Text>
                )}
              </View>
            )}

            {error && (
              <View className="flex-row items-start gap-2 mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                <AlertCircle size={14} color={theme.semantic.danger} />
                <Text className="text-xs text-rose-300 flex-1 leading-4">{error}</Text>
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
              icon={<Send size={16} color={theme.semantic.onAccent} />}
              onPress={send}
            />
          ) : (
            <Button title="Done" variant="secondary" size="lg" fullWidth onPress={close} />
          )}

          {url && (
            <View className="flex-row items-center justify-center gap-1.5 mt-3">
              <Link2 size={11} color={theme.semantic.textFaint} />
              <Text numberOfLines={1} className="text-[10px] font-mono text-slate-500">
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
    <Text className="text-xs text-slate-400">{label}</Text>
    <Text numberOfLines={1} className="text-sm font-bold text-slate-100">
      {value}
    </Text>
  </View>
);
