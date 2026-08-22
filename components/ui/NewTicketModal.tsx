import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, ScrollView, Alert, Platform } from 'react-native';
import { PlusCircle, Car, Bike, Truck, Ticket, X, Check } from 'lucide-react-native';
import { useApp } from '../../src/context/AppContext';
import { VehicleType, Transaction } from '../../src/types';
import { Button } from './Button';

interface NewTicketModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (transaction: Transaction) => void;
}

export const NewTicketModal: React.FC<NewTicketModalProps> = ({ visible, onClose, onSuccess }) => {
  const { merchant, createTransaction } = useApp();
  const [vehicleType, setVehicleType] = useState<VehicleType>('FOUR_WHEELER');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const getAutoAmount = (type: VehicleType): number => {
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

  const currentAmount = customAmount ? parseFloat(customAmount) : getAutoAmount(vehicleType);

  const handleSubmit = async () => {
    if (!currentAmount || currentAmount <= 0) {
      if (Platform.OS === 'web') alert('Please enter a valid amount');
      else Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      const res = await createTransaction({
        amount: currentAmount,
        vehicleNumber: vehicleNumber ? vehicleNumber.toUpperCase() : undefined,
        vehicleType,
        customerPhone: customerPhone || undefined,
      });

      if (res.success) {
        setVehicleNumber('');
        setCustomerPhone('');
        setCustomAmount('');
        onClose();
        if (onSuccess) {
          onSuccess(res.transaction);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create ticket';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/80 items-center justify-center p-4">
        <View className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl">
          {/* Header */}
          <View className="flex-row items-center justify-between pb-4 border-b border-slate-800">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 items-center justify-center">
                <PlusCircle size={20} color="#10B981" />
              </View>
              <View>
                <Text className="text-lg font-bold text-slate-100">Issue Entry Pass</Text>
                <Text className="text-xs text-slate-400">Generate a digital parking ticket</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 items-center justify-center"
            >
              <X size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView className="max-h-96 my-4">
            {/* Vehicle Type Selection */}
            <Text className="text-xs font-semibold text-slate-300 mb-2">Select Vehicle Type</Text>
            <View className="grid grid-cols-2 gap-2 mb-4">
              {[
                { type: 'TWO_WHEELER' as VehicleType, label: '2 Wheeler', icon: <Bike size={18} color="#10B981" />, rate: merchant.configSettings?.twoWheelerRate || 20 },
                { type: 'FOUR_WHEELER' as VehicleType, label: '4 Wheeler (Car)', icon: <Car size={18} color="#38BDF8" />, rate: merchant.configSettings?.fourWheelerRate || 50 },
                { type: 'HEAVY_VEHICLE' as VehicleType, label: 'Heavy / Bus', icon: <Truck size={18} color="#F59E0B" />, rate: (merchant.configSettings?.fourWheelerRate || 50) * 2 },
                { type: 'GENERAL_ENTRY' as VehicleType, label: 'Flat Pass', icon: <Ticket size={18} color="#A78BFA" />, rate: merchant.configSettings?.flatRate || 40 },
              ].map((item) => {
                const isSelected = vehicleType === item.type;
                return (
                  <TouchableOpacity
                    key={item.type}
                    onPress={() => {
                      setVehicleType(item.type);
                      setCustomAmount('');
                    }}
                    activeOpacity={0.7}
                    className={`p-3 rounded-xl border flex-row items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/60'
                        : 'bg-slate-800/60 border-slate-700/60'
                    }`}
                  >
                    <View className="flex-row items-center gap-2">
                      {item.icon}
                      <View>
                        <Text className="text-xs font-bold text-slate-100">{item.label}</Text>
                        <Text className="text-[10px] text-slate-400">₹{item.rate}</Text>
                      </View>
                    </View>
                    {isSelected && (
                      <View className="w-4 h-4 rounded-full bg-emerald-500 items-center justify-center">
                        <Check size={10} color="#0F172A" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Vehicle Number Input */}
            <View className="mb-3">
              <Text className="text-xs font-semibold text-slate-300 mb-1.5">
                Vehicle Registration Number (Optional)
              </Text>
              <View className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
                <TextInput
                  value={vehicleNumber}
                  onChangeText={setVehicleNumber}
                  placeholder="e.g. DL 01 AB 1234"
                  placeholderTextColor="#64748B"
                  autoCapitalize="characters"
                  className="text-slate-100 text-sm font-semibold uppercase"
                />
              </View>
            </View>

            {/* Customer WhatsApp Phone */}
            <View className="mb-3">
              <Text className="text-xs font-semibold text-slate-300 mb-1.5">
                Customer Phone / WhatsApp (For Digital Pass)
              </Text>
              <View className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
                <TextInput
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  placeholder="+91 98765 43210"
                  placeholderTextColor="#64748B"
                  keyboardType="phone-pad"
                  className="text-slate-100 text-sm"
                />
              </View>
            </View>

            {/* Amount Override */}
            <View className="mb-4">
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-xs font-semibold text-slate-300">Amount (₹)</Text>
                <Text className="text-[10px] text-emerald-400 font-medium">Default: ₹{getAutoAmount(vehicleType)}</Text>
              </View>
              <View className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
                <TextInput
                  value={customAmount}
                  onChangeText={setCustomAmount}
                  placeholder={`₹${getAutoAmount(vehicleType)}`}
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  className="text-slate-100 text-sm font-bold"
                />
              </View>
            </View>
          </ScrollView>

          {/* Action */}
          <Button
            title={`Issue Pass (₹${currentAmount})`}
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            onPress={handleSubmit}
          />
        </View>
      </View>
    </Modal>
  );
};
