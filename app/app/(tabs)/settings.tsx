import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TextInput, Switch, TouchableOpacity, Pressable } from 'react-native';
import {
  Building2,
  Sparkles,
  DoorOpen,
  CreditCard,
  Tag,
  Users2,
  SunMoon,
  Sun,
  Moon,
  Languages,
  Plus,
  Trash2,
  Upload,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  UserMinus,
  MessageSquare,
  ChevronRight,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useThemeColors, useTheme, type ThemePreference } from '../../../src/context/ThemeContext';
import { useLanguage, type LanguagePreference } from '../../../src/context/LanguageContext';
import { useAuth } from '../../../src/context/AuthContext';
import { useApp } from '../../../src/context/AppContext';
import { useIsExpanded } from '../../../src/hooks/useLayoutMode';
import { TopBar } from '../../../components/nav/TopBar';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { Text } from '../../../components/ui/Text';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { MerchantLogo } from '../../../components/ui/MerchantLogo';
import { merchantService } from '../../../src/services/merchantService';
import {
  PERMISSION_KEYS,
  defaultStaffPermissions,
  permissionDescription,
  permissionLabel,
  type PermissionKey,
  type PermissionSet,
} from '../../../src/config/permissions';
import { PAYMENT_PROVIDERS, MESSAGING_PROVIDERS } from '../../../src/config/providers';
import {
  validateTicketTypeDraft,
  formatDuration,
  extensionTerms,
  VALIDITY_PRESETS,
} from '../../../src/config/pricing';
import { ticketTypeIcon } from '../../../src/config/icons';
import { formatCurrency } from '../../../src/utils/formatters';
import type { Merchant, StaffMember, TicketType } from '../../../src/types';

export type SettingsPaneId =
  | 'business'
  | 'brand'
  | 'gates'
  | 'providers'
  | 'passTypes'
  | 'staff'
  | 'appearance';

interface PaneMeta {
  id: SettingsPaneId;
  labelKey: string;
  subKey: string;
  icon: LucideIcon;
}

const PANES: PaneMeta[] = [
  { id: 'business', labelKey: 'settings.panes.business', subKey: 'settings.panes.businessSub', icon: Building2 },
  { id: 'brand', labelKey: 'settings.panes.brand', subKey: 'settings.panes.brandSub', icon: Sparkles },
  { id: 'gates', labelKey: 'settings.panes.gates', subKey: 'settings.panes.gatesSub', icon: DoorOpen },
  { id: 'providers', labelKey: 'settings.panes.providers', subKey: 'settings.panes.providersSub', icon: CreditCard },
  { id: 'passTypes', labelKey: 'settings.panes.passTypes', subKey: 'settings.panes.passTypesSub', icon: Tag },
  { id: 'staff', labelKey: 'settings.panes.staff', subKey: 'settings.panes.staffSub', icon: Users2 },
  { id: 'appearance', labelKey: 'settings.panes.appearance', subKey: 'settings.panes.appearanceSub', icon: SunMoon },
];

export default function SettingsScreen() {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const isExpanded = useIsExpanded();
  const { merchant, user, can, refresh: refreshAuth } = useAuth();
  const { ticketTypes, staff, refresh } = useApp();

  const canEdit = can('can_edit_settings');
  const canManageStaff = can('can_manage_staff');

  const [selectedPane, setSelectedPane] = useState<SettingsPaneId | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const flash = (kind: 'ok' | 'error', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 4000);
  };

  if (!merchant || !user) return null;

  // On expanded layout, default to 'business' if none explicitly chosen
  const activePane: SettingsPaneId = isExpanded
    ? selectedPane ?? 'business'
    : (selectedPane ?? 'business');

  const renderNoticeBanner = () => {
    if (!notice) return null;
    return (
      <Card
        className={`mb-5 ${
          notice.kind === 'ok'
            ? 'border-brand-accent/40 bg-brand-accent/5'
            : 'border-brand-danger/40 bg-brand-danger/5'
        }`}
      >
        <View className="flex-row items-center gap-2.5">
          {notice.kind === 'ok' ? (
            <CheckCircle2 size={16} color={colors['accent']} />
          ) : (
            <AlertCircle size={16} color={colors['danger']} />
          )}
          <Text
            font="body-medium"
            className={`text-xs flex-1 leading-4 ${
              notice.kind === 'ok' ? 'text-brand-accent' : 'text-brand-danger'
            }`}
          >
            {notice.text}
          </Text>
        </View>
      </Card>
    );
  };

  const renderDetailContent = () => {
    switch (activePane) {
      case 'business':
        return (
          <BusinessPane
            merchant={merchant}
            canEdit={canEdit}
            onSaved={async () => {
              await refreshAuth();
              flash('ok', t('settings.saved'));
            }}
            onError={(m) => flash('error', m)}
          />
        );
      case 'brand':
        return (
          <BrandPane
            merchant={merchant}
            canEdit={canEdit}
            onSaved={async (msg) => {
              await refreshAuth();
              flash('ok', msg);
            }}
            onError={(m) => flash('error', m)}
          />
        );
      case 'gates':
        return (
          <GatesPane
            merchant={merchant}
            canEdit={canEdit}
            onSaved={async () => {
              await refreshAuth();
              flash('ok', t('settings.saved'));
            }}
            onError={(m) => flash('error', m)}
          />
        );
      case 'providers':
        return (
          <ProvidersPane
            merchant={merchant}
            canEdit={canEdit}
            onSaved={async () => {
              await refreshAuth();
              flash('ok', t('settings.saved'));
            }}
            onError={(m) => flash('error', m)}
          />
        );
      case 'passTypes':
        return (
          <PassTypesPane
            merchantId={merchant.id}
            currency={merchant.currency}
            types={ticketTypes}
            canEdit={canEdit}
            onChanged={async () => {
              await refresh({ silent: true });
              flash('ok', t('settings.passTypes.updated'));
            }}
            onError={(m) => flash('error', m)}
          />
        );
      case 'staff':
        return (
          <StaffPane
            staff={staff}
            canManage={canManageStaff}
            currentUserId={user.id}
            onChanged={async (msg) => {
              await refresh({ silent: true });
              flash('ok', msg);
            }}
            onError={(m) => flash('error', m)}
          />
        );
      case 'appearance':
        return <AppearancePane />;
      default:
        return null;
    }
  };

  return (
    <View className="flex-1 bg-brand-bg">
      <TopBar title={t('settings.title')} subtitle={merchant.businessName} />

      {isExpanded ? (
        // Expanded Master-Detail Layout (Desktop / Tablet)
        <View className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex-row gap-6">
          {/* Left Master Sidebar */}
          <View className="w-72 sm:w-80 shrink-0">
            <Card className="p-2.5 gap-1.5">
              {PANES.map((pane) => {
                const Icon = pane.icon;
                const isSelected = activePane === pane.id;
                return (
                  <Pressable
                    key={pane.id}
                    onPress={() => setSelectedPane(pane.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    className={`flex-row items-center gap-3 p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-brand-accent/10 border-brand-accent/40'
                        : 'bg-transparent border-transparent active:bg-brand-surface-raised'
                    }`}
                  >
                    <View
                      className={`w-9 h-9 rounded-xl items-center justify-center border ${
                        isSelected
                          ? 'bg-brand-accent/20 border-brand-accent/40'
                          : 'bg-brand-surface-raised border-brand-border'
                      }`}
                    >
                      <Icon
                        size={17}
                        color={isSelected ? colors['accent'] : colors['text-muted']}
                      />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text
                        font={isSelected ? 'display-bold' : 'body-semibold'}
                        numberOfLines={1}
                        className={`text-sm ${
                          isSelected ? 'text-brand-accent' : 'text-brand-text'
                        }`}
                      >
                        {t(pane.labelKey)}
                      </Text>
                      <Text
                        font="body"
                        numberOfLines={1}
                        className="text-[11px] text-brand-text-muted mt-0.5"
                      >
                        {t(pane.subKey)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </Card>
          </View>

          {/* Right Detail Pane */}
          <ScrollView
            className="flex-1 min-w-0"
            contentContainerStyle={{ paddingBottom: 56 }}
            showsVerticalScrollIndicator={false}
          >
            {renderNoticeBanner()}
            {renderDetailContent()}
          </ScrollView>
        </View>
      ) : (
        // Compact Drill-Down Layout (Mobile)
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 56 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="max-w-xl mx-auto w-full px-4 py-4 gap-4">
            {selectedPane !== null ? (
              // Active Pane Detail View with Back navigation
              <View className="gap-4">
                <Pressable
                  onPress={() => setSelectedPane(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.title')}
                  className="self-start flex-row items-center gap-2 py-1.5 px-3 rounded-xl bg-brand-surface border border-brand-border active:bg-brand-surface-raised"
                >
                  <ArrowLeft size={15} color={colors['accent']} />
                  <Text font="body-semibold" className="text-xs text-brand-text">
                    {t('settings.title')}
                  </Text>
                </Pressable>

                {renderNoticeBanner()}
                {renderDetailContent()}
              </View>
            ) : (
              // Master Settings Menu List
              <Card className="p-2 gap-1">
                {PANES.map((pane, index) => {
                  const Icon = pane.icon;
                  const isLast = index === PANES.length - 1;
                  return (
                    <Pressable
                      key={pane.id}
                      onPress={() => setSelectedPane(pane.id)}
                      accessibilityRole="button"
                      className={`flex-row items-center gap-3.5 p-3 rounded-xl active:bg-brand-surface-raised ${
                        !isLast ? 'border-b border-brand-border/60' : ''
                      }`}
                    >
                      <View className="w-10 h-10 rounded-xl bg-brand-surface-raised border border-brand-border-strong items-center justify-center">
                        <Icon size={18} color={colors['accent']} />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text font="display-bold" numberOfLines={1} className="text-sm text-brand-text">
                          {t(pane.labelKey)}
                        </Text>
                        <Text font="body" numberOfLines={1} className="text-xs text-brand-text-muted mt-0.5">
                          {t(pane.subKey)}
                        </Text>
                      </View>
                      <ChevronRight size={18} color={colors['text-faint']} />
                    </Pressable>
                  );
                })}
              </Card>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// -----------------------------------------------------------------------------
// Shared Subcomponents
// -----------------------------------------------------------------------------

const ReadOnlyNote: React.FC = () => {
  const { t } = useTranslation();
  return (
    <Text font="body" className="text-[11px] text-brand-text-faint leading-4 mt-2">
      {t('settings.readOnly')}
    </Text>
  );
};

const ChoiceRow: React.FC<{
  selected: boolean;
  disabled: boolean;
  label: string;
  note: string;
  onPress: () => void;
}> = ({ selected, disabled, label, note, onPress }) => {
  const colors = useThemeColors();
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      activeOpacity={disabled ? 1 : 0.7}
      className={`p-3.5 rounded-2xl border ${
        selected ? 'bg-brand-accent/10 border-brand-accent/50' : 'bg-brand-bg/60 border-brand-border'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text font="body-bold" className="text-sm text-brand-text">
          {label}
        </Text>
        {selected && <CheckCircle2 size={16} color={colors['accent']} />}
      </View>
      <Text font="body" className="text-xs text-brand-text-muted leading-4">
        {note}
      </Text>
    </TouchableOpacity>
  );
};

// -----------------------------------------------------------------------------
// Pane 1: Business Details
// -----------------------------------------------------------------------------

const BusinessPane: React.FC<{
  merchant: Merchant;
  canEdit: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}> = ({ merchant, canEdit, onSaved, onError }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [businessName, setBusinessName] = useState(merchant.businessName);
  const [location, setLocation] = useState(merchant.location);
  const [upiId, setUpiId] = useState(merchant.upiId);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await merchantService.updateMerchant(merchant.id, { businessName, location, upiId });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('settings.business.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeader
        icon={<Building2 size={18} color={colors['accent']} />}
        title={t('settings.panes.business')}
        subtitle={t('settings.panes.businessSub')}
        className="mb-5 pb-3.5 border-b border-brand-border"
      />

      <Field label={t('settings.business.name')}>
        <TextInput
          value={businessName}
          onChangeText={setBusinessName}
          editable={canEdit}
          placeholderTextColor={colors['text-faint']}
          className="text-brand-text text-base"
        />
      </Field>

      <Field label={t('settings.business.location')}>
        <TextInput
          value={location}
          onChangeText={setLocation}
          editable={canEdit}
          placeholderTextColor={colors['text-faint']}
          className="text-brand-text text-base"
        />
      </Field>

      <Field label={t('settings.business.upi')} hint={t('settings.business.upiHint')}>
        <TextInput
          value={upiId}
          onChangeText={setUpiId}
          editable={canEdit}
          autoCapitalize="none"
          placeholderTextColor={colors['text-faint']}
          className="text-brand-text text-base"
        />
      </Field>

      {canEdit ? (
        <Button
          title={t('settings.business.save')}
          variant="primary"
          fullWidth
          loading={busy}
          onPress={save}
        />
      ) : (
        <ReadOnlyNote />
      )}
    </Card>
  );
};

// -----------------------------------------------------------------------------
// Pane 2: Brand & Logo
// -----------------------------------------------------------------------------

const BrandPane: React.FC<{
  merchant: Merchant;
  canEdit: boolean;
  onSaved: (msg: string) => void;
  onError: (message: string) => void;
}> = ({ merchant, canEdit, onSaved, onError }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const hasLogo = Boolean(merchant.branding?.logoUrl);

  const pickAndUpload = async () => {
    try {
      // Not granted means not granted. The previous condition also required
      // canAskAgain, so the one case it needed to catch - permission denied for
      // good - fell through and opened a picker the OS refuses to populate.
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        onError(t('settings.brand.permissionNeeded'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setBusy(true);
      await merchantService.uploadLogo(merchant.id, asset.uri, asset.mimeType);
      onSaved(t('settings.brand.uploadSuccess'));
    } catch (err) {
      onError(err instanceof Error ? err.message : t('settings.brand.uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await merchantService.removeLogo(merchant.id);
      onSaved(t('settings.brand.removeSuccess'));
    } catch (err) {
      onError(err instanceof Error ? err.message : t('settings.brand.removeFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="gap-5">
      <SectionHeader
        icon={<Sparkles size={18} color={colors['accent']} />}
        title={t('settings.panes.brand')}
        subtitle={t('settings.panes.brandSub')}
        className="pb-3.5 border-b border-brand-border"
      />

      {/* Current Mark Card */}
      <View className="p-4 rounded-2xl bg-brand-bg/60 border border-brand-border gap-4">
        <View className="flex-row items-center gap-4">
          <MerchantLogo
            name={merchant.businessName}
            logoUrl={merchant.branding?.logoUrl}
            size={56}
          />
          <View className="flex-1 min-w-0">
            <Text font="display-bold" className="text-sm text-brand-text">
              {hasLogo ? t('settings.brand.current') : t('settings.brand.noneTitle')}
            </Text>
            <Text font="body" className="text-xs text-brand-text-muted mt-1 leading-4">
              {hasLogo
                ? merchant.branding?.logoUrl
                : t('settings.brand.noneBody')}
            </Text>
          </View>
        </View>

        {canEdit && (
          <View className="gap-2 pt-2 border-t border-brand-border/60">
            <View className="flex-row gap-2.5">
              <Button
                title={hasLogo ? t('settings.brand.changeBtn') : t('settings.brand.uploadBtn')}
                variant="primary"
                size="md"
                className="flex-1"
                loading={busy}
                icon={<Upload size={15} color={colors['on-accent']} />}
                onPress={pickAndUpload}
              />
              {hasLogo && (
                <Button
                  title={t('settings.brand.removeBtn')}
                  variant="outline"
                  size="md"
                  disabled={busy}
                  icon={<Trash2 size={15} color={colors['danger']} />}
                  onPress={remove}
                />
              )}
            </View>
            <Text font="body" className="text-[11px] text-brand-text-faint leading-4">
              {t('settings.brand.sizeHint')}
            </Text>
          </View>
        )}
      </View>

      {/* Customer Preview Card */}
      <View>
        <Text font="body-semibold" className="text-xs uppercase tracking-wider text-brand-text-subtle mb-3">
          {t('settings.brand.preview')}
        </Text>

        <View className="p-4 sm:p-5 rounded-2xl bg-brand-surface-raised border border-brand-border gap-3.5">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-row items-center gap-3 flex-1 min-w-0">
              <MerchantLogo
                name={merchant.businessName}
                logoUrl={merchant.branding?.logoUrl}
                size={40}
              />
              <View className="flex-1 min-w-0">
                <Text font="display-bold" numberOfLines={1} className="text-base text-brand-text">
                  {merchant.businessName}
                </Text>
                <Text font="body" numberOfLines={1} className="text-xs text-brand-text-muted">
                  {merchant.location || 'Connaught Place, New Delhi'}
                </Text>
              </View>
            </View>
            {/* This block mimics the customer's pass page, so it uses that
                page's own wording rather than a second copy of it. */}
            <Badge label={t('pass.validBadge')} variant="success" size="sm" />
          </View>

          <View className="p-3 rounded-xl bg-brand-bg/80 border border-brand-border/60 flex-row items-center justify-between">
            <Text font="body-medium" className="text-xs text-brand-text-muted">
              UPI: {merchant.upiId}
            </Text>
            <Text font="body-bold" className="text-xs text-brand-accent">
              {formatCurrency(50, merchant.currency)}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
};

// -----------------------------------------------------------------------------
// Pane 3: Exit Gates
// -----------------------------------------------------------------------------

const GatesPane: React.FC<{
  merchant: Merchant;
  canEdit: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}> = ({ merchant, canEdit, onSaved, onError }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [gates, setGates] = useState<string[]>(merchant.exitGates?.length ? merchant.exitGates : ['Main Exit']);
  const [newGate, setNewGate] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (merchant.exitGates?.length) {
      setGates(merchant.exitGates);
    }
  }, [merchant.exitGates]);

  const addGate = () => {
    const trimmed = newGate.trim();
    if (!trimmed) return;
    if (gates.includes(trimmed)) {
      setNewGate('');
      return;
    }
    setGates([...gates, trimmed]);
    setNewGate('');
  };

  const removeGate = (indexToRemove: number) => {
    if (gates.length <= 1) {
      onError(t('settings.gates.atLeastOne'));
      return;
    }
    setGates(gates.filter((_, idx) => idx !== indexToRemove));
  };

  const save = async () => {
    if (gates.length === 0) {
      onError(t('settings.gates.atLeastOne'));
      return;
    }
    setBusy(true);
    try {
      await merchantService.updateMerchant(merchant.id, { exitGates: gates });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('settings.gates.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeader
        icon={<DoorOpen size={18} color={colors['accent']} />}
        title={t('settings.panes.gates')}
        subtitle={t('settings.panes.gatesSub')}
        className="mb-4 pb-3.5 border-b border-brand-border"
      />

      <Text font="body" className="text-xs text-brand-text-muted mb-4 leading-4">
        {t('settings.gates.intro')}
      </Text>

      <View className="gap-2 mb-4">
        {gates.map((gate, index) => (
          <View
            key={`${gate}-${index}`}
            className="flex-row items-center justify-between p-3.5 rounded-2xl bg-brand-bg/60 border border-brand-border gap-3"
          >
            <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
              <DoorOpen size={16} color={colors['accent']} />
              <Text font="body-bold" numberOfLines={1} className="text-sm text-brand-text">
                {gate}
              </Text>
            </View>

            {canEdit && gates.length > 1 && (
              <Pressable
                onPress={() => removeGate(index)}
                accessibilityRole="button"
                accessibilityLabel={t('settings.gates.remove', { gate })}
                className="p-1.5 rounded-lg active:bg-brand-surface-raised"
              >
                <Trash2 size={15} color={colors['danger']} />
              </Pressable>
            )}
          </View>
        ))}
      </View>

      {canEdit && (
        <View className="flex-row items-center gap-2 mb-4">
          <View className="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3.5 py-2.5">
            <TextInput
              value={newGate}
              onChangeText={setNewGate}
              placeholder={t('settings.gates.placeholder')}
              placeholderTextColor={colors['text-faint']}
              className="text-brand-text text-sm"
              onSubmitEditing={addGate}
            />
          </View>
          <Button
            title={t('settings.gates.add')}
            variant="secondary"
            size="md"
            icon={<Plus size={15} color={colors['text']} />}
            onPress={addGate}
          />
        </View>
      )}

      {canEdit ? (
        <Button
          title={t('settings.gates.save')}
          variant="primary"
          fullWidth
          loading={busy}
          onPress={save}
        />
      ) : (
        <ReadOnlyNote />
      )}
    </Card>
  );
};

// -----------------------------------------------------------------------------
// Pane 4: Payment & Delivery Providers
// -----------------------------------------------------------------------------

const ProvidersPane: React.FC<{
  merchant: Merchant;
  canEdit: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}> = ({ merchant, canEdit, onSaved, onError }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [payment, setPayment] = useState(merchant.paymentProvider);
  const [messaging, setMessaging] = useState(merchant.messagingProvider);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await merchantService.updateMerchant(merchant.id, {
        paymentProvider: payment,
        messagingProvider: messaging,
      });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('settings.providers.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeader
        icon={<CreditCard size={18} color={colors['accent']} />}
        title={t('settings.panes.providers')}
        subtitle={t('settings.panes.providersSub')}
        className="mb-4 pb-3.5 border-b border-brand-border"
      />

      <Text font="body" className="text-xs text-brand-text-muted mb-4 leading-4">
        {t('settings.providers.swappable')}
      </Text>

      <Text font="body-semibold" className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider mb-2.5">
        {t('settings.providers.payTitle')}
      </Text>
      <View className="gap-2.5 mb-5">
        {Object.entries(PAYMENT_PROVIDERS).map(([id, meta]) => (
          <ChoiceRow
            key={id}
            selected={payment === id}
            disabled={!canEdit}
            label={meta.label}
            note={meta.note}
            onPress={() => setPayment(id)}
          />
        ))}
      </View>

      <View className="flex-row items-center gap-1.5 mb-2.5">
        <MessageSquare size={13} color={colors['text-muted']} />
        <Text font="body-semibold" className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider">
          {t('settings.providers.deliverTitle')}
        </Text>
      </View>
      <View className="gap-2.5 mb-5">
        {Object.entries(MESSAGING_PROVIDERS).map(([id, meta]) => (
          <ChoiceRow
            key={id}
            selected={messaging === id}
            disabled={!canEdit}
            label={meta.label}
            note={meta.note}
            onPress={() => setMessaging(id)}
          />
        ))}
      </View>

      {canEdit ? (
        <Button
          title={t('settings.providers.save')}
          variant="primary"
          fullWidth
          loading={busy}
          onPress={save}
        />
      ) : (
        <ReadOnlyNote />
      )}
    </Card>
  );
};

// -----------------------------------------------------------------------------
// Pane 5: Pass Types & Prices
// -----------------------------------------------------------------------------

const PassTypesPane: React.FC<{
  merchantId: string;
  currency: string;
  types: TicketType[];
  canEdit: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}> = ({ merchantId, currency, types, canEdit, onChanged, onError }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [validMinutes, setValidMinutes] = useState<number | null>(360);
  const [extAmount, setExtAmount] = useState('');
  const [extMinutes, setExtMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const timed = validMinutes !== null;
    const draft = {
      code: code.trim().toUpperCase().replace(/\s+/g, '_'),
      label: label.trim(),
      icon: 'ticket' as const,
      amount: Number(amount),
      validForMinutes: validMinutes,
      extensionAmount: timed && extAmount.trim() !== '' ? Number(extAmount) : null,
      extensionMinutes: timed ? extMinutes : null,
      sortOrder: types.length + 1,
      isActive: true,
    };

    const problem = validateTicketTypeDraft(draft);
    if (problem) {
      onError(problem);
      return;
    }

    setBusy(true);
    try {
      await merchantService.createTicketType(merchantId, draft);
      setCode('');
      setLabel('');
      setAmount('');
      setValidMinutes(360);
      setExtAmount('');
      setExtMinutes(null);
      setAdding(false);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('settings.passTypes.addFailed'));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await merchantService.updateTicketType(id, { isActive });
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : t('settings.passTypes.updateFailed'));
    }
  };

  return (
    <Card>
      <SectionHeader
        icon={<Tag size={18} color={colors['accent']} />}
        title={t('settings.panes.passTypes')}
        subtitle={t('settings.panes.passTypesSub')}
        className="mb-4 pb-3.5 border-b border-brand-border"
      />

      <View className="gap-2.5 mb-3">
        {types.map((type) => {
          const Icon = ticketTypeIcon(type.icon);
          return (
            <View
              key={type.id}
              className="flex-row items-center gap-3 p-3.5 rounded-2xl bg-brand-bg/60 border border-brand-border"
            >
              <Icon size={18} color={type.isActive ? colors['accent'] : colors['text-faint']} />
              <View className="flex-1 min-w-0">
                <Text font="body-bold" className="text-sm text-brand-text">
                  {type.label}
                </Text>
                <Text font="body" className="text-[11px] text-brand-text-faint mt-0.5">
                  {formatDuration(type.validForMinutes)}
                  {(() => {
                    const terms = extensionTerms(type);
                    return terms
                      ? ` · ${t('settings.passTypes.perExtension', {
                          amount: formatCurrency(terms.amount, currency),
                          duration: formatDuration(terms.minutes),
                        })}`
                      : '';
                  })()}
                </Text>
              </View>
              <Text font="display-extrabold" className="text-sm text-brand-accent">
                {formatCurrency(type.amount, currency)}
              </Text>
              {canEdit && (
                <Switch
                  value={type.isActive}
                  onValueChange={(value) => toggleActive(type.id, value)}
                  trackColor={{ false: colors['surface-raised'], true: colors['accent-deep'] }}
                  thumbColor={type.isActive ? colors['accent-soft'] : colors['text-muted']}
                />
              )}
            </View>
          );
        })}
      </View>

      <Text font="body" className="text-[11px] text-brand-text-faint mb-4 leading-4">
        {t('settings.passTypes.retireNote')}
      </Text>

      {canEdit &&
        (adding ? (
          <View className="mt-2 pt-4 border-t border-brand-border">
            <Field label={t('settings.passTypes.name')}>
              <TextInput
                value={label}
                onChangeText={(text) => {
                  setLabel(text);
                  if (!code) setCode(text.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 32));
                }}
                placeholder={t('settings.passTypes.namePlaceholder')}
                placeholderTextColor={colors['text-faint']}
                className="text-brand-text text-base"
              />
            </Field>
            <Field label={t('settings.passTypes.code')} hint={t('settings.passTypes.codeHint')}>
              <TextInput
                value={code}
                onChangeText={(text) => setCode(text.toUpperCase())}
                placeholder="VIP_PASS"
                placeholderTextColor={colors['text-faint']}
                autoCapitalize="characters"
                className="text-brand-text text-base font-mono"
              />
            </Field>
            <Field label={t('settings.passTypes.price')}>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="50"
                placeholderTextColor={colors['text-faint']}
                keyboardType="number-pad"
                className="text-brand-text text-base"
              />
            </Field>

            <Text font="body-semibold" className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider mb-2">
              {t('settings.passTypes.validFor')}
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-2">
              {VALIDITY_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={String(preset)}
                  onPress={() => {
                    setValidMinutes(preset);
                    if (preset === null) {
                      setExtAmount('');
                      setExtMinutes(null);
                    }
                  }}
                  activeOpacity={0.7}
                  className={`px-3 py-1.5 rounded-xl border ${
                    validMinutes === preset
                      ? 'bg-brand-accent border-brand-accent'
                      : 'bg-brand-bg border-brand-border'
                  }`}
                >
                  <Text
                    font="body-bold"
                    className={`text-xs ${
                      validMinutes === preset ? 'text-brand-on-accent' : 'text-brand-text-muted'
                    }`}
                  >
                    {formatDuration(preset)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text font="body" className="text-[11px] text-brand-text-faint mb-4 leading-4">
              {t('settings.passTypes.clockNote')}
            </Text>

            {validMinutes !== null && (
              <>
                <Text font="body-semibold" className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider mb-2">
                  {t('settings.passTypes.extension')}
                </Text>
                <View className="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 mb-2">
                  <TextInput
                    value={extAmount}
                    onChangeText={setExtAmount}
                    placeholder={t('settings.passTypes.extensionPlaceholder', { amount: amount || '0' })}
                    placeholderTextColor={colors['text-faint']}
                    keyboardType="number-pad"
                    className="text-brand-text text-base"
                  />
                </View>
                <View className="flex-row flex-wrap gap-2 mb-2">
                  {VALIDITY_PRESETS.filter((preset) => preset !== null).map((preset) => (
                    <TouchableOpacity
                      key={String(preset)}
                      onPress={() => setExtMinutes(extMinutes === preset ? null : preset)}
                      activeOpacity={0.7}
                      className={`px-3 py-1.5 rounded-xl border ${
                        extMinutes === preset
                          ? 'bg-brand-accent border-brand-accent'
                          : 'bg-brand-bg border-brand-border'
                      }`}
                    >
                      <Text
                        font="body-bold"
                        className={`text-xs ${
                          extMinutes === preset ? 'text-brand-on-accent' : 'text-brand-text-muted'
                        }`}
                      >
                        {formatDuration(preset)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text font="body" className="text-[11px] text-brand-text-faint mb-4 leading-4">
                  {t('settings.passTypes.extensionNote')}
                </Text>
              </>
            )}

            <View className="flex-row gap-2">
              <Button
                title={t('common.cancel')}
                variant="secondary"
                className="flex-1"
                onPress={() => setAdding(false)}
              />
              <Button
                title={t('settings.passTypes.add')}
                variant="primary"
                className="flex-1"
                loading={busy}
                onPress={add}
              />
            </View>
          </View>
        ) : (
          <Button
            title={t('settings.passTypes.add')}
            variant="secondary"
            fullWidth
            icon={<Plus size={15} color={colors['text']} />}
            onPress={() => setAdding(true)}
          />
        ))}
    </Card>
  );
};

// -----------------------------------------------------------------------------
// Pane 6: Staff & Gatekeepers
// -----------------------------------------------------------------------------

const StaffPane: React.FC<{
  staff: StaffMember[];
  canManage: boolean;
  currentUserId: string;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}> = ({ staff, canManage, currentUserId, onChanged, onError }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const addStaff = async () => {
    setBusy(true);
    try {
      await merchantService.createStaff({
        name,
        phone,
        pin,
        permissions: defaultStaffPermissions(),
      });
      setName('');
      setPhone('');
      setPin('');
      setAdding(false);
      onChanged(t('settings.staff.added'));
    } catch (err) {
      onError(err instanceof Error ? err.message : t('settings.staff.addFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeader
        icon={<Users2 size={18} color={colors['accent']} />}
        title={t('settings.panes.staff')}
        subtitle={t('settings.panes.staffSub')}
        className="mb-4 pb-3.5 border-b border-brand-border"
      />

      <View className="gap-3 mb-3">
        {staff.map((member) => (
          <StaffRow
            key={member.id}
            member={member}
            canManage={canManage}
            isSelf={member.id === currentUserId}
            onChanged={onChanged}
            onError={onError}
          />
        ))}
      </View>

      {canManage &&
        (adding ? (
          <View className="mt-3 pt-4 border-t border-brand-border">
            <Field label={t('settings.staff.name')}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('settings.staff.namePlaceholder')}
                placeholderTextColor={colors['text-faint']}
                className="text-brand-text text-base"
              />
            </Field>
            <Field label={t('settings.staff.phone')} hint={t('settings.staff.phoneHint')}>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="98111 22233"
                placeholderTextColor={colors['text-faint']}
                keyboardType="phone-pad"
                className="text-brand-text text-base"
              />
            </Field>
            <Field label={t('settings.staff.pin')} hint={t('settings.staff.pinHint')}>
              <TextInput
                value={pin}
                onChangeText={setPin}
                placeholder="0000"
                placeholderTextColor={colors['text-faint']}
                keyboardType="number-pad"
                maxLength={8}
                className="text-brand-text text-xl font-bold tracking-[0.3em]"
              />
            </Field>
            <View className="flex-row gap-2">
              <Button
                title={t('common.cancel')}
                variant="secondary"
                className="flex-1"
                onPress={() => setAdding(false)}
              />
              <Button
                title={t('settings.staff.add')}
                variant="primary"
                className="flex-1"
                loading={busy}
                onPress={addStaff}
              />
            </View>
          </View>
        ) : (
          <Button
            title={t('settings.staff.add')}
            variant="secondary"
            fullWidth
            icon={<Plus size={15} color={colors['text']} />}
            onPress={() => setAdding(true)}
          />
        ))}
    </Card>
  );
};

const StaffRow: React.FC<{
  member: StaffMember;
  canManage: boolean;
  isSelf: boolean;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}> = ({ member, canManage, isSelf, onChanged, onError }) => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [permissions, setPermissions] = useState<PermissionSet>(member.permissions);
  const [expanded, setExpanded] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newPin, setNewPin] = useState('');

  useEffect(() => setPermissions(member.permissions), [member.permissions]);

  const toggle = async (key: PermissionKey, value: boolean) => {
    const next = { ...permissions, [key]: value };
    setPermissions(next);
    try {
      await merchantService.setStaffPermissions(member.id, next);
    } catch (err) {
      setPermissions(permissions);
      onError(err instanceof Error ? err.message : t('settings.staff.accessFailed'));
    }
  };

  const resetPin = async () => {
    try {
      await merchantService.resetStaffPin(member.id, newPin);
      setNewPin('');
      setResetting(false);
      onChanged(t('settings.staff.pinSet', { name: member.name }));
    } catch (err) {
      onError(err instanceof Error ? err.message : t('settings.staff.pinFailed'));
    }
  };

  const deactivate = async () => {
    try {
      await merchantService.deactivateStaff(member.id);
      onChanged(t('settings.staff.removed_toast', { name: member.name }));
    } catch (err) {
      onError(err instanceof Error ? err.message : t('settings.staff.removeFailed'));
    }
  };

  return (
    <View className="rounded-2xl bg-brand-bg/60 border border-brand-border p-3.5">
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.8}
        className="flex-row items-center justify-between gap-3"
      >
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2 flex-wrap">
            <Text font="body-bold" className="text-sm text-brand-text">
              {member.name}
            </Text>
            <Badge
              label={
                member.isOwner
                  ? t('settings.staff.owner')
                  : member.isActive
                    ? t('settings.staff.gatekeeper')
                    : t('settings.staff.removed')
              }
              variant={member.isOwner ? 'success' : member.isActive ? 'info' : 'neutral'}
              size="sm"
            />
            {isSelf && <Badge label={t('settings.staff.you')} variant="neutral" size="sm" />}
          </View>
          <Text font="body" className="text-[11px] text-brand-text-muted mt-0.5">
            {member.phone}
          </Text>
        </View>
        <Text font="body-bold" className="text-xs text-brand-accent">
          {expanded ? t('settings.staff.hide') : t('settings.staff.access')}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View className="mt-3 pt-3 border-t border-brand-border">
          {member.isOwner ? (
            <Text font="body" className="text-[11px] text-brand-text-faint leading-4">
              {t('settings.staff.ownerNote')}
            </Text>
          ) : (
            <>
              <View className="gap-3">
                {PERMISSION_KEYS.map((key) => (
                  <View key={key} className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text font="body-bold" className="text-xs text-brand-text">
                        {permissionLabel(key)}
                      </Text>
                      <Text font="body" className="text-[11px] text-brand-text-faint leading-4">
                        {permissionDescription(key)}
                      </Text>
                    </View>
                    <Switch
                      value={permissions[key]}
                      onValueChange={(value) => toggle(key, value)}
                      disabled={!canManage}
                      trackColor={{
                        false: colors['surface-raised'],
                        true: colors['accent-deep'],
                      }}
                      thumbColor={permissions[key] ? colors['accent-soft'] : colors['text-muted']}
                    />
                  </View>
                ))}
              </View>

              {canManage && (
                <View className="mt-4 pt-3 border-t border-brand-border gap-2">
                  {resetting ? (
                    <>
                      <View className="bg-brand-bg border border-brand-border rounded-xl px-3.5 py-2.5">
                        <TextInput
                          value={newPin}
                          onChangeText={setNewPin}
                          placeholder={t('settings.staff.newPin')}
                          placeholderTextColor={colors['text-faint']}
                          keyboardType="number-pad"
                          maxLength={8}
                          className="text-brand-text text-base font-bold tracking-[0.3em]"
                        />
                      </View>
                      <View className="flex-row gap-2">
                        <Button
                          title={t('common.cancel')}
                          variant="ghost"
                          size="sm"
                          className="flex-1"
                          onPress={() => setResetting(false)}
                        />
                        <Button
                          title={t('settings.staff.setPin')}
                          variant="primary"
                          size="sm"
                          className="flex-1"
                          onPress={resetPin}
                        />
                      </View>
                    </>
                  ) : (
                    <View className="flex-row gap-2">
                      <Button
                        title={t('settings.staff.changePin')}
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        icon={<KeyRound size={13} color={colors['text']} />}
                        onPress={() => setResetting(true)}
                      />
                      {member.isActive && (
                        <Button
                          title={t('settings.staff.remove')}
                          variant="danger"
                          size="sm"
                          className="flex-1"
                          icon={<UserMinus size={13} color={colors['on-danger']} />}
                          onPress={deactivate}
                        />
                      )}
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
};

// -----------------------------------------------------------------------------
// Pane 7: Appearance & Language
// -----------------------------------------------------------------------------

const AppearancePane: React.FC = () => {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { preference: themePref, setPreference: setThemePref } = useTheme();
  const { preference: langPref, setPreference: setLangPref } = useLanguage();

  const themeOptions: { value: ThemePreference; labelKey: string; Icon: LucideIcon }[] = [
    { value: 'system', labelKey: 'appearance.themeSystem', Icon: SunMoon },
    { value: 'light', labelKey: 'appearance.themeLight', Icon: Sun },
    { value: 'dark', labelKey: 'appearance.themeDark', Icon: Moon },
  ];

  const langOptions: { value: LanguagePreference; labelKey: string; tag: string }[] = [
    { value: 'system', labelKey: 'appearance.languageSystem', tag: 'AUTO' },
    { value: 'en', labelKey: 'appearance.languageEn', tag: 'EN' },
    { value: 'hi', labelKey: 'appearance.languageHi', tag: 'हिं' },
  ];

  return (
    <Card className="gap-5">
      <SectionHeader
        icon={<SunMoon size={18} color={colors['accent']} />}
        title={t('settings.panes.appearance')}
        subtitle={t('settings.panes.appearanceSub')}
        className="pb-3.5 border-b border-brand-border"
      />

      {/* Theme Section */}
      <View>
        <Text font="body-semibold" className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider mb-2.5">
          {t('appearance.theme')}
        </Text>
        <View className="flex-row gap-2.5">
          {themeOptions.map((option) => {
            const active = themePref === option.value;
            const Icon = option.Icon;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => setThemePref(option.value)}
                activeOpacity={0.7}
                className={`flex-1 items-center gap-2 p-3.5 rounded-2xl border ${
                  active
                    ? 'bg-brand-accent/10 border-brand-accent/60'
                    : 'bg-brand-bg/60 border-brand-border'
                }`}
              >
                <Icon
                  size={20}
                  color={active ? colors['accent'] : colors['text-muted']}
                />
                <Text
                  font={active ? 'body-bold' : 'body-medium'}
                  className={`text-xs ${
                    active ? 'text-brand-accent' : 'text-brand-text-muted'
                  }`}
                >
                  {t(option.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text font="body" className="text-[11px] text-brand-text-faint mt-2.5 leading-4">
          {t('settings.appearance.themeNote')}
        </Text>
      </View>

      {/* Language Section */}
      <View>
        <Text font="body-semibold" className="text-xs font-bold text-brand-text-subtle uppercase tracking-wider mb-2.5">
          {t('appearance.language')}
        </Text>
        <View className="flex-row gap-2.5">
          {langOptions.map((option) => {
            const active = langPref === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => setLangPref(option.value)}
                activeOpacity={0.7}
                className={`flex-1 items-center gap-1.5 p-3.5 rounded-2xl border ${
                  active
                    ? 'bg-brand-accent/10 border-brand-accent/60'
                    : 'bg-brand-bg/60 border-brand-border'
                }`}
              >
                <Text
                  font="display-extrabold"
                  className={`text-sm ${
                    active ? 'text-brand-accent' : 'text-brand-text-muted'
                  }`}
                >
                  {option.tag}
                </Text>
                <Text
                  font={active ? 'body-bold' : 'body-medium'}
                  className={`text-xs ${
                    active ? 'text-brand-accent' : 'text-brand-text-muted'
                  }`}
                >
                  {t(option.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text font="body" className="text-[11px] text-brand-text-faint mt-2.5 leading-4">
          {t('settings.appearance.langNote')}
        </Text>
      </View>
    </Card>
  );
};
