import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Phone, User, Calendar, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { checkoutService } from '../../src/services/checkoutService';
import type { CheckoutMerchant } from '../../src/types';

const CLASS_OPTIONS = [
  'Class 8',
  'Class 9',
  'Class 10',
  'Class 11 (JEE)',
  'Class 11 (NEET)',
  'Class 12 (JEE)',
  'Class 12 (NEET)',
  'Dropper / Repeater',
];

const DEFAULT_SLOTS = [
  'Sunday, 10:00 AM - 12:00 PM (Slot 1)',
  'Sunday, 02:00 PM - 04:00 PM (Slot 2)',
  'Sunday, 05:00 PM - 07:00 PM (Slot 3)',
];

interface ScholarshipRegistrationFormProps {
  merchant: CheckoutMerchant;
  onSuccess: (result: {
    ticketCode: string;
    rollNumber: string;
    studentName: string;
    examSlot: string;
  }) => void;
}

export function ScholarshipRegistrationForm({ merchant, onSuccess }: ScholarshipRegistrationFormProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();

  const [studentName, setStudentName] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [classGrade, setClassGrade] = useState('Class 10');
  const [examSlot, setExamSlot] = useState(DEFAULT_SLOTS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!studentName.trim()) {
      setError(t('scholarship.errorName'));
      return;
    }
    const cleanStudentPhone = studentPhone.replace(/\D/g, '');
    if (cleanStudentPhone.length < 10) {
      setError(t('scholarship.errorStudentPhone'));
      return;
    }
    const cleanParentPhone = parentPhone.replace(/\D/g, '');
    if (cleanParentPhone.length < 10) {
      setError(t('scholarship.errorParentPhone'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await checkoutService.registerScholarship({
        merchantId: merchant.id,
        studentName: studentName.trim(),
        studentPhone: cleanStudentPhone,
        parentPhone: cleanParentPhone,
        classGrade,
        examSlot,
        campaignSource: 'banner_qr',
      });
      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-5">
      {/* Scholarship Banner Header Card */}
      <Card className="p-5 items-center bg-brand-surface border-brand-accent/20">
        <View className="w-12 h-12 rounded-full bg-brand-accent/10 items-center justify-center mb-3">
          <GraduationCap size={26} color={colors['accent']} />
        </View>
        <Text className="text-xs font-bold text-brand-accent uppercase tracking-wider text-center">
          {t('scholarship.badge')}
        </Text>
        <Text className="text-xl font-extrabold text-brand-text text-center mt-1">
          {t('scholarship.title')}
        </Text>
        <Text className="text-xs text-brand-text-muted text-center mt-1.5 leading-4">
          {t('scholarship.subtitle')}
        </Text>
      </Card>

      {/* Registration Input Form */}
      <Card className="p-5 gap-4">
        {/* Student Name */}
        <View>
          <Text className="text-xs font-semibold text-brand-text mb-1.5 flex-row items-center gap-1">
            {t('scholarship.studentName')} *
          </Text>
          <View className="flex-row items-center bg-brand-bg border border-brand-border rounded-control px-3 h-12">
            <User size={18} color={colors['text-muted']} className="mr-2" />
            <TextInput
              value={studentName}
              onChangeText={setStudentName}
              placeholder={t('scholarship.studentNamePlaceholder')}
              placeholderTextColor={colors['text-muted']}
              className="flex-1 text-sm text-brand-text"
              autoCapitalize="words"
            />
          </View>
        </View>

        {/* Student WhatsApp Phone */}
        <View>
          <Text className="text-xs font-semibold text-brand-text mb-1.5">
            {t('scholarship.studentPhone')} *
          </Text>
          <View className="flex-row items-center bg-brand-bg border border-brand-border rounded-control px-3 h-12">
            <Phone size={18} color={colors['text-muted']} className="mr-2" />
            <TextInput
              value={studentPhone}
              onChangeText={setStudentPhone}
              placeholder={t('scholarship.studentPhonePlaceholder')}
              placeholderTextColor={colors['text-muted']}
              keyboardType="phone-pad"
              maxLength={10}
              className="flex-1 text-sm text-brand-text"
            />
          </View>
        </View>

        {/* Parent Mobile Number */}
        <View>
          <Text className="text-xs font-semibold text-brand-text mb-1.5">
            {t('scholarship.parentPhone')} *
          </Text>
          <View className="flex-row items-center bg-brand-bg border border-brand-border rounded-control px-3 h-12">
            <Phone size={18} color={colors['text-muted']} className="mr-2" />
            <TextInput
              value={parentPhone}
              onChangeText={setParentPhone}
              placeholder={t('scholarship.parentPhonePlaceholder')}
              placeholderTextColor={colors['text-muted']}
              keyboardType="phone-pad"
              maxLength={10}
              className="flex-1 text-sm text-brand-text"
            />
          </View>
        </View>

        {/* Target Class Selection */}
        <View>
          <Text className="text-xs font-semibold text-brand-text mb-2">
            {t('scholarship.targetClass')} *
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {CLASS_OPTIONS.map((cls) => {
              const selected = classGrade === cls;
              return (
                <TouchableOpacity
                  key={cls}
                  onPress={() => setClassGrade(cls)}
                  className={`px-3 py-2 rounded-full border ${
                    selected
                      ? 'bg-brand-accent/15 border-brand-accent'
                      : 'bg-brand-bg border-brand-border'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      selected ? 'text-brand-accent' : 'text-brand-text-muted'
                    }`}
                  >
                    {cls}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Exam Slot Selection */}
        <View>
          <Text className="text-xs font-semibold text-brand-text mb-2">
            {t('scholarship.examSlot')} *
          </Text>
          <View className="gap-2">
            {DEFAULT_SLOTS.map((slot) => {
              const selected = examSlot === slot;
              return (
                <TouchableOpacity
                  key={slot}
                  onPress={() => setExamSlot(slot)}
                  className={`flex-row items-center p-3 rounded-control border ${
                    selected
                      ? 'bg-brand-accent/10 border-brand-accent'
                      : 'bg-brand-bg border-brand-border'
                  }`}
                >
                  <Calendar
                    size={16}
                    color={selected ? colors['accent'] : colors['text-muted']}
                    className="mr-2.5"
                  />
                  <Text
                    className={`text-xs flex-1 ${
                      selected ? 'font-bold text-brand-text' : 'text-brand-text-muted'
                    }`}
                  >
                    {slot}
                  </Text>
                  {selected && <CheckCircle2 size={16} color={colors['accent']} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Error message */}
        {error && (
          <View className="flex-row items-center gap-2 p-3 rounded-control bg-brand-danger/10 border border-brand-danger/30">
            <AlertCircle size={16} color={colors['danger']} />
            <Text className="text-xs text-brand-danger flex-1">{error}</Text>
          </View>
        )}

        {/* Submit Button */}
        <Button
          title={busy ? t('scholarship.registering') : t('scholarship.registerFree')}
          variant="primary"
          size="lg"
          fullWidth
          loading={busy}
          onPress={handleSubmit}
        />
      </Card>
    </View>
  );
}
