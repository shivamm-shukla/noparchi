import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { CheckCircle2, XCircle, AlertTriangle, ShieldAlert, WifiOff, Clock, IndianRupee } from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Button } from './Button';
import { formatCurrency, formatDateTime } from '../../src/utils/formatters';
import type { ScanResult, ScanStatus } from '../../src/types';

interface ValidationModalProps {
  result: ScanResult | null;
  visible: boolean;
  onClose: () => void;
  /**
   * Collect the overstay and open the gate. Only shown for EXPIRED, and only
   * when the caller can act on it - the scanner passes it, a read-only view
   * would not.
   */
  onCollectOverstay?: (amount: number) => Promise<void>;
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
interface Presentation {
  headline: string;
  tone: string;
  ring: string;
  text: string;
  color: string;
  Icon: typeof CheckCircle2;
}

/**
 * Built per render rather than held as a module constant, because the icon
 * colours are raw props that have to follow the active theme - a constant would
 * freeze whichever theme happened to load first.
 */
const presentationFor = (colors: Record<string, string>): Record<ScanStatus, Presentation> => ({
  VERIFIED: {
    headline: 'VERIFIED',
    tone: 'bg-brand-accent/15',
    ring: 'border-brand-accent/50',
    text: 'text-brand-accent',
    color: colors['success'],
    Icon: CheckCircle2,
  },
  ALREADY_USED: {
    headline: 'ALREADY USED',
    tone: 'bg-brand-danger/15',
    ring: 'border-brand-danger/50',
    text: 'text-brand-danger',
    color: colors['danger'],
    Icon: XCircle,
  },
  UNPAID: {
    headline: 'NOT PAID',
    tone: 'bg-brand-warning/15',
    ring: 'border-brand-warning/50',
    text: 'text-brand-warning',
    color: colors['warning'],
    Icon: AlertTriangle,
  },
  EXPIRED: {
    headline: 'TIME OVER',
    tone: 'bg-brand-warning/15',
    ring: 'border-brand-warning/50',
    text: 'text-brand-warning',
    color: colors['warning'],
    Icon: Clock,
  },
  INVALID: {
    headline: 'INVALID',
    tone: 'bg-brand-danger/15',
    ring: 'border-brand-danger/50',
    text: 'text-brand-danger',
    color: colors['danger'],
    Icon: XCircle,
  },
  UNAUTHORIZED: {
    headline: 'NOT ALLOWED',
    tone: 'bg-brand-surface-raised/40',
    ring: 'border-brand-border-strong',
    text: 'text-brand-text-subtle',
    color: colors['text-muted'],
    Icon: ShieldAlert,
  },
});

export const ValidationModal: React.FC<ValidationModalProps> = ({
  result,
  visible,
  onClose,
  onCollectOverstay,
}) => {
  const colors = useThemeColors();
  const [collecting, setCollecting] = useState(false);

  if (!result) return null;
  const presentation = presentationFor(colors);
  const p = presentation[result.status] ?? presentation.INVALID;
  const ticket = result.ticket;

  const overstayDue = result.overstayDue ?? 0;
  // Offline, the server cannot be asked what is owed, so there is nothing to
  // collect against and the button would be a guess.
  const canCollect =
    result.status === 'EXPIRED' && Boolean(onCollectOverstay) && !result.queuedOffline;

  const collect = async () => {
    if (!onCollectOverstay) return;
    setCollecting(true);
    try {
      await onCollectOverstay(overstayDue);
    } finally {
      setCollecting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-brand-scrim items-center justify-center p-4">
        <View className={`w-full max-w-md rounded-3xl border-2 ${p.ring} bg-brand-surface p-6`}>
          <View className="items-center">
            <View className={`w-24 h-24 rounded-full ${p.tone} items-center justify-center mb-4`}>
              <p.Icon size={56} color={p.color} />
            </View>

            <Text className={`text-3xl font-extrabold tracking-tight ${p.text} text-center`}>
              {p.headline}
            </Text>

            <Text className="text-sm text-brand-text-subtle text-center mt-3 leading-5">
              {result.message}
            </Text>

            {result.status === 'EXPIRED' && overstayDue > 0 && (
              <View className="w-full mt-5 p-4 rounded-2xl bg-brand-warning/10 border border-brand-warning/40 items-center">
                <Text className="text-[11px] font-bold text-brand-warning uppercase tracking-wider">
                  Collect before exit
                </Text>
                <View className="flex-row items-center gap-1 mt-1">
                  <IndianRupee size={22} color={colors['warning']} />
                  <Text className="text-3xl font-extrabold text-brand-warning">
                    {overstayDue.toFixed(0)}
                  </Text>
                </View>
              </View>
            )}

            {result.queuedOffline && (
              <View className="flex-row items-center gap-2 mt-4 px-3 py-1.5 rounded-full bg-brand-surface-raised border border-brand-border-strong">
                <WifiOff size={12} color={colors['text-muted']} />
                <Text className="text-[11px] font-semibold text-brand-text-subtle">
                  Recorded offline - will sync automatically
                </Text>
              </View>
            )}
          </View>

          {ticket && (
            <ScrollView className="max-h-52 mt-5">
              <View className="rounded-2xl bg-brand-bg/70 border border-brand-border p-4 gap-2.5">
                <Row label="Pass code" value={ticket.ticketCode} mono />
                <Row label="Type" value={ticket.ticketTypeLabel} />
                {ticket.vehicleNumber ? <Row label="Vehicle" value={ticket.vehicleNumber} /> : null}
                <Row label="Amount" value={formatCurrency(ticket.amount)} />
                <Row label="Issued" value={formatDateTime(ticket.createdAt)} />
              </View>
            </ScrollView>
          )}

          <View className="mt-6 gap-2">
            {canCollect && (
              <Button
                title={
                  overstayDue > 0
                    ? `Collected ${formatCurrency(overstayDue)} — open gate`
                    : 'Open gate'
                }
                variant="primary"
                size="lg"
                fullWidth
                loading={collecting}
                onPress={collect}
              />
            )}
            <Button
              title={canCollect ? 'Cancel' : 'Scan next pass'}
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
    <Text className="text-xs text-brand-text-muted">{label}</Text>
    <Text
      numberOfLines={1}
      className={`text-sm font-bold text-brand-text ${mono ? 'font-mono' : ''}`}
    >
      {value}
    </Text>
  </View>
);
