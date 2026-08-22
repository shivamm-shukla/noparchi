import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import { Search, Download, BookOpen, Car, ShieldCheck, Clock, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useApp } from '../../src/context/AppContext';
import { Header } from '../../components/ui/Header';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { DateFilter } from '../../components/ui/DateFilter';
import { RoleGate } from '../../components/ui/RoleGate';
import { WhatsAppTicketModal } from '../../components/ui/WhatsAppTicketModal';
import { Transaction } from '../../src/types';
import { formatCurrency, formatDateTime } from '../../src/utils/formatters';

export default function LedgerScreen() {
  const { transactions, selectedFilter, setFilter, refreshData, isLoading, merchant } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWhatsAppTx, setSelectedWhatsAppTx] = useState<Transaction | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter(
      (tx) =>
        tx.ticketCode.toLowerCase().includes(q) ||
        (tx.vehicleNumber && tx.vehicleNumber.toLowerCase().includes(q)) ||
        (tx.paymentRef && tx.paymentRef.toLowerCase().includes(q))
    );
  }, [transactions, searchQuery]);

  const totalAmount = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.status === 'SUCCESS')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  const handleExportCsv = () => {
    if (Platform.OS === 'web') {
      const csvHeader = 'Ticket Code,Vehicle Number,Vehicle Type,Amount,Status,Payment Ref,Created At,Exit Scanned\n';
      const rows = filteredTransactions.map((tx) =>
        `"${tx.ticketCode}","${tx.vehicleNumber || 'N/A'}","${tx.vehicleType}",${tx.amount},"${tx.status}","${tx.paymentRef || 'N/A'}","${tx.createdAt}","${tx.validation ? 'Yes' : 'No'}"`
      ).join('\n');
      const blob = new Blob([csvHeader + rows], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `noparchi_ledger_${selectedFilter}_${Date.now()}.csv`;
      link.click();
    } else {
      alert('CSV export ready for download.');
    }
  };

  return (
    <View className="flex-1 bg-slate-950">
      <Header
        title="Transactions Ledger"
        subtitle="Historical financial audit and ticket logs"
        rightAction={
          <Button
            title="Export CSV"
            size="sm"
            variant="secondary"
            icon={<Download size={14} color="#94A3B8" />}
            onPress={handleExportCsv}
          />
        }
      />

      <RoleGate
        permissionKey="can_view_ledger"
        fallbackTitle="Ledger Access Restricted"
        fallbackMessage="Your gatekeeper role does not currently have permission to view revenue and ledger records. The Owner can enable 'can_view_ledger' in Settings."
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing || isLoading}
              onRefresh={onRefresh}
              tintColor="#10B981"
            />
          }
        >
          <View className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5">
            {/* Filter & Summary Header Card */}
            <Card className="mb-6 bg-slate-900 border-slate-800">
              <View className="flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <View>
                  <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Date Range Filter
                  </Text>
                  <DateFilter selected={selectedFilter} onSelect={setFilter} />
                </View>

                {/* Summary Metrics */}
                <View className="flex-row items-center gap-4 bg-slate-950/80 border border-slate-800 p-3 rounded-2xl">
                  <View>
                    <Text className="text-[10px] text-slate-400 font-semibold uppercase">
                      Filtered Revenue
                    </Text>
                    <Text className="text-lg font-extrabold text-emerald-400">
                      {formatCurrency(totalAmount)}
                    </Text>
                  </View>
                  <View className="w-px h-8 bg-slate-800" />
                  <View>
                    <Text className="text-[10px] text-slate-400 font-semibold uppercase">
                      Passes
                    </Text>
                    <Text className="text-lg font-extrabold text-slate-100">
                      {filteredTransactions.length}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Search Bar */}
              <View className="flex-row items-center bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
                <Search size={16} color="#64748B" />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search by Vehicle Number, Ticket Code, or UPI Ref..."
                  placeholderTextColor="#64748B"
                  className="flex-1 ml-2.5 text-slate-100 text-sm"
                />
              </View>
            </Card>

            {/* Desktop Table View (Hidden on mobile, visible on md/lg screens) */}
            <View className="hidden md:flex">
              <Card className="bg-slate-900 border-slate-800 p-0 overflow-hidden">
                <View className="flex-row bg-slate-950 px-6 py-3.5 border-b border-slate-800">
                  <Text className="w-32 text-xs font-bold text-slate-400 uppercase">Ticket Code</Text>
                  <Text className="w-36 text-xs font-bold text-slate-400 uppercase">Vehicle</Text>
                  <Text className="w-32 text-xs font-bold text-slate-400 uppercase">Amount</Text>
                  <Text className="w-32 text-xs font-bold text-slate-400 uppercase">Status</Text>
                  <Text className="flex-1 text-xs font-bold text-slate-400 uppercase">Timestamp</Text>
                  <Text className="w-28 text-xs font-bold text-slate-400 uppercase text-right">Actions</Text>
                </View>

                {filteredTransactions.length === 0 ? (
                  <View className="py-12 items-center justify-center">
                    <BookOpen size={36} color="#64748B" />
                    <Text className="text-slate-400 font-semibold mt-2">No transactions found</Text>
                  </View>
                ) : (
                  filteredTransactions.map((tx, idx) => {
                    const isVerified = Boolean(tx.validation);
                    return (
                      <View
                        key={tx.id}
                        className={`flex-row items-center px-6 py-3.5 border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors ${
                          idx % 2 === 1 ? 'bg-slate-900/40' : 'bg-slate-900'
                        }`}
                      >
                        <Text className="w-32 text-xs font-mono font-bold text-emerald-400 truncate">
                          {tx.ticketCode}
                        </Text>
                        <View className="w-36 flex-row items-center gap-1.5">
                          <Car size={14} color="#94A3B8" />
                          <Text className="text-xs font-bold text-slate-200 uppercase truncate">
                            {tx.vehicleNumber || 'Standard'}
                          </Text>
                        </View>
                        <Text className="w-32 text-sm font-extrabold text-slate-100">
                          {formatCurrency(tx.amount)}
                        </Text>
                        <View className="w-32">
                          <Badge
                            label={isVerified ? 'Exit Scanned' : 'Active Pass'}
                            variant={isVerified ? 'success' : 'warning'}
                            size="sm"
                          />
                        </View>
                        <Text className="flex-1 text-xs text-slate-400">
                          {formatDateTime(tx.createdAt)}
                        </Text>
                        <View className="w-28 flex-row items-center justify-end gap-2">
                          <TouchableOpacity
                            onPress={() => setSelectedWhatsAppTx(tx)}
                            accessibilityLabel="Send WhatsApp"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600"
                          >
                            <MessageSquare size={14} color="#34D399" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </Card>
            </View>

            {/* Mobile Card List View (Visible on mobile screens) */}
            <View className="flex md:hidden gap-3">
              {filteredTransactions.length === 0 ? (
                <Card className="py-10 items-center justify-center bg-slate-900 border-slate-800">
                  <BookOpen size={36} color="#64748B" />
                  <Text className="text-slate-400 font-semibold mt-2">No transactions found</Text>
                </Card>
              ) : (
                filteredTransactions.map((tx) => {
                  const isVerified = Boolean(tx.validation);
                  return (
                    <Card
                      key={tx.id}
                      className="bg-slate-900 border-slate-800 p-4"
                    >
                      <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-xs font-mono font-bold text-emerald-400">
                          {tx.ticketCode}
                        </Text>
                        <Badge
                          label={isVerified ? 'Exit Scanned' : 'Active Pass'}
                          variant={isVerified ? 'success' : 'warning'}
                          size="sm"
                        />
                      </View>

                      <View className="flex-row items-center justify-between mb-3">
                        <View className="flex-row items-center gap-2">
                          <Car size={16} color="#94A3B8" />
                          <Text className="text-sm font-bold text-slate-100 uppercase">
                            {tx.vehicleNumber || 'Standard Pass'}
                          </Text>
                        </View>
                        <Text className="text-base font-extrabold text-slate-100">
                          {formatCurrency(tx.amount)}
                        </Text>
                      </View>

                      <View className="flex-row items-center justify-between pt-2 border-t border-slate-800">
                        <Text className="text-[11px] text-slate-400">
                          {formatDateTime(tx.createdAt)}
                        </Text>

                        <TouchableOpacity
                          onPress={() => setSelectedWhatsAppTx(tx)}
                          className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30"
                        >
                          <MessageSquare size={12} color="#10B981" />
                          <Text className="text-[11px] font-bold text-emerald-400">
                            WhatsApp Pass
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </Card>
                  );
                })
              )}
            </View>
          </View>
        </ScrollView>
      </RoleGate>

      {/* WhatsApp Modal */}
      <WhatsAppTicketModal
        transaction={selectedWhatsAppTx}
        visible={Boolean(selectedWhatsAppTx)}
        onClose={() => setSelectedWhatsAppTx(null)}
      />
    </View>
  );
}
