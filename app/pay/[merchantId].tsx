import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { ShieldCheck, AlertCircle, Smartphone, CheckCircle2 } from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Card } from '../../components/ui/Card';
import { MerchantLogo } from '../../components/ui/MerchantLogo';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { checkoutService, type CheckoutInfo } from '../../src/services/checkoutService';
import { paymentProvider } from '../../src/services/payment';
import { ticketTypeIcon } from '../../src/config/icons';
import { formatCurrency } from '../../src/utils/formatters';

/**
 * The app-less customer checkout.
 *
 * Everything on this page belongs to the merchant named in the URL. The
 * previous version destructured merchantId from the route and then never used
 * it, rendering the app's own hardcoded merchant instead - so every business's
 * gate QR led to the same shop, at the same prices, paying the same UPI ID.
 *
 * It also no longer issues a valid pass from a button. Checkout creates the
 * pass as pending; it is worthless at the gate until payment is confirmed. What
 * the customer gets here is a pass code to show, not a cleared entry.
 */
export default function CheckoutScreen() {
  const colors = useThemeColors();
  const { merchantId } = useLocalSearchParams<{ merchantId: string }>();
  const router = useRouter();

  const [info, setInfo] = useState<CheckoutInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!merchantId) return;
    setLoading(true);
    try {
      setError(null);
      const result = await checkoutService.loadCheckout(merchantId);
      setInfo(result);
      setSelectedCode(result.ticketTypes[0]?.code ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This gate QR is not active.');
    } finally {
      setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    load();
  }, [load]);

  const chosen = info?.ticketTypes.find((t) => t.code === selectedCode) ?? null;

  const pay = async () => {
    if (!info || !chosen || !merchantId) return;
    setBusy(true);
    setError(null);
    try {
      // The pass is created first, and its amount comes from the merchant's own
      // ticket type row inside the database - never from this browser.
      const started = await checkoutService.startCheckout({
        merchantId,
        ticketTypeCode: chosen.code,
        vehicleNumber: vehicleNumber.trim() || undefined,
        customerPhone: phone.trim() || undefined,
      });

      const provider = paymentProvider(info.merchant.paymentProvider);
      const result = await provider.begin({
        merchantId,
        merchantName: info.merchant.businessName,
        upiId: info.merchant.upiId,
        ticketCode: started.ticketCode,
        amount: started.amount,
        currency: info.merchant.currency,
        note: `${info.merchant.businessName} ${started.ticketTypeLabel}`,
      });

      if (result.outcome === 'failed') {
        setError(result.error ?? 'Could not start the payment.');
        return;
      }

      setIssuedCode(started.ticketCode);
      setPayUrl(result.payUrl ?? null);

      // Only a provider that can prove payment - one with a webhook - may send
      // the customer straight to their pass. UPI cannot, so the customer stays
      // here until a gatekeeper confirms.
      if (result.outcome === 'confirmed') {
        router.replace(`/ticket/${started.ticketCode}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the payment.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center">
        <ActivityIndicator size="large" color={colors['accent']} />
      </View>
    );
  }

  if (!info) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center p-6">
        <Card className="w-full max-w-md items-center p-6">
          <AlertCircle size={28} color={colors['warning']} />
          <Text className="text-base font-bold text-brand-text mt-3 text-center">
            {error ?? 'This gate QR is not active.'}
          </Text>
          <Text className="text-xs text-brand-text-muted mt-2 text-center leading-4">
            Ask the staff at the counter for help.
          </Text>
        </Card>
      </View>
    );
  }

  const { merchant, ticketTypes } = info;

  return (
    <View className="flex-1 bg-brand-bg">
      <View className="bg-brand-surface border-b border-brand-border px-4 py-4">
        <View className="max-w-lg mx-auto w-full flex-row items-center justify-between">
          <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
            <MerchantLogo
              name={merchant.businessName}
              logoUrl={merchant.branding?.logoUrl}
              size={36}
            />
            <View className="flex-1 min-w-0">
              <Text numberOfLines={1} className="text-base font-extrabold text-brand-text">
                {merchant.businessName}
              </Text>
              <Text numberOfLines={1} className="text-xs text-brand-text-muted">
                {merchant.location}
              </Text>
            </View>
          </View>
          <Badge label="No app needed" variant="success" size="sm" />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="max-w-lg mx-auto w-full px-4 py-6">
          {issuedCode ? (
            <PendingPass
              ticketCode={issuedCode}
              amount={chosen?.amount ?? 0}
              currency={merchant.currency}
              payUrl={payUrl}
              onOpenPass={() => router.push(`/ticket/${issuedCode}`)}
            />
          ) : (
            <>
              <Card className="mb-5 items-center p-5">
                <Text className="text-xs font-bold text-brand-accent uppercase tracking-widest mb-1">
                  Entry pass
                </Text>
                <Text className="text-2xl font-extrabold text-brand-text text-center">
                  Pay and get your pass
                </Text>
                <Text className="text-xs text-brand-text-muted text-center mt-1 leading-4">
                  Show it at the exit. Nothing to install, nothing to print.
                </Text>
              </Card>

              <Text className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider mb-2.5">
                1. Choose your pass
              </Text>
              <View className="flex-row flex-wrap gap-2.5 mb-5">
                {ticketTypes.map((type) => {
                  const Icon = ticketTypeIcon(type.icon);
                  const isSelected = selectedCode === type.code;
                  return (
                    <TouchableOpacity
                      key={type.code}
                      onPress={() => setSelectedCode(type.code)}
                      activeOpacity={0.7}
                      className={`flex-1 min-w-[45%] p-3.5 rounded-2xl border ${
                        isSelected
                          ? 'bg-brand-accent/10 border-brand-accent/60'
                          : 'bg-brand-surface border-brand-border'
                      }`}
                    >
                      <View className="flex-row items-center justify-between mb-2">
                        <Icon
                          size={20}
                          color={isSelected ? colors['accent'] : colors['text-muted']}
                        />
                        <Text className="text-base font-extrabold text-brand-text">
                          {formatCurrency(type.amount, merchant.currency)}
                        </Text>
                      </View>
                      <Text className="text-xs font-bold text-brand-text">{type.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider mb-2">
                2. Vehicle number (optional)
              </Text>
              <View className="bg-brand-surface border border-brand-border rounded-2xl px-4 py-3 mb-5">
                <TextInput
                  value={vehicleNumber}
                  onChangeText={setVehicleNumber}
                  placeholder="DL 01 AB 1234"
                  placeholderTextColor={colors['text-faint']}
                  autoCapitalize="characters"
                  className="text-brand-text text-base font-bold uppercase tracking-wider"
                />
              </View>

              <Text className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider mb-2">
                3. WhatsApp number (optional)
              </Text>
              <View className="bg-brand-surface border border-brand-border rounded-2xl px-4 py-3 mb-6">
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="98765 43210"
                  placeholderTextColor={colors['text-faint']}
                  keyboardType="phone-pad"
                  className="text-brand-text text-sm font-semibold"
                />
              </View>

              <Card className="p-5">
                <View className="flex-row items-center justify-between pb-3 border-b border-brand-border mb-3">
                  <Text className="text-xs text-brand-text-muted">Paying to</Text>
                  <Text className="text-xs font-mono font-bold text-brand-accent">
                    {merchant.upiId || '—'}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-sm font-bold text-brand-text">Total</Text>
                  <Text className="text-2xl font-extrabold text-brand-accent">
                    {formatCurrency(chosen?.amount ?? 0, merchant.currency)}
                  </Text>
                </View>

                <Button
                  title={`Pay ${formatCurrency(chosen?.amount ?? 0, merchant.currency)}`}
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={busy}
                  disabled={!chosen}
                  icon={<Smartphone size={18} color={colors['on-accent']} />}
                  onPress={pay}
                />
              </Card>
            </>
          )}

          {error && (
            <View className="flex-row items-start gap-2 mt-4 p-3 rounded-xl bg-brand-danger/10 border border-brand-danger/30">
              <AlertCircle size={14} color={colors['danger']} />
              <Text className="text-xs text-brand-danger flex-1 leading-4">{error}</Text>
            </View>
          )}

          <View className="flex-row items-center justify-center gap-2 mt-6">
            <ShieldCheck size={14} color={colors['accent']} />
            <Text className="text-[11px] text-brand-text-faint text-center">Secured by NoParchi</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Shown after checkout with a provider that cannot confirm payment itself.
 *
 * The wording is deliberately blunt about the pass not being valid yet. Telling
 * a customer they are done when a gatekeeper still has to confirm the money is
 * how people end up arguing at the exit.
 */
const PendingPass: React.FC<{
  ticketCode: string;
  amount: number;
  currency: string;
  payUrl: string | null;
  onOpenPass: () => void;
}> = ({ ticketCode, amount, currency, payUrl, onOpenPass }) => {
  const colors = useThemeColors();
  return (
  <Card className="items-center p-6">
    <View className="w-14 h-14 rounded-full bg-brand-warning/10 border border-brand-warning/30 items-center justify-center mb-3">
      <CheckCircle2 size={28} color={colors['warning']} />
    </View>
    <Text className="text-xl font-extrabold text-brand-text text-center">
      Pay {formatCurrency(amount, currency)} to finish
    </Text>
    <Text className="text-xs text-brand-text-muted text-center mt-2 leading-4 mb-5">
      Scan this with any UPI app, or use the payment app that just opened. Then show the
      code below to the staff — they will activate your pass.
    </Text>

    {payUrl && (
      <View className="p-3 bg-brand-paper rounded-2xl mb-5">
        <QRCode
          value={payUrl}
          size={170}
          color={colors['on-paper']}
          backgroundColor={colors['paper']}
        />
      </View>
    )}

    <View className="w-full rounded-2xl bg-brand-bg border border-brand-border p-4 items-center mb-5">
      <Text className="text-[11px] text-brand-text-muted uppercase font-semibold tracking-wider mb-1">
        Your pass code
      </Text>
      <Text className="text-2xl font-mono font-extrabold text-brand-text tracking-widest">
        {ticketCode}
      </Text>
    </View>

    <Button title="Open my pass" variant="primary" size="lg" fullWidth onPress={onOpenPass} />
  </Card>
  );
};
