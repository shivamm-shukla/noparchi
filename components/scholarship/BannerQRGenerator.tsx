import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Pressable, Platform, Share } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Download, Copy, CheckCircle2, QrCode, Printer, Sparkles } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../src/context/ThemeContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';
import { MerchantLogo } from '../ui/MerchantLogo';
import { checkoutUrl } from '../../src/utils/links';
import type { Merchant } from '../../src/types';

interface BannerQRGeneratorProps {
  merchant: Merchant;
}

const PRESET_CAMPAIGNS = [
  { id: 'banner_main_road', label: 'Main Road Flex Banner' },
  { id: 'poster_school_gate', label: 'School Gate Poster' },
  { id: 'coaching_reception', label: 'Coaching Reception Standee' },
  { id: 'flyer_distribution', label: 'Newspaper Insert / Flyer' },
];

export function BannerQRGenerator({ merchant }: BannerQRGeneratorProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [campaign, setCampaign] = useState('banner_main_road');
  const [customTag, setCustomTag] = useState('');
  const [copied, setCopied] = useState(false);

  const activeTag = customTag.trim() || campaign;
  const baseUrl = checkoutUrl(merchant.id);
  const targetUrl = baseUrl ? `${baseUrl}?src=${encodeURIComponent(activeTag)}` : '';

  const copyLink = async () => {
    if (!targetUrl) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(targetUrl);
    } else {
      await Share.share({ message: targetUrl });
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const printBanner = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.print();
    }
  };

  const downloadSvg = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const svg = document.querySelector('.scholarship-banner-qr svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `${merchant.businessName.replace(/\s+/g, '_')}_${activeTag}_qr.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  return (
    <Card className="gap-5">
      <View className="flex-row items-center justify-between pb-3.5 border-b border-brand-border">
        <View className="flex-row items-center gap-2.5">
          <QrCode size={20} color={colors['accent']} />
          <View>
            <Text font="display-bold" className="text-base text-brand-text">
              Scholarship Banner QR Generator
            </Text>
            <Text font="body" className="text-xs text-brand-text-muted">
              Generate & print high-res QR codes for physical flex banners and school gate posters.
            </Text>
          </View>
        </View>
      </View>

      {/* Campaign Preset Chips */}
      <View>
        <Text font="body-semibold" className="text-xs text-brand-text-subtle uppercase tracking-wider mb-2">
          Select Campaign Source / Location
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {PRESET_CAMPAIGNS.map((item) => {
            const isSelected = campaign === item.id && !customTag;
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  setCampaign(item.id);
                  setCustomTag('');
                }}
                className={`px-3 py-1.5 rounded-full border ${
                  isSelected
                    ? 'bg-brand-accent/15 border-brand-accent'
                    : 'bg-brand-bg border-brand-border'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    isSelected ? 'text-brand-accent' : 'text-brand-text-muted'
                  }`}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Custom Tag Input */}
      <View>
        <Text font="body-semibold" className="text-xs text-brand-text-subtle uppercase tracking-wider mb-1.5">
          Or Custom Campaign Tag
        </Text>
        <TextInput
          value={customTag}
          onChangeText={setCustomTag}
          placeholder="e.g. city_center_billboard"
          placeholderTextColor={colors['text-muted']}
          autoCapitalize="none"
          className="rounded-control border border-brand-border bg-brand-bg px-3.5 py-2.5 text-sm text-brand-text"
        />
      </View>

      {/* Printable Banner Preview Poster Card */}
      <View className="scholarship-banner-qr bg-white border-2 border-slate-900 rounded-panel p-6 items-center shadow-sm">
        <MerchantLogo
          name={merchant.businessName}
          logoUrl={merchant.branding?.logoUrl}
          size={52}
        />
        <Text className="text-xl font-black text-slate-900 text-center uppercase tracking-tight mt-2">
          {merchant.businessName}
        </Text>
        <Text className="text-xs text-slate-600 text-center font-medium mt-0.5">
          {merchant.location}
        </Text>

        <View className="my-3 bg-emerald-600 px-4 py-1 rounded-full">
          <Text className="text-xs font-black text-white uppercase tracking-widest text-center">
            SCHOLARSHIP ADMISSION TEST 2026
          </Text>
        </View>

        {/* QR Code Container */}
        <View className="p-4 bg-white border-2 border-slate-900 rounded-xl my-2 shadow-2xs items-center">
          <QRCode
            value={targetUrl}
            size={180}
            color="#0F172A"
            backgroundColor="#FFFFFF"
            ecl="H"
          />
        </View>

        <Text className="text-sm font-black text-slate-900 text-center uppercase tracking-wide mt-2">
          Scan QR Code To Register Online
        </Text>
        <Text className="text-[11px] text-slate-600 text-center mt-1">
          Open Phone Camera or Google Lens · Instant Free Registration · Get Admit Card
        </Text>

        <View className="mt-4 pt-3 border-t border-slate-200 w-full flex-row items-center justify-between">
          <Text className="text-[10px] text-slate-400 font-mono">
            TAG: {activeTag}
          </Text>
          <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Powered by NoParchi
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View className="flex-row flex-wrap gap-2.5 pt-2">
        <Pressable
          onPress={copyLink}
          className="flex-1 min-w-[45%] flex-row items-center justify-center gap-2 py-3 px-4 rounded-control border border-brand-border bg-brand-surface-alt active:opacity-70"
        >
          {copied ? <CheckCircle2 size={16} color={colors['accent']} /> : <Copy size={16} color={colors['text-muted']} />}
          <Text font="body-semibold" className="text-xs text-brand-text">
            {copied ? 'Link Copied!' : 'Copy Link'}
          </Text>
        </Pressable>

        {Platform.OS === 'web' && (
          <>
            <TouchableOpacity
              onPress={downloadSvg}
              className="flex-1 min-w-[45%] flex-row items-center justify-center gap-2 py-3 px-4 rounded-control border border-brand-border bg-brand-surface-alt active:opacity-70"
            >
              <Download size={16} color={colors['accent']} />
              <Text font="body-semibold" className="text-xs text-brand-text">
                Download SVG
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={printBanner}
              className="flex-1 min-w-[45%] flex-row items-center justify-center gap-2 py-3 px-4 rounded-control bg-brand-accent active:opacity-80"
            >
              <Printer size={16} color={colors['on-accent']} />
              <Text font="body-bold" className="text-xs text-brand-on-accent">
                Print Poster (A4)
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Card>
  );
}
