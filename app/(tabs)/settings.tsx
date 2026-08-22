import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Switch, TouchableOpacity, Alert, Platform } from 'react-native';
import {
  Settings,
  Users2,
  Building2,
  QrCode,
  MessageSquare,
  Shield,
  Plus,
  Trash2,
  CheckCircle2,
  Smartphone,
  Save,
  KeyRound,
  Info,
  Lock,
} from 'lucide-react-native';
import { useApp } from '../../src/context/AppContext';
import { Header } from '../../components/ui/Header';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { User, StaffPermission } from '../../src/types';

export default function SettingsScreen() {
  const {
    merchant,
    currentUser,
    staffList,
    updateStaffPermissions,
    addNewStaff,
    updateMerchantSettings,
  } = useApp();

  // Merchant config state
  const [businessName, setBusinessName] = useState(merchant.businessName);
  const [location, setLocation] = useState(merchant.location);
  const [upiId, setUpiId] = useState(merchant.upiId);
  const [twoWheelerRate, setTwoWheelerRate] = useState(
    (merchant.configSettings?.twoWheelerRate || 20).toString()
  );
  const [fourWheelerRate, setFourWheelerRate] = useState(
    (merchant.configSettings?.fourWheelerRate || 50).toString()
  );
  const [flatRate, setFlatRate] = useState(
    (merchant.configSettings?.flatRate || 40).toString()
  );
  const [savingSettings, setSavingSettings] = useState(false);

  // New staff modal/form state
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffPasscode, setNewStaffPasscode] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);

  const isOwner = currentUser.isOwner;

  const handleSaveMerchantConfig = async () => {
    setSavingSettings(true);
    try {
      await updateMerchantSettings({
        businessName,
        location,
        upiId,
        twoWheelerRate: parseFloat(twoWheelerRate) || 20,
        fourWheelerRate: parseFloat(fourWheelerRate) || 50,
        flatRate: parseFloat(flatRate) || 40,
      });
      if (Platform.OS === 'web') alert('Settings saved successfully!');
      else Alert.alert('Saved', 'Merchant configuration updated successfully.');
    } catch {
      if (Platform.OS === 'web') alert('Failed to save settings');
      else Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateStaff = async () => {
    if (!newStaffName.trim() || !newStaffPhone.trim()) {
      if (Platform.OS === 'web') alert('Please enter staff name and phone number');
      else Alert.alert('Error', 'Please enter staff name and phone number');
      return;
    }

    setAddingStaff(true);
    try {
      await addNewStaff({
        name: newStaffName,
        phone: newStaffPhone,
        passcode: newStaffPasscode || '1234',
        permissions: {
          can_view_ledger: false,
          can_verify_tickets: true,
          can_edit_settings: false,
          can_issue_refund: false,
        },
      });
      setNewStaffName('');
      setNewStaffPhone('');
      setNewStaffPasscode('');
      setShowAddStaff(false);
      if (Platform.OS === 'web') alert('New staff member added successfully!');
      else Alert.alert('Success', 'New staff member added successfully!');
    } catch {
      if (Platform.OS === 'web') alert('Failed to add staff member');
      else Alert.alert('Error', 'Failed to add staff member');
    } finally {
      setAddingStaff(false);
    }
  };

  const handleTogglePermission = async (
    targetUser: User,
    permKey: keyof StaffPermission,
    value: boolean
  ) => {
    if (!isOwner) {
      if (Platform.OS === 'web') alert('Only the Merchant Owner can modify staff permissions.');
      else Alert.alert('Restricted', 'Only the Merchant Owner can modify staff permissions.');
      return;
    }

    await updateStaffPermissions(targetUser.id, {
      [permKey]: value,
    });
  };

  return (
    <View className="flex-1 bg-slate-950">
      <Header
        title="Settings & Staff RBAC"
        subtitle="Facility profiles, rates, and role-based permissions"
      />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 50 }}>
        <View className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5">
          {/* Main 2-Column Responsive Layout for Laptops & Desktops */}
          <View className="flex-col lg:flex-row gap-6">
            {/* Left Column: Merchant Profile, Rates & WhatsApp Engine Status */}
            <View className="flex-1 gap-6">
              {/* Merchant Facility Info */}
              <Card className="bg-slate-900 border-slate-800">
                <View className="flex-row items-center gap-2 mb-4 pb-3 border-b border-slate-800">
                  <Building2 size={18} color="#10B981" />
                  <Text className="text-base font-bold text-slate-100">
                    Merchant Facility Profile
                  </Text>
                </View>

                <View className="gap-3.5">
                  <View>
                    <Text className="text-xs font-semibold text-slate-300 mb-1">
                      Business Name
                    </Text>
                    <TextInput
                      value={businessName}
                      onChangeText={setBusinessName}
                      editable={isOwner}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm"
                    />
                  </View>

                  <View>
                    <Text className="text-xs font-semibold text-slate-300 mb-1">
                      Location / Address
                    </Text>
                    <TextInput
                      value={location}
                      onChangeText={setLocation}
                      editable={isOwner}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm"
                    />
                  </View>

                  <View>
                    <Text className="text-xs font-semibold text-slate-300 mb-1">
                      Merchant UPI ID (For Direct Customer Payments)
                    </Text>
                    <TextInput
                      value={upiId}
                      onChangeText={setUpiId}
                      editable={isOwner}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-emerald-400 font-mono text-sm font-bold"
                    />
                  </View>

                  {/* Pricing Configuration */}
                  <View className="pt-3 border-t border-slate-800">
                    <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
                      Parking Rates Configuration (₹)
                    </Text>
                    <View className="grid grid-cols-3 gap-2.5">
                      <View>
                        <Text className="text-[11px] text-slate-400 mb-1">2-Wheeler</Text>
                        <TextInput
                          value={twoWheelerRate}
                          onChangeText={setTwoWheelerRate}
                          editable={isOwner}
                          keyboardType="numeric"
                          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 text-sm font-bold"
                        />
                      </View>
                      <View>
                        <Text className="text-[11px] text-slate-400 mb-1">4-Wheeler</Text>
                        <TextInput
                          value={fourWheelerRate}
                          onChangeText={setFourWheelerRate}
                          editable={isOwner}
                          keyboardType="numeric"
                          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 text-sm font-bold"
                        />
                      </View>
                      <View>
                        <Text className="text-[11px] text-slate-400 mb-1">Flat Rate</Text>
                        <TextInput
                          value={flatRate}
                          onChangeText={setFlatRate}
                          editable={isOwner}
                          keyboardType="numeric"
                          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 text-sm font-bold"
                        />
                      </View>
                    </View>
                  </View>

                  {isOwner && (
                    <Button
                      title="Save Facility Settings"
                      variant="primary"
                      loading={savingSettings}
                      icon={<Save size={14} color="#0F172A" />}
                      onPress={handleSaveMerchantConfig}
                      className="mt-2"
                    />
                  )}
                </View>
              </Card>

              {/* WhatsApp Ticketing Engine Status (Phase 4 Integration) */}
              <Card className="bg-slate-900 border-slate-800">
                <View className="flex-row items-center justify-between mb-3 pb-2.5 border-b border-slate-800">
                  <View className="flex-row items-center gap-2">
                    <MessageSquare size={18} color="#10B981" />
                    <Text className="text-base font-bold text-slate-100">
                      WhatsApp Dispatch Engine
                    </Text>
                  </View>
                  <Badge label="Connected (Meta API)" variant="emerald" size="sm" />
                </View>

                <View className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 mb-3 gap-1.5">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs text-slate-400">Meta Cloud API Version</Text>
                    <Text className="text-xs font-mono font-bold text-slate-200">v20.0</Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs text-slate-400">Template</Text>
                    <Text className="text-xs font-mono text-emerald-400">digital_parking_pass_v1</Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs text-slate-400">Auto Delivery</Text>
                    <Text className="text-xs font-bold text-emerald-400">Active (Instant PDF/QR)</Text>
                  </View>
                </View>

                <Text className="text-[11px] text-slate-400 leading-4">
                  Customer digital passes are dispatched immediately upon payment confirmation via Meta WhatsApp Cloud API webhooks.
                </Text>
              </Card>
            </View>

            {/* Right Column: Dynamic Staff Management & RBAC Module */}
            <View className="flex-1">
              <Card className="bg-slate-900 border-slate-800">
                <View className="flex-row items-center justify-between mb-4 pb-3 border-b border-slate-800">
                  <View className="flex-row items-center gap-2">
                    <Users2 size={18} color="#38BDF8" />
                    <View>
                      <Text className="text-base font-bold text-slate-100">
                        Staff RBAC Permissions
                      </Text>
                      <Text className="text-[11px] text-slate-400">
                        Dynamically toggle staff capabilities
                      </Text>
                    </View>
                  </View>

                  {isOwner && (
                    <Button
                      title={showAddStaff ? 'Cancel' : 'Add Staff'}
                      size="sm"
                      variant={showAddStaff ? 'secondary' : 'primary'}
                      icon={showAddStaff ? undefined : <Plus size={14} color="#0F172A" />}
                      onPress={() => setShowAddStaff(!showAddStaff)}
                    />
                  )}
                </View>

                {/* Add New Staff Form */}
                {showAddStaff && (
                  <View className="bg-slate-950 border border-slate-800 rounded-2xl p-4 mb-4 gap-3">
                    <Text className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Add New Gatekeeper Staff
                    </Text>

                    <TextInput
                      value={newStaffName}
                      onChangeText={setNewStaffName}
                      placeholder="Staff Full Name (e.g. Suresh Patel)"
                      placeholderTextColor="#64748B"
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm"
                    />

                    <TextInput
                      value={newStaffPhone}
                      onChangeText={setNewStaffPhone}
                      placeholder="Phone Number (e.g. +91 98123 45678)"
                      placeholderTextColor="#64748B"
                      keyboardType="phone-pad"
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm"
                    />

                    <TextInput
                      value={newStaffPasscode}
                      onChangeText={setNewStaffPasscode}
                      placeholder="4-Digit Gate PIN (e.g. 1234)"
                      placeholderTextColor="#64748B"
                      keyboardType="numeric"
                      maxLength={4}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-100 text-sm font-mono"
                    />

                    <Button
                      title="Confirm & Add Staff"
                      variant="primary"
                      size="sm"
                      loading={addingStaff}
                      onPress={handleCreateStaff}
                    />
                  </View>
                )}

                {/* Staff List & RBAC Toggles */}
                <View className="gap-4">
                  {staffList.map((staff) => {
                    const isStaffOwner = staff.isOwner;
                    const perms = staff.permission || {
                      userId: staff.id,
                      can_view_ledger: false,
                      can_verify_tickets: true,
                      can_edit_settings: false,
                      can_issue_refund: false,
                    };

                    return (
                      <View
                        key={staff.id}
                        className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4"
                      >
                        {/* Staff Header */}
                        <View className="flex-row items-center justify-between mb-3 pb-2.5 border-b border-slate-800/60">
                          <View className="flex-row items-center gap-2.5">
                            <View
                              className={`w-9 h-9 rounded-xl items-center justify-center border ${
                                isStaffOwner
                                  ? 'bg-emerald-500/10 border-emerald-500/30'
                                  : 'bg-slate-800 border-slate-700'
                              }`}
                            >
                              {isStaffOwner ? (
                                <Shield size={18} color="#10B981" />
                              ) : (
                                <KeyRound size={16} color="#94A3B8" />
                              )}
                            </View>
                            <View>
                              <Text className="text-sm font-bold text-slate-100">
                                {staff.name}
                              </Text>
                              <Text className="text-xs text-slate-400 font-mono">
                                {staff.phone}
                              </Text>
                            </View>
                          </View>

                          <Badge
                            label={isStaffOwner ? 'Root Owner' : 'Gatekeeper'}
                            variant={isStaffOwner ? 'emerald' : 'info'}
                            size="sm"
                          />
                        </View>

                        {/* RBAC Permission Toggles */}
                        {isStaffOwner ? (
                          <View className="p-2.5 bg-emerald-950/20 rounded-xl border border-emerald-500/20">
                            <Text className="text-xs text-emerald-400 font-medium">
                              Root privileges active: Unrestricted access across all modules.
                            </Text>
                          </View>
                        ) : (
                          <View className="gap-2.5">
                            {/* Toggle 1: can_verify_tickets */}
                            <View className="flex-row items-center justify-between">
                              <View className="flex-1 pr-2">
                                <Text className="text-xs font-bold text-slate-200">
                                  Verify Exit Tickets (Scanner)
                                </Text>
                                <Text className="text-[10px] text-slate-400">
                                  Allows scanning and clearing customer passes
                                </Text>
                              </View>
                              <Switch
                                value={perms.can_verify_tickets}
                                onValueChange={(val) =>
                                  handleTogglePermission(staff, 'can_verify_tickets', val)
                                }
                                disabled={!isOwner}
                                trackColor={{ false: '#334155', true: '#10B981' }}
                                thumbColor="#FFFFFF"
                              />
                            </View>

                            {/* Toggle 2: can_view_ledger */}
                            <View className="flex-row items-center justify-between pt-2 border-t border-slate-800/40">
                              <View className="flex-1 pr-2">
                                <Text className="text-xs font-bold text-slate-200">
                                  View Financial Ledger
                                </Text>
                                <Text className="text-[10px] text-slate-400">
                                  Access to revenue totals and transaction history
                                </Text>
                              </View>
                              <Switch
                                value={perms.can_view_ledger}
                                onValueChange={(val) =>
                                  handleTogglePermission(staff, 'can_view_ledger', val)
                                }
                                disabled={!isOwner}
                                trackColor={{ false: '#334155', true: '#10B981' }}
                                thumbColor="#FFFFFF"
                              />
                            </View>

                            {/* Toggle 3: can_edit_settings */}
                            <View className="flex-row items-center justify-between pt-2 border-t border-slate-800/40">
                              <View className="flex-1 pr-2">
                                <Text className="text-xs font-bold text-slate-200">
                                  Edit Facility Settings
                                </Text>
                                <Text className="text-[10px] text-slate-400">
                                  Modify pricing rates and merchant profile
                                </Text>
                              </View>
                              <Switch
                                value={perms.can_edit_settings}
                                onValueChange={(val) =>
                                  handleTogglePermission(staff, 'can_edit_settings', val)
                                }
                                disabled={!isOwner}
                                trackColor={{ false: '#334155', true: '#10B981' }}
                                thumbColor="#FFFFFF"
                              />
                            </View>

                            {/* Toggle 4: can_issue_refund */}
                            <View className="flex-row items-center justify-between pt-2 border-t border-slate-800/40">
                              <View className="flex-1 pr-2">
                                <Text className="text-xs font-bold text-slate-200">
                                  Issue Pass Refunds
                                </Text>
                                <Text className="text-[10px] text-slate-400">
                                  Authorize transaction cancellations and refunds
                                </Text>
                              </View>
                              <Switch
                                value={perms.can_issue_refund}
                                onValueChange={(val) =>
                                  handleTogglePermission(staff, 'can_issue_refund', val)
                                }
                                disabled={!isOwner}
                                trackColor={{ false: '#334155', true: '#10B981' }}
                                thumbColor="#FFFFFF"
                              />
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </Card>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
