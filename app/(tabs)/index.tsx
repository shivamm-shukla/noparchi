import React, { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import {
  IndianRupee,
  ScanLine,
  Car,
  Ticket as TicketIcon,
  PlusCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  MessageSquare,
  AlertTriangle,
  X,
  Clock as ClockIcon,
  Timer,
  MessageCircle,
} from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { useApp } from '../../src/context/AppContext';
import { Header } from '../../components/ui/Header';
import { StatsCard } from '../../components/ui/StatsCard';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CustomBrandedQR } from '../../components/ui/CustomBrandedQR';
import { NewTicketModal } from '../../components/ui/NewTicketModal';
import { PassDeliveryModal } from '../../components/ui/PassDeliveryModal';
import { messagingProvider } from '../../src/services/messaging';
import { passUrl } from '../../src/utils/links';
import { formatCurrency, formatTimeAgo, formatDateTime } from '../../src/utils/formatters';
import type { ExpiringPass, Merchant, Transaction } from '../../src/types';

export default function DashboardScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { user, merchant, can } = useAuth();
  const {
    stats,
    transactions,
    ticketTypes,
    expiringPasses,
    isLoading,
    isRefreshing,
    error,
    syncConflicts,
    dismissConflicts,
    refresh,
  } = useApp();

  const [issueVisible, setIssueVisible] = useState(false);
  const [deliverFor, setDeliverFor] = useState<Transaction | null>(null);

  if (!merchant || !user) return null;

  const canSeeLedger = can('can_view_ledger');
  const canIssue = can('can_issue_passes');
  const recent = transactions.slice(0, 8);

  return (
    <View className="flex-1 bg-brand-bg">
      <Header
        title={merchant.businessName}
        subtitle={merchant.location || 'Live operations'}
        rightAction={
          canIssue ? (
            <Button
              title="Issue pass"
              size="sm"
              variant="primary"
              icon={<PlusCircle size={14} color={colors['on-accent']} />}
              onPress={() => setIssueVisible(true)}
            />
          ) : undefined
        }
      />

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
        <View className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5">
          {/*
            Offline scans the server refused on sync. Shown prominently rather
            than logged, because each one is a customer who left the venue on a
            pass another device had already cleared - the owner needs to know.
          */}
          {syncConflicts.length > 0 && (
            <Card className="mb-5 border-brand-warning/40 bg-brand-warning/5">
              <View className="flex-row items-start gap-3">
                <AlertTriangle size={18} color={colors['warning']} />
                <View className="flex-1">
                  <Text className="text-sm font-bold text-brand-warning mb-1">
                    {syncConflicts.length} offline scan
                    {syncConflicts.length > 1 ? 's were' : ' was'} rejected on sync
                  </Text>
                  {syncConflicts.slice(0, 3).map((c) => (
                    <Text key={c.ticketCode} className="text-xs text-brand-warning/80 leading-4">
                      {c.ticketCode} — {c.message}
                    </Text>
                  ))}
                </View>
                <TouchableOpacity onPress={dismissConflicts} className="p-1">
                  <X size={14} color={colors['warning']} />
                </TouchableOpacity>
              </View>
            </Card>
          )}

          {error && (
            <Card className="mb-5 border-brand-danger/40 bg-brand-danger/5">
              <Text className="text-xs text-brand-danger leading-4">{error}</Text>
            </Card>
          )}

          <View className="flex-row flex-wrap items-center justify-between gap-3 bg-brand-surface border border-brand-border rounded-2xl p-4 mb-6">
            <View>
              <Text className="text-base sm:text-lg font-bold text-brand-text">
                Welcome back, {user.name.split(' ')[0]}
              </Text>
              <Text className="text-xs text-brand-text-muted">
                {user.isOwner
                  ? 'Owner — full access'
                  : 'Gatekeeper — scanner and today’s activity'}
              </Text>
            </View>
            <Badge
              label={user.isOwner ? 'Owner' : 'Staff'}
              variant={user.isOwner ? 'emerald' : 'info'}
            />
          </View>

          {/*
            Revenue is only rendered when the server said this account may see
            it. stats.revenue is null otherwise - the figure never leaves the
            database, so hiding the tile is presentation, not protection.
          */}
          <View className="flex-row flex-wrap gap-3 sm:gap-4 mb-6">
            {stats?.canViewRevenue && (
              <StatsCard
                title="Revenue today"
                value={formatCurrency(stats.revenue ?? 0, merchant.currency)}
                trend={
                  stats.growthPercent === null
                    ? undefined
                    : `${Math.abs(stats.growthPercent)}% vs yesterday`
                }
                trendPositive={(stats.growthPercent ?? 0) >= 0}
                icon={<IndianRupee size={20} color={colors['accent']} />}
                highlight
              />
            )}
            <StatsCard
              title="Passes verified"
              value={stats?.scans ?? 0}
              subtitle={user.isOwner ? 'all gates' : `${stats?.myScans ?? 0} by you`}
              icon={<ScanLine size={20} color={colors['info']} />}
            />
            <StatsCard
              title="Still inside"
              value={stats?.openPasses ?? 0}
              subtitle={
                stats?.expiringSoon
                  ? `${stats.expiringSoon} running out soon`
                  : 'paid, not yet exited'
              }
              icon={<Car size={20} color={colors['warning']} />}
            />
            {stats?.canViewRevenue && (
              <StatsCard
                title="Passes sold"
                value={stats.passesIssued ?? 0}
                subtitle={
                  stats.pendingPayments
                    ? `${stats.pendingPayments} awaiting payment`
                    : 'today'
                }
                icon={<TicketIcon size={20} color={colors['text-subtle']} />}
              />
            )}
          </View>

          {/*
            Expiring passes, surfaced before the activity feed because they are
            the only thing here that is time-sensitive. When automated WhatsApp
            is off this list is also the fallback: staff can nudge each customer
            themselves rather than only discovering the overstay at the gate.
          */}
          {canSeeLedger && expiringPasses.length > 0 && (
            <ExpiringSoonCard passes={expiringPasses} merchant={merchant} />
          )}

          <View className="flex-col lg:flex-row gap-6">
            <View className="flex-1">
              <Card className="mb-6">
                <Text className="text-sm font-bold text-brand-text uppercase tracking-wider mb-3">
                  Quick actions
                </Text>
                <View className="flex-row flex-wrap gap-3">
                  {canIssue && (
                    <QuickAction
                      label="Issue a pass"
                      icon={<PlusCircle size={22} color={colors['accent']} />}
                      onPress={() => setIssueVisible(true)}
                    />
                  )}
                  <QuickAction
                    label="Open scanner"
                    icon={<ScanLine size={22} color={colors['info']} />}
                    onPress={() => router.push('/(tabs)/scanner')}
                  />
                  {canSeeLedger && (
                    <QuickAction
                      label="View ledger"
                      icon={<IndianRupee size={22} color={colors['warning']} />}
                      onPress={() => router.push('/(tabs)/ledger')}
                    />
                  )}
                </View>
              </Card>

              <Card>
                <View className="flex-row items-center justify-between mb-4 pb-3 border-b border-brand-border">
                  <View className="flex-row items-center gap-2">
                    <View className="w-2.5 h-2.5 rounded-full bg-brand-accent" />
                    <Text className="text-base font-bold text-brand-text">Live gate activity</Text>
                  </View>
                  {canSeeLedger && (
                    <TouchableOpacity
                      onPress={() => router.push('/(tabs)/ledger')}
                      className="flex-row items-center gap-1"
                    >
                      <Text className="text-xs font-bold text-brand-accent">View all</Text>
                      <ArrowRight size={12} color={colors['accent']} />
                    </TouchableOpacity>
                  )}
                </View>

                {!canSeeLedger ? (
                  <View className="py-10 items-center">
                    <ShieldCheck size={32} color={colors['text-faint']} />
                    <Text className="text-sm font-semibold text-brand-text-muted mt-2 text-center">
                      Activity is hidden on your account
                    </Text>
                    <Text className="text-xs text-brand-text-faint text-center mt-1 leading-4">
                      Your scan count above is live. Ask the owner for ledger access to see
                      payments.
                    </Text>
                  </View>
                ) : recent.length === 0 ? (
                  <View className="py-10 items-center">
                    <Clock size={32} color={colors['text-faint']} />
                    <Text className="text-sm font-semibold text-brand-text-muted mt-2">
                      {isLoading ? 'Loading…' : 'Nothing yet today'}
                    </Text>
                    <Text className="text-xs text-brand-text-faint text-center mt-1">
                      Passes and scans appear here as they happen.
                    </Text>
                  </View>
                ) : (
                  <View className="gap-3">
                    {recent.map((tx) => (
                      <ActivityRow
                        key={tx.id}
                        transaction={tx}
                        currency={merchant.currency}
                        onDeliver={() => setDeliverFor(tx)}
                      />
                    ))}
                  </View>
                )}
              </Card>
            </View>

            <View className="w-full lg:w-96 shrink-0">
              <CustomBrandedQR merchant={merchant} ticketTypes={ticketTypes} size={190} />
            </View>
          </View>
        </View>
      </ScrollView>

      <NewTicketModal
        visible={issueVisible}
        onClose={() => setIssueVisible(false)}
        onIssued={(tx) => setDeliverFor(tx)}
      />
      <PassDeliveryModal
        merchant={merchant}
        transaction={deliverFor}
        visible={Boolean(deliverFor)}
        onClose={() => setDeliverFor(null)}
      />
    </View>
  );
}

const ExpiringSoonCard: React.FC<{ passes: ExpiringPass[]; merchant: Merchant }> = ({
  passes,
  merchant,
}) => {
  const colors = useThemeColors();
  const nudge = async (pass: ExpiringPass) => {
    if (!pass.customerPhone) return;
    const url = passUrl(pass.ticketCode);
    if (!url) return;

    // Uses the merchant's configured provider, so a business on the Cloud API
    // sends automatically while everyone else gets WhatsApp opened with the
    // message ready.
    await messagingProvider(merchant.messagingProvider).sendPass({
      recipientPhone: pass.customerPhone,
      businessName: merchant.businessName,
      location: merchant.location,
      ticketCode: pass.ticketCode,
      typeLabel: pass.typeLabel,
      amount: pass.overstayDue,
      currency: merchant.currency,
      vehicleNumber: pass.vehicleNumber,
      issuedAt: pass.expiresAt,
      passUrl: url,
    });
  };

  return (
    <Card className="mb-6 border-brand-warning/30">
      <View className="flex-row items-center gap-2 mb-4 pb-3 border-b border-brand-border">
        <Timer size={17} color={colors['warning']} />
        <Text className="text-base font-bold text-brand-text">Running out soon</Text>
        <Badge label={String(passes.length)} variant="warning" size="sm" />
      </View>

      <View className="gap-2.5">
        {passes.slice(0, 6).map((pass) => (
          <View
            key={pass.ticketCode}
            className="flex-row items-center justify-between gap-3 p-3 rounded-xl bg-brand-bg/60 border border-brand-border"
          >
            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2 flex-wrap">
                <Text numberOfLines={1} className="text-xs font-bold text-brand-text uppercase">
                  {pass.vehicleNumber || pass.typeLabel}
                </Text>
                <Badge
                  label={pass.isExpired ? 'Time over' : 'Ending'}
                  variant={pass.isExpired ? 'danger' : 'warning'}
                  size="sm"
                />
                {pass.reminderSentAt && (
                  <Badge label="Reminded" variant="neutral" size="sm" />
                )}
              </View>
              <View className="flex-row items-center gap-1.5 mt-0.5">
                <ClockIcon size={10} color={colors['text-faint']} />
                <Text className="text-[11px] text-brand-text-muted">
                  {formatDateTime(pass.expiresAt)}
                  {pass.overstayDue > 0
                    ? ` · ${formatCurrency(pass.overstayDue, merchant.currency)} due`
                    : ''}
                </Text>
              </View>
            </View>

            {pass.customerPhone && (
              <TouchableOpacity
                onPress={() => nudge(pass)}
                accessibilityLabel="Remind this customer on WhatsApp"
                className="p-2 rounded-lg bg-brand-surface-raised active:bg-brand-surface-raised"
              >
                <MessageCircle size={14} color={colors['accent-soft']} />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </Card>
  );
};

const QuickAction: React.FC<{
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}> = ({ label, icon, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    className="flex-1 min-w-[130px] p-3.5 rounded-xl bg-brand-surface-raised/80 border border-brand-border-strong/80 items-center justify-center gap-2"
  >
    {icon}
    <Text className="text-xs font-bold text-brand-text text-center">{label}</Text>
  </TouchableOpacity>
);

const ActivityRow: React.FC<{
  transaction: Transaction;
  currency: string;
  onDeliver: () => void;
}> = ({ transaction, currency, onDeliver }) => {
  const colors = useThemeColors();
  const exited = Boolean(transaction.validation);
  const unpaid = transaction.status === 'pending';

  return (
    <View className="flex-row items-center justify-between p-3 sm:p-3.5 rounded-xl bg-brand-surface-raised/50 border border-brand-border-strong/60">
      <View className="flex-row items-center gap-3 flex-1 min-w-0 pr-2">
        <View
          className={`w-9 h-9 rounded-xl items-center justify-center shrink-0 border ${
            unpaid
              ? 'bg-brand-warning/10 border-brand-warning/30'
              : exited
                ? 'bg-brand-accent/10 border-brand-accent/30'
                : 'bg-brand-info/10 border-brand-info/30'
          }`}
        >
          {unpaid ? (
            <AlertTriangle size={18} color={colors['warning']} />
          ) : exited ? (
            <ShieldCheck size={18} color={colors['accent']} />
          ) : (
            <Car size={18} color={colors['info']} />
          )}
        </View>

        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Text numberOfLines={1} className="text-xs font-bold text-brand-text uppercase">
              {transaction.vehicleNumber || transaction.ticketTypeLabel}
            </Text>
            <Badge
              label={unpaid ? 'Unpaid' : exited ? 'Exited' : 'Inside'}
              variant={unpaid ? 'warning' : exited ? 'success' : 'info'}
              size="sm"
            />
          </View>
          <Text numberOfLines={1} className="text-[11px] font-mono text-brand-text-muted">
            {transaction.ticketCode} · {formatTimeAgo(transaction.createdAt)}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2 shrink-0">
        <Text className="text-sm font-extrabold text-brand-accent">
          {formatCurrency(transaction.amount, currency)}
        </Text>
        <TouchableOpacity
          onPress={onDeliver}
          accessibilityLabel="Send pass on WhatsApp"
          className="p-1.5 rounded-lg bg-brand-surface-raised/60 active:bg-brand-border-strong"
        >
          <MessageSquare size={14} color={colors['accent-soft']} />
        </TouchableOpacity>
      </View>
    </View>
  );
};
