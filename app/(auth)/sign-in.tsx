import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Link } from 'expo-router';
import { AlertCircle, Mail, KeyRound, Smartphone } from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Logo } from '../../components/ui/Logo';
import { Field } from '../../components/ui/Field';
import { authService, type StaffAccountChoice } from '../../src/services/authService';

type Mode = 'owner' | 'staff';

/**
 * Two ways in, because the two users are genuinely different.
 *
 * An owner signs in with an email and password on their own phone. A gatekeeper
 * signs in with a phone number and a short PIN, often on a device shared across
 * a shift, standing at a gate. Forcing either into the other's flow makes the
 * product unusable for them.
 *
 * Both end in a real Supabase session. That is the point: every permission
 * check in the database resolves from the JWT, so an identity that exists only
 * in app state - as the previous build's did - protects nothing.
 */
export default function SignInScreen() {
  const colors = useThemeColors();
  const [mode, setMode] = useState<Mode>('owner');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [choices, setChoices] = useState<StaffAccountChoice[] | null>(null);

  const submitOwner = async () => {
    setBusy(true);
    setError(null);
    try {
      await authService.signInOwner(email, password);
      // The auth state listener in AuthContext routes onward.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  const submitStaff = async (userId?: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await authService.signInStaff({ phone, pin, userId });
      // The same number can work at more than one business; ask rather than guess.
      if (result.needsChoice) setChoices(result.needsChoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
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
            <Text className="text-sm text-brand-text-muted mt-3">No paper. No stolen cash.</Text>
          </View>

          <Card className="p-5 sm:p-6">
            <View className="flex-row bg-brand-bg border border-brand-border rounded-2xl p-1 mb-5">
              <ModeTab
                label="Owner"
                icon={<Mail size={14} color={mode === 'owner' ? colors['on-accent'] : colors['text-muted']} />}
                active={mode === 'owner'}
                onPress={() => { setMode('owner'); setError(null); }}
              />
              <ModeTab
                label="Gatekeeper"
                icon={<Smartphone size={14} color={mode === 'staff' ? colors['on-accent'] : colors['text-muted']} />}
                active={mode === 'staff'}
                onPress={() => { setMode('staff'); setError(null); }}
              />
            </View>

            {mode === 'owner' ? (
              <>
                <Field label="Email">
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@business.com"
                    placeholderTextColor={colors['text-faint']}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    className="text-brand-text text-base"
                  />
                </Field>

                <Field label="Password">
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
                  title="Sign in"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={busy}
                  onPress={submitOwner}
                />

                <View className="flex-row items-center justify-center gap-1.5 mt-4">
                  <Text className="text-xs text-brand-text-muted">New here?</Text>
                  <Link href="/(auth)/sign-up" asChild>
                    <TouchableOpacity>
                      <Text className="text-xs font-bold text-brand-accent">Create a business</Text>
                    </TouchableOpacity>
                  </Link>
                </View>
              </>
            ) : choices ? (
              <>
                <Text className="text-sm font-bold text-brand-text mb-1">Which business?</Text>
                <Text className="text-xs text-brand-text-muted mb-4 leading-4">
                  That number works at more than one place.
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
                <Field label="Phone number">
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="98765 43210"
                    placeholderTextColor={colors['text-faint']}
                    keyboardType="phone-pad"
                    className="text-brand-text text-base"
                  />
                </Field>

                <Field label="PIN">
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
                  title="Start shift"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={busy}
                  icon={<KeyRound size={16} color={colors['on-accent']} />}
                  onPress={() => submitStaff()}
                />

                <Text className="text-[11px] text-brand-text-faint text-center mt-4 leading-4">
                  Your PIN is set by the business owner. Five wrong tries locks the account
                  for fifteen minutes.
                </Text>
              </>
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

