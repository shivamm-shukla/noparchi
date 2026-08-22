import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Linking, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Car, Bike, Truck, Ticket, Sparkles, ShieldCheck, QrCode, Smartphone, ArrowRight, CheckCircle2 } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { useApp } from '../../src/context/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { VehicleType } from '../../src/types';
import { formatCurrency } from '../../src/utils/formatters';

export default function CustomerPayScreen() {
  const { merchantId } = useLocalSearchParams<{ merchantId: string }>();
  const router = useRouter();
  const { merchant, createTransaction } = useApp();

  const [vehicleType, setVehicleType] = useState<VehicleType>('FOUR_WHEELER');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUpiModal, setShowUpiModal] = useState(false);

  const getRate = (type: VehicleType): number => {
    switch (type) {
      case 'TWO_WHEELER':
        return merchant.configSettings?.twoWheelerRate || 20;
      case 'FOUR_WHEELER':
        return merchant.configSettings?.fourWheelerRate || 50;
      case 'HEAVY_VEHICLE':
        return (merchant.configSettings?.fourWheelerRate || 50) * 2;
      default:
        return merchant.configSettings?.flatRate || 40;
    }
  };

  const amount = getRate(vehicleType);

  const upiIntentUrl = `upi://pay?pa=${merchant.upiId}&pn=${encodeURIComponent(
    merchant.businessName
  )}&am=${amount}&cu=INR&tn=${encodeURIComponent(
    `NoParchi-${vehicleNumber || 'Pass'}`
  )}`;

  const handlePayNow = async () => {
    if (Platform.OS !== 'web') {
      try {
        const canOpen = await Linking.canOpenURL(upiIntentUrl);
        if (canOpen) {
          await Linking.openURL(upiIntentUrl);
        }
      } catch {
        // Fall back to QR modal
      }
    }
    setShowUpiModal(true);
  };

  const handleConfirmPayment = async () => {
    setIsProcessing(true);
    try {
      const res = await createTransaction({
        amount,
        vehicleNumber: vehicleNumber ? vehicleNumber.toUpperCase() : undefined,
        vehicleType,
        customerPhone: customerPhone || undefined,
      });

      if (res.success) {
        router.push(`/ticket/${res.ticketCode}`);
      }
    } catch {
      alert('Failed to complete payment');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-950">
      {/* Customer Header */}
      <View className="bg-slate-900 border-b border-slate-800 px-4 py-4">
        <View className="max-w-lg mx-auto w-full flex-row items-center justify-between">
          <View className="flex-row items-center gap-2.5">
            <View className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 items-center justify-center">
              <Sparkles size={18} color="#10B981" />
            </View>
            <View>
              <Text className="text-base font-extrabold text-slate-100">
                {merchant.businessName}
              </Text>
              <Text className="text-xs text-slate-400">
                {merchant.location}
              </Text>
            </View>
          </View>
          <Badge label="Zero Paper" variant="emerald" size="sm" />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="max-w-lg mx-auto w-full px-4 py-6">
          {/* Hero Banner */}
          <Card className="bg-gradient-to-br from-slate-900 to-slate-950 border-slate-800 mb-5 text-center items-center p-5">
            <Text className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">
              Instant Smart Pass
            </Text>
            <Text className="text-2xl font-extrabold text-slate-100 text-center mb-1">
              Pay ₹{amount} & Get WhatsApp Ticket
            </Text>
            <Text className="text-xs text-slate-400 text-center">
              Zero apps required. Instant digital receipt sent to your phone.
            </Text>
          </Card>

          {/* Vehicle Type Selector */}
          <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
            1. Select Vehicle Type
          </Text>
          <View className="grid grid-cols-2 gap-2.5 mb-5">
            {[
              { type: 'TWO_WHEELER' as VehicleType, label: '2-Wheeler / Bike', icon: <Bike size={20} color="#10B981" />, rate: merchant.configSettings?.twoWheelerRate || 20 },
              { type: 'FOUR_WHEELER' as VehicleType, label: '4-Wheeler / Car', icon: <Car size={20} color="#38BDF8" />, rate: merchant.configSettings?.fourWheelerRate || 50 },
              { type: 'HEAVY_VEHICLE' as VehicleType, label: 'Bus / Commercial', icon: <Truck size={20} color="#F59E0B" />, rate: (merchant.configSettings?.fourWheelerRate || 50) * 2 },
              { type: 'GENERAL_ENTRY' as VehicleType, label: 'Flat Pass', icon: <Ticket size={20} color="#A78BFA" />, rate: merchant.configSettings?.flatRate || 40 },
            ].map((item) => {
              const isSelected = vehicleType === item.type;
              return (
                <TouchableOpacity
                  key={item.type}
                  onPress={() => setVehicleType(item.type)}
                  activeOpacity={0.7}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <View className="flex-row items-center justify-between mb-2">
                    {item.icon}
                    <Text className="text-base font-extrabold text-slate-100">
                      ₹{item.rate}
                    </Text>
                  </View>
                  <Text className="text-xs font-bold text-slate-200">
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Vehicle Registration Number */}
          <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            2. Vehicle Registration Number
          </Text>
          <View className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 mb-5">
            <TextInput
              value={vehicleNumber}
              onChangeText={setVehicleNumber}
              placeholder="e.g. DL 01 AB 1234 (Optional)"
              placeholderTextColor="#64748B"
              autoCapitalize="characters"
              className="text-slate-100 text-base font-bold uppercase tracking-wider"
            />
          </View>

          {/* WhatsApp Phone Number */}
          <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            3. WhatsApp Number for Digital Pass
          </Text>
          <View className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 mb-6">
            <TextInput
              value={customerPhone}
              onChangeText={setCustomerPhone}
              placeholder="+91 98765 43210 (For PDF receipt)"
              placeholderTextColor="#64748B"
              keyboardType="phone-pad"
              className="text-slate-100 text-sm font-semibold"
            />
          </View>

          {/* Price Summary & Payment CTA */}
          <Card className="bg-slate-900 border-slate-800 p-5 mb-6">
            <View className="flex-row items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <Text className="text-xs text-slate-400">Merchant UPI Account</Text>
              <Text className="text-xs font-mono font-bold text-emerald-400">
                {merchant.upiId}
              </Text>
            </View>

            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-sm font-bold text-slate-200">Total Payable</Text>
              <Text className="text-2xl font-extrabold text-emerald-400">
                ₹{amount}
              </Text>
            </View>

            <Button
              title={`Pay ₹${amount} via UPI`}
              variant="primary"
              size="lg"
              fullWidth
              icon={<Smartphone size={18} color="#0F172A" />}
              onPress={handlePayNow}
            />
          </Card>

          {/* UPI Confirmation / Dynamic QR Modal */}
          {showUpiModal && (
            <Card className="bg-slate-900 border-emerald-500/40 p-6 items-center">
              <Text className="text-sm font-bold text-emerald-400 mb-2 uppercase tracking-wider">
                Scan & Complete UPI Payment
              </Text>

              <View className="p-3 bg-white rounded-2xl mb-4 shadow-xl">
                <QRCode
                  value={upiIntentUrl}
                  size={160}
                  color="#0F172A"
                  backgroundColor="#FFFFFF"
                />
              </View>

              <Text className="text-xs text-slate-300 text-center mb-4 leading-4">
                Open GPay, PhonePe, or Paytm to pay ₹{amount}. Once paid, tap Confirm below to generate your WhatsApp Pass.
              </Text>

              <Button
                title="I Have Paid • Generate My Pass"
                variant="primary"
                size="lg"
                fullWidth
                loading={isProcessing}
                icon={<CheckCircle2 size={18} color="#0F172A" />}
                onPress={handleConfirmPayment}
              />
            </Card>
          )}

          <View className="flex-row items-center justify-center gap-2 mt-6">
            <ShieldCheck size={14} color="#10B981" />
            <Text className="text-[11px] text-slate-500 text-center">
              Secured by NoParchi Smart QR & WhatsApp Commerce
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
