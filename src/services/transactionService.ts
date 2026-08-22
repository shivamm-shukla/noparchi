import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Transaction, DashboardStats, DateFilterRange, VehicleType } from '../types';
import { INITIAL_TRANSACTIONS } from './mockData';

const STORAGE_KEY_TRANSACTIONS = '@noparchi_transactions_v1';

class TransactionService {
  private localTransactions: Transaction[] = [];
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_TRANSACTIONS);
      if (stored) {
        this.localTransactions = JSON.parse(stored);
      } else {
        this.localTransactions = [...INITIAL_TRANSACTIONS];
        await this.persist();
      }
    } catch {
      this.localTransactions = [...INITIAL_TRANSACTIONS];
    }
    this.initialized = true;
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY_TRANSACTIONS,
        JSON.stringify(this.localTransactions)
      );
    } catch (e) {
      console.warn('Failed to persist transactions locally', e);
    }
  }

  async getTransactions(merchantId: string, filter: DateFilterRange = 'today'): Promise<Transaction[]> {
    await this.init();

    if (isSupabaseConfigured) {
      try {
        let query = supabase
          .from('transactions')
          .select('*, validation:ticket_validations(*)')
          .eq('merchantId', merchantId)
          .order('createdAt', { ascending: false });

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        if (filter === 'today') {
          query = query.gte('createdAt', startOfToday);
        } else if (filter === 'yesterday') {
          const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
          query = query.gte('createdAt', startOfYesterday).lt('createdAt', startOfToday);
        } else if (filter === 'week') {
          const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          query = query.gte('createdAt', startOfWeek);
        } else if (filter === 'month') {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          query = query.gte('createdAt', startOfMonth);
        }

        const { data, error } = await query;
        if (!error && data) {
          return data as Transaction[];
        }
      } catch (err) {
        console.warn('Supabase fetch failed, falling back to local store:', err);
      }
    }

    // Local / Offline store fallback
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOfWeek = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return this.localTransactions
      .filter((tx) => {
        if (tx.merchantId !== merchantId) return false;
        const txTime = new Date(tx.createdAt).getTime();

        if (filter === 'today') return txTime >= startOfToday;
        if (filter === 'yesterday') return txTime >= startOfYesterday && txTime < startOfToday;
        if (filter === 'week') return txTime >= startOfWeek;
        if (filter === 'month') return txTime >= startOfMonth;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getDashboardStats(merchantId: string): Promise<DashboardStats> {
    await this.init();

    const todayTxs = await this.getTransactions(merchantId, 'today');
    const yesterdayTxs = await this.getTransactions(merchantId, 'yesterday');

    const todayRevenue = todayTxs
      .filter((t) => t.status === 'SUCCESS')
      .reduce((sum, t) => sum + t.amount, 0);

    const yesterdayRevenue = yesterdayTxs
      .filter((t) => t.status === 'SUCCESS')
      .reduce((sum, t) => sum + t.amount, 0);

    const todayScansCount = todayTxs.filter((t) => Boolean(t.validation)).length;
    const activeVehiclesCount = todayTxs.filter((t) => !t.validation && t.status === 'SUCCESS').length;

    let growthPercentage = 0;
    if (yesterdayRevenue > 0) {
      growthPercentage = Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100);
    } else if (todayRevenue > 0) {
      growthPercentage = 100;
    }

    return {
      todayRevenue,
      todayTransactionsCount: todayTxs.length,
      todayScansCount,
      activeVehiclesCount,
      yesterdayRevenue,
      growthPercentage,
    };
  }

  async createTransaction(params: {
    merchantId: string;
    amount: number;
    vehicleNumber?: string;
    vehicleType?: VehicleType;
    customerPhone?: string;
    paymentRef?: string;
  }): Promise<{ success: boolean; transaction: Transaction; ticketCode: string }> {
    await this.init();

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let randomPart = '';
    for (let i = 0; i < 6; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
    const ticketCode = `NP-${timestamp}-${randomPart}`;
    const vehicleNumber = params.vehicleNumber ? params.vehicleNumber.trim().toUpperCase() : undefined;
    const paymentRef = params.paymentRef || `UPI-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const newTx: Transaction = {
      id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      merchantId: params.merchantId,
      amount: params.amount,
      vehicleNumber: vehicleNumber || null,
      vehicleType: params.vehicleType || 'FOUR_WHEELER',
      status: 'SUCCESS',
      paymentRef,
      customerPhone: params.customerPhone || null,
      ticketCode,
      qrPayload: JSON.stringify({
        app: 'NoParchi',
        ticketCode,
        merchantId: params.merchantId,
        amount: params.amount,
        vehicleNumber,
        issuedAt: new Date().toISOString(),
      }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      validation: null,
    };

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('transactions')
          .insert({
            merchantId: newTx.merchantId,
            amount: newTx.amount,
            vehicleNumber: newTx.vehicleNumber,
            vehicleType: newTx.vehicleType,
            status: newTx.status,
            paymentRef: newTx.paymentRef,
            customerPhone: newTx.customerPhone,
            ticketCode: newTx.ticketCode,
            qrPayload: newTx.qrPayload,
          })
          .select()
          .single();

        if (!error && data) {
          newTx.id = data.id;
        }
      } catch (err) {
        console.warn('Supabase create transaction failed, stored locally:', err);
      }
    }

    this.localTransactions.unshift(newTx);
    await this.persist();

    return {
      success: true,
      transaction: newTx,
      ticketCode,
    };
  }

  subscribeToMerchantActivity(merchantId: string, onUpdate: (tx: Transaction) => void): () => void {
    if (!isSupabaseConfigured) {
      return () => {};
    }

    const channel = supabase
      .channel(`public:transactions:${merchantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `merchantId=eq.${merchantId}`,
        },
        (payload) => {
          if (payload.new) {
            onUpdate(payload.new as Transaction);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}

export const transactionService = new TransactionService();
