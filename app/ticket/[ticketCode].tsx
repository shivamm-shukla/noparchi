import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  TimerReset,
  IndianRupee,
} from 'lucide-react-native';
import theme from '../../src/config/theme';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { checkoutService } from '../../src/services/checkoutService';
import { paymentProvider } from '../../src/services/payment';
import { passUrl } from '../../src/utils/links';
import { formatDuration } from '../../src/config/pricing';
import { formatCurrency, formatDateTime } from '../../src/utils/formatters';
import type { PublicTicket } from '../../src/types';

/**
 * The customer's pass, with its clock.
 *
 * This is where the expiry loop closes. The WhatsApp reminder links straight
 * here, so the countdown and the Extend button have to be the first things a
 * customer sees - they arrive already knowing their time is nearly up and
 * wanting one decision, not a receipt to read.
 */
export default function TicketScreen() {
  const { ticketCode } = useLocalSearchParams<{ ticketCode: string }>();
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extending, setExtending] = useState(false);
  const [extendPayUrl, setExtendPayUrl] = useState<string | null>(null);

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

  /**
   * Poll while anything is still moving: a pending payment, a pending
   * extension, or a live countdown. The customer should watch their pass turn
   * valid rather than be told to refresh - and after an extension is confirmed
   * at the counter, the new time appears on its own.
   */
  const shouldPoll =
    ticket?.status === 'pending' ||
    Boolean(ticket?.pendingExtension) ||
    (ticket?.status === 'paid' && !ticket.isUsed && Boolean(ticket.expiresAt));

  useEffect(() => {
    if (!shouldPoll) return;
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [shouldPoll, load]);

  const remaining = useCountdown(ticket?.expiresAt ?? null);

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

  const extend = async () => {
    if (!ticket) return;
    setExtending(true);
    setError(null);
    try {
      const started = await checkoutService.startExtension(ticket.ticketCode);

      const provider = paymentProvider(ticket.merchant.paymentProvider);
      const result = await provider.begin({
        merchantId: ticket.merchant.id,
        merchantName: ticket.merchant.businessName,
        upiId: ticket.merchant.upiId,
        ticketCode: ticket.ticketCode,
        amount: started.amount,
        currency: ticket.merchant.currency,
        note: `${ticket.merchant.businessName} extension`,
        extensionId: started.extensionId,
      });

      if (result.outcome === 'failed') {
        setError(result.error ?? 'Could not start the payment.');
        return;
      }
      setExtendPayUrl(result.payUrl ?? null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not extend the pass.');
    } finally {
      setExtending(false);
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

  const state = passState(ticket, remaining);

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
          {/*
            The clock sits above the QR on purpose. Someone arriving from a
            "your time is nearly up" message needs the number and the button,
            not to scroll past a receipt to find them.
          */}
          {ticket.status === 'paid' && !ticket.isUsed && ticket.expiresAt && (
            <CountdownCard
              ticket={ticket}
              remaining={remaining}
              extending={extending}
              payUrl={extendPayUrl}
              onExtend={extend}
            />
          )}

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
              {ticket.extensionCount > 0 && (
                <Row
                  label="Extended"
                  value={`${ticket.extensionCount} time${ticket.extensionCount > 1 ? 's' : ''}`}
                />
              )}
              <Row
                label="Issued"
                value={formatDateTime(ticket.issuedAt)}
                icon={<Clock size={13} color={theme.semantic.textMuted} />}
              />
              {ticket.expiresAt ? (
                <Row label="Valid until" value={formatDateTime(ticket.expiresAt)} />
              ) : null}
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

          {error && (
            <View className="flex-row items-start gap-2 mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
              <AlertCircle size={14} color={theme.semantic.danger} />
              <Text className="text-xs text-rose-300 flex-1 leading-4">{error}</Text>
            </View>
          )}

          <View className="flex-row items-center justify-center gap-2">
            <ShieldCheck size={14} color={theme.semantic.accent} />
            <Text className="text-xs text-slate-500 text-center">Powered by NoParchi</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// -----------------------------------------------------------------------------

interface Remaining {
  totalMs: number;
  expired: boolean;
  label: string;
}

/**
 * Ticks once a second, so the last minute genuinely counts down.
 *
 * Derived from the expiry timestamp on every tick rather than decremented, so a
 * backgrounded tab or a phone that slept wakes up showing the right number
 * instead of however far its own counter got.
 */
function useCountdown(expiresAt: string | null): Remaining | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return useMemo(() => {
    if (!expiresAt) return null;
    const totalMs = new Date(expiresAt).getTime() - now;
    const expired = totalMs <= 0;
    const abs = Math.abs(totalMs);

    const hours = Math.floor(abs / 3600000);
    const minutes = Math.floor((abs % 3600000) / 60000);
    const seconds = Math.floor((abs % 60000) / 1000);

    const label =
      hours > 0
        ? `${hours}h ${String(minutes).padStart(2, '0')}m`
        : `${minutes}:${String(seconds).padStart(2, '0')}`;

    return { totalMs, expired, label };
  }, [expiresAt, now]);
}

const CountdownCard: React.FC<{
  ticket: PublicTicket;
  remaining: Remaining | null;
  extending: boolean;
  payUrl: string | null;
  onExtend: () => void;
}> = ({ ticket, remaining, extending, payUrl, onExtend }) => {
  if (!remaining) return null;

  const pending = ticket.pendingExtension;
  // Under half an hour is when the reminder goes out, so it is also when this
  // card should start looking urgent.
  const urgent = !remaining.expired && remaining.totalMs < 30 * 60 * 1000;

  const tone = remaining.expired
    ? { border: 'border-rose-500/50', bg: 'bg-rose-500/10', text: 'text-rose-300' }
    : urgent
      ? { border: 'border-amber-500/50', bg: 'bg-amber-500/10', text: 'text-amber-300' }
      : { border: 'border-emerald-500/40', bg: 'bg-emerald-500/5', text: 'text-emerald-300' };

  return (
    <Card className={`${tone.border} ${tone.bg} p-5 mb-5 items-center`}>
      <Text className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
        {remaining.expired ? 'Time over by' : 'Time left'}
      </Text>
      <Text className={`text-5xl font-extrabold tracking-tight mt-1 ${tone.text}`}>
        {remaining.label}
      </Text>
      <Text className="text-[11px] text-slate-400 mt-1">
        {remaining.expired ? 'Expired' : 'Valid until'} {formatDateTime(ticket.expiresAt!)}
      </Text>

      {/* An expired pass owes money at the gate. Say the number plainly here so
          it is not a surprise handed over by a gatekeeper. */}
      {remaining.expired && ticket.overstayDue > 0 && (
        <View className="flex-row items-center gap-1.5 mt-3 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/40">
          <IndianRupee size={14} color={theme.semantic.danger} />
          <Text className="text-xs font-bold text-rose-200">
            {formatCurrency(ticket.overstayDue)} due at the exit
          </Text>
        </View>
      )}

      {pending ? (
        <View className="w-full mt-5 items-center">
          <Text className="text-xs font-bold text-slate-200 text-center mb-1">
            Pay {formatCurrency(pending.amount)} for {formatDuration(pending.minutes)} more
          </Text>
          <Text className="text-[11px] text-slate-400 text-center mb-4 leading-4">
            Your extra time starts once the staff confirm the payment. This page updates on its
            own.
          </Text>

          {payUrl && (
            <View className="p-3 bg-white rounded-2xl mb-3">
              <QRCode
                value={payUrl}
                size={150}
                color={theme.semantic.onPaper}
                backgroundColor={theme.semantic.paper}
              />
            </View>
          )}

          <View className="flex-row items-center gap-2 px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800">
            <Clock size={12} color={theme.semantic.warning} />
            <Text className="text-[11px] font-semibold text-slate-300">
              Waiting for payment confirmation
            </Text>
          </View>
        </View>
      ) : ticket.canExtend ? (
        <View className="w-full mt-4">
          <Button
            title={
              ticket.extensionAmount !== null && ticket.extensionMinutes !== null
                ? `Extend ${formatDuration(ticket.extensionMinutes)} · ${formatCurrency(ticket.extensionAmount)}`
                : 'Extend my time'
            }
            variant="primary"
            size="lg"
            fullWidth
            loading={extending}
            icon={<TimerReset size={17} color={theme.semantic.onAccent} />}
            onPress={onExtend}
          />
          {!remaining.expired && (
            <Text className="text-[11px] text-slate-500 text-center mt-2 leading-4">
              Extending now costs the same as the overstay would — never more.
            </Text>
          )}
        </View>
      ) : null}
    </Card>
  );
};

function passState(ticket: PublicTicket, remaining: Remaining | null) {
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
  if (ticket.status === 'paid' && remaining?.expired) {
    return {
      badge: 'Time over',
      badgeVariant: 'warning' as const,
      headline: 'Your time has run out',
      instruction:
        ticket.overstayDue > 0
          ? 'Extend above, or pay the overstay to the gatekeeper on your way out.'
          : 'Extend above, or show this at the exit.',
      Icon: Clock,
      color: theme.semantic.warning,
      ringClass: 'bg-amber-500/10 border-amber-500/30',
      textClass: 'text-amber-400',
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
