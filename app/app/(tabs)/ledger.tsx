import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, RefreshControl } from 'react-native';
import { Search, BookOpen, ShieldCheck, Car, MessageSquare, CheckCircle2, AlertTriangle, TimerReset, Clock } from 'lucide-react-native';
import { useThemeColors } from '../../../src/context/ThemeContext';
import { useAuth } from '../../../src/context/AuthContext';
import { useApp } from '../../../src/context/AppContext';
import { TopBar } from '../../../components/nav/TopBar';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { DateFilter } from '../../../components/ui/DateFilter';
import { RoleGate } from '../../../components/ui/RoleGate';
import { PassDeliveryModal } from '../../../components/ui/PassDeliveryModal';
import { transactionService } from '../../../src/services/transactionService';
import { formatCurrency, formatDateTime } from '../../../src/utils/formatters';
import { formatDuration } from '../../../src/config/pricing';
import type { Transaction } from '../../../src/types';

export default function LedgerScreen() {
  const colors = useThemeColors();
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
      setError(err instanceof Error ? err.message : 'Could not confirm the payment.');
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
      setError(err instanceof Error ? err.message : 'Could not confirm the extension.');
    } finally {
      setExtendingCode(null);
    }
  };

  if (!merchant) return null;

  return (
    <View className="flex-1 bg-brand-bg">
      <TopBar title="Ledger" subtitle="Every pass, every rupee" />

      <RoleGate permission="can_view_ledger" title="Ledger is off for your account">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => refresh({ silent: true })}
              tintColor={colors['accent']}
              colors={[colors['accent']]}
            />
          }
        >
          <View className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5">
            <DateFilter selected={range} onSelect={setRange} />

            <View className="flex-row items-center gap-2 bg-brand-surface border border-brand-border rounded-2xl px-4 py-2.5 my-4">
              <Search size={16} color={colors['text-muted']} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search code, vehicle or payment reference"
                placeholderTextColor={colors['text-faint']}
                className="flex-1 text-brand-text text-sm"
              />
            </View>

            <View className="flex-row flex-wrap gap-3 mb-5">
              <SummaryTile label="Collected" value={formatCurrency(totals.collected, merchant.currency)} accent />
              <SummaryTile label="Passes" value={String(totals.count)} />
              <SummaryTile label="Awaiting payment" value={String(totals.awaiting)} warn={totals.awaiting > 0} />
            </View>

            {error && (
              <Card className="mb-4 border-brand-danger/40 bg-brand-danger/5">
                <Text className="text-xs text-brand-danger leading-4">{error}</Text>
              </Card>
            )}

            {filtered.length === 0 ? (
              <Card className="items-center py-12">
                <BookOpen size={34} color={colors['text-faint']} />
                <Text className="text-sm font-semibold text-brand-text-muted mt-3">
                  Nothing in this period
                </Text>
                <Text className="text-xs text-brand-text-faint mt-1 text-center">
                  Try a wider date range.
                </Text>
              </Card>
            ) : (
              <View className="gap-3">
                {filtered.map((tx) => (
                  <LedgerRow
                    key={tx.id}
                    transaction={tx}
                    currency={merchant.currency}
                    canConfirm={can('can_issue_passes')}
                    confirming={confirmingCode === tx.ticketCode}
                    extending={extendingCode === tx.ticketCode}
                    onConfirm={() => confirmPayment(tx)}
                    onConfirmExtension={() => confirmExtension(tx)}
                    onDeliver={() => setDeliverFor(tx)}
                  />
                ))}
              </View>
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

const SummaryTile: React.FC<{ label: string; value: string; accent?: boolean; warn?: boolean }> = ({
  label,
  value,
  accent,
  warn,
}) => (
  <View
    className={`flex-1 min-w-[130px] rounded-2xl border p-3.5 ${
      accent
        ? 'bg-brand-accent/10 border-brand-accent/30'
        : warn
          ? 'bg-brand-warning/10 border-brand-warning/30'
          : 'bg-brand-surface border-brand-border'
    }`}
  >
    <Text className="text-[11px] text-brand-text-muted uppercase font-semibold tracking-wider">
      {label}
    </Text>
    <Text
      className={`text-xl font-extrabold mt-1 ${
        accent ? 'text-brand-accent' : warn ? 'text-brand-warning' : 'text-brand-text'
      }`}
    >
      {value}
    </Text>
  </View>
);

const LedgerRow: React.FC<{
  transaction: Transaction;
  currency: string;
  canConfirm: boolean;
  confirming: boolean;
  extending: boolean;
  onConfirm: () => void;
  onConfirmExtension: () => void;
  onDeliver: () => void;
}> = ({
  transaction,
  currency,
  canConfirm,
  confirming,
  extending,
  onConfirm,
  onConfirmExtension,
  onDeliver,
}) => {
  const colors = useThemeColors();
  const exited = Boolean(transaction.validation);
  const pending = transaction.status === 'pending';
  const expired =
    !exited &&
    transaction.status === 'paid' &&
    Boolean(transaction.expiresAt) &&
    new Date(transaction.expiresAt!).getTime() < Date.now();
  const extension = transaction.pendingExtension;

  return (
    <Card className="p-3.5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-row items-start gap-3 flex-1 min-w-0">
          <View
            className={`w-9 h-9 rounded-xl items-center justify-center shrink-0 border ${
              pending
                ? 'bg-brand-warning/10 border-brand-warning/30'
                : exited
                  ? 'bg-brand-accent/10 border-brand-accent/30'
                  : 'bg-brand-info/10 border-brand-info/30'
            }`}
          >
            {pending ? (
              <AlertTriangle size={17} color={colors['warning']} />
            ) : exited ? (
              <ShieldCheck size={17} color={colors['accent']} />
            ) : (
              <Car size={17} color={colors['info']} />
            )}
          </View>

          <View className="flex-1 min-w-0">
            <View className="flex-row items-center flex-wrap gap-2">
              <Text className="text-sm font-bold text-brand-text uppercase">
                {transaction.vehicleNumber || transaction.ticketTypeLabel}
              </Text>
              <Badge
                label={pending ? 'Unpaid' : exited ? 'Exited' : expired ? 'Time over' : 'Inside'}
                variant={pending ? 'warning' : exited ? 'success' : expired ? 'danger' : 'info'}
                size="sm"
              />
              {transaction.extensionCount > 0 && (
                <Badge label={`+${transaction.extensionCount}`} variant="neutral" size="sm" />
              )}
            </View>
            <Text className="text-[11px] font-mono text-brand-text-muted mt-0.5">
              {transaction.ticketCode}
            </Text>
            <Text className="text-[11px] text-brand-text-faint mt-0.5">
              {formatDateTime(transaction.createdAt)}
              {transaction.validation
                ? ` · exited ${formatDateTime(transaction.validation.scannedAt)}`
                : transaction.expiresAt
                  ? ` · ${expired ? 'expired' : 'until'} ${formatDateTime(transaction.expiresAt)}`
                  : ''}
            </Text>
            {transaction.overstayAmount > 0 && (
              <Text className="text-[11px] text-brand-warning mt-0.5">
                Overstay collected: {formatCurrency(transaction.overstayAmount, currency)}
              </Text>
            )}
          </View>
        </View>

        <View className="items-end shrink-0 gap-2">
          <Text className="text-base font-extrabold text-brand-accent">
            {formatCurrency(transaction.amount, currency)}
          </Text>
          <TouchableOpacity
            onPress={onDeliver}
            accessibilityLabel="Send pass on WhatsApp"
            className="p-1.5 rounded-lg bg-brand-surface-raised active:bg-brand-surface-raised"
          >
            <MessageSquare size={14} color={colors['accent-soft']} />
          </TouchableOpacity>
        </View>
      </View>

      {pending && canConfirm && (
        <View className="mt-3 pt-3 border-t border-brand-border">
          <Button
            title="Payment received — make pass valid"
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
        <View className="mt-3 pt-3 border-t border-brand-border">
          <View className="flex-row items-center gap-1.5 mb-2">
            <Clock size={12} color={colors['warning']} />
            <Text className="text-[11px] text-brand-warning font-semibold">
              Extension requested · {formatCurrency(extension.amount, currency)} for{' '}
              {formatDuration(extension.minutes)}
            </Text>
          </View>
          <Button
            title={`Extension paid — extend to ${formatDateTime(extension.extendsTo)}`}
            variant="secondary"
            size="sm"
            fullWidth
            loading={extending}
            icon={<TimerReset size={14} color={colors['accent']} />}
            onPress={onConfirmExtension}
          />
        </View>
      )}
    </Card>
  );
};
