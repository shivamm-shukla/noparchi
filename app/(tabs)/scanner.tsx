import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScanLine, WifiOff, Camera as CameraIcon } from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { useApp } from '../../src/context/AppContext';
import { Header } from '../../components/ui/Header';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ValidationModal } from '../../components/ui/ValidationModal';
import { RoleGate } from '../../components/ui/RoleGate';
import { scanService } from '../../src/services/scanService';
import type { ScanResult } from '../../src/types';

/**
 * Gates are configurable text rather than a fixed list. The previous version
 * hardcoded three and matched the selection with a substring test against a
 * label that did not even match its own initial state.
 */
const DEFAULT_GATES = ['Main Exit', 'Gate 2', 'Gate 3'];

export default function ScannerScreen() {
  const colors = useThemeColors();
  const { merchant } = useAuth();
  const { refresh } = useApp();
  const [permission, requestPermission] = useCameraPermissions();

  const [exitGate, setExitGate] = useState(DEFAULT_GATES[0]);
  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  /**
   * The camera fires onBarcodeScanned continuously while a code is in frame -
   * many times a second. Without this the same pass would be submitted dozens
   * of times before the first response came back.
   */
  const lastScanned = useRef<{ code: string; at: number } | null>(null);

  const verify = useCallback(
    async (raw: string) => {
      if (!merchant || busy || modalVisible) return;

      const now = Date.now();
      if (lastScanned.current?.code === raw && now - lastScanned.current.at < 3000) return;
      lastScanned.current = { code: raw, at: now };

      setBusy(true);
      try {
        const scanResult = await scanService.verify({
          raw,
          merchantId: merchant.id,
          exitGate,
        });
        setResult(scanResult);
        setModalVisible(true);
        // Keep the dashboard counters honest without blocking the modal.
        if (scanResult.success && !scanResult.queuedOffline) refresh({ silent: true });
      } catch (err) {
        setResult({
          success: false,
          status: 'INVALID',
          message: err instanceof Error ? err.message : 'Could not verify this pass.',
        });
        setModalVisible(true);
      } finally {
        setBusy(false);
      }
    },
    [merchant, busy, modalVisible, exitGate, refresh]
  );

  /**
   * The pass had run out. The gatekeeper has taken the overstay in cash; record
   * it and open the gate. Kept as an explicit second action rather than
   * something the scan does by itself, because money changed hands and someone
   * has to be accountable for saying so.
   */
  const collectOverstay = async (amount: number) => {
    const code = result?.ticket?.ticketCode;
    if (!code) return;
    try {
      const cleared = await scanService.clearExpired({
        ticketCode: code,
        collectedAmount: amount,
        exitGate,
      });
      setResult(cleared);
      refresh({ silent: true });
    } catch (err) {
      setResult({
        success: false,
        status: 'INVALID',
        message: err instanceof Error ? err.message : 'Could not record the overstay.',
      });
    }
  };

  const submitManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    setManualCode('');
    verify(code);
  };

  const cameraAvailable = Platform.OS !== 'web' && permission?.granted;

  return (
    <View className="flex-1 bg-brand-bg">
      <Header title="Exit scanner" subtitle={`Gate: ${exitGate}`} />

      <RoleGate permission="can_verify_tickets" title="Scanner is off for your account">
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5">
            <Card className="p-0 overflow-hidden mb-6">
              <View className="p-4 bg-brand-bg flex-row items-center justify-between border-b border-brand-border">
                <View className="flex-row items-center gap-2">
                  <View className="w-2.5 h-2.5 rounded-full bg-brand-accent" />
                  <Text className="text-sm font-bold text-brand-text">Scanner</Text>
                </View>

                <View className="flex-row gap-1 bg-brand-surface p-1 rounded-xl border border-brand-border">
                  {DEFAULT_GATES.map((gate) => (
                    <TouchableOpacity
                      key={gate}
                      onPress={() => setExitGate(gate)}
                      className={`px-2.5 py-1 rounded-lg ${
                        exitGate === gate ? 'bg-brand-accent' : 'bg-transparent'
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-bold ${
                          exitGate === gate ? 'text-brand-on-accent' : 'text-brand-text-muted'
                        }`}
                      >
                        {gate}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View className="h-72 sm:h-96 w-full bg-brand-bg items-center justify-center relative overflow-hidden">
                {cameraAvailable ? (
                  <>
                    <CameraView
                      style={StyleSheet.absoluteFillObject}
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={busy ? undefined : ({ data }) => verify(data)}
                    />
                    <View
                      pointerEvents="none"
                      className="absolute w-56 h-56 border-2 border-brand-accent/50 rounded-3xl"
                    />
                  </>
                ) : (
                  <View className="items-center justify-center p-6">
                    <View className="w-20 h-20 rounded-3xl bg-brand-surface border border-brand-border-strong items-center justify-center mb-3">
                      <ScanLine size={40} color={colors['accent']} />
                    </View>
                    <Text className="text-base font-bold text-brand-text text-center mb-1">
                      {Platform.OS === 'web'
                        ? 'Type the pass code below'
                        : 'Camera permission needed'}
                    </Text>
                    <Text className="text-xs text-brand-text-muted text-center max-w-xs mb-4 leading-4">
                      {Platform.OS === 'web'
                        ? 'Camera scanning runs on the installed Android and iOS app. On a laptop, enter the code printed under the customer’s QR.'
                        : 'Allow camera access to scan customer passes at the gate.'}
                    </Text>

                    {Platform.OS !== 'web' && !permission?.granted && (
                      <Button
                        title="Allow camera"
                        size="sm"
                        variant="primary"
                        icon={<CameraIcon size={14} color={colors['on-accent']} />}
                        onPress={requestPermission}
                      />
                    )}
                  </View>
                )}
              </View>

              <View className="p-4 bg-brand-surface border-t border-brand-border">
                <Text className="text-xs font-semibold text-brand-text-subtle mb-2">
                  Enter pass code
                </Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={manualCode}
                    onChangeText={setManualCode}
                    placeholder="NP-XXXX-YYYY"
                    placeholderTextColor={colors['text-faint']}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    onSubmitEditing={submitManual}
                    className="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3.5 py-2.5 text-brand-text text-sm font-mono"
                  />
                  <Button
                    title="Verify"
                    variant="primary"
                    loading={busy}
                    onPress={submitManual}
                  />
                </View>
              </View>
            </Card>

            <Card className="border-brand-border">
              <View className="flex-row items-start gap-3">
                <WifiOff size={16} color={colors['text-muted']} />
                <View className="flex-1">
                  <Text className="text-sm font-bold text-brand-text mb-1">
                    Works without signal
                  </Text>
                  <Text className="text-xs text-brand-text-muted leading-4">
                    Paid passes are cached on this device. If the network drops, scanning
                    keeps working and every clearance is written to storage immediately, so a
                    used pass stays used even if the app restarts. Scans upload automatically
                    once you are back online.
                  </Text>
                </View>
              </View>
            </Card>
          </View>
        </ScrollView>
      </RoleGate>

      <ValidationModal
        result={result}
        visible={modalVisible}
        onCollectOverstay={collectOverstay}
        onClose={() => {
          setModalVisible(false);
          setResult(null);
        }}
      />
    </View>
  );
}
