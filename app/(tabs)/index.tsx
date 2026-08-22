import React, { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import {
  IndianRupee,
  ScanLine,
  Car,
  TrendingUp,
  PlusCircle,
  QrCode,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  MessageSquare,
} from 'lucide-react-native';
import { useApp } from '../../src/context/AppContext';
import { Header } from '../../components/ui/Header';
import { StatsCard } from '../../components/ui/StatsCard';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CustomBrandedQR } from '../../components/ui/CustomBrandedQR';
import { NewTicketModal } from '../../components/ui/NewTicketModal';
import { WhatsAppTicketModal } from '../../components/ui/WhatsAppTicketModal';
import { Transaction } from '../../src/types';
import { formatCurrency, formatTimeAgo } from '../../src/utils/formatters';

export default function DashboardScreen() {
  const router = useRouter();
  const { merchant, currentUser, stats, transactions, refreshData, isLoading } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [newTicketModalVisible, setNewTicketModalVisible] = useState(false);
  const [selectedWhatsAppTx, setSelectedWhatsAppTx] = useState<Transaction | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const todayTransactions = transactions.slice(0, 8);

  return (
    <View className="flex-1 bg-slate-950">
      <Header
        title={merchant.businessName}
        subtitle={`${merchant.location} • Real-time Operations`}
        rightAction={
          <Button
            title="Issue Pass"
            size="sm"
            variant="primary"
            icon={<PlusCircle size={14} color="#0F172A" />}
            onPress={() => setNewTicketModalVisible(true)}
          />
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isLoading}
            onRefresh={onRefresh}
            tintColor="#10B981"
            colors={['#10B981']}
          />
        }
      >
        <View className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5">
          {/* Welcome & Role Banner */}
          <View className="flex-row flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-900 to-slate-900/80 border border-slate-800 rounded-2xl p-4 mb-6 shadow-lg">
            <View className="flex-row items-center gap-3">
              <View className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 items-center justify-center">
                <Sparkles size={24} color="#10B981" />
              </View>
              <View>
                <Text className="text-base sm:text-lg font-bold text-slate-100">
                  Welcome back, {currentUser.name}
                </Text>
                <Text className="text-xs text-slate-400">
                  {currentUser.isOwner
                    ? 'Root Merchant Administrator • Full Privileges'
                    : 'Gatekeeper Attendant • Scanner & Activity Access'}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center gap-2">
              <Badge
                label={currentUser.isOwner ? 'Owner Dashboard' : 'Staff Mode'}
                variant={currentUser.isOwner ? 'emerald' : 'info'}
              />
            </View>
          </View>

          {/* Key Metrics Grid - Responsive (1 col on small phones, 2 on tablets, 4 on laptops) */}
          <View className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatsCard
              title="Today's Revenue"
              value={formatCurrency(stats.todayRevenue)}
              trend={`${Math.abs(stats.growthPercentage)}% vs yesterday`}
              trendPositive={stats.growthPercentage >= 0}
              icon={<IndianRupee size={20} color="#10B981" />}
              highlight
            />
            <StatsCard
              title="Exit Scans Verified"
              value={stats.todayScansCount}
              subtitle="passes cleared"
              icon={<ScanLine size={20} color="#38BDF8" />}
            />
            <StatsCard
              title="Active Vehicles"
              value={stats.activeVehiclesCount}
              subtitle="currently parked"
              icon={<Car size={20} color="#F59E0B" />}
            />
            <StatsCard
              title="Total Passes Issued"
              value={stats.todayTransactionsCount}
              subtitle="today"
              icon={<TrendingUp size={20} color="#A78BFA" />}
            />
          </View>

          {/* Main Layout Grid: Responsive 2 Columns on Desktop/Laptop */}
          <View className="flex-col lg:flex-row gap-6">
            {/* Left Column: Live Activity Feed & Quick Actions */}
            <View className="flex-1">
              {/* Quick Actions Card */}
              <Card className="mb-6 bg-slate-900 border-slate-800">
                <Text className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-3">
                  Quick Actions
                </Text>
                <View className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <TouchableOpacity
                    onPress={() => setNewTicketModalVisible(true)}
                    activeOpacity={0.7}
                    className="p-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 items-center justify-center gap-2"
                  >
                    <PlusCircle size={22} color="#10B981" />
                    <Text className="text-xs font-bold text-slate-200 text-center">
                      Issue Entry Pass
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => router.push('/(tabs)/scanner')}
                    activeOpacity={0.7}
                    className="p-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 items-center justify-center gap-2"
                  >
                    <ScanLine size={22} color="#38BDF8" />
                    <Text className="text-xs font-bold text-slate-200 text-center">
                      Open QR Scanner
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => router.push('/(tabs)/ledger')}
                    activeOpacity={0.7}
                    className="p-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 items-center justify-center gap-2 col-span-2 sm:col-span-1"
                  >
                    <IndianRupee size={22} color="#F59E0B" />
                    <Text className="text-xs font-bold text-slate-200 text-center">
                      View Ledger
                    </Text>
                  </TouchableOpacity>
                </View>
              </Card>

              {/* Real-time Live Activity Feed */}
              <Card className="bg-slate-900 border-slate-800">
                <View className="flex-row items-center justify-between mb-4 pb-3 border-b border-slate-800">
                  <View className="flex-row items-center gap-2">
                    <View className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <Text className="text-base font-bold text-slate-100">
                      Live Gate Activity Feed
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push('/(tabs)/ledger')}
                    className="flex-row items-center gap-1"
                  >
                    <Text className="text-xs font-bold text-emerald-400">View All</Text>
                    <ArrowRight size={12} color="#10B981" />
                  </TouchableOpacity>
                </View>

                {todayTransactions.length === 0 ? (
                  <View className="py-10 items-center justify-center">
                    <Clock size={36} color="#64748B" />
                    <Text className="text-sm font-semibold text-slate-400 mt-2">
                      No activity recorded yet today
                    </Text>
                    <Text className="text-xs text-slate-500 text-center mt-1">
                      New scans and customer UPI payments will appear here in real-time.
                    </Text>
                  </View>
                ) : (
                  <View className="gap-3">
                    {todayTransactions.map((tx) => {
                      const isVerified = Boolean(tx.validation);
                      return (
                        <View
                          key={tx.id}
                          className="flex-row items-center justify-between p-3 sm:p-3.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 transition-all"
                        >
                          <View className="flex-row items-center gap-3 flex-1 min-w-0 pr-2">
                            <View
                              className={`w-9 h-9 rounded-xl items-center justify-center shrink-0 border ${
                                isVerified
                                  ? 'bg-emerald-500/10 border-emerald-500/30'
                                  : 'bg-amber-500/10 border-amber-500/30'
                              }`}
                            >
                              {isVerified ? (
                                <ShieldCheck size={18} color="#10B981" />
                              ) : (
                                <Car size={18} color="#F59E0B" />
                              )}
                            </View>

                            <View className="flex-1 min-w-0">
                              <View className="flex-row items-center gap-2">
                                <Text className="text-xs font-bold text-slate-200 truncate uppercase">
                                  {tx.vehicleNumber || 'Standard Pass'}
                                </Text>
                                <Badge
                                  label={isVerified ? 'Exit Cleared' : 'Parked'}
                                  variant={isVerified ? 'success' : 'warning'}
                                  size="sm"
                                />
                              </View>
                              <Text className="text-[11px] font-mono text-slate-400 truncate">
                                Code: {tx.ticketCode} • {formatTimeAgo(tx.createdAt)}
                              </Text>
                            </View>
                          </View>

                          {/* Right: Amount & WhatsApp Action */}
                          <View className="flex-row items-center gap-2 shrink-0">
                            <Text className="text-sm font-extrabold text-emerald-400">
                              {formatCurrency(tx.amount)}
                            </Text>
                            <TouchableOpacity
                              onPress={() => setSelectedWhatsAppTx(tx)}
                              accessibilityLabel="Send WhatsApp Pass"
                              className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 active:bg-slate-600"
                            >
                              <MessageSquare size={14} color="#34D399" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </Card>
            </View>

            {/* Right Column: Custom Branded Merchant QR Code (Phase 4 component) */}
            <View className="w-full lg:w-96 shrink-0">
              <View className="lg:sticky lg:top-6">
                <CustomBrandedQR size={190} showDetails />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* New Ticket Modal */}
      <NewTicketModal
        visible={newTicketModalVisible}
        onClose={() => setNewTicketModalVisible(false)}
        onSuccess={(tx) => {
          setSelectedWhatsAppTx(tx);
        }}
      />

      {/* WhatsApp Pass Modal */}
      <WhatsAppTicketModal
        transaction={selectedWhatsAppTx}
        visible={Boolean(selectedWhatsAppTx)}
        onClose={() => setSelectedWhatsAppTx(null)}
      />
    </View>
  );
}
