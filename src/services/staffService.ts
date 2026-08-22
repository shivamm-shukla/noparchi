import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { User, StaffPermission } from '../types';
import { INITIAL_USERS } from './mockData';

const STORAGE_KEY_USERS = '@noparchi_users_v1';

class StaffService {
  private users: User[] = [];
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_USERS);
      if (stored) {
        this.users = JSON.parse(stored);
      } else {
        this.users = [...INITIAL_USERS];
        await this.persist();
      }
    } catch {
      this.users = [...INITIAL_USERS];
    }
    this.initialized = true;
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(this.users));
    } catch (e) {
      console.warn('Failed to persist users locally', e);
    }
  }

  async getStaffMembers(merchantId: string): Promise<User[]> {
    await this.init();

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*, permission:staff_permissions(*)')
          .eq('merchantId', merchantId)
          .order('isOwner', { ascending: false });

        if (!error && data) {
          return data as User[];
        }
      } catch (e) {
        console.warn('Supabase getStaffMembers failed, using local:', e);
      }
    }

    return this.users.filter((u) => u.merchantId === merchantId);
  }

  async createStaffMember(params: {
    merchantId: string;
    name: string;
    phone: string;
    passcode: string;
    permissions?: Partial<StaffPermission>;
  }): Promise<User> {
    await this.init();

    const newUser: User = {
      id: `u-staff-${Date.now()}`,
      merchantId: params.merchantId,
      isOwner: false,
      name: params.name.trim(),
      phone: params.phone.trim(),
      passcode: params.passcode,
      permission: {
        userId: `u-staff-${Date.now()}`,
        can_view_ledger: params.permissions?.can_view_ledger ?? false,
        can_verify_tickets: params.permissions?.can_verify_tickets ?? true,
        can_edit_settings: params.permissions?.can_edit_settings ?? false,
        can_issue_refund: params.permissions?.can_issue_refund ?? false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      try {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .insert({
            merchantId: newUser.merchantId,
            name: newUser.name,
            phone: newUser.phone,
            passcode: newUser.passcode,
            isOwner: false,
          })
          .select()
          .single();

        if (!userError && userData) {
          newUser.id = userData.id;
          if (newUser.permission) {
            newUser.permission.userId = userData.id;
            await supabase.from('staff_permissions').insert({
              userId: userData.id,
              can_view_ledger: newUser.permission.can_view_ledger,
              can_verify_tickets: newUser.permission.can_verify_tickets,
              can_edit_settings: newUser.permission.can_edit_settings,
              can_issue_refund: newUser.permission.can_issue_refund,
            });
          }
        }
      } catch (e) {
        console.warn('Supabase create staff failed, created locally:', e);
      }
    }

    this.users.push(newUser);
    await this.persist();
    return newUser;
  }

  async updateStaffPermissions(
    userId: string,
    permissions: Partial<StaffPermission>
  ): Promise<User | null> {
    await this.init();

    const staff = this.users.find((u) => u.id === userId);
    if (!staff) return null;

    if (!staff.permission) {
      staff.permission = {
        userId,
        can_view_ledger: false,
        can_verify_tickets: true,
        can_edit_settings: false,
        can_issue_refund: false,
      };
    }

    staff.permission = {
      ...staff.permission,
      ...permissions,
      updatedAt: new Date().toISOString(),
    };
    staff.updatedAt = new Date().toISOString();

    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('staff_permissions')
          .upsert({
            userId,
            can_view_ledger: staff.permission.can_view_ledger,
            can_verify_tickets: staff.permission.can_verify_tickets,
            can_edit_settings: staff.permission.can_edit_settings,
            can_issue_refund: staff.permission.can_issue_refund,
          });
      } catch (e) {
        console.warn('Supabase updateStaffPermissions failed:', e);
      }
    }

    await this.persist();
    return staff;
  }

  async deleteStaffMember(userId: string): Promise<boolean> {
    await this.init();

    const idx = this.users.findIndex((u) => u.id === userId);
    if (idx === -1) return false;

    if (this.users[idx].isOwner) {
      throw new Error('Cannot delete merchant owner account.');
    }

    this.users.splice(idx, 1);
    await this.persist();

    if (isSupabaseConfigured) {
      try {
        await supabase.from('users').delete().eq('id', userId);
      } catch (e) {
        console.warn('Supabase delete user failed:', e);
      }
    }

    return true;
  }
}

export const staffService = new StaffService();
