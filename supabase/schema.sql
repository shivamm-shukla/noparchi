-- ==============================================================================
-- NoParchi: Production PostgreSQL Schema & Multi-Tenant Database Setup
-- Target: Supabase / PostgreSQL 14+
-- Includes: Multi-tenancy, Dynamic RBAC, Atomic Concurrency Locks, and Indexes
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "VehicleType" AS ENUM ('TWO_WHEELER', 'FOUR_WHEELER', 'HEAVY_VEHICLE', 'GENERAL_ENTRY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Merchants Table
CREATE TABLE IF NOT EXISTS "merchants" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "businessName" VARCHAR(255) NOT NULL,
    "location" VARCHAR(255) NOT NULL,
    "upiId" VARCHAR(100) NOT NULL,
    "configSettings" JSONB NOT NULL DEFAULT '{"twoWheelerRate": 20, "fourWheelerRate": 50, "flatRate": 40, "currency": "INR", "enableWhatsApp": true}'::jsonb,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Users Table (Merchants & Staff Gatekeepers)
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "merchantId" UUID NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "phone" VARCHAR(20) NOT NULL UNIQUE,
    "name" VARCHAR(100) NOT NULL,
    "passcode" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_users_merchant" ON "users"("merchantId");

-- 4. Dynamic RBAC Staff Permissions Table
CREATE TABLE IF NOT EXISTS "staff_permissions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
    "can_view_ledger" BOOLEAN NOT NULL DEFAULT false,
    "can_verify_tickets" BOOLEAN NOT NULL DEFAULT true,
    "can_edit_settings" BOOLEAN NOT NULL DEFAULT false,
    "can_issue_refund" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Transactions Table
CREATE TABLE IF NOT EXISTS "transactions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "merchantId" UUID NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
    "amount" NUMERIC(10, 2) NOT NULL,
    "vehicleNumber" VARCHAR(30),
    "vehicleType" "VehicleType" NOT NULL DEFAULT 'FOUR_WHEELER',
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "paymentRef" VARCHAR(100) UNIQUE,
    "customerPhone" VARCHAR(20),
    "ticketCode" VARCHAR(50) NOT NULL UNIQUE,
    "qrPayload" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_transactions_merchant_created" ON "transactions"("merchantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_transactions_ticket_code" ON "transactions"("ticketCode");

-- 6. Ticket Validations Table (Crucial: UNIQUE constraint on transactionId enforces atomic concurrency safety)
CREATE TABLE IF NOT EXISTS "ticket_validations" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "transactionId" UUID NOT NULL UNIQUE REFERENCES "transactions"("id") ON DELETE CASCADE,
    "scannedByUserId" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "exitGate" VARCHAR(100) DEFAULT 'Main Exit',
    "notes" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_ticket_validations_scanned_by" ON "ticket_validations"("scannedByUserId");
CREATE INDEX IF NOT EXISTS "idx_ticket_validations_timestamp" ON "ticket_validations"("timestamp" DESC);

-- 7. Atomic Concurrency Stored Procedure for Exit Pass Validation
CREATE OR REPLACE FUNCTION validate_ticket_atomic(
    p_ticket_code TEXT,
    p_scanned_by_user_id UUID,
    p_exit_gate TEXT DEFAULT 'Main Exit',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tx RECORD;
    v_existing_val RECORD;
    v_user RECORD;
    v_has_permission BOOLEAN;
    v_new_val RECORD;
BEGIN
    -- Step 1: Verify staff user exists and permissions
    SELECT * INTO v_user FROM users WHERE id = p_scanned_by_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 'UNAUTHORIZED', 'message', 'Staff user not found.');
    END IF;

    IF NOT v_user.isOwner THEN
        SELECT can_verify_tickets INTO v_has_permission FROM staff_permissions WHERE "userId" = p_scanned_by_user_id;
        IF NOT COALESCE(v_has_permission, false) THEN
            RETURN jsonb_build_object('success', false, 'status', 'UNAUTHORIZED', 'message', 'Staff member lacks ticket verification permission.');
        END IF;
    END IF;

    -- Step 2: Lock transaction row for update to eliminate race conditions
    SELECT * INTO v_tx 
    FROM transactions 
    WHERE "ticketCode" = p_ticket_code 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 'INVALID', 'message', 'Ticket not found.');
    END IF;

    IF v_tx.merchantId != v_user.merchantId THEN
        RETURN jsonb_build_object('success', false, 'status', 'INVALID', 'message', 'Ticket belongs to a different merchant facility.');
    END IF;

    -- Step 3: Check if already validated
    SELECT * INTO v_existing_val FROM ticket_validations WHERE "transactionId" = v_tx.id;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'ALREADY_USED',
            'message', 'Ticket has already been verified and used!',
            'transaction', row_to_json(v_tx),
            'validation', row_to_json(v_existing_val),
            'scannedAt', v_existing_val.timestamp
        );
    END IF;

    -- Step 4: Insert validation
    INSERT INTO ticket_validations ("transactionId", "scannedByUserId", "exitGate", "notes", "timestamp")
    VALUES (v_tx.id, p_scanned_by_user_id, p_exit_gate, p_notes, NOW())
    RETURNING * INTO v_new_val;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'VERIFIED',
        'message', 'Pass verified successfully! Exit cleared.',
        'transaction', row_to_json(v_tx),
        'validation', row_to_json(v_new_val),
        'scannedAt', v_new_val.timestamp
    );
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'status', 'ALREADY_USED', 'message', 'Ticket was just verified by another gatekeeper!');
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'status', 'INVALID', 'message', SQLERRM);
END;
$$;

-- 8. Seed Default Merchant & Staff
INSERT INTO "merchants" ("id", "businessName", "location", "upiId", "configSettings")
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Metro Hub Smart Parking',
    'Connaught Place, New Delhi',
    'metrohub@icici',
    '{"twoWheelerRate": 20, "fourWheelerRate": 50, "flatRate": 40, "currency": "INR", "enableWhatsApp": true}'::jsonb
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "users" ("id", "merchantId", "isOwner", "phone", "name", "passcode")
VALUES 
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', true, '+91 98765 43210', 'Rajesh Sharma (Owner)', '1234'),
    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', false, '+91 98111 22233', 'Amit Kumar (Gate 1 Staff)', '0000')
ON CONFLICT ("phone") DO NOTHING;

INSERT INTO "staff_permissions" ("userId", "can_view_ledger", "can_verify_tickets", "can_edit_settings", "can_issue_refund")
VALUES 
    ('b0000000-0000-0000-0000-000000000001', true, true, true, true),
    ('b0000000-0000-0000-0000-000000000002', false, true, false, false)
ON CONFLICT ("userId") DO NOTHING;
