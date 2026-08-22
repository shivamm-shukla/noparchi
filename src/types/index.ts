export type TransactionStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
export type VehicleType = 'TWO_WHEELER' | 'FOUR_WHEELER' | 'HEAVY_VEHICLE' | 'GENERAL_ENTRY';

export interface MerchantConfig {
  twoWheelerRate: number;
  fourWheelerRate: number;
  flatRate: number;
  currency: string;
  enableWhatsApp: boolean;
  businessLogo?: string;
  themeColor?: string;
  welcomeMessage?: string;
}

export interface Merchant {
  id: string;
  businessName: string;
  location: string;
  upiId: string;
  configSettings: MerchantConfig;
  createdAt: string;
  updatedAt: string;
}

export interface StaffPermission {
  id?: string;
  userId: string;
  can_view_ledger: boolean;
  can_verify_tickets: boolean;
  can_edit_settings: boolean;
  can_issue_refund: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  merchantId: string;
  isOwner: boolean;
  phone: string;
  name: string;
  passcode: string;
  permission?: StaffPermission;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  merchantId: string;
  amount: number;
  vehicleNumber?: string | null;
  vehicleType: VehicleType;
  status: TransactionStatus;
  paymentRef?: string | null;
  customerPhone?: string | null;
  ticketCode: string;
  qrPayload?: string | null;
  createdAt: string;
  updatedAt: string;
  validation?: TicketValidation | null;
}

export interface TicketValidation {
  id: string;
  transactionId: string;
  scannedByUserId: string;
  scannedByUser?: {
    id: string;
    name: string;
    phone: string;
  };
  timestamp: string;
  exitGate?: string;
  notes?: string;
  transaction?: Transaction;
}

export interface DashboardStats {
  todayRevenue: number;
  todayTransactionsCount: number;
  todayScansCount: number;
  activeVehiclesCount: number;
  yesterdayRevenue: number;
  growthPercentage: number;
}

export type DateFilterRange = 'today' | 'yesterday' | 'week' | 'month' | 'all';

export interface TicketValidationResult {
  success: boolean;
  status: 'VERIFIED' | 'ALREADY_USED' | 'INVALID' | 'UNAUTHORIZED';
  message: string;
  transaction?: Transaction;
  validation?: TicketValidation;
  scannedAt?: string;
}

export interface WhatsAppTemplatePayload {
  recipientPhone: string;
  customerName?: string;
  businessName: string;
  location: string;
  amount: number;
  vehicleNumber?: string;
  ticketCode: string;
  qrCodeUrl: string;
  issuedAt: string;
}
