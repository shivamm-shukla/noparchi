import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Merchant,
  User,
  Transaction,
  DashboardStats,
  DateFilterRange,
  TicketValidationResult,
  StaffPermission,
  MerchantConfig,
  VehicleType,
} from '../types';
import { INITIAL_MERCHANT, INITIAL_USERS } from '../services/mockData';
import { transactionService } from '../services/transactionService';
import { validationService } from '../services/validationService';
import { staffService } from '../services/staffService';

interface AppContextType {
  merchant: Merchant;
  currentUser: User;
  staffList: User[];
  transactions: Transaction[];
  stats: DashboardStats;
  selectedFilter: DateFilterRange;
  isLoading: boolean;
  setFilter: (filter: DateFilterRange) => void;
  switchUser: (userId: string) => Promise<void>;
  refreshData: () => Promise<void>;
  createTransaction: (params: {
    amount: number;
    vehicleNumber?: string;
    vehicleType?: VehicleType;
    customerPhone?: string;
  }) => Promise<{ success: boolean; transaction: Transaction; ticketCode: string }>;
  validateTicket: (rawQrCode: string, exitGate?: string, notes?: string) => Promise<TicketValidationResult>;
  updateStaffPermissions: (userId: string, permissions: Partial<StaffPermission>) => Promise<void>;
  addNewStaff: (params: { name: string; phone: string; passcode: string; permissions?: Partial<StaffPermission> }) => Promise<User>;
  updateMerchantSettings: (newSettings: Partial<MerchantConfig> & { businessName?: string; location?: string; upiId?: string }) => Promise<void>;
}

const STORAGE_KEY_MERCHANT = '@noparchi_merchant_v1';
const STORAGE_KEY_ACTIVE_USER_ID = '@noparchi_active_user_id_v1';

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [merchant, setMerchant] = useState<Merchant>(INITIAL_MERCHANT);
  const [currentUser, setCurrentUser] = useState<User>(INITIAL_USERS[0]);
  const [staffList, setStaffList] = useState<User[]>(INITIAL_USERS);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<DateFilterRange>('today');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [stats, setStats] = useState<DashboardStats>({
    todayRevenue: 0,
    todayTransactionsCount: 0,
    todayScansCount: 0,
    activeVehiclesCount: 0,
    yesterdayRevenue: 0,
    growthPercentage: 0,
  });

  const loadData = useCallback(async () => {
    try {
      // 1. Load Merchant
      const storedMerchant = await AsyncStorage.getItem(STORAGE_KEY_MERCHANT);
      let currentMerchant = INITIAL_MERCHANT;
      if (storedMerchant) {
        currentMerchant = JSON.parse(storedMerchant);
        setMerchant(currentMerchant);
      }

      // 2. Load Staff
      const staff = await staffService.getStaffMembers(currentMerchant.id);
      setStaffList(staff);

      // 3. Load Active User
      const storedUserId = await AsyncStorage.getItem(STORAGE_KEY_ACTIVE_USER_ID);
      if (storedUserId) {
        const found = staff.find((u) => u.id === storedUserId);
        if (found) {
          setCurrentUser(found);
        } else if (staff.length > 0) {
          setCurrentUser(staff[0]);
        }
      } else if (staff.length > 0) {
        setCurrentUser(staff[0]);
      }

      // 4. Load Stats and Transactions
      const [newStats, txs] = await Promise.all([
        transactionService.getDashboardStats(currentMerchant.id),
        transactionService.getTransactions(currentMerchant.id, selectedFilter),
      ]);

      setStats(newStats);
      setTransactions(txs);
    } catch (err) {
      console.error('Error loading AppContext data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time subscription to merchant activity
  useEffect(() => {
    if (!merchant.id) return;
    const unsubscribe = transactionService.subscribeToMerchantActivity(
      merchant.id,
      () => {
        loadData();
      }
    );
    return () => unsubscribe();
  }, [merchant.id, loadData]);

  const switchUser = async (userId: string) => {
    const target = staffList.find((u) => u.id === userId);
    if (target) {
      setCurrentUser(target);
      await AsyncStorage.setItem(STORAGE_KEY_ACTIVE_USER_ID, userId);
    }
  };

  const setFilter = (filter: DateFilterRange) => {
    setSelectedFilter(filter);
  };

  const refreshData = async () => {
    await loadData();
  };

  const createTransaction = async (params: {
    amount: number;
    vehicleNumber?: string;
    vehicleType?: VehicleType;
    customerPhone?: string;
  }) => {
    const res = await transactionService.createTransaction({
      merchantId: merchant.id,
      ...params,
    });
    await loadData();
    return res;
  };

  const validateTicket = async (
    rawQrCode: string,
    exitGate?: string,
    notes?: string
  ): Promise<TicketValidationResult> => {
    const result = await validationService.validateTicket({
      rawQrCode,
      scannerUser: currentUser,
      exitGate,
      notes,
    });
    await loadData();
    return result;
  };

  const updateStaffPermissions = async (
    userId: string,
    permissions: Partial<StaffPermission>
  ) => {
    const updated = await staffService.updateStaffPermissions(userId, permissions);
    if (updated) {
      setStaffList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, permission: updated.permission } : u))
      );
      if (currentUser.id === userId) {
        setCurrentUser((prev) => ({ ...prev, permission: updated.permission }));
      }
    }
  };

  const addNewStaff = async (params: {
    name: string;
    phone: string;
    passcode: string;
    permissions?: Partial<StaffPermission>;
  }) => {
    const newStaff = await staffService.createStaffMember({
      merchantId: merchant.id,
      ...params,
    });
    setStaffList((prev) => [...prev, newStaff]);
    return newStaff;
  };

  const updateMerchantSettings = async (
    newSettings: Partial<MerchantConfig> & { businessName?: string; location?: string; upiId?: string }
  ) => {
    const updatedMerchant: Merchant = {
      ...merchant,
      businessName: newSettings.businessName ?? merchant.businessName,
      location: newSettings.location ?? merchant.location,
      upiId: newSettings.upiId ?? merchant.upiId,
      configSettings: {
        ...merchant.configSettings,
        ...newSettings,
      },
      updatedAt: new Date().toISOString(),
    };
    setMerchant(updatedMerchant);
    await AsyncStorage.setItem(STORAGE_KEY_MERCHANT, JSON.stringify(updatedMerchant));
  };

  return (
    <AppContext.Provider
      value={{
        merchant,
        currentUser,
        staffList,
        transactions,
        stats,
        selectedFilter,
        isLoading,
        setFilter,
        switchUser,
        refreshData,
        createTransaction,
        validateTicket,
        updateStaffPermissions,
        addNewStaff,
        updateMerchantSettings,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
