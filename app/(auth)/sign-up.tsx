import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Link } from 'expo-router';
import { Sparkles, AlertCircle, ArrowLeft } from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { authService } from '../../src/services/authService';

/**
 * Owner signup: creates the login and the business in one pass.
 *
 * provision_merchant seeds the starter pass types from src/config/pricing.ts, so
 * a brand new merchant can take money immediately rather than staring at an
 * empty Settings screen.
 */
export default function SignUpScreen() {
  const colors = useThemeColors();
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

  const submit = async () => {
    if (!businessName.trim() || !ownerName.trim() || !email.trim() || !password) {
      setError('Business name, your name, email and password are all needed.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
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
      setError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setBusy(false);
    }
  };

  if (confirmEmailNotice) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center p-6">
        <Card className="w-full max-w-md p-6 items-center">
          <Text className="text-xl font-extrabold text-brand-text text-center mb-2">
            Check your email
          </Text>
          <Text className="text-sm text-brand-text-muted text-center leading-5 mb-5">
            Confirm your address, then sign in. Your business is set up on the first sign-in.
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
              <Text className="text-sm font-bold text-brand-accent">Back to sign in</Text>
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
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity className="flex-row items-center gap-1.5 mb-6">
              <ArrowLeft size={16} color={colors['text-muted']} />
              <Text className="text-xs font-bold text-brand-text-subtle">Back</Text>
            </TouchableOpacity>
          </Link>

          <View className="flex-row items-center gap-2 mb-6">
            <View className="w-11 h-11 rounded-2xl bg-brand-accent/10 border border-brand-accent/30 items-center justify-center">
              <Sparkles size={22} color={colors['accent']} />
            </View>
            <View>
              <Text className="text-2xl font-extrabold text-brand-text">Set up your business</Text>
              <Text className="text-xs text-brand-text-muted">Takes about a minute.</Text>
            </View>
          </View>

          <Card className="p-5 sm:p-6">
            <Field label="Business name">
              <TextInput
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="Metro Hub Parking"
                placeholderTextColor={colors['text-faint']}
                className="text-brand-text text-base"
              />
            </Field>

            <Field label="Your name">
              <TextInput
                value={ownerName}
                onChangeText={setOwnerName}
                placeholder="Rajesh Sharma"
                placeholderTextColor={colors['text-faint']}
                className="text-brand-text text-base"
              />
            </Field>

            <Field label="Phone">
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="98765 43210"
                placeholderTextColor={colors['text-faint']}
                keyboardType="phone-pad"
                className="text-brand-text text-base"
              />
            </Field>

            <Field label="Location" hint="Shown to customers on the checkout page.">
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="Connaught Place, New Delhi"
                placeholderTextColor={colors['text-faint']}
                className="text-brand-text text-base"
              />
            </Field>

            <Field label="UPI ID" hint="Where customer payments land. You can add this later.">
              <TextInput
                value={upiId}
                onChangeText={setUpiId}
                placeholder="yourbusiness@icici"
                placeholderTextColor={colors['text-faint']}
                autoCapitalize="none"
                className="text-brand-text text-base"
              />
            </Field>

            <View className="h-px bg-brand-surface-raised my-2" />

            <Field label="Email">
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@business.com"
                placeholderTextColor={colors['text-faint']}
                autoCapitalize="none"
                keyboardType="email-address"
                className="text-brand-text text-base"
              />
            </Field>

            <Field label="Password" hint="At least 6 characters.">
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
              title="Create business"
              variant="primary"
              size="lg"
              fullWidth
              loading={busy}
              onPress={submit}
            />
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
