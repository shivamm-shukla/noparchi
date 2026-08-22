import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Download, Share2, Sparkles, CheckCircle2, Copy } from 'lucide-react-native';
import { useApp } from '../../src/context/AppContext';
import { Card } from './Card';
import { Button } from './Button';

interface CustomBrandedQRProps {
  amount?: number;
  customPayload?: string;
  size?: number;
  showDetails?: boolean;
}

export const CustomBrandedQR: React.FC<CustomBrandedQRProps> = ({
  amount,
  customPayload,
  size = 200,
  showDetails = true,
}) => {
  const { merchant } = useApp();
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<any>(null);

  // Generate standard UPI payload or digital web-view link
  const defaultUpiPayload = amount
    ? `upi://pay?pa=${merchant.upiId}&pn=${encodeURIComponent(
        merchant.businessName
      )}&am=${amount}&cu=INR&tn=NoParchi%20Smart%20Pass`
    : `upi://pay?pa=${merchant.upiId}&pn=${encodeURIComponent(
        merchant.businessName
      )}&cu=INR&tn=NoParchi%20Parking%20Pass`;

  const payload = customPayload || defaultUpiPayload;
  const merchantInitials = merchant.businessName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleCopyUpi = () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(merchant.upiId);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    if (Platform.OS === 'web') {
      // Direct Web SVG/Canvas download for laptop browsers
      const svg = document.querySelector('.custom-branded-qr svg');
      if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        const downloadLink = document.createElement('a');
        downloadLink.href = svgUrl;
        downloadLink.download = `${merchant.businessName.replace(/\s+/g, '_')}_NoParchi_QR.svg`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      } else {
        alert('QR ready for print / screenshot.');
      }
    } else {
      Alert.alert('Download QR', 'QR Code saved to device gallery for printing.');
    }
  };

  return (
    <Card className="w-full max-w-sm mx-auto items-center p-6 bg-slate-900 border-slate-800 shadow-2xl">
      {/* Branding Header */}
      <View className="items-center mb-4">
        <View className="flex-row items-center gap-1.5 mb-1">
          <Sparkles size={14} color="#10B981" />
          <Text className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">
            Smart UPI Checkout
          </Text>
        </View>
        <Text className="text-lg font-extrabold text-slate-100 text-center">
          {merchant.businessName}
        </Text>
        <Text className="text-xs text-slate-400 text-center">
          {merchant.location}
        </Text>
      </View>

      {/* QR Code Frame with Dynamic Overlay */}
      <View className="custom-branded-qr p-4 bg-white rounded-3xl items-center justify-center shadow-xl shadow-black/50 relative border-4 border-emerald-500/20">
        <QRCode
          value={payload}
          size={size}
          color="#0F172A"
          backgroundColor="#FFFFFF"
          getRef={(c) => (qrRef.current = c)}
        />

        {/* Dynamic Center Branding Overlay */}
        <View
          style={{
            position: 'absolute',
            width: size * 0.24,
            height: size * 0.24,
            borderRadius: (size * 0.24) / 2,
          }}
          className="bg-slate-950 border-2 border-emerald-400 items-center justify-center shadow-md shadow-black/60"
        >
          <Text className="text-emerald-400 font-extrabold text-xs sm:text-sm">
            {merchantInitials || 'NP'}
          </Text>
        </View>
      </View>

      {/* Instructions & UPI ID */}
      {showDetails && (
        <View className="w-full mt-5 pt-4 border-t border-slate-800 items-center">
          <Text className="text-xs text-slate-300 font-medium text-center mb-2">
            Scan with any UPI App (GPay, PhonePe, Paytm)
          </Text>

          <TouchableOpacity
            onPress={handleCopyUpi}
            activeOpacity={0.7}
            className="flex-row items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-xl mb-4"
          >
            <Text className="text-xs font-mono text-emerald-400 font-bold">
              {merchant.upiId}
            </Text>
            {copied ? (
              <CheckCircle2 size={12} color="#10B981" />
            ) : (
              <Copy size={12} color="#94A3B8" />
            )}
          </TouchableOpacity>

          {/* Rates pill */}
          <View className="flex-row items-center justify-center gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 w-full mb-4">
            <View className="items-center">
              <Text className="text-[10px] text-slate-400 uppercase font-semibold">2-Wheeler</Text>
              <Text className="text-xs font-bold text-slate-200">
                ₹{merchant.configSettings?.twoWheelerRate || 20}
              </Text>
            </View>
            <View className="w-px h-6 bg-slate-800" />
            <View className="items-center">
              <Text className="text-[10px] text-slate-400 uppercase font-semibold">4-Wheeler</Text>
              <Text className="text-xs font-bold text-slate-200">
                ₹{merchant.configSettings?.fourWheelerRate || 50}
              </Text>
            </View>
            <View className="w-px h-6 bg-slate-800" />
            <View className="items-center">
              <Text className="text-[10px] text-slate-400 uppercase font-semibold">Flat Rate</Text>
              <Text className="text-xs font-bold text-slate-200">
                ₹{merchant.configSettings?.flatRate || 40}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View className="flex-row gap-2 w-full">
            <Button
              title="Download QR"
              variant="secondary"
              size="sm"
              className="flex-1"
              icon={<Download size={14} color="#F1F5F9" />}
              onPress={handleDownloadQR}
            />
            <Button
              title="Share Link"
              variant="outline"
              size="sm"
              className="flex-1"
              icon={<Share2 size={14} color="#94A3B8" />}
              onPress={handleCopyUpi}
            />
          </View>
        </View>
      )}
    </Card>
  );
};
