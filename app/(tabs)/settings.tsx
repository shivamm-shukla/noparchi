import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Switch, TouchableOpacity } from 'react-native';
import {
  Building2,
  Users2,
  Tag,
  Plus,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  UserMinus,
  CreditCard,
  MessageSquare,
} from 'lucide-react-native';
import theme from '../../src/config/theme';
import { useAuth } from '../../src/context/AuthContext';
import { useApp } from '../../src/context/AppContext';
import { Header } from '../../components/ui/Header';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { merchantService } from '../../src/services/merchantService';
import {
  PERMISSION_KEYS,
  PERMISSION_REGISTRY,
  defaultStaffPermissions,
  type PermissionKey,
  type PermissionSet,
} from '../../src/config/permissions';
import { PAYMENT_PROVIDERS, MESSAGING_PROVIDERS } from '../../src/config/providers';
import {
  validateTicketTypeDraft,
  formatDuration,
  extensionTerms,
  VALIDITY_PRESETS,
} from '../../src/config/pricing';
import { ticketTypeIcon } from '../../src/config/icons';
import { formatCurrency } from '../../src/utils/formatters';
import type { StaffMember } from '../../src/types';

export default function SettingsScreen() {
  const { merchant, user, can, refresh: refreshAuth } = useAuth();
  const { ticketTypes, staff, refresh } = useApp();

  const canEdit = can('can_edit_settings');
  const canManageStaff = can('can_manage_staff');

  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const flash = (kind: 'ok' | 'error', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 4000);
  };

  if (!merchant || !user) return null;

  return (
    <View className="flex-1 bg-slate-950">
      <Header title="Settings" subtitle={merchant.businessName} />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 gap-6">
          {notice && (
            <Card
              className={
                notice.kind === 'ok'
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-rose-500/40 bg-rose-500/5'
              }
            >
              <View className="flex-row items-center gap-2">
                {notice.kind === 'ok' ? (
                  <CheckCircle2 size={15} color={theme.semantic.accent} />
                ) : (
                  <AlertCircle size={15} color={theme.semantic.danger} />
                )}
                <Text
                  className={`text-xs flex-1 leading-4 ${
                    notice.kind === 'ok' ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {notice.text}
                </Text>
              </View>
            </Card>
          )}

          <BusinessSection
            merchant={merchant}
            canEdit={canEdit}
            onSaved={async () => {
              await refreshAuth();
              flash('ok', 'Business details saved.');
            }}
            onError={(m) => flash('error', m)}
          />

          <ProvidersSection
            merchant={merchant}
            canEdit={canEdit}
            onSaved={async () => {
              await refreshAuth();
              flash('ok', 'Payment and delivery settings saved.');
            }}
            onError={(m) => flash('error', m)}
          />

          <TicketTypesSection
            merchantId={merchant.id}
            currency={merchant.currency}
            types={ticketTypes}
            canEdit={canEdit}
            onChanged={async () => {
              await refresh({ silent: true });
              flash('ok', 'Pass types updated.');
            }}
            onError={(m) => flash('error', m)}
          />

          <StaffSection
            staff={staff}
            canManage={canManageStaff}
            currentUserId={user.id}
            onChanged={async (message) => {
              await refresh({ silent: true });
              flash('ok', message);
            }}
            onError={(m) => flash('error', m)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

// -----------------------------------------------------------------------------

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle: string }> = ({
  icon,
  title,
  subtitle,
}) => (
  <View className="flex-row items-center gap-3 mb-4 pb-3 border-b border-slate-800">
    <View className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 items-center justify-center">
      {icon}
    </View>
    <View className="flex-1">
      <Text className="text-base font-bold text-slate-100">{title}</Text>
      <Text className="text-xs text-slate-400">{subtitle}</Text>
    </View>
  </View>
);

const ReadOnlyNote: React.FC = () => (
  <Text className="text-[11px] text-slate-500 leading-4">
    You can see this but not change it. Ask the owner for the matching permission.
  </Text>
);

// -----------------------------------------------------------------------------

const BusinessSection: React.FC<{
  merchant: NonNullable<ReturnType<typeof useAuth>['merchant']>;
  canEdit: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}> = ({ merchant, canEdit, onSaved, onError }) => {
  const [businessName, setBusinessName] = useState(merchant.businessName);
  const [location, setLocation] = useState(merchant.location);
  const [upiId, setUpiId] = useState(merchant.upiId);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      // Persisted to the database, not just to device storage. The previous
      // build saved merchant settings to AsyncStorage only, so a rate change on
      // one phone never reached the gate device or the customer checkout.
      await merchantService.updateMerchant(merchant.id, { businessName, location, upiId });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeader
        icon={<Building2 size={18} color={theme.semantic.accent} />}
        title="Business"
        subtitle="What customers see at checkout"
      />

      <Field label="Business name">
        <TextInput
          value={businessName}
          onChangeText={setBusinessName}
          editable={canEdit}
          placeholderTextColor={theme.semantic.textFaint}
          className="text-slate-100 text-base"
        />
      </Field>

      <Field label="Location">
        <TextInput
          value={location}
          onChangeText={setLocation}
          editable={canEdit}
          placeholderTextColor={theme.semantic.textFaint}
          className="text-slate-100 text-base"
        />
      </Field>

      <Field label="UPI ID" hint="Where customer payments land.">
        <TextInput
          value={upiId}
          onChangeText={setUpiId}
          editable={canEdit}
          autoCapitalize="none"
          placeholderTextColor={theme.semantic.textFaint}
          className="text-slate-100 text-base"
        />
      </Field>

      {canEdit ? (
        <Button title="Save business details" variant="primary" fullWidth loading={busy} onPress={save} />
      ) : (
        <ReadOnlyNote />
      )}
    </Card>
  );
};

// -----------------------------------------------------------------------------

const ProvidersSection: React.FC<{
  merchant: NonNullable<ReturnType<typeof useAuth>['merchant']>;
  canEdit: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}> = ({ merchant, canEdit, onSaved, onError }) => {
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
      onError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeader
        icon={<CreditCard size={18} color={theme.semantic.accent} />}
        title="Payments & delivery"
        subtitle="Swappable — switching one does not affect the rest of the app"
      />

      <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
        How customers pay
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

      <View className="flex-row items-center gap-1.5 mb-2">
        <MessageSquare size={12} color={theme.semantic.textMuted} />
        <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          How passes reach customers
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
        <Button title="Save" variant="primary" fullWidth loading={busy} onPress={save} />
      ) : (
        <ReadOnlyNote />
      )}
    </Card>
  );
};

const ChoiceRow: React.FC<{
  selected: boolean;
  disabled: boolean;
  label: string;
  note: string;
  onPress: () => void;
}> = ({ selected, disabled, label, note, onPress }) => (
  <TouchableOpacity
    onPress={disabled ? undefined : onPress}
    activeOpacity={disabled ? 1 : 0.7}
    className={`p-3.5 rounded-2xl border ${
      selected ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-slate-950/60 border-slate-800'
    } ${disabled ? 'opacity-60' : ''}`}
  >
    <View className="flex-row items-center justify-between mb-1">
      <Text className="text-sm font-bold text-slate-100">{label}</Text>
      {selected && <CheckCircle2 size={15} color={theme.semantic.accent} />}
    </View>
    <Text className="text-[11px] text-slate-400 leading-4">{note}</Text>
  </TouchableOpacity>
);

// -----------------------------------------------------------------------------

const TicketTypesSection: React.FC<{
  merchantId: string;
  currency: string;
  types: ReturnType<typeof useApp>['ticketTypes'];
  canEdit: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}> = ({ merchantId, currency, types, canEdit, onChanged, onError }) => {
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [validMinutes, setValidMinutes] = useState<number | null>(360);
  const [extAmount, setExtAmount] = useState('');
  const [extMinutes, setExtMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    // null in either extension field means "fall back to the base price /
    // window". Storing null rather than a copy keeps that link live, so an
    // owner who later raises the base price does not silently leave extensions
    // priced at the old rate.
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
      onError(err instanceof Error ? err.message : 'Could not add the pass type.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await merchantService.updateTicketType(id, { isActive });
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not update the pass type.');
    }
  };

  return (
    <Card>
      <SectionHeader
        icon={<Tag size={18} color={theme.semantic.accent} />}
        title="Pass types & prices"
        subtitle="Add a new type any time — no update needed"
      />

      <View className="gap-2.5">
        {types.map((type) => {
          const Icon = ticketTypeIcon(type.icon);
          return (
            <View
              key={type.id}
              className="flex-row items-center gap-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800"
            >
              <Icon size={18} color={type.isActive ? theme.semantic.accent : theme.semantic.textFaint} />
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-bold text-slate-100">{type.label}</Text>
                <Text className="text-[11px] text-slate-500">
                  {formatDuration(type.validForMinutes)}
                  {(() => {
                    const terms = extensionTerms(type);
                    return terms
                      ? ` · +${formatCurrency(terms.amount, currency)} per ${formatDuration(terms.minutes)}`
                      : '';
                  })()}
                </Text>
              </View>
              <Text className="text-sm font-extrabold text-emerald-400">
                {formatCurrency(type.amount, currency)}
              </Text>
              {canEdit && (
                <Switch
                  value={type.isActive}
                  onValueChange={(value) => toggleActive(type.id, value)}
                  trackColor={{ false: theme.semantic.surfaceRaised, true: theme.semantic.accentDeep }}
                  thumbColor={type.isActive ? theme.semantic.accentSoft : theme.semantic.textMuted}
                />
              )}
            </View>
          );
        })}
      </View>

      {/*
        Retiring rather than deleting: transactions reference the type, and a
        pass sold last month must keep reporting under the type it was sold as.
      */}
      <Text className="text-[11px] text-slate-500 mt-3 leading-4">
        Switching a type off hides it from checkout. Past passes keep their original type
        and price.
      </Text>

      {canEdit &&
        (adding ? (
          <View className="mt-4 pt-4 border-t border-slate-800">
            <Field label="Name">
              <TextInput
                value={label}
                onChangeText={(text) => {
                  setLabel(text);
                  if (!code) setCode(text.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 32));
                }}
                placeholder="Cycle / VIP Pass / Night Rate"
                placeholderTextColor={theme.semantic.textFaint}
                className="text-slate-100 text-base"
              />
            </Field>
            <Field label="Code" hint="Used internally. Letters, numbers and underscore.">
              <TextInput
                value={code}
                onChangeText={(text) => setCode(text.toUpperCase())}
                placeholder="VIP_PASS"
                placeholderTextColor={theme.semantic.textFaint}
                autoCapitalize="characters"
                className="text-slate-100 text-base font-mono"
              />
            </Field>
            <Field label="Price">
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="50"
                placeholderTextColor={theme.semantic.textFaint}
                keyboardType="number-pad"
                className="text-slate-100 text-base"
              />
            </Field>

            <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Valid for
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-2">
              {VALIDITY_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.label}
                  onPress={() => {
                    setValidMinutes(preset.minutes);
                    // An untimed pass cannot be extended, so clear the terms
                    // rather than leave stale ones the form would then reject.
                    if (preset.minutes === null) {
                      setExtAmount('');
                      setExtMinutes(null);
                    }
                  }}
                  activeOpacity={0.7}
                  className={`px-3 py-1.5 rounded-xl border ${
                    validMinutes === preset.minutes
                      ? 'bg-emerald-500 border-emerald-400'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      validMinutes === preset.minutes ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text className="text-[11px] text-slate-500 mb-4 leading-4">
              The clock starts when the pass is paid for, not when it is created.
            </Text>

            {validMinutes !== null && (
              <>
                <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Extension
                </Text>
                <View className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 mb-2">
                  <TextInput
                    value={extAmount}
                    onChangeText={setExtAmount}
                    placeholder={`Leave blank for the same price (${amount || '0'})`}
                    placeholderTextColor={theme.semantic.textFaint}
                    keyboardType="number-pad"
                    className="text-slate-100 text-base"
                  />
                </View>
                <View className="flex-row flex-wrap gap-2 mb-2">
                  {VALIDITY_PRESETS.filter((preset) => preset.minutes !== null).map((preset) => (
                    <TouchableOpacity
                      key={preset.label}
                      onPress={() =>
                        setExtMinutes(extMinutes === preset.minutes ? null : preset.minutes)
                      }
                      activeOpacity={0.7}
                      className={`px-3 py-1.5 rounded-xl border ${
                        extMinutes === preset.minutes
                          ? 'bg-emerald-500 border-emerald-400'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          extMinutes === preset.minutes ? 'text-slate-900' : 'text-slate-400'
                        }`}
                      >
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text className="text-[11px] text-slate-500 mb-4 leading-4">
                  Leave both blank to charge the same price for the same length again. Overstay
                  is billed in whole extensions, so extending in advance is never more expensive
                  than being late.
                </Text>
              </>
            )}

            <View className="flex-row gap-2">
              <Button title="Cancel" variant="secondary" className="flex-1" onPress={() => setAdding(false)} />
              <Button title="Add" variant="primary" className="flex-1" loading={busy} onPress={add} />
            </View>
          </View>
        ) : (
          <Button
            title="Add a pass type"
            variant="secondary"
            fullWidth
            className="mt-4"
            icon={<Plus size={15} color={theme.semantic.text} />}
            onPress={() => setAdding(true)}
          />
        ))}
    </Card>
  );
};

// -----------------------------------------------------------------------------

const StaffSection: React.FC<{
  staff: StaffMember[];
  canManage: boolean;
  currentUserId: string;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}> = ({ staff, canManage, currentUserId, onChanged, onError }) => {
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
        // Scanner access only, until the owner grants more. Defaults come from
        // the registry, so a permission added later starts off correctly too.
        permissions: defaultStaffPermissions(),
      });
      setName('');
      setPhone('');
      setPin('');
      setAdding(false);
      onChanged('Gatekeeper added. Share their PIN with them.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not add the gatekeeper.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionHeader
        icon={<Users2 size={18} color={theme.semantic.accent} />}
        title="Gatekeepers"
        subtitle="Who works here, and what each of them can do"
      />

      <View className="gap-3">
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
          <View className="mt-4 pt-4 border-t border-slate-800">
            <Field label="Name">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Amit Kumar"
                placeholderTextColor={theme.semantic.textFaint}
                className="text-slate-100 text-base"
              />
            </Field>
            <Field label="Phone" hint="They sign in with this number and their PIN.">
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="98111 22233"
                placeholderTextColor={theme.semantic.textFaint}
                keyboardType="phone-pad"
                className="text-slate-100 text-base"
              />
            </Field>
            <Field label="PIN" hint="4 to 8 digits. You can change it any time.">
              <TextInput
                value={pin}
                onChangeText={setPin}
                placeholder="0000"
                placeholderTextColor={theme.semantic.textFaint}
                keyboardType="number-pad"
                maxLength={8}
                className="text-slate-100 text-xl font-bold tracking-[0.3em]"
              />
            </Field>
            <View className="flex-row gap-2">
              <Button title="Cancel" variant="secondary" className="flex-1" onPress={() => setAdding(false)} />
              <Button title="Add" variant="primary" className="flex-1" loading={busy} onPress={addStaff} />
            </View>
          </View>
        ) : (
          <Button
            title="Add a gatekeeper"
            variant="secondary"
            fullWidth
            className="mt-4"
            icon={<Plus size={15} color={theme.semantic.text} />}
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
  const [permissions, setPermissions] = useState<PermissionSet>(member.permissions);
  const [expanded, setExpanded] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newPin, setNewPin] = useState('');

  // Keep local toggles in step with a refresh that happened elsewhere.
  useEffect(() => setPermissions(member.permissions), [member.permissions]);

  const toggle = async (key: PermissionKey, value: boolean) => {
    const next = { ...permissions, [key]: value };
    setPermissions(next); // optimistic
    try {
      // The whole set is written, not a patch: the column is JSONB and a partial
      // write would drop every key it omits.
      await merchantService.setStaffPermissions(member.id, next);
    } catch (err) {
      setPermissions(permissions);
      onError(err instanceof Error ? err.message : 'Could not change access.');
    }
  };

  const resetPin = async () => {
    try {
      await merchantService.resetStaffPin(member.id, newPin);
      setNewPin('');
      setResetting(false);
      onChanged(`New PIN set for ${member.name}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not reset the PIN.');
    }
  };

  const deactivate = async () => {
    try {
      await merchantService.deactivateStaff(member.id);
      onChanged(`${member.name} can no longer sign in.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not remove them.');
    }
  };

  return (
    <View className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3.5">
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.8}
        className="flex-row items-center justify-between gap-3"
      >
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2 flex-wrap">
            <Text className="text-sm font-bold text-slate-100">{member.name}</Text>
            <Badge
              label={member.isOwner ? 'Owner' : member.isActive ? 'Gatekeeper' : 'Removed'}
              variant={member.isOwner ? 'emerald' : member.isActive ? 'info' : 'neutral'}
              size="sm"
            />
            {isSelf && <Badge label="You" variant="neutral" size="sm" />}
          </View>
          <Text className="text-[11px] text-slate-400 mt-0.5">{member.phone}</Text>
        </View>
        <Text className="text-[11px] font-bold text-emerald-400">
          {expanded ? 'Hide' : 'Access'}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View className="mt-3 pt-3 border-t border-slate-800">
          {member.isOwner ? (
            <Text className="text-[11px] text-slate-500 leading-4">
              The owner always has every permission, including any added later.
            </Text>
          ) : (
            <>
              {/*
                Rendered from the registry, so adding a permission in
                src/config/permissions.ts makes it appear here with no change to
                this screen and no migration.
              */}
              <View className="gap-3">
                {PERMISSION_KEYS.map((key) => (
                  <View key={key} className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-slate-200">
                        {PERMISSION_REGISTRY[key].label}
                      </Text>
                      <Text className="text-[11px] text-slate-500 leading-4">
                        {PERMISSION_REGISTRY[key].description}
                      </Text>
                    </View>
                    <Switch
                      value={permissions[key]}
                      onValueChange={(value) => toggle(key, value)}
                      disabled={!canManage}
                      trackColor={{
                        false: theme.semantic.surfaceRaised,
                        true: theme.semantic.accentDeep,
                      }}
                      thumbColor={permissions[key] ? theme.semantic.accentSoft : theme.semantic.textMuted}
                    />
                  </View>
                ))}
              </View>

              {canManage && (
                <View className="mt-4 pt-3 border-t border-slate-800 gap-2">
                  {resetting ? (
                    <>
                      <View className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
                        <TextInput
                          value={newPin}
                          onChangeText={setNewPin}
                          placeholder="New PIN"
                          placeholderTextColor={theme.semantic.textFaint}
                          keyboardType="number-pad"
                          maxLength={8}
                          className="text-slate-100 text-base font-bold tracking-[0.3em]"
                        />
                      </View>
                      <View className="flex-row gap-2">
                        <Button
                          title="Cancel"
                          variant="ghost"
                          size="sm"
                          className="flex-1"
                          onPress={() => setResetting(false)}
                        />
                        <Button
                          title="Set PIN"
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
                        title="Change PIN"
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        icon={<KeyRound size={13} color={theme.semantic.text} />}
                        onPress={() => setResetting(true)}
                      />
                      {member.isActive && (
                        <Button
                          title="Remove"
                          variant="danger"
                          size="sm"
                          className="flex-1"
                          icon={<UserMinus size={13} color={theme.palette.white} />}
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
