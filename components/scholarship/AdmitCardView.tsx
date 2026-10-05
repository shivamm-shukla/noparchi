import React from 'react';
import { View, Text, TouchableOpacity, Platform, Share } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { Printer, Share2, CheckCircle2, AlertCircle, Calendar, MapPin, User, Hash, GraduationCap } from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { MerchantLogo } from '../ui/MerchantLogo';
import { formatDateTime } from '../../src/utils/formatters';
import type { PublicTicket } from '../../src/types';

interface AdmitCardViewProps {
  ticket: PublicTicket;
}

export function AdmitCardView({ ticket }: AdmitCardViewProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();

  const meta = (ticket.metadata ?? {}) as Record<string, string>;
  const studentName = ticket.primaryName || meta.student_name || 'Candidate';
  const rollNumber = meta.roll_number || ticket.ticketCode;
  const classGrade = meta.class_grade || 'Class 10';
  const targetStream = meta.target_stream || 'General';
  const examSlot = meta.exam_slot || 'Sunday, 10:00 AM';
  const parentPhone = meta.parent_phone || '';
  const isAttended = ticket.isUsed || Boolean(ticket.attendedAt);

  const handlePrint = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print();
    } else {
      Share.share({
        title: `${ticket.merchant.businessName} - Admit Card`,
        message: `Admit Card for ${studentName}\nRoll No: ${rollNumber}\nSlot: ${examSlot}\nLink: ${typeof window !== 'undefined' ? window.location.href : ''}`,
      });
    }
  };

  const handleShare = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    Share.share({
      title: `${ticket.merchant.businessName} - Admit Card`,
      message: `Dear ${studentName}, here is your official Admit Card for the Scholarship Test at ${ticket.merchant.businessName}.\nRoll No: ${rollNumber}\nSlot: ${examSlot}\nView/Print here: ${url}`,
    });
  };

  return (
    <View className="gap-5 max-w-xl mx-auto w-full">
      {/* Action Buttons for Candidate */}
      <View className="flex-row items-center justify-between gap-3 print:hidden">
        <TouchableOpacity
          onPress={handlePrint}
          className="flex-1 flex-row items-center justify-center gap-2 bg-brand-surface border border-brand-border py-3 px-4 rounded-control"
        >
          <Printer size={18} color={colors['accent']} />
          <Text className="text-xs font-bold text-brand-text">
            {t('admitCard.printButton')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleShare}
          className="flex-row items-center justify-center gap-2 bg-brand-surface border border-brand-border py-3 px-4 rounded-control"
        >
          <Share2 size={18} color={colors['text']} />
          <Text className="text-xs font-bold text-brand-text">
            {t('pass.share')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Official Admit Card Paper Container (Print-Ready) */}
      <View className="bg-white border-2 border-slate-900 rounded-panel p-6 shadow-sm">
        {/* Institute Header */}
        <View className="flex-row items-center justify-between border-b-2 border-slate-900 pb-4 mb-5">
          <View className="flex-1 pr-3">
            <Text className="text-lg font-black text-slate-900 uppercase tracking-tight">
              {ticket.merchant.businessName}
            </Text>
            <Text className="text-xs text-slate-600 mt-0.5">
              {ticket.merchant.location}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-2">
              <View className="bg-emerald-600 px-2.5 py-0.5 rounded">
                <Text className="text-[10px] font-bold text-white uppercase tracking-wider">
                  SCHOLARSHIP TEST 2026
                </Text>
              </View>
              <Text className="text-[11px] font-semibold text-slate-700">
                OFFICIAL ADMIT CARD
              </Text>
            </View>
          </View>
          <MerchantLogo
            name={ticket.merchant.businessName}
            logoUrl={ticket.merchant.branding?.logoUrl}
            size={52}
          />
        </View>

        {/* Verification Status Banner */}
        <View
          className={`flex-row items-center justify-between p-3 rounded-lg mb-5 border ${
            isAttended
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-blue-50 border-blue-300'
          }`}
        >
          <View className="flex-row items-center gap-2">
            <CheckCircle2
              size={18}
              color={isAttended ? '#059669' : '#2563EB'}
            />
            <Text
              className={`text-xs font-extrabold uppercase tracking-wide ${
                isAttended ? 'text-emerald-800' : 'text-blue-800'
              }`}
            >
              {isAttended
                ? t('admitCard.statusAttended')
                : t('admitCard.statusValid')}
            </Text>
          </View>
          {isAttended && ticket.usedAt && (
            <Text className="text-[11px] font-medium text-emerald-700">
              {t('admitCard.attendedAt', {
                time: new Date(ticket.usedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </Text>
          )}
        </View>

        {/* Roll Number & Candidate Summary Box */}
        <View className="flex-row flex-wrap justify-between gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4 mb-5">
          <View className="w-[48%]">
            <Text className="text-[10px] font-bold text-slate-500 uppercase">
              {t('admitCard.rollNo')}
            </Text>
            <Text className="text-base font-black text-slate-900 tracking-wider">
              {rollNumber}
            </Text>
          </View>

          <View className="w-[48%]">
            <Text className="text-[10px] font-bold text-slate-500 uppercase">
              {t('admitCard.student')}
            </Text>
            <Text className="text-sm font-bold text-slate-900" numberOfLines={1}>
              {studentName}
            </Text>
          </View>

          <View className="w-[48%]">
            <Text className="text-[10px] font-bold text-slate-500 uppercase">
              {t('admitCard.classStream')}
            </Text>
            <Text className="text-xs font-bold text-slate-800">
              {classGrade} {targetStream !== 'General' ? `(${targetStream})` : ''}
            </Text>
          </View>

          <View className="w-[48%]">
            <Text className="text-[10px] font-bold text-slate-500 uppercase">
              Parent Contact
            </Text>
            <Text className="text-xs font-semibold text-slate-800">
              {parentPhone || 'Provided at registration'}
            </Text>
          </View>
        </View>

        {/* Exam Timing and Center */}
        <View className="border-t border-b border-slate-200 py-3.5 mb-5 gap-2">
          <View className="flex-row items-center gap-2">
            <Calendar size={15} color="#475569" />
            <Text className="text-xs font-bold text-slate-900">
              {t('admitCard.slot')}:{' '}
              <Text className="font-semibold text-slate-700">{examSlot}</Text>
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <MapPin size={15} color="#475569" />
            <Text className="text-xs font-bold text-slate-900">
              {t('admitCard.center')}:{' '}
              <Text className="font-semibold text-slate-700">
                {ticket.merchant.location}
              </Text>
            </Text>
          </View>
        </View>

        {/* Center QR & Barcode Section */}
        <View className="items-center py-4 bg-slate-50 border border-slate-200 rounded-lg mb-5">
          <View className="p-3 bg-white border border-slate-300 rounded-lg shadow-2xs mb-2">
            <QRCode
              value={JSON.stringify({ ticketCode: ticket.ticketCode })}
              size={140}
              color="#0F172A"
              backgroundColor="#FFFFFF"
            />
          </View>
          <Text className="text-xs font-mono font-bold tracking-widest text-slate-900 mt-1">
            {ticket.ticketCode}
          </Text>
          <Text className="text-[10px] text-slate-500 mt-0.5">
            Scan at exam center entrance for entry verification
          </Text>
        </View>

        {/* Candidate Guidelines / Instructions */}
        <View className="pt-2">
          <Text className="text-[11px] font-bold text-slate-800 mb-1.5">
            {t('admitCard.instructionsTitle')}
          </Text>
          <Text className="text-[10px] text-slate-600 leading-4">
            {t('admitCard.inst1')}
          </Text>
          <Text className="text-[10px] text-slate-600 leading-4 mt-1">
            {t('admitCard.inst2')}
          </Text>
          <Text className="text-[10px] text-slate-600 leading-4 mt-1">
            {t('admitCard.inst3')}
          </Text>
        </View>

        {/* Official Watermark / Footer */}
        <View className="border-t border-slate-200 mt-5 pt-3 flex-row items-center justify-between">
          <Text className="text-[9px] text-slate-400 font-mono">
            ISSUED: {formatDateTime(ticket.issuedAt)}
          </Text>
          <Text className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
            NoParchi O2O Pass Engine
          </Text>
        </View>
      </View>
    </View>
  );
}
