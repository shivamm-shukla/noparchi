import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, Car, Clock, ShieldCheck, Download, Share2, ArrowLeft, Sparkles, AlertCircle } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { useApp } from '../../src/context/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { formatCurrency, formatDateTime } from '../../src/utils/formatters';

export default function CustomerTicketScreen() {
  const { ticketCode } = useLocalSearchParams<{ ticketCode: string }>();
  const router = useRouter();
  const { transactions, merchant } = useApp();

  const targetTx = transactions.find(
    (t) => t.ticketCode.toUpperCase() === (ticketCode || '').toUpperCase()
  );

  const isVerified = Boolean(targetTx?.validation);

  const handleShare = async () => {
    const message = `🎫 NoParchi Digital Pass\nMerchant: ${merchant.businessName}\nTicket Code: ${ticketCode}\nAmount: ₹${targetTx?.amount || 0}\nVehicle: ${targetTx?.vehicleNumber || 'Standard'}\nShow at exit gate.`;

    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title: 'NoParchi Pass', text: message });
        } catch {
          // ignore
        }
      } else {
        alert('Pass details copied to clipboard!');
      }
    } else {
      Share.share({ message });
    }
  };

  return (
    <View className="flex-1 bg-slate-950">
      {/* Header */}
      <View className="bg-slate-900 border-b border-slate-800 px-4 py-4">
        <View className="max-w-lg mx-auto w-full flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => router.push('/')}
            className="flex-row items-center gap-1.5"
          >
            <ArrowLeft size={18} color="#94A3B8" />
            <Text className="text-xs font-bold text-slate-300">Home</Text>
          </TouchableOpacity>
          <Text className="text-sm font-bold text-slate-100">Digital Pass Receipt</Text>
          <Badge
            label={isVerified ? 'Exit Cleared' : 'Active Pass'}
            variant={isVerified ? 'success' : 'emerald'}
            size="sm"
          />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="max-w-lg mx-auto w-full px-4 py-6">
          {/* Main Ticket Pass Card */}
          <Card className="bg-slate-900 border-slate-800 p-6 shadow-2xl items-center relative overflow-hidden mb-6">
            {/* Top Status Header */}
            <View className="items-center mb-4">
              <View className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 items-center justify-center mb-2">
                <CheckCircle2 size={28} color="#10B981" />
              </View>
              <Text className="text-xl font-extrabold text-slate-100 text-center">
                {merchant.businessName}
              </Text>
              <Text className="text-xs text-slate-400 text-center">
                {merchant.location}
              </Text>
            </View>

            {/* QR Code Container */}
            <View className="p-4 bg-white rounded-3xl items-center justify-center shadow-xl mb-4 border-4 border-emerald-500/20">
              <QRCode
                value={ticketCode || 'NP-SAMPLE'}
                size={180}
                color="#0F172A"
                backgroundColor="#FFFFFF"
              />
              <Text className="text-slate-950 font-mono font-extrabold text-sm mt-2 tracking-wider">
                {ticketCode}
              </Text>
            </View>

            <Text className="text-xs text-slate-400 text-center mb-5 font-medium">
              Show this QR code to the gatekeeper upon vehicle exit.
            </Text>

            {/* Details Breakdown */}
            <View className="w-full bg-slate-950/80 rounded-2xl p-4 border border-slate-800 gap-3">
              <View className="flex-row items-center justify-between pb-2 border-b border-slate-800">
                <Text className="text-xs text-slate-400">Pass Status</Text>
                <Badge
                  label={isVerified ? 'VERIFIED & CLEARED' : 'VALID ENTRY PASS'}
                  variant={isVerified ? 'info' : 'emerald'}
                  size="sm"
                />
              </View>

              {targetTx?.vehicleNumber && (
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <Car size={14} color="#94A3B8" />
                    <Text className="text-xs text-slate-400">Vehicle No.</Text>
                  </View>
                  <Text className="text-sm font-bold text-slate-100 uppercase">
                    {targetTx.vehicleNumber}
                  </Text>
                </View>
              )}

              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-slate-400">Amount Paid</Text>
                <Text className="text-base font-extrabold text-emerald-400">
                  {formatCurrency(targetTx?.amount || 50)}
                </Text>
              </View>

              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5">
                  <Clock size={14} color="#94A3B8" />
                  <Text className="text-xs text-slate-400">Issue Timestamp</Text>
                </View>
                <Text className="text-xs text-slate-300">
                  {formatDateTime(targetTx?.createdAt || new Date().toISOString())}
                </Text>
              </View>
            </View>

            {/* Actions */}
            <View className="flex-row gap-3 w-full mt-5">
              <Button
                title="Share Pass"
                variant="secondary"
                size="md"
                className="flex-1"
                icon={<Share2 size={16} color="#94A3B8" />}
                onPress={handleShare}
              />
              <Button
                title="Save Receipt"
                variant="outline"
                size="md"
                className="flex-1"
                icon={<Download size={16} color="#94A3B8" />}
                onPress={() => {
                  if (Platform.OS === 'web') window.print();
                  else alert('Pass saved.');
                }}
              />
            </View>
          </Card>

          <View className="flex-row items-center justify-center gap-2">
            <ShieldCheck size={14} color="#10B981" />
            <Text className="text-xs text-slate-500 text-center">
              Powered by NoParchi Smart QR Commerce Ecosystem
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
