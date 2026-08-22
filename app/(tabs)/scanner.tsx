import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScanLine, WifiOff, Camera as CameraIcon } from 'lucide-react-native';
import theme from '../../src/config/theme';
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

  const submitManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    setManualCode('');
    verify(code);
  };

  const cameraAvailable = Platform.OS !== 'web' && permission?.granted;

  return (
    <View className="flex-1 bg-slate-950">
      <Header title="Exit scanner" subtitle={`Gate: ${exitGate}`} />

      <RoleGate permission="can_verify_tickets" title="Scanner is off for your account">
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5">
            <Card className="p-0 overflow-hidden mb-6">
              <View className="p-4 bg-slate-950 flex-row items-center justify-between border-b border-slate-800">
                <View className="flex-row items-center gap-2">
                  <View className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <Text className="text-sm font-bold text-slate-100">Scanner</Text>
                </View>

                <View className="flex-row gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                  {DEFAULT_GATES.map((gate) => (
                    <TouchableOpacity
                      key={gate}
                      onPress={() => setExitGate(gate)}
                      className={`px-2.5 py-1 rounded-lg ${
                        exitGate === gate ? 'bg-emerald-500' : 'bg-transparent'
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-bold ${
                          exitGate === gate ? 'text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        {gate}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View className="h-72 sm:h-96 w-full bg-slate-950 items-center justify-center relative overflow-hidden">
                {cameraAvailable ? (
                  <>
                    <CameraView
                      style={StyleSheet.absoluteFillObject}
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={busy ? undefined : ({ data }) => verify(data)}
                    />
                    <View
                      pointerEvents="none"
                      className="absolute w-56 h-56 border-2 border-emerald-500/50 rounded-3xl"
                    />
                  </>
                ) : (
                  <View className="items-center justify-center p-6">
                    <View className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-700 items-center justify-center mb-3">
                      <ScanLine size={40} color={theme.semantic.accent} />
                    </View>
                    <Text className="text-base font-bold text-slate-200 text-center mb-1">
                      {Platform.OS === 'web'
                        ? 'Type the pass code below'
                        : 'Camera permission needed'}
                    </Text>
                    <Text className="text-xs text-slate-400 text-center max-w-xs mb-4 leading-4">
                      {Platform.OS === 'web'
                        ? 'Camera scanning runs on the installed Android and iOS app. On a laptop, enter the code printed under the customer’s QR.'
                        : 'Allow camera access to scan customer passes at the gate.'}
                    </Text>

                    {Platform.OS !== 'web' && !permission?.granted && (
                      <Button
                        title="Allow camera"
                        size="sm"
                        variant="primary"
                        icon={<CameraIcon size={14} color={theme.semantic.onAccent} />}
                        onPress={requestPermission}
                      />
                    )}
                  </View>
                )}
              </View>

              <View className="p-4 bg-slate-900 border-t border-slate-800">
                <Text className="text-xs font-semibold text-slate-300 mb-2">
                  Enter pass code
                </Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={manualCode}
                    onChangeText={setManualCode}
                    placeholder="NP-XXXX-YYYY"
                    placeholderTextColor={theme.semantic.textFaint}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    onSubmitEditing={submitManual}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm font-mono"
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

            <Card className="border-slate-800">
              <View className="flex-row items-start gap-3">
                <WifiOff size={16} color={theme.semantic.textMuted} />
                <View className="flex-1">
                  <Text className="text-sm font-bold text-slate-200 mb-1">
                    Works without signal
                  </Text>
                  <Text className="text-xs text-slate-400 leading-4">
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
        onClose={() => {
          setModalVisible(false);
          setResult(null);
        }}
      />
    </View>
  );
}
