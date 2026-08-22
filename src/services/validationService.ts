import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { TicketValidationResult, Transaction, TicketValidation, User } from '../types';
import { transactionService } from './transactionService';

const STORAGE_KEY_VALIDATIONS = '@noparchi_validations_v1';

class ValidationService {
  private scanMutex = false;

  private async acquireLock(): Promise<boolean> {
    if (this.scanMutex) return false;
    this.scanMutex = true;
    return true;
  }

  private releaseLock(): void {
    this.scanMutex = false;
  }

  async validateTicket(params: {
    rawQrCode: string;
    scannerUser: User;
    exitGate?: string;
    notes?: string;
  }): Promise<TicketValidationResult> {
    const { rawQrCode, scannerUser, exitGate = 'Main Exit', notes } = params;

    // 1. RBAC Gatekeeper check
    const canVerify =
      scannerUser.isOwner ||
      scannerUser.permission?.can_verify_tickets === true;

    if (!canVerify) {
      return {
        success: false,
        status: 'UNAUTHORIZED',
        message: 'Permission Denied: Staff member is not authorized to verify exit passes.',
      };
    }

    // 2. Concurrency Lock: prevent duplicate parallel processing on the device
    const lockAcquired = await this.acquireLock();
    if (!lockAcquired) {
      return {
        success: false,
        status: 'ALREADY_USED',
        message: 'A verification scan is already processing. Please wait.',
      };
    }

    try {
      // 3. Parse QR payload or code
      let ticketCode = rawQrCode.trim();
      try {
        if (rawQrCode.startsWith('{') && rawQrCode.endsWith('}')) {
          const parsed = JSON.parse(rawQrCode);
          if (parsed.ticketCode) {
            ticketCode = parsed.ticketCode;
          }
        }
      } catch {
        // use raw string
      }

      // 4. If Supabase is configured, call Edge Function or Postgres atomic insert
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase.functions.invoke('validate-ticket', {
            body: {
              ticketCode,
              scannedByUserId: scannerUser.id,
              exitGate,
              notes,
            },
          });

          if (!error && data) {
            return data as TicketValidationResult;
          }
        } catch (e) {
          console.warn('Edge function invoke failed, proceeding with local validator:', e);
        }
      }

      // 5. Local In-Memory & Storage Validation (Optimistic / Offline Engine)
      const allTransactions = await transactionService.getTransactions(scannerUser.merchantId, 'all');
      const targetTx = allTransactions.find(
        (tx) => tx.ticketCode.toUpperCase() === ticketCode.toUpperCase() || tx.id === ticketCode
      );

      if (!targetTx) {
        return {
          success: false,
          status: 'INVALID',
          message: 'Invalid Ticket QR: No matching transaction found for this facility.',
        };
      }

      // Check if already validated
      if (targetTx.validation) {
        const scannedTime = new Date(targetTx.validation.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const scannedBy = targetTx.validation.scannedByUser?.name || 'Gatekeeper Staff';

        return {
          success: false,
          status: 'ALREADY_USED',
          message: `Ticket already used! Scanned at ${scannedTime} by ${scannedBy} (${targetTx.validation.exitGate || 'Exit Gate'}).`,
          transaction: targetTx,
          validation: targetTx.validation,
          scannedAt: targetTx.validation.timestamp,
        };
      }

      // Mark ticket as verified
      const newValidation: TicketValidation = {
        id: `val-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        transactionId: targetTx.id,
        scannedByUserId: scannerUser.id,
        scannedByUser: {
          id: scannerUser.id,
          name: scannerUser.name,
          phone: scannerUser.phone,
        },
        timestamp: new Date().toISOString(),
        exitGate,
        notes: notes || 'Exit cleared successfully',
      };

      targetTx.validation = newValidation;

      // Persist validation in local storage list
      const storedValRaw = await AsyncStorage.getItem(STORAGE_KEY_VALIDATIONS);
      const valList: TicketValidation[] = storedValRaw ? JSON.parse(storedValRaw) : [];
      valList.unshift(newValidation);
      await AsyncStorage.setItem(STORAGE_KEY_VALIDATIONS, JSON.stringify(valList));

      return {
        success: true,
        status: 'VERIFIED',
        message: 'Pass Verified Successfully! Vehicle cleared for exit.',
        transaction: targetTx,
        validation: newValidation,
        scannedAt: newValidation.timestamp,
      };
    } finally {
      this.releaseLock();
    }
  }
}

export const validationService = new ValidationService();
