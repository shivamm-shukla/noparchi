import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { CheckCircle2, XCircle, AlertTriangle, ShieldAlert, WifiOff } from 'lucide-react-native';
import theme from '../../src/config/theme';
import { Button } from './Button';
import { formatCurrency, formatDateTime } from '../../src/utils/formatters';
import type { ScanResult, ScanStatus } from '../../src/types';

interface ValidationModalProps {
  result: ScanResult | null;
  visible: boolean;
  onClose: () => void;
}

/**
 * The gatekeeper's answer, in one glance.
 *
 * This screen is read in a second, in daylight, by someone with a queue behind
 * them, so the outcome is carried by colour and a single large word before any
 * detail. UNPAID is its own state rather than folded into INVALID: "this is a
 * real pass that was never paid for" usually means the customer is standing
 * right there and can pay, which is a different action from turning away a fake.
 */
const PRESENTATION: Record<
  ScanStatus,
  { headline: string; tone: string; ring: string; text: string; color: string; Icon: typeof CheckCircle2 }
> = {
  VERIFIED: {
    headline: 'VERIFIED',
    tone: 'bg-emerald-500/15',
    ring: 'border-emerald-500/50',
    text: 'text-emerald-400',
    color: theme.semantic.success,
    Icon: CheckCircle2,
  },
  ALREADY_USED: {
    headline: 'ALREADY USED',
    tone: 'bg-rose-500/15',
    ring: 'border-rose-500/50',
    text: 'text-rose-400',
    color: theme.semantic.danger,
    Icon: XCircle,
  },
  UNPAID: {
    headline: 'NOT PAID',
    tone: 'bg-amber-500/15',
    ring: 'border-amber-500/50',
    text: 'text-amber-400',
    color: theme.semantic.warning,
    Icon: AlertTriangle,
  },
  INVALID: {
    headline: 'INVALID',
    tone: 'bg-rose-500/15',
    ring: 'border-rose-500/50',
    text: 'text-rose-400',
    color: theme.semantic.danger,
    Icon: XCircle,
  },
  UNAUTHORIZED: {
    headline: 'NOT ALLOWED',
    tone: 'bg-slate-700/40',
    ring: 'border-slate-600',
    text: 'text-slate-300',
    color: theme.semantic.textMuted,
    Icon: ShieldAlert,
  },
};

export const ValidationModal: React.FC<ValidationModalProps> = ({ result, visible, onClose }) => {
  if (!result) return null;
  const p = PRESENTATION[result.status] ?? PRESENTATION.INVALID;
  const ticket = result.ticket;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/80 items-center justify-center p-4">
        <View className={`w-full max-w-md rounded-3xl border-2 ${p.ring} bg-slate-900 p-6`}>
          <View className="items-center">
            <View className={`w-24 h-24 rounded-full ${p.tone} items-center justify-center mb-4`}>
              <p.Icon size={56} color={p.color} />
            </View>

            <Text className={`text-3xl font-extrabold tracking-tight ${p.text} text-center`}>
              {p.headline}
            </Text>

            <Text className="text-sm text-slate-300 text-center mt-3 leading-5">
              {result.message}
            </Text>

            {result.queuedOffline && (
              <View className="flex-row items-center gap-2 mt-4 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700">
                <WifiOff size={12} color={theme.semantic.textMuted} />
                <Text className="text-[11px] font-semibold text-slate-300">
                  Recorded offline - will sync automatically
                </Text>
              </View>
            )}
          </View>

          {ticket && (
            <ScrollView className="max-h-52 mt-5">
              <View className="rounded-2xl bg-slate-950/70 border border-slate-800 p-4 gap-2.5">
                <Row label="Pass code" value={ticket.ticketCode} mono />
                <Row label="Type" value={ticket.ticketTypeLabel} />
                {ticket.vehicleNumber ? <Row label="Vehicle" value={ticket.vehicleNumber} /> : null}
                <Row label="Amount" value={formatCurrency(ticket.amount)} />
                <Row label="Issued" value={formatDateTime(ticket.createdAt)} />
              </View>
            </ScrollView>
          )}

          <View className="mt-6">
            <Button
              title="Scan next pass"
              variant={result.success ? 'primary' : 'secondary'}
              size="lg"
              fullWidth
              onPress={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const Row: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <View className="flex-row items-center justify-between gap-3">
    <Text className="text-xs text-slate-400">{label}</Text>
    <Text
      numberOfLines={1}
      className={`text-sm font-bold text-slate-100 ${mono ? 'font-mono' : ''}`}
    >
      {value}
    </Text>
  </View>
);
