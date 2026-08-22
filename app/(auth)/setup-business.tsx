import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { Building2, AlertCircle } from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { authService } from '../../src/services/authService';
import { useAuth } from '../../src/context/AuthContext';

/**
 * Recovery for a half-finished signup.
 *
 * Reached when there is a valid session but no merchant row - which happens when
 * email confirmation is on, or when signup was interrupted between creating the
 * login and creating the business. provision_merchant is idempotent, so getting
 * here twice is harmless.
 */
export default function SetupBusinessScreen() {
  const colors = useThemeColors();
  const { refresh, signOut } = useAuth();
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [upiId, setUpiId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!businessName.trim() || !ownerName.trim()) {
      setError('Business name and your name are needed.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authService.provisionMerchant({ businessName, ownerName, phone, location, upiId });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the business.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-brand-bg"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
    >
      <View className="w-full max-w-md mx-auto">
        <View className="flex-row items-center gap-2 mb-6">
          <View className="w-11 h-11 rounded-2xl bg-brand-accent/10 border border-brand-accent/30 items-center justify-center">
            <Building2 size={22} color={colors['accent']} />
          </View>
          <View className="flex-1">
            <Text className="text-2xl font-extrabold text-brand-text">One last step</Text>
            <Text className="text-xs text-brand-text-muted">Tell us about your business.</Text>
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

          <Field label="Location">
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Connaught Place, New Delhi"
              placeholderTextColor={colors['text-faint']}
              className="text-brand-text text-base"
            />
          </Field>

          <Field label="UPI ID" hint="Where customer payments land.">
            <TextInput
              value={upiId}
              onChangeText={setUpiId}
              placeholder="yourbusiness@icici"
              placeholderTextColor={colors['text-faint']}
              autoCapitalize="none"
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
            title="Finish setup"
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
            onPress={submit}
          />
          <Button
            title="Sign out"
            variant="ghost"
            size="sm"
            fullWidth
            className="mt-2"
            onPress={signOut}
          />
        </Card>
      </View>
    </ScrollView>
  );
}
