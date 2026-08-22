import React, { useMemo, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { PlusCircle, X, AlertCircle } from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Button } from './Button';
import { useApp } from '../../src/context/AppContext';
import { transactionService } from '../../src/services/transactionService';
import { activeTicketTypes } from '../../src/config/pricing';
import { ticketTypeIcon } from '../../src/config/icons';
import { formatCurrency } from '../../src/utils/formatters';
import type { Transaction } from '../../src/types';

interface NewTicketModalProps {
  visible: boolean;
  onClose: () => void;
  onIssued?: (transaction: Transaction) => void;
}

/**
 * Issue a pass at the counter - the walk-up cash or in-person UPI case.
 *
 * The pass types and their prices come from the merchant's own ticket_types
 * rows, so an owner who adds "Cycle" in Settings sees it here immediately. The
 * previous version hardcoded four vehicle types and a rate ladder with the
 * literal fallbacks 20 / 50 / 40 repeated in three separate components.
 *
 * The amount is never sent from here: issue_pass reads it from the database, so
 * a tampered client cannot issue a hundred-rupee pass for one rupee.
 */
export const NewTicketModal: React.FC<NewTicketModalProps> = ({ visible, onClose, onIssued }) => {
  const colors = useThemeColors();
  const { ticketTypes, refresh } = useApp();
  const types = useMemo(() => activeTicketTypes(ticketTypes), [ticketTypes]);

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = types.find((t) => t.code === selectedCode) ?? types[0] ?? null;

  const reset = () => {
    setSelectedCode(null);
    setVehicleNumber('');
    setCustomerPhone('');
    setError(null);
  };

  const submit = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const transaction = await transactionService.issuePass({
        ticketTypeCode: chosen.code,
        vehicleNumber: vehicleNumber.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        // The staff member is physically taking the money, so this is a real
        // verification by an accountable person - recorded against their id.
        markPaid: true,
      });
      await refresh({ silent: true });
      onIssued?.(transaction);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not issue the pass.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-brand-scrim items-center justify-center p-4">
        <View className="bg-brand-surface border border-brand-border rounded-3xl w-full max-w-lg p-5 sm:p-6">
          <View className="flex-row items-center justify-between pb-4 border-b border-brand-border">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-brand-accent/10 border border-brand-accent/30 items-center justify-center">
                <PlusCircle size={20} color={colors['accent']} />
              </View>
              <View>
                <Text className="text-lg font-bold text-brand-text">Issue a pass</Text>
                <Text className="text-xs text-brand-text-muted">For a customer paying at the gate</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="w-8 h-8 rounded-full bg-brand-surface-raised items-center justify-center"
            >
              <X size={16} color={colors['text-muted']} />
            </TouchableOpacity>
          </View>

          <ScrollView className="max-h-96 my-4">
            {types.length === 0 ? (
              <View className="items-center py-8">
                <AlertCircle size={28} color={colors['warning']} />
                <Text className="text-sm font-bold text-brand-text mt-3 text-center">
                  No pass types yet
                </Text>
                <Text className="text-xs text-brand-text-muted text-center mt-1.5 leading-4">
                  Add one in Settings → Pass types before issuing passes.
                </Text>
              </View>
            ) : (
              <>
                <Text className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider mb-2.5">
                  Pass type
                </Text>
                <View className="flex-row flex-wrap gap-2.5 mb-5">
                  {types.map((type) => {
                    const Icon = ticketTypeIcon(type.icon);
                    const isSelected = chosen?.code === type.code;
                    return (
                      <TouchableOpacity
                        key={type.id}
                        onPress={() => setSelectedCode(type.code)}
                        activeOpacity={0.7}
                        className={`flex-1 min-w-[140px] p-3.5 rounded-2xl border ${
                          isSelected
                            ? 'bg-brand-accent/10 border-brand-accent/60'
                            : 'bg-brand-bg/60 border-brand-border'
                        }`}
                      >
                        <View className="flex-row items-center justify-between mb-2">
                          <Icon
                            size={18}
                            color={isSelected ? colors['accent'] : colors['text-muted']}
                          />
                          <Text className="text-sm font-extrabold text-brand-text">
                            {formatCurrency(type.amount)}
                          </Text>
                        </View>
                        <Text className="text-xs font-bold text-brand-text">{type.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider mb-2">
                  Vehicle number (optional)
                </Text>
                <View className="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 mb-4">
                  <TextInput
                    value={vehicleNumber}
                    onChangeText={setVehicleNumber}
                    placeholder="DL 01 AB 1234"
                    placeholderTextColor={colors['text-faint']}
                    autoCapitalize="characters"
                    className="text-brand-text text-base font-bold uppercase tracking-wider"
                  />
                </View>

                <Text className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider mb-2">
                  WhatsApp number (optional)
                </Text>
                <View className="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
                  <TextInput
                    value={customerPhone}
                    onChangeText={setCustomerPhone}
                    placeholder="98765 43210"
                    placeholderTextColor={colors['text-faint']}
                    keyboardType="phone-pad"
                    className="text-brand-text text-sm font-semibold"
                  />
                </View>
              </>
            )}
          </ScrollView>

          {error && (
            <View className="flex-row items-start gap-2 mb-3 p-3 rounded-xl bg-brand-danger/10 border border-brand-danger/30">
              <AlertCircle size={14} color={colors['danger']} />
              <Text className="text-xs text-brand-danger flex-1 leading-4">{error}</Text>
            </View>
          )}

          <Button
            title={chosen ? `Issue pass · ${formatCurrency(chosen.amount)}` : 'Issue pass'}
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
            disabled={!chosen}
            onPress={submit}
          />
        </View>
      </View>
    </Modal>
  );
};
