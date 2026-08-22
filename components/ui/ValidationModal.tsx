import React from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import { CheckCircle2, XCircle, AlertTriangle, ShieldX, Clock, Car, UserCheck, X } from 'lucide-react-native';
import { TicketValidationResult } from '../../src/types';
import { Button } from './Button';
import { formatCurrency, formatDateTime, formatTimeAgo } from '../../src/utils/formatters';

interface ValidationModalProps {
  result: TicketValidationResult | null;
  visible: boolean;
  onClose: () => void;
}

export const ValidationModal: React.FC<ValidationModalProps> = ({
  result,
  visible,
  onClose,
}) => {
  if (!result) return null;

  const isVerified = result.status === 'VERIFIED';
  const isAlreadyUsed = result.status === 'ALREADY_USED';
  const isUnauthorized = result.status === 'UNAUTHORIZED';
  const isInvalid = result.status === 'INVALID';

  const getModalTheme = () => {
    if (isVerified) {
      return {
        bg: 'bg-emerald-950/95 border-emerald-500/50',
        iconBg: 'bg-emerald-500/20 border-emerald-500/40',
        icon: <CheckCircle2 size={44} color="#10B981" />,
        badgeText: 'EXIT PASS CLEARED',
        badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        title: 'Ticket Verified Successfully',
      };
    }
    if (isAlreadyUsed) {
      return {
        bg: 'bg-rose-950/95 border-rose-500/50',
        iconBg: 'bg-rose-500/20 border-rose-500/40',
        icon: <XCircle size={44} color="#EF4444" />,
        badgeText: 'DUPLICATE / ALREADY USED',
        badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        title: 'Already Used Pass!',
      };
    }
    if (isUnauthorized) {
      return {
        bg: 'bg-amber-950/95 border-amber-500/50',
        iconBg: 'bg-amber-500/20 border-amber-500/40',
        icon: <ShieldX size={44} color="#F59E0B" />,
        badgeText: 'PERMISSION DENIED',
        badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        title: 'Staff Unauthorized',
      };
    }
    return {
      bg: 'bg-slate-900 border-slate-700',
      iconBg: 'bg-slate-800 border-slate-700',
      icon: <AlertTriangle size={44} color="#94A3B8" />,
      badgeText: 'INVALID PASS',
      badgeBg: 'bg-slate-800 text-slate-300 border-slate-700',
      title: 'Invalid QR Code',
    };
  };

  const theme = getModalTheme();
  const tx = result.transaction;
  const val = result.validation;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/80 items-center justify-center p-4">
        <View
          className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl ${theme.bg}`}
        >
          {/* Close button */}
          <TouchableOpacity
            onPress={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-800/80 items-center justify-center z-10"
          >
            <X size={16} color="#94A3B8" />
          </TouchableOpacity>

          {/* Status Icon */}
          <View className="items-center mb-4">
            <View
              className={`w-20 h-20 rounded-full border items-center justify-center mb-3 ${theme.iconBg}`}
            >
              {theme.icon}
            </View>

            <View
              className={`px-3 py-1 rounded-full border mb-2 ${theme.badgeBg}`}
            >
              <Text className="text-xs font-extrabold tracking-wider uppercase text-center">
                {theme.badgeText}
              </Text>
            </View>

            <Text className="text-xl font-extrabold text-slate-100 text-center">
              {theme.title}
            </Text>
            <Text className="text-xs text-slate-300 text-center mt-1">
              {result.message}
            </Text>
          </View>

          {/* Details Card */}
          {tx && (
            <View className="bg-slate-900/90 rounded-2xl p-4 border border-slate-800/90 mb-5 gap-2.5">
              <View className="flex-row items-center justify-between pb-2 border-b border-slate-800">
                <Text className="text-xs text-slate-400 font-semibold">Ticket Token</Text>
                <Text className="text-xs font-mono font-bold text-emerald-400">
                  {tx.ticketCode}
                </Text>
              </View>

              {tx.vehicleNumber && (
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <Car size={14} color="#94A3B8" />
                    <Text className="text-xs text-slate-400">Vehicle No.</Text>
                  </View>
                  <Text className="text-sm font-bold text-slate-100 uppercase">
                    {tx.vehicleNumber}
                  </Text>
                </View>
              )}

              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-slate-400">Amount Paid</Text>
                <Text className="text-sm font-extrabold text-emerald-400">
                  {formatCurrency(tx.amount)}
                </Text>
              </View>

              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5">
                  <Clock size={14} color="#94A3B8" />
                  <Text className="text-xs text-slate-400">Issued At</Text>
                </View>
                <Text className="text-xs text-slate-300">
                  {formatDateTime(tx.createdAt)} ({formatTimeAgo(tx.createdAt)})
                </Text>
              </View>

              {val && (
                <View className="pt-2 mt-1 border-t border-slate-800 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <UserCheck size={14} color="#94A3B8" />
                    <Text className="text-xs text-slate-400">Validated By</Text>
                  </View>
                  <Text className="text-xs font-bold text-slate-300">
                    {val.scannedByUser?.name || 'Staff'} ({val.exitGate || 'Exit'})
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Action Button */}
          <Button
            title={isVerified ? 'Clear & Scan Next Ticket' : 'Dismiss'}
            variant={isVerified ? 'primary' : isAlreadyUsed ? 'danger' : 'secondary'}
            size="lg"
            fullWidth
            onPress={onClose}
          />
        </View>
      </View>
    </Modal>
  );
};
