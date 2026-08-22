import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScanLine, CheckCircle, AlertTriangle, RefreshCw, KeyRound, ShieldAlert, Sparkles, HelpCircle } from 'lucide-react-native';
import { useApp } from '../../src/context/AppContext';
import { Header } from '../../components/ui/Header';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ValidationModal } from '../../components/ui/ValidationModal';
import { RoleGate } from '../../components/ui/RoleGate';
import { TicketValidationResult } from '../../src/types';

export default function ScannerScreen() {
  const { currentUser, validateTicket, transactions } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedCode, setScannedCode] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [exitGate, setExitGate] = useState('Main Exit Gate 1');
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationResult, setValidationResult] = useState<TicketValidationResult | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Find sample active and used tickets for quick testing in web/laptop or physical test
  const activeUnusedTicket = transactions.find((t) => !t.validation && t.status === 'SUCCESS');
  const alreadyUsedTicket = transactions.find((t) => Boolean(t.validation));

  const handleBarcodeScanned = async (data: string) => {
    if (isProcessing || modalVisible || !data) return;
    setIsProcessing(true);
    try {
      const result = await validateTicket(data, exitGate);
      setValidationResult(result);
      setModalVisible(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scan validation failed';
      setValidationResult({
        success: false,
        status: 'INVALID',
        message: msg,
      });
      setModalVisible(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) return;
    handleBarcodeScanned(manualCode.trim());
    setManualCode('');
  };

  return (
    <View className="flex-1 bg-slate-950">
      <Header
        title="Exit Pass Scanner"
        subtitle={`Gate: ${exitGate} • Gatekeeper: ${currentUser.name}`}
      />

      <RoleGate
        permissionKey="can_verify_tickets"
        fallbackTitle="Scanner Access Restricted"
        fallbackMessage="Your staff role does not have permission to verify exit tickets. Please ask the Merchant Owner to enable 'can_verify_tickets'."
      >
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5">
            {/* Camera / Scanner Card */}
            <Card className="p-0 overflow-hidden bg-slate-900 border-slate-800 shadow-2xl mb-6">
              <View className="p-4 bg-slate-950 flex-row items-center justify-between border-b border-slate-800">
                <View className="flex-row items-center gap-2">
                  <View className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                  <Text className="text-sm font-bold text-slate-100">
                    Live Optical Scanner
                  </Text>
                </View>

                {/* Gate Selector */}
                <View className="flex-row gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                  {['Gate 1', 'Gate 2', 'Gate 3'].map((g) => (
                    <TouchableOpacity
                      key={g}
                      onPress={() => setExitGate(`Exit ${g}`)}
                      className={`px-2.5 py-1 rounded-lg ${
                        exitGate.includes(g)
                          ? 'bg-emerald-500'
                          : 'bg-transparent'
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-bold ${
                          exitGate.includes(g) ? 'text-slate-950' : 'text-slate-400'
                        }`}
                      >
                        {g}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Camera Viewport or Web/Permission Fallback */}
              <View className="h-72 sm:h-96 w-full bg-slate-950 items-center justify-center relative overflow-hidden">
                {Platform.OS !== 'web' && permission?.granted ? (
                  <CameraView
                    style={StyleSheet.absoluteFillObject}
                    barcodeScannerSettings={{
                      barcodeTypes: ['qr'],
                    }}
                    onBarcodeScanned={
                      isProcessing
                        ? undefined
                        : ({ data }) => handleBarcodeScanned(data)
                    }
                  />
                ) : (
                  // Laptop / Web / Permission Mode Interactive Visualizer
                  <View className="items-center justify-center p-6 text-center">
                    <View className="w-20 h-20 rounded-3xl bg-slate-900/90 border border-slate-700 items-center justify-center mb-3">
                      <ScanLine size={40} color="#10B981" />
                    </View>
                    <Text className="text-base font-bold text-slate-200 text-center mb-1">
                      Ready to Verify Exit Passes
                    </Text>
                    <Text className="text-xs text-slate-400 text-center max-w-xs mb-4">
                      Position the customer's WhatsApp Ticket QR in view, or use manual code entry / test triggers below.
                    </Text>

                    {Platform.OS !== 'web' && !permission?.granted && (
                      <Button
                        title="Enable Camera Permission"
                        size="sm"
                        variant="primary"
                        onPress={requestPermission}
                      />
                    )}
                  </View>
                )}

                {/* Laser scan line overlay effect */}
                <View className="absolute inset-x-12 top-1/2 h-0.5 bg-emerald-400 shadow-lg shadow-emerald-500/80" />

                {/* Reticle Target Corners */}
                <View className="absolute w-56 h-56 border-2 border-emerald-500/40 rounded-3xl pointer-events-none" />
              </View>

              {/* Manual Ticket Code Entry Bar */}
              <View className="p-4 bg-slate-900 border-t border-slate-800">
                <Text className="text-xs font-semibold text-slate-300 mb-2">
                  Manual Ticket Code Entry
                </Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={manualCode}
                    onChangeText={setManualCode}
                    placeholder="Enter Token (e.g. NP-A7X1-K892)"
                    placeholderTextColor="#64748B"
                    autoCapitalize="characters"
                    onSubmitEditing={handleManualSubmit}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm font-mono"
                  />
                  <Button
                    title="Verify Pass"
                    variant="primary"
                    loading={isProcessing}
                    onPress={handleManualSubmit}
                  />
                </View>
              </View>
            </Card>

            {/* Quick Test Simulator Panel (Great for testing Verified vs Already-Used flows immediately!) */}
            <Card className="bg-slate-900 border-slate-800 p-5">
              <View className="flex-row items-center gap-2 mb-3 pb-2 border-b border-slate-800">
                <Sparkles size={16} color="#10B981" />
                <Text className="text-sm font-bold text-slate-200">
                  Instant Test Triggers (Simulate QR Scans)
                </Text>
              </View>

              <Text className="text-xs text-slate-400 mb-4">
                Test the concurrency engine and validation modals in 1 click:
              </Text>

              <View className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Green Verified Test */}
                <TouchableOpacity
                  onPress={() => {
                    if (activeUnusedTicket) {
                      handleBarcodeScanned(activeUnusedTicket.ticketCode);
                    } else {
                      handleBarcodeScanned('NP-NEW-SAMPLE');
                    }
                  }}
                  activeOpacity={0.7}
                  className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 items-center justify-center gap-1.5"
                >
                  <CheckCircle size={20} color="#10B981" />
                  <Text className="text-xs font-bold text-emerald-400 text-center">
                    Test Active Pass
                  </Text>
                  <Text className="text-[10px] text-slate-400 text-center">
                    Shows Green Verified
                  </Text>
                </TouchableOpacity>

                {/* 2. Red Already Used Test */}
                <TouchableOpacity
                  onPress={() => {
                    if (alreadyUsedTicket) {
                      handleBarcodeScanned(alreadyUsedTicket.ticketCode);
                    } else {
                      handleBarcodeScanned('NP-A7X1-K892');
                    }
                  }}
                  activeOpacity={0.7}
                  className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 items-center justify-center gap-1.5"
                >
                  <AlertTriangle size={20} color="#EF4444" />
                  <Text className="text-xs font-bold text-rose-400 text-center">
                    Test Used Pass
                  </Text>
                  <Text className="text-[10px] text-slate-400 text-center">
                    Shows Red Already Used
                  </Text>
                </TouchableOpacity>

                {/* 3. Invalid Pass Test */}
                <TouchableOpacity
                  onPress={() => handleBarcodeScanned('CORRUPT-FAKE-CODE-999')}
                  activeOpacity={0.7}
                  className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 items-center justify-center gap-1.5"
                >
                  <HelpCircle size={20} color="#94A3B8" />
                  <Text className="text-xs font-bold text-slate-300 text-center">
                    Test Invalid Code
                  </Text>
                  <Text className="text-[10px] text-slate-400 text-center">
                    Shows Invalid Error
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          </View>
        </ScrollView>
      </RoleGate>

      {/* High-Impact Verification Feedback Modal */}
      <ValidationModal
        result={validationResult}
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setValidationResult(null);
        }}
      />
    </View>
  );
}
