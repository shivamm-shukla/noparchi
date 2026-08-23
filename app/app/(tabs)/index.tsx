import React, { useState } from 'react';
import { View, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
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
  Car,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../src/context/ThemeContext';
import { useAuth } from '../../../src/context/AuthContext';
import { useApp } from '../../../src/context/AppContext';
import { useIsExpanded } from '../../../src/hooks/useLayoutMode';
import { TopBar } from '../../../components/nav/TopBar';
import { StatCard } from '../../../components/ui/StatCard';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Text } from '../../../components/ui/Text';
import { Row } from '../../../components/ui/Row';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { CustomBrandedQR } from '../../../components/ui/CustomBrandedQR';
import { NewTicketModal } from '../../../components/ui/NewTicketModal';
import { PassDeliveryModal } from '../../../components/ui/PassDeliveryModal';
import { messagingProvider } from '../../../src/services/messaging';
import { passUrl } from '../../../src/utils/links';
import { formatCurrency, formatTimeAgo, formatDateTime } from '../../../src/utils/formatters';
import type { ExpiringPass, Merchant, Transaction } from '../../../src/types';

/** Width the gate QR column takes once there is room for a second column. */
const QR_COLUMN_WIDTH = 356;

export default function DashboardScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { t } = useTranslation();
  const isExpanded = useIsExpanded();
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

  const gateQr = (
    <CustomBrandedQR merchant={merchant} ticketTypes={ticketTypes} size={188} />
  );

  const operations = (
    <>
      {/*
        Expiring passes come before the feed because they are the only thing
        here that is time-sensitive. When automated WhatsApp is off this list is
        also the fallback: staff can nudge each customer themselves rather than
        only discovering the overstay at the gate.
      */}
      {canSeeLedger && expiringPasses.length > 0 && (
        <ExpiringSoonCard passes={expiringPasses} merchant={merchant} />
      )}

      <Card>
        <SectionHeader
          title={t('dashboard.activity.title')}
          className="mb-1 border-b border-brand-border pb-3"
          action={
            canSeeLedger ? (
              <Pressable
                onPress={() => router.push('/app/ledger')}
                accessibilityRole="button"
                className="flex-row items-center gap-1 active:opacity-60"
              >
                <Text font="body-semibold" className="text-xs text-brand-accent">
                  {t('dashboard.activity.viewAll')}
                </Text>
                <ArrowRight size={12} color={colors['accent']} />
              </Pressable>
            ) : undefined
          }
        />

        {!canSeeLedger ? (
          <EmptyState
            icon={<ShieldCheck size={26} color={colors['text-faint']} />}
            title={t('dashboard.activity.hiddenTitle')}
            body={t('dashboard.activity.hiddenBody')}
          />
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<Clock size={26} color={colors['text-faint']} />}
            title={isLoading ? t('common.loading') : t('dashboard.activity.emptyTitle')}
            body={t('dashboard.activity.emptyBody')}
          />
        ) : (
          <View>
            {recent.map((tx, index) => (
              <ActivityRow
                key={tx.id}
                transaction={tx}
                currency={merchant.currency}
                divider={index < recent.length - 1}
                onDeliver={() => setDeliverFor(tx)}
              />
            ))}
          </View>
        )}
      </Card>
    </>
  );

  return (
    <View className="flex-1 bg-brand-bg">
      <TopBar
        title={merchant.businessName}
        subtitle={merchant.location}
        rightAction={
          canIssue ? (
            <Button
              title={t('dashboard.issuePass')}
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
        <View className="mx-auto w-full max-w-7xl gap-4 px-4 py-5 sm:px-6 lg:px-8">
          {/*
            Offline scans the server refused on sync. Shown prominently rather
            than logged, because each one is a customer who left the venue on a
            pass another device had already cleared - the owner needs to know.
          */}
          {syncConflicts.length > 0 && (
            <Card className="border-brand-warning/40">
              <View className="flex-row items-start gap-3">
                <AlertTriangle size={17} color={colors['warning']} />
                <View className="flex-1 gap-1">
                  <Text font="body-semibold" className="text-sm text-brand-warning">
                    {t('dashboard.conflicts.title', { count: syncConflicts.length })}
                  </Text>
                  {syncConflicts.slice(0, 3).map((conflict) => (
                    <Text
                      key={conflict.ticketCode}
                      font="body"
                      className="text-xs leading-5 text-brand-text-subtle"
                    >
                      {conflict.ticketCode} — {conflict.message}
                    </Text>
                  ))}
                </View>
                <Pressable
                  onPress={dismissConflicts}
                  accessibilityRole="button"
                  accessibilityLabel={t('dashboard.conflicts.dismiss')}
                  className="p-1 active:opacity-60"
                >
                  <X size={14} color={colors['text-muted']} />
                </Pressable>
              </View>
            </Card>
          )}

          {error && (
            <Card className="border-brand-danger/40">
              <Text font="body" className="text-xs leading-5 text-brand-danger">
                {error}
              </Text>
            </Card>
          )}

          {/*
            Revenue is only rendered when the server said this account may see
            it. stats.revenue is null otherwise - the figure never leaves the
            database, so hiding the tile is presentation, not protection.
          */}
          <View className="flex-row flex-wrap gap-3">
            {stats?.canViewRevenue && (
              <StatCard
                label={t('dashboard.stats.revenue')}
                value={formatCurrency(stats.revenue ?? 0, merchant.currency)}
                deltaPercent={stats.growthPercent}
                deltaLabel={t('dashboard.stats.vsYesterday')}
              />
            )}
            <StatCard
              label={t('dashboard.stats.verified')}
              value={stats?.scans ?? 0}
              detail={
                user.isOwner
                  ? t('dashboard.stats.verifiedAllGates')
                  : t('dashboard.stats.verifiedByYou', { count: stats?.myScans ?? 0 })
              }
            />
            <StatCard
              label={t('dashboard.stats.inside')}
              value={stats?.openPasses ?? 0}
              detail={
                stats?.expiringSoon
                  ? t('dashboard.stats.insideExpiring', { count: stats.expiringSoon })
                  : t('dashboard.stats.insidePaid')
              }
            />
            {stats?.canViewRevenue && (
              <StatCard
                label={t('dashboard.stats.sold')}
                value={stats.passesIssued ?? 0}
                detail={
                  stats.pendingPayments
                    ? t('dashboard.stats.soldPending', { count: stats.pendingPayments })
                    : t('dashboard.stats.soldToday')
                }
              />
            )}
          </View>

          {/*
            Two columns when there is room, and the QR leads on a phone.
            Yoga does not implement CSS `order`, so the arrangement is chosen
            here rather than with a `lg:order-*` class that would do nothing.
          */}
          {isExpanded ? (
            <View className="flex-row items-start gap-4">
              <View className="flex-1 gap-4">{operations}</View>
              <View style={{ width: QR_COLUMN_WIDTH }}>{gateQr}</View>
            </View>
          ) : (
            <View className="gap-4">
              {gateQr}
              {operations}
            </View>
          )}
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

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; body: string }> = ({
  icon,
  title,
  body,
}) => (
  <View className="items-center gap-1.5 py-10">
    {icon}
    <Text font="body-semibold" className="mt-1 text-center text-sm text-brand-text-subtle">
      {title}
    </Text>
    <Text font="body" className="max-w-xs text-center text-xs leading-5 text-brand-text-muted">
      {body}
    </Text>
  </View>
);

const ExpiringSoonCard: React.FC<{ passes: ExpiringPass[]; merchant: Merchant }> = ({
  passes,
  merchant,
}) => {
  const colors = useThemeColors();
  const { t } = useTranslation();

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

  const shown = passes.slice(0, 6);

  return (
    <Card>
      <SectionHeader
        title={t('dashboard.expiring.title')}
        icon={<Timer size={15} color={colors['warning']} />}
        action={<Badge label={String(passes.length)} variant="warning" size="sm" />}
        className="mb-1 border-b border-brand-border pb-3"
      />

      {shown.map((pass, index) => (
        <Row key={pass.ticketCode} divider={index < shown.length - 1}>
          <View className="min-w-0 flex-1 gap-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text
                font="body-semibold"
                numberOfLines={1}
                className="text-xs uppercase tracking-wide text-brand-text"
              >
                {pass.vehicleNumber || pass.typeLabel}
              </Text>
              <Badge
                label={t(pass.isExpired ? 'dashboard.expiring.timeOver' : 'dashboard.expiring.ending')}
                variant={pass.isExpired ? 'danger' : 'warning'}
                size="sm"
              />
              {pass.reminderSentAt && (
                <Badge label={t('dashboard.expiring.reminded')} variant="neutral" size="sm" />
              )}
            </View>
            <View className="flex-row items-center gap-1.5">
              <ClockIcon size={10} color={colors['text-faint']} />
              <Text font="body" className="text-[11px] text-brand-text-muted">
                {formatDateTime(pass.expiresAt)}
                {pass.overstayDue > 0
                  ? ` · ${t('dashboard.expiring.due', {
                      amount: formatCurrency(pass.overstayDue, merchant.currency),
                    })}`
                  : ''}
              </Text>
            </View>
          </View>

          {pass.customerPhone && (
            <Pressable
              onPress={() => nudge(pass)}
              accessibilityRole="button"
              accessibilityLabel={t('dashboard.expiring.remind')}
              className="rounded-control border border-brand-border bg-brand-surface-alt p-2 active:opacity-60"
            >
              <MessageCircle size={14} color={colors['text-subtle']} />
            </Pressable>
          )}
        </Row>
      ))}
    </Card>
  );
};

const ActivityRow: React.FC<{
  transaction: Transaction;
  currency: string;
  divider: boolean;
  onDeliver: () => void;
}> = ({ transaction, currency, divider, onDeliver }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const exited = Boolean(transaction.validation);
  const unpaid = transaction.status === 'pending';

  return (
    <Row divider={divider}>
      <View
        className={`h-9 w-9 shrink-0 items-center justify-center rounded-control border ${
          unpaid
            ? 'border-brand-warning/30 bg-brand-warning/10'
            : exited
              ? 'border-brand-accent/30 bg-brand-accent/10'
              : 'border-brand-border bg-brand-surface-alt'
        }`}
      >
        {unpaid ? (
          <AlertTriangle size={16} color={colors['warning']} />
        ) : exited ? (
          <ShieldCheck size={16} color={colors['accent']} />
        ) : (
          <Car size={16} color={colors['text-muted']} />
        )}
      </View>

      <View className="min-w-0 flex-1">
        <Text
          font="body-semibold"
          numberOfLines={1}
          className="text-xs uppercase tracking-wide text-brand-text"
        >
          {transaction.vehicleNumber || transaction.ticketTypeLabel}
        </Text>
        <Text font="body" numberOfLines={1} className="text-[11px] text-brand-text-muted">
          {transaction.ticketCode} · {formatTimeAgo(transaction.createdAt)}
        </Text>
      </View>

      <View className="shrink-0 flex-row items-center gap-2.5">
        {/*
          The amount is the figure, so it is set in the display face - but in
          the text colour, not the accent. A green number on every row makes the
          accent mean nothing, and none of these rows is the one to look at.
        */}
        <Text font="display-bold" className="text-sm text-brand-text">
          {formatCurrency(transaction.amount, currency)}
        </Text>
        <Badge
          label={t(
            unpaid
              ? 'dashboard.activity.statusUnpaid'
              : exited
                ? 'dashboard.activity.statusExited'
                : 'dashboard.activity.statusInside'
          )}
          variant={unpaid ? 'warning' : exited ? 'success' : 'info'}
          size="sm"
        />
        <Pressable
          onPress={onDeliver}
          accessibilityRole="button"
          accessibilityLabel={t('dashboard.activity.sendPass')}
          className="rounded-control border border-brand-border bg-brand-surface-alt p-1.5 active:opacity-60"
        >
          <MessageSquare size={13} color={colors['text-subtle']} />
        </Pressable>
      </View>
    </Row>
  );
};
