import React, { useMemo, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, RefreshControl } from 'react-native';
import {
  Search,
  BookOpen,
  ShieldCheck,
  Car,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  TimerReset,
  Clock,
  X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../src/context/ThemeContext';
import { useAuth } from '../../../src/context/AuthContext';
import { useApp } from '../../../src/context/AppContext';
import { TopBar } from '../../../components/nav/TopBar';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Text } from '../../../components/ui/Text';
import { Row } from '../../../components/ui/Row';
import { StatCard } from '../../../components/ui/StatCard';
import { DateFilter } from '../../../components/ui/DateFilter';
import { RoleGate } from '../../../components/ui/RoleGate';
import { PassDeliveryModal } from '../../../components/ui/PassDeliveryModal';
import { transactionService } from '../../../src/services/transactionService';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatTime,
  dayKey,
  daysAgo,
} from '../../../src/utils/formatters';
import { formatDuration } from '../../../src/config/pricing';
import type { Transaction } from '../../../src/types';

interface DayGroup {
  key: string;
  /** Already translated: "Today", "Yesterday", or a formatted date. */
  label: string;
  rows: Transaction[];
  collected: number;
}

export default function LedgerScreen() {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { merchant, can } = useAuth();
  const { transactions, range, setRange, isRefreshing, refresh, applyOptimistic } = useApp();

  const [query, setQuery] = useState('');
  const [deliverFor, setDeliverFor] = useState<Transaction | null>(null);
  const [confirmingCode, setConfirmingCode] = useState<string | null>(null);
  const [extendingCode, setExtendingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter(
      (tx) =>
        tx.ticketCode.toLowerCase().includes(q) ||
        tx.vehicleNumber?.toLowerCase().includes(q) ||
        tx.paymentRef?.toLowerCase().includes(q) ||
        tx.ticketTypeLabel.toLowerCase().includes(q)
    );
  }, [transactions, query]);

  /**
   * Rows grouped by the day they were issued, newest first.
   *
   * A flat list of forty rows makes an owner count backwards to work out where
   * yesterday ended. The header carries that day's own total, which is the
   * number they were scrolling to find.
   */
  const groups = useMemo<DayGroup[]>(() => {
    const byDay = new Map<string, DayGroup>();

    for (const tx of filtered) {
      const key = dayKey(tx.createdAt);
      let group = byDay.get(key);
      if (!group) {
        const age = daysAgo(tx.createdAt);
        group = {
          key,
          label:
            age === 0
              ? t('ledger.group.today')
              : age === 1
                ? t('ledger.group.yesterday')
                : formatDate(tx.createdAt),
          rows: [],
          collected: 0,
        };
        byDay.set(key, group);
      }
      group.rows.push(tx);
      if (tx.status === 'paid') group.collected += tx.amount;
    }

    return [...byDay.values()].sort(
      (a, b) =>
        new Date(b.rows[0].createdAt).getTime() - new Date(a.rows[0].createdAt).getTime()
    );
  }, [filtered, t]);

  const totals = useMemo(() => {
    const paid = filtered.filter((tx) => tx.status === 'paid');
    return {
      count: filtered.length,
      collected: paid.reduce((sum, tx) => sum + tx.amount, 0),
      awaiting: filtered.filter((tx) => tx.status === 'pending').length,
    };
  }, [filtered]);

  /**
   * Confirm that a customer's UPI payment landed.
   *
   * This is the step that keeps the honour-system hole closed: a customer's
   * checkout leaves the pass pending and unscannable, and only a named staff
   * member who has seen the money can promote it - recorded against their id.
   */
  const confirmPayment = async (tx: Transaction) => {
    setConfirmingCode(tx.ticketCode);
    setError(null);

    // Optimistic: the row flips to paid immediately so the queue keeps moving,
    // and the refresh below reconciles with whatever the server actually did.
    applyOptimistic((current) =>
      current.map((row) => (row.id === tx.id ? { ...row, status: 'paid' } : row))
    );

    try {
      await transactionService.confirmPayment(tx.ticketCode);
      await refresh({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ledger.actions.confirmFailed'));
      await refresh({ silent: true });
    } finally {
      setConfirmingCode(null);
    }
  };

  /**
   * The customer tapped Extend on their pass and paid; a staff member confirms
   * the money arrived. Same accountability as the original payment - the
   * extension does not take effect until a named person says it did.
   */
  const confirmExtension = async (tx: Transaction) => {
    setExtendingCode(tx.ticketCode);
    setError(null);
    try {
      await transactionService.confirmExtension(tx.ticketCode);
      await refresh({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ledger.actions.extensionFailed'));
    } finally {
      setExtendingCode(null);
    }
  };

  if (!merchant) return null;
  const searching = query.trim().length > 0;

  return (
    <View className="flex-1 bg-brand-bg">
      <TopBar title={t('ledger.title')} subtitle={t('ledger.subtitle')} />

      <RoleGate permission="can_view_ledger" title={t('ledger.blockedTitle')}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => refresh({ silent: true })}
              tintColor={colors['accent']}
              colors={[colors['accent']]}
            />
          }
        >
          <View className="mx-auto w-full max-w-4xl gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <DateFilter selected={range} onSelect={setRange} />

            <View className="flex-row items-center gap-2 rounded-control border border-brand-border bg-brand-surface px-3.5 py-2.5">
              <Search size={16} color={colors['text-muted']} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('ledger.search')}
                placeholderTextColor={colors['text-faint']}
                accessibilityLabel={t('ledger.search')}
                className="flex-1 text-sm text-brand-text"
              />
              {searching ? (
                <Pressable
                  onPress={() => setQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                  className="p-1 active:opacity-60"
                >
                  <X size={14} color={colors['text-muted']} />
                </Pressable>
              ) : null}
            </View>

            <View className="flex-row flex-wrap gap-3">
              <StatCard
                label={t('ledger.totals.collected')}
                value={formatCurrency(totals.collected, merchant.currency)}
              />
              <StatCard label={t('ledger.totals.passes')} value={String(totals.count)} />
              <StatCard label={t('ledger.totals.awaiting')} value={String(totals.awaiting)} />
            </View>

            {error && (
              <Card className="border-brand-danger/40">
                <Text font="body" className="text-xs leading-5 text-brand-danger">
                  {error}
                </Text>
              </Card>
            )}

            {groups.length === 0 ? (
              <Card className="items-center gap-1.5 py-12">
                <BookOpen size={30} color={colors['text-faint']} />
                <Text font="body-semibold" className="mt-1 text-sm text-brand-text-subtle">
                  {t(searching ? 'ledger.noMatchTitle' : 'ledger.emptyTitle')}
                </Text>
                <Text font="body" className="text-center text-xs text-brand-text-muted">
                  {t(searching ? 'ledger.noMatchBody' : 'ledger.emptyBody')}
                </Text>
              </Card>
            ) : (
              groups.map((group) => (
                <View key={group.key} className="gap-2">
                  {/*
                    A sticky-feeling date header, the way Mail and Messages
                    break a long list. The day's own total sits opposite it -
                    that is the figure someone scrolling to yesterday came for.
                  */}
                  <View className="flex-row items-baseline justify-between gap-3 px-1">
                    <Text
                      font="display-bold"
                      className="text-[13px] uppercase tracking-wider text-brand-text-subtle"
                    >
                      {group.label}
                    </Text>
                    <Text font="body-medium" className="text-[11px] text-brand-text-muted">
                      {t('ledger.group.dayTotal', {
                        count: group.rows.length,
                        amount: formatCurrency(group.collected, merchant.currency),
                      })}
                    </Text>
                  </View>

                  <Card className="py-0">
                    {group.rows.map((tx, index) => (
                      <LedgerRow
                        key={tx.id}
                        transaction={tx}
                        currency={merchant.currency}
                        divider={index < group.rows.length - 1}
                        canConfirm={can('can_issue_passes')}
                        confirming={confirmingCode === tx.ticketCode}
                        extending={extendingCode === tx.ticketCode}
                        onConfirm={() => confirmPayment(tx)}
                        onConfirmExtension={() => confirmExtension(tx)}
                        onDeliver={() => setDeliverFor(tx)}
                      />
                    ))}
                  </Card>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </RoleGate>

      <PassDeliveryModal
        merchant={merchant}
        transaction={deliverFor}
        visible={Boolean(deliverFor)}
        onClose={() => setDeliverFor(null)}
      />
    </View>
  );
}

const LedgerRow: React.FC<{
  transaction: Transaction;
  currency: string;
  divider: boolean;
  canConfirm: boolean;
  confirming: boolean;
  extending: boolean;
  onConfirm: () => void;
  onConfirmExtension: () => void;
  onDeliver: () => void;
}> = ({
  transaction,
  currency,
  divider,
  canConfirm,
  confirming,
  extending,
  onConfirm,
  onConfirmExtension,
  onDeliver,
}) => {
  const colors = useThemeColors();
  const { t } = useTranslation();

  const exited = Boolean(transaction.validation);
  const pending = transaction.status === 'pending';
  const expired =
    !exited &&
    transaction.status === 'paid' &&
    Boolean(transaction.expiresAt) &&
    new Date(transaction.expiresAt!).getTime() < Date.now();
  const extension = transaction.pendingExtension;
  const hasAction = (pending || Boolean(extension)) && canConfirm;

  const timing = transaction.validation
    ? t('ledger.row.exitedAt', { time: formatTime(transaction.validation.scannedAt) })
    : transaction.expiresAt
      ? t(expired ? 'ledger.row.expiredAt' : 'ledger.row.until', {
          time: formatTime(transaction.expiresAt),
        })
      : null;

  return (
    <View>
      <Row divider={divider && !hasAction}>
        <View
          className={`h-9 w-9 shrink-0 items-center justify-center rounded-control border ${
            pending
              ? 'border-brand-warning/30 bg-brand-warning/10'
              : exited
                ? 'border-brand-accent/30 bg-brand-accent/10'
                : 'border-brand-border bg-brand-surface-alt'
          }`}
        >
          {pending ? (
            <AlertTriangle size={16} color={colors['warning']} />
          ) : exited ? (
            <ShieldCheck size={16} color={colors['accent']} />
          ) : (
            <Car size={16} color={colors['text-muted']} />
          )}
        </View>

        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text
              font="body-semibold"
              numberOfLines={1}
              className="text-[13px] uppercase tracking-wide text-brand-text"
            >
              {transaction.vehicleNumber || transaction.ticketTypeLabel}
            </Text>
            <Badge
              label={t(
                pending
                  ? 'ledger.status.unpaid'
                  : exited
                    ? 'ledger.status.exited'
                    : expired
                      ? 'ledger.status.timeOver'
                      : 'ledger.status.inside'
              )}
              variant={pending ? 'warning' : exited ? 'success' : expired ? 'danger' : 'info'}
              size="sm"
            />
            {transaction.extensionCount > 0 && (
              <Badge
                label={t('ledger.row.extensions', { count: transaction.extensionCount })}
                variant="neutral"
                size="sm"
              />
            )}
          </View>

          <Text font="body" numberOfLines={1} className="text-[11px] text-brand-text-muted">
            {transaction.ticketCode} · {formatDateTime(transaction.createdAt)}
            {timing ? ` · ${timing}` : ''}
          </Text>

          {transaction.overstayAmount > 0 && (
            <Text font="body-medium" className="text-[11px] text-brand-warning">
              {t('ledger.row.overstayCollected', {
                amount: formatCurrency(transaction.overstayAmount, currency),
              })}
            </Text>
          )}
        </View>

        {/*
          The amount is the most prominent thing in the row, in the display
          face - but in the text colour. Every row carrying an accent-green
          figure is how the accent stopped meaning anything.
        */}
        <View className="shrink-0 items-end gap-1.5">
          <Text font="display-bold" className="text-[15px] text-brand-text">
            {formatCurrency(transaction.amount, currency)}
          </Text>
          <Pressable
            onPress={onDeliver}
            accessibilityRole="button"
            accessibilityLabel={t('ledger.row.sendPass')}
            className="rounded-control border border-brand-border bg-brand-surface-alt p-1.5 active:opacity-60"
          >
            <MessageSquare size={13} color={colors['text-subtle']} />
          </Pressable>
        </View>
      </Row>

      {pending && canConfirm && (
        <View className={`pb-3 ${divider ? 'border-b border-brand-border' : ''}`}>
          <Button
            title={t('ledger.actions.confirmPayment')}
            variant="secondary"
            size="sm"
            fullWidth
            loading={confirming}
            icon={<CheckCircle2 size={14} color={colors['accent']} />}
            onPress={onConfirm}
          />
        </View>
      )}

      {/* The customer asked for more time and paid; a person still has to say
          the money arrived before the clock moves. */}
      {extension && canConfirm && (
        <View className={`gap-2 pb-3 ${divider ? 'border-b border-brand-border' : ''}`}>
          <View className="flex-row items-center gap-1.5">
            <Clock size={12} color={colors['warning']} />
            <Text font="body-semibold" className="text-[11px] text-brand-warning">
              {t('ledger.actions.extensionRequested', {
                amount: formatCurrency(extension.amount, currency),
                duration: formatDuration(extension.minutes),
              })}
            </Text>
          </View>
          <Button
            title={t('ledger.actions.confirmExtension', {
              time: formatDateTime(extension.extendsTo),
            })}
            variant="secondary"
            size="sm"
            fullWidth
            loading={extending}
            icon={<TimerReset size={14} color={colors['accent']} />}
            onPress={onConfirmExtension}
          />
        </View>
      )}
    </View>
  );
};
