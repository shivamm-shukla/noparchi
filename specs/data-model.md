# FlowPoint — Data Model & Schema Specification
**Document:** `specs/data-model.md`  
**Purpose:** Formal database contracts, JSONB schemas, and RPC definitions for the Dual-Mode architecture.

---

## 1. Unified Entity-Relationship Architecture

FlowPoint generalizes the transaction lifecycle by maintaining the `merchants`, `merchant_users`, and `transactions` (artifacts) relationship, while adding `operating_mode` branching and structured `metadata` JSONB.

```
┌──────────────────┐       1 : N       ┌──────────────────────┐
│    merchants     ├───────────────────┤    merchant_users    │
│ (mode, branding) │                   │  (staff, permissions)│
└────────┬─────────┘                   └──────────────────────┘
         │
         │ 1 : N
         ▼
┌──────────────────┐       1 : 1       ┌──────────────────────┐
│   transactions   ├───────────────────┤  ticket_validations  │
│ (artifacts/data) │                   │ (attendance/clearance│
└──────────────────┘                   └──────────────────────┘
```

---

## 2. Table Modifications

### 2.1 `merchants` Table Update
Adds operational context and branding customization.

```sql
-- Add operating mode constraint
ALTER TABLE public.merchants 
ADD COLUMN IF NOT EXISTS operating_mode text NOT NULL DEFAULT 'PARKING'
CHECK (operating_mode IN ('PARKING', 'SCHOLARSHIP_TEST', 'GENERAL_EVENT'));

-- Add custom branding and print settings
ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS branding jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS print_settings jsonb NOT NULL DEFAULT '{
  "show_rules": true,
  "instructions": "Please bring a valid photo ID and ballpoint pen.",
  "admit_card_title": "ADMIT CARD / HALL TICKET"
}'::jsonb;
```

---

### 2.2 `transactions` (Artifacts) Table Update
Generalizes customer identification and stores mode-specific data in `metadata`.

```sql
-- Add generic customer/student identifiers
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS primary_name text,
ADD COLUMN IF NOT EXISTS primary_phone text,
ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS attended_at timestamptz,
ADD COLUMN IF NOT EXISTS attended_by uuid REFERENCES public.merchant_users(id);

-- Indexes for lightning-fast lookups
CREATE INDEX IF NOT EXISTS idx_transactions_primary_phone ON public.transactions(primary_phone);
CREATE INDEX IF NOT EXISTS idx_transactions_metadata ON public.transactions USING gin(metadata);
```

---

## 3. Metadata JSONB Schemas

### 3.1 Mode 1: Parking (`operating_mode = 'PARKING'`)
```json
{
  "vehicle_number": "UP16AB1234",
  "vehicle_type": "car",
  "duration_minutes": 120,
  "entry_gate": "Gate 1",
  "overstay_amount": 0,
  "overstay_collected": false
}
```

### 3.2 Mode 2: Scholarship Test (`operating_mode = 'SCHOLARSHIP_TEST'`)
```json
{
  "student_name": "Rahul Sharma",
  "parent_phone": "9876543210",
  "student_phone": "9876501234",
  "class_grade": "Class 10",
  "target_stream": "Foundation JEE/NEET",
  "exam_center": "Kota Main Campus, Hall 3",
  "exam_date": "2026-10-18T10:00:00Z",
  "exam_slot": "10:00 AM - 12:00 PM",
  "roll_number": "KTA-2026-1042",
  "campaign_source": "banner_station_road"
}
```

---

## 4. Key Stored Procedures (RPCs)

### 4.1 `public_register_scholarship_student`
Public endpoint invoked when a student registers from a city banner QR code.

```sql
CREATE OR REPLACE FUNCTION public.public_register_scholarship_student(
  p_merchant_id uuid,
  p_student_name text,
  p_student_phone text,
  p_parent_phone text,
  p_class_grade text,
  p_target_stream text,
  p_exam_slot text,
  p_campaign_source text DEFAULT 'banner'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_merchant record;
  v_ticket_code text;
  v_roll_number text;
  v_transaction_id uuid;
  v_metadata jsonb;
BEGIN
  -- 1. Validate Merchant & Operating Mode
  SELECT * INTO v_merchant 
  FROM public.merchants 
  WHERE id = p_merchant_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merchant not found or inactive';
  END IF;

  -- 2. Generate Roll Number & Unique Ticket Code
  v_ticket_code := generate_ticket_code();
  v_roll_number := 'SCH-' || to_char(now(), 'YY') || '-' || upper(substr(replace(v_ticket_code, '-', ''), 1, 4));

  -- 3. Construct Metadata Payload
  v_metadata := jsonb_build_object(
    'student_name', trim(p_student_name),
    'student_phone', regexp_replace(p_student_phone, '\D', '', 'g'),
    'parent_phone', regexp_replace(p_parent_phone, '\D', '', 'g'),
    'class_grade', trim(p_class_grade),
    'target_stream', trim(coalesce(p_target_stream, 'General')),
    'exam_slot', trim(p_exam_slot),
    'roll_number', v_roll_number,
    'campaign_source', trim(coalesce(p_campaign_source, 'banner'))
  );

  -- 4. Insert into transactions table
  INSERT INTO public.transactions (
    merchant_id,
    customer_phone,
    primary_name,
    primary_phone,
    ticket_code,
    amount,
    currency,
    status,
    activated_at,
    metadata
  ) VALUES (
    p_merchant_id,
    regexp_replace(p_student_phone, '\D', '', 'g'),
    trim(p_student_name),
    regexp_replace(p_student_phone, '\D', '', 'g'),
    v_ticket_code,
    0, -- Free scholarship registration (or configurable fee)
    'INR',
    'paid', -- Active / Confirmed
    now(),
    v_metadata
  )
  RETURNING id INTO v_transaction_id;

  -- 5. Return Registration Summary
  RETURN jsonb_build_object(
    'success', true,
    'ticketCode', v_ticket_code,
    'rollNumber', v_roll_number,
    'studentName', trim(p_student_name),
    'examSlot', trim(p_exam_slot),
    'merchantName', v_merchant.business_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_register_scholarship_student TO anon, authenticated;
```

---

### 4.2 Mode-Aware `validate_ticket` RPC Enhancement
Upgrades gate scanning to support both Parking Exits and Scholarship Hall Check-in.

```sql
-- Snippet of mode-aware verification logic:
-- When merchant.operating_mode = 'SCHOLARSHIP_TEST':
--   1. Check if already checked in:
--      IF v_transaction.attended_at IS NOT NULL THEN
--        RETURN { status: 'ALREADY_USED', message: 'Student already checked in at ' || to_char(v_transaction.attended_at, 'HH12:MI AM') };
--      END IF;
--   2. Mark attendance:
--      UPDATE transactions SET attended_at = now(), attended_by = p_staff_id WHERE id = v_transaction.id;
--      INSERT INTO ticket_validations (transaction_id, merchant_id, verified_by, scanned_at) VALUES (...);
--   3. Return:
--      RETURN { status: 'VERIFIED', mode: 'SCHOLARSHIP_TEST', studentName: v_transaction.primary_name, rollNumber: v_transaction.metadata->>'roll_number', class: v_transaction.metadata->>'class_grade' };
```

---

### 4.3 1-Click CSV Export Query Contract
Used by the teacher's dashboard to download verified student leads:

```sql
SELECT 
  t.ticket_code AS "Admit Card Code",
  t.metadata->>'roll_number' AS "Roll Number",
  t.primary_name AS "Student Name",
  t.primary_phone AS "Student WhatsApp",
  t.metadata->>'parent_phone' AS "Parent Mobile",
  t.metadata->>'class_grade' AS "Target Class",
  t.metadata->>'target_stream' AS "Stream",
  t.metadata->>'exam_slot' AS "Exam Slot",
  t.metadata->>'campaign_source' AS "Banner Source",
  to_char(t.created_at, 'DD Mon YYYY HH12:MI AM') AS "Registration Time",
  CASE WHEN t.attended_at IS NOT NULL THEN 'PRESENT' ELSE 'ABSENT' END AS "Exam Attendance",
  to_char(t.attended_at, 'DD Mon YYYY HH12:MI AM') AS "Checked-In Time"
FROM public.transactions t
WHERE t.merchant_id = :merchant_id
ORDER BY t.created_at DESC;
```

---
*End of Data Model Specification.*
