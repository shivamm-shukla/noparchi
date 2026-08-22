import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform, Share } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  Share2,
  AlertCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react-native';
import theme from '../../src/config/theme';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { checkoutService } from '../../src/services/checkoutService';
import { passUrl } from '../../src/utils/links';
import { formatCurrency, formatDateTime } from '../../src/utils/formatters';
import type { PublicTicket } from '../../src/types';

/**
 * The customer's pass.
 *
 * Fetched by code from a public RPC, so it works on the customer's own phone
 * with no account. The previous version looked the pass up in the merchant
 * app's in-memory context - which on a customer's device always missed, leaving
 * the page rendering placeholder values including a hardcoded ₹50.
 */
export default function TicketScreen() {
  const { ticketCode } = useLocalSearchParams<{ ticketCode: string }>();
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ticketCode) return;
    try {
      setError(null);
      setTicket(await checkoutService.loadTicket(ticketCode));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pass not found.');
    } finally {
      setLoading(false);
    }
  }, [ticketCode]);

  useEffect(() => {
    load();
  }, [load]);

  // A pass bought with UPI stays pending until a gatekeeper confirms the money.
  // Polling means the customer sees it turn valid without refreshing, which is
  // the difference between waiting calmly and asking staff what went wrong.
  useEffect(() => {
    if (ticket?.status !== 'pending') return;
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [ticket?.status, load]);

  const share = async () => {
    if (!ticket) return;
    const url = passUrl(ticket.ticketCode);
    const message = `${ticket.merchant.businessName} pass\nCode: ${ticket.ticketCode}\n${url ?? ''}`;
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'NoParchi pass', text: message }).catch(() => {});
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
      }
    } else {
      await Share.share({ message });
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color={theme.semantic.accent} />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View className="flex-1 bg-slate-950 items-center justify-center p-6">
        <Card className="w-full max-w-md items-center p-6">
          <AlertCircle size={28} color={theme.semantic.warning} />
          <Text className="text-base font-bold text-slate-100 mt-3 text-center">
            {error ?? 'Pass not found.'}
          </Text>
          <Text className="text-xs text-slate-400 mt-2 text-center leading-4">
            Check the code, or ask the staff at the counter.
          </Text>
        </Card>
      </View>
    );
  }

  const state = passState(ticket);

  return (
    <View className="flex-1 bg-slate-950">
      <View className="bg-slate-900 border-b border-slate-800 px-4 py-4">
        <View className="max-w-lg mx-auto w-full flex-row items-center justify-between">
          <Text className="text-sm font-bold text-slate-100">Your pass</Text>
          <Badge label={state.badge} variant={state.badgeVariant} size="sm" />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="max-w-lg mx-auto w-full px-4 py-6">
          <Card className="items-center p-6 mb-6">
            <View
              className={`w-14 h-14 rounded-full items-center justify-center mb-3 border ${state.ringClass}`}
            >
              <state.Icon size={30} color={state.color} />
            </View>

            <Text className="text-xl font-extrabold text-slate-100 text-center">
              {ticket.merchant.businessName}
            </Text>
            <Text className="text-xs text-slate-400 text-center mb-1">
              {ticket.merchant.location}
            </Text>
            <Text className={`text-sm font-bold text-center mb-4 ${state.textClass}`}>
              {state.headline}
            </Text>

            {/*
              The QR encodes the pass URL, which is what the gatekeeper's scanner
              reads. It is rendered even for a pending pass so the customer has
              it ready the moment payment is confirmed - but the status above
              never claims the pass is valid before it is.
            */}
            <View className="p-4 bg-white rounded-3xl items-center mb-4 border-4 border-emerald-500/20">
              <QRCode
                value={passUrl(ticket.ticketCode) ?? ticket.ticketCode}
                size={180}
                color={theme.semantic.onPaper}
                backgroundColor={theme.semantic.paper}
              />
              <Text className="text-slate-950 font-mono font-extrabold text-sm mt-2 tracking-wider">
                {ticket.ticketCode}
              </Text>
            </View>

            <Text className="text-xs text-slate-400 text-center mb-5 leading-4">
              {state.instruction}
            </Text>

            <View className="w-full rounded-2xl bg-slate-950/80 border border-slate-800 p-4 gap-3">
              <Row label="Pass type" value={ticket.typeLabel} />
              {ticket.vehicleNumber ? <Row label="Vehicle" value={ticket.vehicleNumber} /> : null}
              <Row label="Amount" value={formatCurrency(ticket.amount)} highlight />
              <Row label="Issued" value={formatDateTime(ticket.issuedAt)} icon={<Clock size={13} color={theme.semantic.textMuted} />} />
              {ticket.usedAt ? <Row label="Exited" value={formatDateTime(ticket.usedAt)} /> : null}
            </View>

            <View className="flex-row gap-3 w-full mt-5">
              <Button
                title="Share"
                variant="secondary"
                className="flex-1"
                icon={<Share2 size={15} color={theme.semantic.text} />}
                onPress={share}
              />
              <Button
                title="Refresh"
                variant="outline"
                className="flex-1"
                icon={<RefreshCw size={15} color={theme.semantic.textMuted} />}
                onPress={load}
              />
            </View>
          </Card>

          <View className="flex-row items-center justify-center gap-2">
            <ShieldCheck size={14} color={theme.semantic.accent} />
            <Text className="text-xs text-slate-500 text-center">Powered by NoParchi</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function passState(ticket: PublicTicket) {
  if (ticket.isUsed) {
    return {
      badge: 'Exited',
      badgeVariant: 'neutral' as const,
      headline: 'Already used',
      instruction: 'This pass has been scanned at the exit and cannot be used again.',
      Icon: XCircle,
      color: theme.semantic.textMuted,
      ringClass: 'bg-slate-800 border-slate-700',
      textClass: 'text-slate-400',
    };
  }
  if (ticket.status === 'paid') {
    return {
      badge: 'Valid',
      badgeVariant: 'success' as const,
      headline: 'Ready to use',
      instruction: 'Show this QR code to the gatekeeper on your way out.',
      Icon: CheckCircle2,
      color: theme.semantic.accent,
      ringClass: 'bg-emerald-500/10 border-emerald-500/30',
      textClass: 'text-emerald-400',
    };
  }
  if (ticket.status === 'pending') {
    return {
      badge: 'Awaiting payment',
      badgeVariant: 'warning' as const,
      headline: 'Not valid yet',
      instruction:
        'Show this code to the staff once you have paid. They will activate it, and this page will update on its own.',
      Icon: Clock,
      color: theme.semantic.warning,
      ringClass: 'bg-amber-500/10 border-amber-500/30',
      textClass: 'text-amber-400',
    };
  }
  return {
    badge: ticket.status,
    badgeVariant: 'danger' as const,
    headline: 'This pass is not valid',
    instruction: 'Please speak to the staff at the counter.',
    Icon: XCircle,
    color: theme.semantic.danger,
    ringClass: 'bg-rose-500/10 border-rose-500/30',
    textClass: 'text-rose-400',
  };
}

const Row: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
  icon?: React.ReactNode;
}> = ({ label, value, highlight, icon }) => (
  <View className="flex-row items-center justify-between gap-3">
    <View className="flex-row items-center gap-1.5">
      {icon}
      <Text className="text-xs text-slate-400">{label}</Text>
    </View>
    <Text
      numberOfLines={1}
      className={`text-sm font-bold ${highlight ? 'text-emerald-400' : 'text-slate-100'}`}
    >
      {value}
    </Text>
  </View>
);
