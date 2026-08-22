import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Download, Copy, CheckCircle2, Sparkles, AlertTriangle } from 'lucide-react-native';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Card } from './Card';
import { Button } from './Button';
import { checkoutUrl } from '../../src/utils/links';
import { formatCurrency } from '../../src/utils/formatters';
import type { Merchant } from '../../src/types';
import type { TicketType } from '../../src/config/pricing';

interface CustomBrandedQRProps {
  merchant: Merchant;
  ticketTypes?: TicketType[];
  size?: number;
  showDetails?: boolean;
}

/**
 * The gate QR a customer scans.
 *
 * It encodes the checkout URL for THIS merchant - /pay/<merchantId> - which is
 * what makes the app-less flow work: any phone camera opens a web page, picks a
 * pass, pays, and gets a pass back. No install.
 *
 * It deliberately no longer encodes a upi:// intent. A bare UPI QR moves money
 * but produces no pass, no ticket code and no record, so nothing could be
 * scanned at the exit and none of it reached the ledger - which is the theft
 * this product exists to stop.
 */
export const CustomBrandedQR: React.FC<CustomBrandedQRProps> = ({
  merchant,
  ticketTypes = [],
  size = 200,
  showDetails = true,
}) => {
  const colors = useThemeColors();
  const [copied, setCopied] = useState(false);
  const url = checkoutUrl(merchant.id);

  const initials = merchant.businessName
    .split(' ')
    .map((word) => word[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const copyLink = async () => {
    if (!url) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQr = () => {
    // Web only: turn the rendered SVG into a file the owner can print and stick
    // on the gate. On native this needs expo-file-system plus a share sheet,
    // which is a separate piece of work.
    if (Platform.OS !== 'web') return;
    const svg = document.querySelector('.noparchi-gate-qr svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `${merchant.businessName.replace(/\s+/g, '_')}_gate_qr.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  if (!url) {
    return (
      <Card className="w-full items-center p-6">
        <AlertTriangle size={28} color={colors['warning']} />
        <Text className="text-sm font-bold text-brand-text mt-3 text-center">
          Gate QR not ready
        </Text>
        <Text className="text-xs text-brand-text-muted text-center mt-2 leading-4">
          Set EXPO_PUBLIC_WEB_URL to the address customers will visit, so the QR points
          somewhere their phone can actually open.
        </Text>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm mx-auto items-center p-6">
      <View className="items-center mb-4">
        <View className="flex-row items-center gap-1.5 mb-1">
          <Sparkles size={14} color={colors['accent']} />
          <Text className="text-[11px] font-bold text-brand-accent uppercase tracking-widest">
            Scan to enter
          </Text>
        </View>
        <Text className="text-lg font-extrabold text-brand-text text-center">
          {merchant.businessName}
        </Text>
        <Text className="text-xs text-brand-text-muted text-center">{merchant.location}</Text>
      </View>

      <View className="noparchi-gate-qr p-4 bg-brand-paper rounded-3xl items-center justify-center relative border-4 border-brand-accent/20">
        <QRCode
          value={url}
          size={size}
          color={colors['on-paper']}
          backgroundColor={colors['paper']}
          // Higher correction so the centre badge cannot make the code unreadable.
          ecl="H"
        />
        <View
          style={{
            position: 'absolute',
            width: size * 0.22,
            height: size * 0.22,
            borderRadius: (size * 0.22) / 2,
          }}
          className="bg-brand-bg border-2 border-brand-accent items-center justify-center"
        >
          <Text className="text-brand-accent font-extrabold text-xs">{initials || 'NP'}</Text>
        </View>
      </View>

      {showDetails && (
        <View className="w-full mt-5 pt-4 border-t border-brand-border items-center">
          <Text className="text-xs text-brand-text-subtle font-medium text-center mb-3">
            Any phone camera. No app to install.
          </Text>

          <TouchableOpacity
            onPress={copyLink}
            activeOpacity={0.7}
            className="flex-row items-center gap-2 bg-brand-surface-raised/90 border border-brand-border-strong/80 px-3 py-1.5 rounded-xl mb-4 max-w-full"
          >
            <Text numberOfLines={1} className="text-[11px] font-mono text-brand-accent flex-shrink">
              {url}
            </Text>
            {copied ? (
              <CheckCircle2 size={12} color={colors['accent']} />
            ) : (
              <Copy size={12} color={colors['text-muted']} />
            )}
          </TouchableOpacity>

          {ticketTypes.length > 0 && (
            <View className="flex-row flex-wrap items-center justify-center gap-2 mb-4">
              {ticketTypes.slice(0, 4).map((type) => (
                <View
                  key={type.id}
                  className="px-2.5 py-1.5 rounded-xl bg-brand-bg/60 border border-brand-border"
                >
                  <Text className="text-[10px] text-brand-text-muted uppercase font-semibold">
                    {type.label}
                  </Text>
                  <Text className="text-xs font-bold text-brand-text text-center">
                    {formatCurrency(type.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {Platform.OS === 'web' && (
            <Button
              title="Download QR to print"
              variant="secondary"
              size="sm"
              fullWidth
              icon={<Download size={14} color={colors['text']} />}
              onPress={downloadQr}
            />
          )}
        </View>
      )}
    </Card>
  );
};
