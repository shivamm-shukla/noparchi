import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { AlertCircle, Mail, KeyRound, Smartphone, AlertTriangle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../src/context/ThemeContext';
import { useAuth } from '../../../src/context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Logo } from '../../../components/ui/Logo';
import { Field } from '../../../components/ui/Field';
import { GoogleIcon } from '../../../components/ui/GoogleIcon';
import { authService, type StaffAccountChoice, SupabaseUnreachableError, isNetworkError } from '../../../src/services/authService';

type Mode = 'owner' | 'staff';

export default function SignInScreen() {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const router = useRouter();
  const { signInDemo } = useAuth();
  const [mode, setMode] = useState<Mode>('owner');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnreachable, setIsUnreachable] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [choices, setChoices] = useState<StaffAccountChoice[] | null>(null);

  const handleDemoSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInDemo();
      router.replace('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign in failed');
    } finally {
      setBusy(false);
    }
  };

  const submitOwner = async () => {
    setBusy(true);
    setError(null);
    setIsUnreachable(false);
    try {
      await authService.signInOwner(email, password);
      // The auth state listener in AuthContext routes onward.
    } catch (err) {
      if (err instanceof SupabaseUnreachableError || isNetworkError(err)) {
        setIsUnreachable(true);
      } else {
        setError(err instanceof Error ? err.message : t('auth.signInFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const submitGoogle = async () => {
    setBusy(true);
    setError(null);
    setIsUnreachable(false);
    try {
      await authService.signInWithGoogle();
    } catch (err) {
      if (err instanceof SupabaseUnreachableError || isNetworkError(err)) {
        setIsUnreachable(true);
      } else {
        setError(err instanceof Error ? err.message : t('auth.signInFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const submitStaff = async (userId?: string) => {
    setBusy(true);
    setError(null);
    setIsUnreachable(false);
    try {
      const result = await authService.signInStaff({ phone, pin, userId });
      // The same number can work at more than one business; ask rather than guess.
      if (result.needsChoice) setChoices(result.needsChoice);
    } catch (err) {
      if (err instanceof SupabaseUnreachableError || isNetworkError(err)) {
        setIsUnreachable(true);
      } else {
        setError(err instanceof Error ? err.message : t('auth.signInFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-brand-bg"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View className="w-full max-w-md mx-auto">
          <View className="items-center mb-8">
            <Logo size={56} tagline />
            <Text className="text-sm text-brand-text-muted mt-3">{t('auth.tagline')}</Text>
          </View>

          <Card className="p-5 sm:p-6">
            <View className="flex-row bg-brand-bg border border-brand-border rounded-2xl p-1 mb-5">
              <ModeTab
                label={t('auth.modeOwner')}
                icon={<Mail size={14} color={mode === 'owner' ? colors['on-accent'] : colors['text-muted']} />}
                active={mode === 'owner'}
                onPress={() => { setMode('owner'); setError(null); }}
              />
              <ModeTab
                label={t('auth.modeGatekeeper')}
                icon={<Smartphone size={14} color={mode === 'staff' ? colors['on-accent'] : colors['text-muted']} />}
                active={mode === 'staff'}
                onPress={() => { setMode('staff'); setError(null); }}
              />
            </View>

            {mode === 'owner' ? (
              <>
                <Field label={t('auth.email')}>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder={t('auth.emailPlaceholder')}
                    placeholderTextColor={colors['text-faint']}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    className="text-brand-text text-base"
                  />
                </Field>

                <Field label={t('auth.password')}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={colors['text-faint']}
                    secureTextEntry
                    textContentType="password"
                    onSubmitEditing={submitOwner}
                    className="text-brand-text text-base"
                  />
                </Field>

                <Button
                  title={t('auth.signIn')}
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={busy}
                  onPress={submitOwner}
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

                <Button
                  title="🚀 Demo Account Login (No Setup Needed)"
                  variant="ghost"
                  size="md"
                  fullWidth
                  className="mt-2"
                  onPress={handleDemoSignIn}
                />

                <View className="flex-row items-center justify-center gap-1.5 mt-4">
                  <Text className="text-xs text-brand-text-muted">{t('auth.newHere')}</Text>
                  <Link href="/app/sign-up" asChild>
                    <TouchableOpacity>
                      <Text className="text-xs font-bold text-brand-accent">
                        {t('auth.createBusiness')}
                      </Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </>
            ) : choices ? (
              <>
                <Text className="text-sm font-bold text-brand-text mb-1">
                  {t('auth.whichBusiness')}
                </Text>
                <Text className="text-xs text-brand-text-muted mb-4 leading-4">
                  {t('auth.whichBusinessBody')}
                </Text>
                <View className="gap-2.5">
                  {choices.map((choice) => (
                    <TouchableOpacity
                      key={choice.userId}
                      onPress={() => submitStaff(choice.userId)}
                      activeOpacity={0.7}
                      className="p-4 rounded-2xl bg-brand-bg border border-brand-border active:border-brand-accent/50"
                    >
                      <Text className="text-sm font-bold text-brand-text">{choice.businessName}</Text>
                      <Text className="text-xs text-brand-text-muted mt-0.5">{choice.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Field label={t('auth.phoneNumber')}>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder={t('auth.phonePlaceholder')}
                    placeholderTextColor={colors['text-faint']}
                    keyboardType="phone-pad"
                    className="text-brand-text text-base"
                  />
                </Field>

                <Field label={t('auth.pin')}>
                  <TextInput
                    value={pin}
                    onChangeText={setPin}
                    placeholder="••••"
                    placeholderTextColor={colors['text-faint']}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={8}
                    onSubmitEditing={() => submitStaff()}
                    className="text-brand-text text-2xl font-bold tracking-[0.4em]"
                  />
                </Field>

                <Button
                  title={t('auth.startShift')}
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={busy}
                  icon={<KeyRound size={16} color={colors['on-accent']} />}
                  onPress={() => submitStaff()}
                />

                <Button
                  title="🚀 Demo Gatekeeper Mode"
                  variant="ghost"
                  size="md"
                  fullWidth
                  className="mt-2"
                  onPress={handleDemoSignIn}
                />

                <Text className="text-[11px] text-brand-text-faint text-center mt-4 leading-4">
                  {t('auth.pinNote')}
                </Text>
              </>
            )}

            {isUnreachable && (
              <View className="mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <View className="flex-row items-center gap-2 mb-1.5">
                  <AlertTriangle size={16} color={colors['warning']} />
                  <Text className="text-sm font-bold text-brand-text">
                    Supabase Server Unreachable (Failed to fetch)
                  </Text>
                </View>
                <Text className="text-xs text-brand-text-muted leading-5 mb-3">
                  Supabase cloud backend connect nahi ho pa raha. Aap Demo Account se 1-click login karke NoParchi ke saare features test kar sakte hain!
                </Text>
                <Button
                  title="🚀 1-Click Demo Login"
                  variant="primary"
                  size="md"
                  fullWidth
                  loading={busy}
                  onPress={handleDemoSignIn}
                />
              </View>
            )}

            {error && (
              <View className="flex-row items-start gap-2 mt-4 p-3 rounded-xl bg-brand-danger/10 border border-brand-danger/30">
                <AlertCircle size={14} color={colors['danger']} />
                <Text className="text-xs text-brand-danger flex-1 leading-4">{error}</Text>
              </View>
            )}
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const ModeTab: React.FC<{
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onPress: () => void;
}> = ({ label, icon, active, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.8}
    className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl ${
      active ? 'bg-brand-accent' : 'bg-transparent'
    }`}
  >
    {icon}
    <Text className={`text-xs font-bold ${active ? 'text-brand-on-accent' : 'text-brand-text-muted'}`}>
      {label}
    </Text>
  </TouchableOpacity>
);

