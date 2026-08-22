import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Link } from 'expo-router';
import { Sparkles, AlertCircle, ArrowLeft } from 'lucide-react-native';
import theme from '../../src/config/theme';
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
      <View className="flex-1 bg-slate-950 items-center justify-center p-6">
        <Card className="w-full max-w-md p-6 items-center">
          <Text className="text-xl font-extrabold text-slate-100 text-center mb-2">
            Check your email
          </Text>
          <Text className="text-sm text-slate-400 text-center leading-5 mb-5">
            Confirm your address, then sign in. Your business is set up on the first sign-in.
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
              <Text className="text-sm font-bold text-emerald-400">Back to sign in</Text>
            </TouchableOpacity>
          </Link>
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-slate-950"
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 48 }}>
        <View className="w-full max-w-md mx-auto">
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity className="flex-row items-center gap-1.5 mb-6">
              <ArrowLeft size={16} color={theme.semantic.textMuted} />
              <Text className="text-xs font-bold text-slate-300">Back</Text>
            </TouchableOpacity>
          </Link>

          <View className="flex-row items-center gap-2 mb-6">
            <View className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 items-center justify-center">
              <Sparkles size={22} color={theme.semantic.accent} />
            </View>
            <View>
              <Text className="text-2xl font-extrabold text-slate-100">Set up your business</Text>
              <Text className="text-xs text-slate-400">Takes about a minute.</Text>
            </View>
          </View>

          <Card className="p-5 sm:p-6">
            <Field label="Business name">
              <TextInput
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="Metro Hub Parking"
                placeholderTextColor={theme.semantic.textFaint}
                className="text-slate-100 text-base"
              />
            </Field>

            <Field label="Your name">
              <TextInput
                value={ownerName}
                onChangeText={setOwnerName}
                placeholder="Rajesh Sharma"
                placeholderTextColor={theme.semantic.textFaint}
                className="text-slate-100 text-base"
              />
            </Field>

            <Field label="Phone">
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="98765 43210"
                placeholderTextColor={theme.semantic.textFaint}
                keyboardType="phone-pad"
                className="text-slate-100 text-base"
              />
            </Field>

            <Field label="Location" hint="Shown to customers on the checkout page.">
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="Connaught Place, New Delhi"
                placeholderTextColor={theme.semantic.textFaint}
                className="text-slate-100 text-base"
              />
            </Field>

            <Field label="UPI ID" hint="Where customer payments land. You can add this later.">
              <TextInput
                value={upiId}
                onChangeText={setUpiId}
                placeholder="yourbusiness@icici"
                placeholderTextColor={theme.semantic.textFaint}
                autoCapitalize="none"
                className="text-slate-100 text-base"
              />
            </Field>

            <View className="h-px bg-slate-800 my-2" />

            <Field label="Email">
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@business.com"
                placeholderTextColor={theme.semantic.textFaint}
                autoCapitalize="none"
                keyboardType="email-address"
                className="text-slate-100 text-base"
              />
            </Field>

            <Field label="Password" hint="At least 6 characters.">
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={theme.semantic.textFaint}
                secureTextEntry
                className="text-slate-100 text-base"
              />
            </Field>

            {error && (
              <View className="flex-row items-start gap-2 mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                <AlertCircle size={14} color={theme.semantic.danger} />
                <Text className="text-xs text-rose-300 flex-1 leading-4">{error}</Text>
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
