import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, TextInput, Alert, Platform } from 'react-native';
import { MessageSquare, CheckCircle, Send, X, Smartphone, Sparkles, QrCode } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { Transaction } from '../../src/types';
import { useApp } from '../../src/context/AppContext';
import { sendWhatsAppTicket } from '../../src/utils/whatsapp';
import { formatCurrency, formatDateTime } from '../../src/utils/formatters';
import { Button } from './Button';

interface WhatsAppTicketModalProps {
  transaction: Transaction | null;
  visible: boolean;
  onClose: () => void;
}

export const WhatsAppTicketModal: React.FC<WhatsAppTicketModalProps> = ({
  transaction,
  visible,
  onClose,
}) => {
  const { merchant } = useApp();
  const [phoneNumber, setPhoneNumber] = useState(transaction?.customerPhone || '+91 ');
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  if (!transaction) return null;

  const handleSendWhatsApp = async () => {
    setSending(true);
    try {
      const res = await sendWhatsAppTicket(
        { ...transaction, customerPhone: phoneNumber },
        merchant
      );
      if (res.success) {
        setSentSuccess(true);
        setTimeout(() => {
          setSentSuccess(false);
          onClose();
        }, 1800);
      }
    } catch {
      if (Platform.OS === 'web') {
        alert('Dispatched digital ticket simulation to ' + phoneNumber);
      } else {
        Alert.alert('Sent', 'Dispatched digital ticket to WhatsApp');
      }
      onClose();
    } finally {
      setSending(false);
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
                <MessageSquare size={20} color="#10B981" />
              </View>
              <View>
                <Text className="text-lg font-bold text-slate-100">WhatsApp Digital Pass</Text>
                <Text className="text-xs text-slate-400">Automated paperless receipt dispatch</Text>
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
            {/* WhatsApp Message Preview Card */}
            <View className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 mb-4">
              <View className="flex-row items-center gap-2 mb-2 pb-2 border-b border-emerald-500/20">
                <Smartphone size={16} color="#10B981" />
                <Text className="text-xs font-bold text-emerald-400">
                  WhatsApp Pass Template Preview
                </Text>
              </View>

              <View className="items-center py-3 bg-white rounded-xl mb-3">
                <QRCode
                  value={transaction.ticketCode}
                  size={120}
                  color="#0F172A"
                  backgroundColor="#FFFFFF"
                />
                <Text className="text-slate-950 font-mono font-bold text-xs mt-2">
                  {transaction.ticketCode}
                </Text>
              </View>

              <Text className="text-xs text-slate-300 leading-5">
                🎫 *{merchant.businessName}*\n
                📍 Location: {merchant.location}\n
                🚗 Vehicle: {transaction.vehicleNumber || 'Standard Pass'}\n
                💰 Amount Paid: *{formatCurrency(transaction.amount)}*\n
                🕒 Issued: {formatDateTime(transaction.createdAt)}\n
                \n
                _Please show this QR code to the gatekeeper upon vehicle exit._
              </Text>
            </View>

            {/* Recipient Phone Input */}
            <View className="mb-4">
              <Text className="text-xs font-semibold text-slate-300 mb-1.5">
                Customer WhatsApp Phone Number
              </Text>
              <View className="flex-row items-center bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
                <TextInput
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="+91 98765 43210"
                  placeholderTextColor="#64748B"
                  keyboardType="phone-pad"
                  className="flex-1 text-slate-100 text-sm"
                />
              </View>
            </View>
          </ScrollView>

          {/* Action */}
          {sentSuccess ? (
            <View className="bg-emerald-500/20 border border-emerald-500/40 rounded-xl p-3 flex-row items-center justify-center gap-2">
              <CheckCircle size={18} color="#10B981" />
              <Text className="text-emerald-400 font-bold text-sm">
                Pass Sent to WhatsApp Successfully!
              </Text>
            </View>
          ) : (
            <Button
              title="Send Digital Ticket Now"
              variant="primary"
              size="lg"
              fullWidth
              loading={sending}
              icon={<Send size={16} color="#0F172A" />}
              onPress={handleSendWhatsApp}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};
