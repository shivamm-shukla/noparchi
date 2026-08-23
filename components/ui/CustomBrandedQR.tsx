import React, { useState } from 'react';
import { View, Pressable, Platform } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Download, Copy, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../src/context/ThemeContext';
import { radii } from '../../src/config/radii';
import { Card } from './Card';
import { Button } from './Button';
import { Text } from './Text';
import { MerchantLogo } from './MerchantLogo';
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
 *
 * The centre badge is the landing page's treatment exactly: a solid dark
 * rounded square, white border, initials in the accent. The frame around it is
 * plain paper with a hairline - the old heavy accent border made the whole card
 * read green, and a QR wants a quiet mount.
 */
export const CustomBrandedQR: React.FC<CustomBrandedQRProps> = ({
  merchant,
  ticketTypes = [],
  size = 200,
  showDetails = true,
}) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const url = checkoutUrl(merchant.id);

  const initials = merchant.businessName
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
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
      <Card className="w-full items-center gap-2 p-6">
        <AlertTriangle size={24} color={colors['warning']} />
        <Text font="display-bold" className="text-center text-sm text-brand-text">
          {t('dashboard.gateQr.notReadyTitle')}
        </Text>
        <Text font="body" className="text-center text-xs leading-5 text-brand-text-muted">
          {t('dashboard.gateQr.notReadyBody')}
        </Text>
      </Card>
    );
  }

  const badge = Math.round(size * 0.24);

  return (
    <Card variant="hero" className="w-full items-center p-6">
      {/*
        The merchant's own identity, above their own QR. When logo upload lands
        this slot fills on its own - MerchantLogo already prefers
        branding.logoUrl and only falls back to the initials.
      */}
      <View className="mb-5 w-full flex-row items-center gap-3">
        <MerchantLogo
          name={merchant.businessName}
          logoUrl={merchant.branding?.logoUrl}
          size={40}
        />
        <View className="min-w-0 flex-1">
          <Text font="display-bold" numberOfLines={1} className="text-base text-brand-text">
            {merchant.businessName}
          </Text>
          <Text font="body" numberOfLines={1} className="text-xs text-brand-text-muted">
            {merchant.location}
          </Text>
        </View>
      </View>

      <Text
        font="body-semibold"
        className="mb-3 text-[11px] uppercase tracking-widest text-brand-accent"
      >
        {t('dashboard.gateQr.scanToEnter')}
      </Text>

      <View
        style={{ borderRadius: radii.panel }}
        className="noparchi-gate-qr relative items-center justify-center border border-brand-border bg-brand-paper p-4"
      >
        <QRCode
          value={url}
          size={size}
          color={colors['on-paper']}
          backgroundColor={colors['paper']}
          // Higher correction so the centre badge cannot make the code unreadable.
          ecl="H"
        />
        <View
          style={{ width: badge, height: badge, borderRadius: radii.control, borderWidth: 3 }}
          className="absolute items-center justify-center border-brand-paper bg-brand-on-paper"
        >
          <Text
            font="display-extrabold"
            style={{ fontSize: badge * 0.36, color: colors['accent'] }}
          >
            {initials || 'NP'}
          </Text>
        </View>
      </View>

      {showDetails && (
        <View className="mt-5 w-full items-center border-t border-brand-border pt-4">
          <Text font="body" className="mb-3 text-center text-xs text-brand-text-subtle">
            {t('dashboard.gateQr.noApp')}
          </Text>

          <Pressable
            onPress={copyLink}
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.gateQr.copyLink')}
            className="mb-4 max-w-full flex-row items-center gap-2 rounded-control border border-brand-border bg-brand-surface-alt px-3 py-1.5 active:opacity-70"
          >
            <Text
              font="body-medium"
              numberOfLines={1}
              className="flex-shrink text-[11px] text-brand-text-subtle"
            >
              {url}
            </Text>
            {copied ? (
              <CheckCircle2 size={12} color={colors['accent']} />
            ) : (
              <Copy size={12} color={colors['text-muted']} />
            )}
          </Pressable>

          {ticketTypes.length > 0 && (
            <View className="mb-4 flex-row flex-wrap items-center justify-center gap-2">
              {ticketTypes.slice(0, 4).map((type) => (
                <View
                  key={type.id}
                  className="rounded-control border border-brand-border bg-brand-surface-alt px-2.5 py-1.5"
                >
                  <Text
                    font="body-medium"
                    className="text-[10px] uppercase tracking-wide text-brand-text-muted"
                  >
                    {type.label}
                  </Text>
                  <Text font="display-bold" className="text-center text-xs text-brand-text">
                    {formatCurrency(type.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {Platform.OS === 'web' && (
            <Button
              title={t('dashboard.gateQr.download')}
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
