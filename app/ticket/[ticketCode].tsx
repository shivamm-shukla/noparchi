import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform, Share } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { useThemeColors } from '../../src/context/ThemeContext';
import { Card } from '../../components/ui/Card';
import { MerchantLogo } from '../../components/ui/MerchantLogo';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { AdmitCardView } from '../../components/scholarship/AdmitCardView';
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
 *
 * Every string is a translation key, including the ones passState builds - it
 * takes `t` rather than reading i18next itself, so the state wording stays a
 * pure function of the ticket and the language.
 */
export default function TicketScreen() {
  const colors = useThemeColors();
  const { t } = useTranslation();
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
      setError(err instanceof Error ? err.message : t('pass.notFound'));
    } finally {
      setLoading(false);
    }
  }, [ticketCode, t]);

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
    const message = t('pass.shareMessage', {
      business: ticket.merchant.businessName,
      code: ticket.ticketCode,
      url: url ?? '',
    });
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: t('pass.shareTitle'), text: message }).catch(() => {});
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
        setError(result.error ?? t('pass.paymentFailed'));
        return;
      }
      setExtendPayUrl(result.payUrl ?? null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('pass.extendFailed'));
    } finally {
      setExtending(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center">
        <ActivityIndicator size="large" color={colors['accent']} />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center p-6">
        <Card className="w-full max-w-md items-center p-6">
          <AlertCircle size={28} color={colors['warning']} />
          <Text className="text-base font-bold text-brand-text mt-3 text-center">
            {error ?? t('pass.notFound')}
          </Text>
          <Text className="text-xs text-brand-text-muted mt-2 text-center leading-4">
            {t('pass.notFoundHelp')}
          </Text>
        </Card>
      </View>
    );
  }

  if (ticket.merchant.operatingMode === 'SCHOLARSHIP_TEST') {
    return (
      <View className="flex-1 bg-brand-bg">
        <View className="bg-brand-surface border-b border-brand-border px-4 py-4 print:hidden">
          <View className="max-w-xl mx-auto w-full flex-row items-center justify-between">
            <Text className="text-sm font-bold text-brand-text">{ticket.merchant.businessName}</Text>
            <Badge
              label={ticket.isUsed || ticket.attendedAt ? t('admitCard.statusAttended') : t('admitCard.statusValid')}
              variant={ticket.isUsed || ticket.attendedAt ? 'neutral' : 'success'}
              size="sm"
            />
          </View>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40, paddingTop: 16 }}>
          <View className="max-w-xl mx-auto w-full px-4">
            <AdmitCardView ticket={ticket} />
          </View>
        </ScrollView>
      </View>
    );
  }

  const state = passState(ticket, remaining, colors, t);

  return (
    <View className="flex-1 bg-brand-bg">
      <View className="bg-brand-surface border-b border-brand-border px-4 py-4">
        <View className="max-w-lg mx-auto w-full flex-row items-center justify-between">
          <Text className="text-sm font-bold text-brand-text">{t('pass.header')}</Text>
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

            <View className="flex-row items-center gap-2 mb-0.5">
              <MerchantLogo
                name={ticket.merchant.businessName}
                logoUrl={ticket.merchant.branding?.logoUrl}
                size={26}
              />
              <Text className="text-xl font-extrabold text-brand-text text-center">
                {ticket.merchant.businessName}
              </Text>
            </View>
            <Text className="text-xs text-brand-text-muted text-center mb-1">
              {ticket.merchant.location}
            </Text>
            <Text className={`text-sm font-bold text-center mb-4 ${state.textClass}`}>
              {state.headline}
            </Text>

            <View className="p-4 bg-brand-paper rounded-3xl items-center mb-4 border-4 border-brand-accent/20">
              <QRCode
                value={passUrl(ticket.ticketCode) ?? ticket.ticketCode}
                size={180}
                color={colors['on-paper']}
                backgroundColor={colors['paper']}
              />
              <Text className="text-brand-on-accent font-mono font-extrabold text-sm mt-2 tracking-wider">
                {ticket.ticketCode}
              </Text>
            </View>

            <Text className="text-xs text-brand-text-muted text-center mb-5 leading-4">
              {state.instruction}
            </Text>

            <View className="w-full rounded-2xl bg-brand-bg/80 border border-brand-border p-4 gap-3">
              <Row label={t('pass.rowType')} value={ticket.typeLabel} />
              {ticket.vehicleNumber ? (
                <Row label={t('pass.rowVehicle')} value={ticket.vehicleNumber} />
              ) : null}
              <Row label={t('pass.rowAmount')} value={formatCurrency(ticket.amount)} highlight />
              {ticket.extensionCount > 0 && (
                <Row
                  label={t('pass.rowExtended')}
                  value={t('pass.times', { count: ticket.extensionCount })}
                />
              )}
              <Row
                label={t('pass.rowIssued')}
                value={formatDateTime(ticket.issuedAt)}
                icon={<Clock size={13} color={colors['text-muted']} />}
              />
              {ticket.expiresAt ? (
                <Row label={t('pass.rowValidUntil')} value={formatDateTime(ticket.expiresAt)} />
              ) : null}
              {ticket.usedAt ? (
                <Row label={t('pass.rowExited')} value={formatDateTime(ticket.usedAt)} />
              ) : null}
            </View>

            <View className="flex-row gap-3 w-full mt-5">
              <Button
                title={t('pass.share')}
                variant="secondary"
                className="flex-1"
                icon={<Share2 size={15} color={colors['text']} />}
                onPress={share}
              />
              <Button
                title={t('pass.refresh')}
                variant="outline"
                className="flex-1"
                icon={<RefreshCw size={15} color={colors['text-muted']} />}
                onPress={load}
              />
            </View>
          </Card>

          {error && (
            <View className="flex-row items-start gap-2 mb-4 p-3 rounded-xl bg-brand-danger/10 border border-brand-danger/30">
              <AlertCircle size={14} color={colors['danger']} />
              <Text className="text-xs text-brand-danger flex-1 leading-4">{error}</Text>
            </View>
          )}

          <View className="flex-row items-center justify-center gap-2">
            <ShieldCheck size={14} color={colors['accent']} />
            <Text className="text-xs text-brand-text-faint text-center">
              {t('pass.poweredBy')}
            </Text>
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
  const { t, i18n } = useTranslation();
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

    // The hour form carries unit letters and has to be translated; the
    // mm:ss form is the same in any language, so it is built here.
    const label =
      hours > 0
        ? t('pass.countdownHoursMinutes', {
            hours,
            minutes: String(minutes).padStart(2, '0'),
          })
        : `${minutes}:${String(seconds).padStart(2, '0')}`;

    return { totalMs, expired, label };
    // i18n.language is a dependency because t() is stable across a language
    // change but its output is not.
  }, [expiresAt, now, t, i18n.language]);
}

const CountdownCard: React.FC<{
  ticket: PublicTicket;
  remaining: Remaining | null;
  extending: boolean;
  payUrl: string | null;
  onExtend: () => void;
}> = ({ ticket, remaining, extending, payUrl, onExtend }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  if (!remaining) return null;

  const pending = ticket.pendingExtension;
  // Under half an hour is when the reminder goes out, so it is also when this
  // card should start looking urgent.
  const urgent = !remaining.expired && remaining.totalMs < 30 * 60 * 1000;

  const tone = remaining.expired
    ? { border: 'border-brand-danger/50', bg: 'bg-brand-danger/10', text: 'text-brand-danger' }
    : urgent
      ? { border: 'border-brand-warning/50', bg: 'bg-brand-warning/10', text: 'text-brand-warning' }
      : { border: 'border-brand-accent/40', bg: 'bg-brand-accent/5', text: 'text-brand-accent' };

  return (
    <Card className={`${tone.border} ${tone.bg} p-5 mb-5 items-center`}>
      <Text className="text-[11px] font-bold uppercase tracking-widest text-brand-text-muted">
        {t(remaining.expired ? 'pass.timeOverBy' : 'pass.timeLeft')}
      </Text>
      <Text className={`text-5xl font-extrabold tracking-tight mt-1 ${tone.text}`}>
        {remaining.label}
      </Text>
      <Text className="text-[11px] text-brand-text-muted mt-1">
        {t(remaining.expired ? 'pass.expiredAt' : 'pass.validUntilAt', {
          time: formatDateTime(ticket.expiresAt!),
        })}
      </Text>

      {/* An expired pass owes money at the gate. Say the number plainly here so
          it is not a surprise handed over by a gatekeeper. */}
      {remaining.expired && ticket.overstayDue > 0 && (
        <View className="flex-row items-center gap-1.5 mt-3 px-3 py-2 rounded-xl bg-brand-danger/15 border border-brand-danger/40">
          <IndianRupee size={14} color={colors['danger']} />
          <Text className="text-xs font-bold text-brand-danger">
            {t('pass.overstayDue', { amount: formatCurrency(ticket.overstayDue) })}
          </Text>
        </View>
      )}

      {pending ? (
        <View className="w-full mt-5 items-center">
          <Text className="text-xs font-bold text-brand-text text-center mb-1">
            {t('pass.extendPendingTitle', {
              amount: formatCurrency(pending.amount),
              duration: formatDuration(pending.minutes),
            })}
          </Text>
          <Text className="text-[11px] text-brand-text-muted text-center mb-4 leading-4">
            {t('pass.extendPendingBody')}
          </Text>

          {payUrl && (
            <View className="p-3 bg-brand-paper rounded-2xl mb-3">
              <QRCode
                value={payUrl}
                size={150}
                color={colors['on-paper']}
                backgroundColor={colors['paper']}
              />
            </View>
          )}

          <View className="flex-row items-center gap-2 px-3 py-2 rounded-xl bg-brand-bg/70 border border-brand-border">
            <Clock size={12} color={colors['warning']} />
            <Text className="text-[11px] font-semibold text-brand-text-subtle">
              {t('pass.awaitingConfirmation')}
            </Text>
          </View>
        </View>
      ) : ticket.canExtend ? (
        <View className="w-full mt-4">
          <Button
            title={
              ticket.extensionAmount !== null && ticket.extensionMinutes !== null
                ? t('pass.extendWithTerms', {
                    duration: formatDuration(ticket.extensionMinutes),
                    amount: formatCurrency(ticket.extensionAmount),
                  })
                : t('pass.extend')
            }
            variant="primary"
            size="lg"
            fullWidth
            loading={extending}
            icon={<TimerReset size={17} color={colors['on-accent']} />}
            onPress={onExtend}
          />
          {!remaining.expired && (
            <Text className="text-[11px] text-brand-text-faint text-center mt-2 leading-4">
              {t('pass.sameAsOverstay')}
            </Text>
          )}
        </View>
      ) : null}
    </Card>
  );
};

function passState(
  ticket: PublicTicket,
  remaining: Remaining | null,
  colors: Record<string, string>,
  t: TFunction
) {
  if (ticket.isUsed) {
    return {
      badge: t('pass.usedBadge'),
      badgeVariant: 'neutral' as const,
      headline: t('pass.usedHeadline'),
      instruction: t('pass.usedInstruction'),
      Icon: XCircle,
      color: colors['text-muted'],
      ringClass: 'bg-brand-surface-raised border-brand-border-strong',
      textClass: 'text-brand-text-muted',
    };
  }
  if (ticket.status === 'paid' && remaining?.expired) {
    return {
      badge: t('pass.overBadge'),
      badgeVariant: 'warning' as const,
      headline: t('pass.overHeadline'),
      instruction: t(
        ticket.overstayDue > 0 ? 'pass.overInstructionDue' : 'pass.overInstruction'
      ),
      Icon: Clock,
      color: colors['warning'],
      ringClass: 'bg-brand-warning/10 border-brand-warning/30',
      textClass: 'text-brand-warning',
    };
  }
  if (ticket.status === 'paid') {
    return {
      badge: t('pass.validBadge'),
      badgeVariant: 'success' as const,
      headline: t('pass.validHeadline'),
      instruction: t('pass.validInstruction'),
      Icon: CheckCircle2,
      color: colors['accent'],
      ringClass: 'bg-brand-accent/10 border-brand-accent/30',
      textClass: 'text-brand-accent',
    };
  }
  if (ticket.status === 'pending') {
    return {
      badge: t('pass.unpaidBadge'),
      badgeVariant: 'warning' as const,
      headline: t('pass.unpaidHeadline'),
      instruction: t('pass.unpaidInstruction'),
      Icon: Clock,
      color: colors['warning'],
      ringClass: 'bg-brand-warning/10 border-brand-warning/30',
      textClass: 'text-brand-warning',
    };
  }
  // Anything else is a status the customer should not be reading anyway - the
  // raw value is left in the badge deliberately, so a refunded or cancelled
  // pass is at least identifiable to the staff member they are told to ask.
  return {
    badge: ticket.status,
    badgeVariant: 'danger' as const,
    headline: t('pass.invalidHeadline'),
    instruction: t('pass.invalidInstruction'),
    Icon: XCircle,
    color: colors['danger'],
    ringClass: 'bg-brand-danger/10 border-brand-danger/30',
    textClass: 'text-brand-danger',
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
      <Text className="text-xs text-brand-text-muted">{label}</Text>
    </View>
    <Text
      numberOfLines={1}
      className={`text-sm font-bold ${highlight ? 'text-brand-accent' : 'text-brand-text'}`}
    >
      {value}
    </Text>
  </View>
);
