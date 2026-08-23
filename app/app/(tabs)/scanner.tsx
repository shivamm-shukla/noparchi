import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, Platform, TextInput, Pressable, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScanLine, WifiOff, Camera as CameraIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../src/context/ThemeContext';
import { useAuth } from '../../../src/context/AuthContext';
import { useApp } from '../../../src/context/AppContext';
import { TopBar } from '../../../components/nav/TopBar';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Text } from '../../../components/ui/Text';
import { ValidationModal } from '../../../components/ui/ValidationModal';
import { RoleGate } from '../../../components/ui/RoleGate';
import { PulseRing } from '../../../components/ui/PulseRing';
import { radii } from '../../../src/config/radii';
import { scanService } from '../../../src/services/scanService';
import type { ScanResult } from '../../../src/types';

export default function ScannerScreen() {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { merchant } = useAuth();
  const { stats, refresh } = useApp();
  const [permission, requestPermission] = useCameraPermissions();

  const gates = merchant?.exitGates ?? [];
  const [exitGate, setExitGate] = useState(gates[0] ?? 'Main Exit');
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
        const scanResult = await scanService.verify({ raw, merchantId: merchant.id, exitGate });
        setResult(scanResult);
        setModalVisible(true);
        // Keep the dashboard counters honest without blocking the modal.
        if (scanResult.success && !scanResult.queuedOffline) refresh({ silent: true });
      } catch (err) {
        setResult({
          success: false,
          status: 'INVALID',
          message: err instanceof Error ? err.message : t('scanner.result.invalid'),
        });
        setModalVisible(true);
      } finally {
        setBusy(false);
      }
    },
    [merchant, busy, modalVisible, exitGate, refresh, t]
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
        message: err instanceof Error ? err.message : t('scanner.result.invalid'),
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
      <TopBar title={t('scanner.title')} subtitle={t('scanner.gateLabel', { gate: exitGate })} />

      <RoleGate permission="can_verify_tickets" title={t('scanner.blockedTitle')}>
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
          <View className="mx-auto w-full max-w-3xl gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <Card className="overflow-hidden p-0">
              <View className="flex-row items-center justify-between gap-3 border-b border-brand-border px-4 py-3">
                {/*
                  The gatekeeper's own count, unobtrusive. Staff get this even
                  without ledger access - it is their work, not the takings.
                */}
                <Text
                  font="body-medium"
                  className="text-[11px] uppercase tracking-wider text-brand-text-muted"
                >
                  {t('scanner.scansToday', { count: stats?.myScans ?? stats?.scans ?? 0 })}
                </Text>

                {gates.length > 1 ? (
                  <View className="flex-row gap-1 rounded-control border border-brand-border bg-brand-surface-alt p-1">
                    {gates.map((gate) => {
                      const active = exitGate === gate;
                      return (
                        <Pressable
                          key={gate}
                          onPress={() => setExitGate(gate)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={gate}
                          className={`rounded-lg px-2.5 py-1 ${active ? 'bg-brand-accent' : ''}`}
                        >
                          <Text
                            font={active ? 'body-bold' : 'body-medium'}
                            className={`text-[11px] ${
                              active ? 'text-brand-on-accent' : 'text-brand-text-muted'
                            }`}
                          >
                            {gate}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              <View className="relative h-80 w-full items-center justify-center overflow-hidden bg-brand-on-paper sm:h-96">
                {cameraAvailable ? (
                  <>
                    <CameraView
                      style={StyleSheet.absoluteFillObject}
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={busy ? undefined : ({ data }) => verify(data)}
                    />
                    <Viewfinder busy={busy} />
                  </>
                ) : (
                  <CameraUnavailable
                    onRequestPermission={requestPermission}
                    needsPermission={Platform.OS !== 'web' && !permission?.granted}
                  />
                )}
              </View>

              <View className="gap-2 border-t border-brand-border bg-brand-surface p-4">
                <Text font="body-medium" className="text-xs text-brand-text-subtle">
                  {t('scanner.manualTitle')}
                </Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={manualCode}
                    onChangeText={setManualCode}
                    placeholder={t('scanner.manualPlaceholder')}
                    placeholderTextColor={colors['text-faint']}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    onSubmitEditing={submitManual}
                    accessibilityLabel={t('scanner.manualTitle')}
                    className="flex-1 rounded-control border border-brand-border bg-brand-bg px-3.5 py-2.5 text-sm text-brand-text"
                  />
                  <Button
                    title={t('scanner.verify')}
                    variant="primary"
                    loading={busy}
                    onPress={submitManual}
                  />
                </View>
              </View>
            </Card>

            <Card>
              <View className="flex-row items-start gap-3">
                <WifiOff size={16} color={colors['text-muted']} />
                <View className="flex-1 gap-1">
                  <Text font="display-semibold" className="text-sm text-brand-text">
                    {t('scanner.offlineTitle')}
                  </Text>
                  <Text font="body" className="text-xs leading-5 text-brand-text-muted">
                    {t('scanner.offlineBody')}
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

/**
 * The frame the gatekeeper aims with.
 *
 * Corner brackets rather than a full box: they mark the target without a
 * continuous line competing with the QR's own edges, which is what makes a
 * viewfinder read as a viewfinder. The ring only pulses while the scanner is
 * idle - once a code is in flight it stops, so the animation means "waiting for
 * a pass" and never "still thinking about the one you just showed me".
 */
const Viewfinder: React.FC<{ busy: boolean }> = ({ busy }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const size = 224;
  const bracket = 34;
  const thickness = 3;

  const corners: { key: string; style: Record<string, unknown> }[] = [
    {
      key: 'tl',
      style: { top: 0, left: 0, borderTopWidth: thickness, borderLeftWidth: thickness, borderTopLeftRadius: radii.card },
    },
    {
      key: 'tr',
      style: { top: 0, right: 0, borderTopWidth: thickness, borderRightWidth: thickness, borderTopRightRadius: radii.card },
    },
    {
      key: 'bl',
      style: { bottom: 0, left: 0, borderBottomWidth: thickness, borderLeftWidth: thickness, borderBottomLeftRadius: radii.card },
    },
    {
      key: 'br',
      style: { bottom: 0, right: 0, borderBottomWidth: thickness, borderRightWidth: thickness, borderBottomRightRadius: radii.card },
    },
  ];

  return (
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
      <View style={{ width: size, height: size }}>
        {!busy && <PulseRing inset={12} radius={radii.card + 12} />}
        {corners.map(({ key, style }) => (
          <View
            key={key}
            style={[
              { position: 'absolute', width: bracket, height: bracket, borderColor: colors['accent'] },
              style,
            ]}
          />
        ))}
      </View>
      <Text
        font="body-medium"
        className="mt-6 max-w-xs text-center text-xs text-brand-paper/80"
      >
        {t('scanner.aimHint')}
      </Text>
    </View>
  );
};

const CameraUnavailable: React.FC<{
  needsPermission: boolean;
  onRequestPermission: () => void;
}> = ({ needsPermission, onRequestPermission }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();

  return (
    <View className="items-center justify-center gap-3 p-6">
      <View className="h-20 w-20 items-center justify-center rounded-panel border border-brand-border bg-brand-surface">
        <ScanLine size={38} color={colors['accent']} />
      </View>
      <Text font="display-semibold" className="text-center text-base text-brand-paper">
        {t(needsPermission ? 'scanner.cameraPermissionTitle' : 'scanner.cameraOnPhoneTitle')}
      </Text>
      <Text font="body" className="max-w-xs text-center text-xs leading-5 text-brand-paper/70">
        {t(needsPermission ? 'scanner.cameraPermissionBody' : 'scanner.cameraOnPhoneBody')}
      </Text>
      {needsPermission ? (
        <Button
          title={t('scanner.allowCamera')}
          size="sm"
          variant="primary"
          icon={<CameraIcon size={14} color={colors['on-accent']} />}
          onPress={onRequestPermission}
        />
      ) : null}
    </View>
  );
};
