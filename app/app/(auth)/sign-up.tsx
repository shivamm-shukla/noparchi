import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Link } from 'expo-router';
import { Sparkles, AlertCircle, ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../src/context/ThemeContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Field } from '../../../components/ui/Field';
import { GoogleIcon } from '../../../components/ui/GoogleIcon';
import { authService } from '../../../src/services/authService';

/**
 * Owner signup: creates the login and the business in one pass.
 *
 * provision_merchant seeds the starter pass types from src/config/pricing.ts, so
 * a brand new merchant can take money immediately rather than staring at an
 * empty Settings screen.
 */
export default function SignUpScreen() {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [upiId, setUpiId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmailNotice, setConfirmEmailNotice] = useState(false);

  const submitGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      await authService.signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.signUpFailed'));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!businessName.trim() || !ownerName.trim() || !email.trim() || !password) {
      setError(t('auth.signUpMissing'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await authService.signUpOwner({
        email,
        password,
        businessName,
        ownerName,
        phone,
        location,
        upiId,
      });
      // With email confirmation switched on in Supabase, signUp returns no
      // session, so there is nothing to route to yet. Provisioning is
      // idempotent and runs on the first real sign-in instead.
      if (!(await authService.hasSession())) setConfirmEmailNotice(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.signUpFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (confirmEmailNotice) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center p-6">
        <Card className="w-full max-w-md p-6 items-center">
          <Text className="text-xl font-extrabold text-brand-text text-center mb-2">
            {t('auth.checkEmailTitle')}
          </Text>
          <Text className="text-sm text-brand-text-muted text-center leading-5 mb-5">
            {t('auth.checkEmailBody')}
          </Text>
          <Link href="/app/sign-in" asChild>
            <TouchableOpacity>
              <Text className="text-sm font-bold text-brand-accent">
                {t('auth.backToSignIn')}
              </Text>
            </TouchableOpacity>
          </Link>
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-brand-bg"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 48 }}>
        <View className="w-full max-w-md mx-auto">
          <Link href="/app/sign-in" asChild>
            <TouchableOpacity className="flex-row items-center gap-1.5 mb-6">
              <ArrowLeft size={16} color={colors['text-muted']} />
              <Text className="text-xs font-bold text-brand-text-subtle">{t('auth.back')}</Text>
            </TouchableOpacity>
          </Link>

          <View className="flex-row items-center gap-2 mb-6">
            <View className="w-11 h-11 rounded-2xl bg-brand-accent/10 border border-brand-accent/30 items-center justify-center">
              <Sparkles size={22} color={colors['accent']} />
            </View>
            <View>
              <Text className="text-2xl font-extrabold text-brand-text">
                {t('auth.signUpTitle')}
              </Text>
              <Text className="text-xs text-brand-text-muted">{t('auth.signUpSubtitle')}</Text>
            </View>
          </View>

          <Card className="p-5 sm:p-6">
            <Field label={t('auth.businessName')}>
              <TextInput
                value={businessName}
                onChangeText={setBusinessName}
                placeholder={t('auth.businessNamePlaceholder')}
                placeholderTextColor={colors['text-faint']}
                className="text-brand-text text-base"
              />
            </Field>

            <Field label={t('auth.yourName')}>
              <TextInput
                value={ownerName}
                onChangeText={setOwnerName}
                placeholder={t('auth.yourNamePlaceholder')}
                placeholderTextColor={colors['text-faint']}
                className="text-brand-text text-base"
              />
            </Field>

            <Field label={t('auth.phone')}>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder={t('auth.phonePlaceholder')}
                placeholderTextColor={colors['text-faint']}
                keyboardType="phone-pad"
                className="text-brand-text text-base"
              />
            </Field>

            <Field label={t('auth.location')} hint={t('auth.locationHintSignUp')}>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder={t('auth.locationPlaceholder')}
                placeholderTextColor={colors['text-faint']}
                className="text-brand-text text-base"
              />
            </Field>

            <Field label={t('auth.upiId')} hint={t('auth.upiHintSignUp')}>
              <TextInput
                value={upiId}
                onChangeText={setUpiId}
                placeholder={t('auth.upiPlaceholder')}
                placeholderTextColor={colors['text-faint']}
                autoCapitalize="none"
                className="text-brand-text text-base"
              />
            </Field>

            <View className="h-px bg-brand-surface-raised my-2" />

            <Field label={t('auth.email')}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor={colors['text-faint']}
                autoCapitalize="none"
                keyboardType="email-address"
                className="text-brand-text text-base"
              />
            </Field>

            <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors['text-faint']}
                secureTextEntry
                className="text-brand-text text-base"
              />
            </Field>

            {error && (
              <View className="flex-row items-start gap-2 mb-4 p-3 rounded-xl bg-brand-danger/10 border border-brand-danger/30">
                <AlertCircle size={14} color={colors['danger']} />
                <Text className="text-xs text-brand-danger flex-1 leading-4">{error}</Text>
              </View>
            )}

            <Button
              title={t('auth.createBusinessCta')}
              variant="primary"
              size="lg"
              fullWidth
              loading={busy}
              onPress={submit}
            />

            <View className="flex-row items-center my-3.5">
              <View className="flex-1 h-px bg-brand-border" />
              <Text className="px-3 text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">{t('auth.orDivider')}</Text>
              <View className="flex-1 h-px bg-brand-border" />
            </View>

            <Button
              title={t('auth.googleSignIn')}
              variant="secondary"
              size="lg"
              fullWidth
              disabled={busy}
              icon={<GoogleIcon size={18} />}
              onPress={submitGoogle}
            />

            <View className="flex-row items-center justify-center gap-1.5 mt-4">
              <Text className="text-xs text-brand-text-muted">{t('auth.alreadyHaveAccount')}</Text>
              <Link href="/app/sign-in" asChild>
                <TouchableOpacity>
                  <Text className="text-xs font-bold text-brand-accent">
                    {t('auth.signIn')}
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
