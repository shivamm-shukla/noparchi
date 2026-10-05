# NoParchi — Dual-Mode O2O Workflow & Pass Verification Engine
## System Specification Document (`spec.md`)
**Version:** 2.0.0 (Dual-Mode Expansion)  
**Status:** Approved for Implementation  
**Methodology:** Spec-Driven Development (SDD)  
**Target Domain:** Dual-Mode Offline-to-Online (O2O) Operations  
1. **Mode A: Parking & Valet Operations** (`PARKING`)  
2. **Mode B: Coaching Scholarship Test & Academic Banners** (`SCHOLARSHIP_TEST`)

---

## 1. Executive Summary & Vision

### 1.1 The Core Problem
Offline businesses in India manage high-footfall physical touchpoints with fragmented, manual tools:
- **Parking contractors** use unlinked cash slips ("parchis"), manual registers, and static UPI QR codes that result in 10-15% revenue leakage and chaotic exit queues.
- **Coaching institutes & educators** put up city-wide flex banners and posters for scholarship exams and seminar walk-ins, relying on paper inquiry counters, Google Forms without instant verification, and manual roll-list checks at exam gates.

### 1.2 The FlowPoint Solution
FlowPoint is an **app-less, physical-to-digital orchestration engine**. It binds physical triggers (banners, standees, entrance boards) to full operational fulfillment in a single closed loop:
```
[Physical QR Trigger] 
       ↓ (Scan via phone camera, zero app install)
[Mobile Web Client] (Fast form + WebOTP + UPI/Razorpay)
       ↓
[Digital & Printable Pass / Artifact] (Rotating QR / Printable Admit Card)
       ↓
[Staff Gatekeeper Scanner PWA] (Instant <200ms verification, Green/Red)
       ↓
[Operator Dashboard & CSV Telemetry] (Real-time count, revenue, lead export)
```

---

## 2. Dual-Mode Architecture & Requirements

The platform operates under a single unified backend engine, dynamically switching its presentation and form schema based on the merchant's `operating_mode`.

```
                        ┌───────────────────────────────────┐
                        │     FlowPoint Core Engine         │
                        │ (Auth, Payments, QR Crypto, Sync) │
                        └─────────────────┬─────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     ┌────────────────────────┐                      ┌────────────────────────┐
     │   Mode: PARKING        │                      │ Mode: SCHOLARSHIP_TEST │
     ├────────────────────────┤                      ├────────────────────────┤
     │ • Gate Entrance QR     │                      │ • City Flex Banner QR  │
     │ • Vehicle No. & Type   │                      │ • Student Name & Class │
     │ • Duration / Hourly    │                      │ • Parent Mobile / Exam │
     │ • Overstay Cash Logic  │                      │ • Printable Admit Card │
     │ • Exit Clearance Scan  │                      │ • Gate Attendance Scan │
     │ • Active Vehicle Count │                      │ • 1-Click CSV Export   │
     └────────────────────────┘                      └────────────────────────┘
```

---

### 2.1 Mode 1: Parking & Valet Operations (`PARKING`)

#### Purpose
Complete digital parking lot management: eliminate paper slips, track parked vehicle duration, enforce payment compliance, and speed up vehicle exits.

#### User Journey
1. **Arrival**: Driver scans gate entrance QR standee with their native phone camera.
2. **Details**: Browser opens `/pay/[merchantId]`. Driver enters:
   - Vehicle Number (e.g., `DL 01 AB 1234`).
   - Vehicle Type (2-Wheeler / 4-Wheeler / Heavy).
   - Duration Preset (e.g., 2 hrs, 4 hrs, Day Pass).
3. **Payment**: Driver pays via UPI Intent (GPay, PhonePe, Paytm) or Razorpay. (Counter cash option supported via Staff Issuance).
4. **Active Pass**: Digital Parking Pass rendered in browser with live countdown clock and exit verification QR.
5. **Exit & Verification**: Gatekeeper opens Scanner on their phone:
   - Scans vehicle pass QR.
   - If within time: **GREEN ("VALID - EXITED")**.
   - If overdue: **AMBER ("OVERSTAY DUE: ₹40")** -> Gatekeeper collects cash -> Marks exit.
   - If already cleared: **RED ("ALREADY EXITED")**.
6. **Ledger & Settlement**: Owner tracks real-time occupancy and cash vs. online collection.

---

### 2.2 Mode 2: Coaching Scholarship Test & Academic Banners (`SCHOLARSHIP_TEST`)

#### Purpose
Allow coaching institutes and educators to convert city posters/standees into automated registration desks, issue printable admit cards, verify attendees on test day, and capture verified student leads.

#### User Journey
1. **Discovery & Trigger**: Student/Parent spots a physical banner/poster in the city and scans the FlowPoint QR.
2. **Registration Form (`/e/[eventCode]` or `/pay/[merchantId]`)**:
   - Student Full Name.
   - Student WhatsApp Number (with WebOTP validation).
   - Parent Mobile Number.
   - Grade / Class Target (e.g., Class 8, 9, 10, 11-JEE, 12-NEET, Repeater).
   - Preferred Exam Center / Shift Slot (e.g., Sunday 10:00 AM - Batch 1).
   - Registration Fee: Configurable (₹0 / Free, or nominal fee like ₹50/₹100).
3. **Pass & Admit Card Generation (`/ticket/[code]`)**:
   - Digital Admit Card with Student Name, Roll Number, Exam Date, Center Address, and Unique Barcode/QR.
   - **Printable Admit Card Mode (`@media print`)**: Center rules often prohibit mobile phones inside exam halls. A dedicated **"Download / Print Admit Card"** view formats the pass into a clean A4/ticket voucher for paper printing at local cyber cafes.
4. **Exam Day Gate Check-in**:
   - Invigilator/Guard scans student's phone screen OR printed paper admit card using FlowPoint Scanner.
   - Scanner displays: **"VERIFIED ✅ - Roll #1042 - Rahul Sharma (Class 10)"**.
   - Atomic state changes to `ATTENDED` with timestamp and invigilator attribution.
   - Duplicate attempt by the same admit card triggers **"ALREADY CHECKED IN ❌ at 09:42 AM"**.
5. **Admin / Teacher Command Center**:
   - Live Dashboard: Total Registered vs. Present (Attended) vs. Absent.
   - **1-Click CSV Lead Export**: Downloads all student names, parent numbers, grades, and test attendance status for admissions follow-up.

---

## 3. Unified Data Architecture & Database Schema

The database transitions from parking-only tables (`vehicle_number` hardcoded) to a generalized **Artifact & Workflow** data model using PostgreSQL JSONB metadata.

### 3.1 `merchants` Table (Organization / Institute)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid PK` | Tenant unique identifier |
| `business_name` | `text` | e.g. "Kota Super 30" or "City Plaza Parking" |
| `operating_mode` | `text` | `'PARKING'` or `'SCHOLARSHIP_TEST'` or `'GENERAL_EVENT'` |
| `location` | `text` | Physical venue / coaching address |
| `upi_id` | `text` | Direct merchant VPA for instant UPI payouts |
| `branding` | `jsonb` | Logo URL, primary color, banner image, custom rules |
| `settings` | `jsonb` | Print layout rules, overstay grace period, default slots |
| `created_at` | `timestamptz` | Account creation timestamp |

### 3.2 `events` / `workflow_definitions` Table
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid PK` | Event / Workflow ID |
| `merchant_id` | `uuid FK` | References `merchants(id)` |
| `slug` | `text` | Public URL slug (e.g. `scholarship-2026`) |
| `title` | `text` | "Talent Search Exam 2026" / "Main Gate Parking" |
| `event_date` | `timestamptz` | Date of test / event (nullable for continuous parking) |
| `fee_amount` | `numeric` | Registration or ticket fee (0 if free) |
| `capacity` | `int` | Maximum available seats / slots (null = unlimited) |
| `form_schema` | `jsonb` | Custom fields schema (Class, Parent Phone, Roll Prefix) |
| `is_active` | `boolean` | Enable/disable registrations |

### 3.3 `artifacts` Table (Generalizes `passes` & `transactions`)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid PK` | Artifact ID |
| `merchant_id` | `uuid FK` | References `merchants(id)` |
| `event_id` | `uuid FK` | References `events(id)` (optional) |
| `ticket_code` | `text UNIQUE` | High-readability code (e.g., `FP-9482-1042`) |
| `status` | `text` | `'pending' \| 'active' \| 'used' \| 'expired' \| 'cancelled'` |
| `primary_name` | `text` | Customer Name / Student Name |
| `primary_phone` | `text` | Primary contact number |
| `metadata` | `jsonb` | Mode-specific structured data (see below) |
| `amount_paid` | `numeric` | Amount collected |
| `payment_ref` | `text` | UPI UTR / Razorpay payment ID |
| `expires_at` | `timestamptz` | Parking expiry or exam gate closure time |
| `created_at` | `timestamptz` | Registration / Entry timestamp |

#### Metadata JSONB Structure:
- **In Parking Mode (`PARKING`)**:
  ```json
  {
    "vehicle_number": "UP16AB1234",
    "vehicle_type": "4_wheeler",
    "duration_minutes": 120,
    "entry_gate": "Gate 1",
    "overstay_amount": 0
  }
  ```
- **In Scholarship Test Mode (`SCHOLARSHIP_TEST`)**:
  ```json
  {
    "parent_phone": "9876543210",
    "class_grade": "Class 10",
    "target_stream": "IIT-JEE",
    "exam_center": "Main Campus, Hall A",
    "exam_slot": "Sunday 10:00 AM - 12:00 PM",
    "roll_number": "KTA-2026-1042"
  }
  ```

### 3.4 `artifact_validations` Table (Gate Verification Log)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid PK` | Validation event ID |
| `artifact_id` | `uuid FK` | References `artifacts(id)` (**UNIQUE** - atomic single-use) |
| `merchant_id` | `uuid FK` | References `merchants(id)` |
| `verified_by` | `uuid FK` | Staff/Invigilator ID |
| `checkpoint_name` | `text` | "Gate 2 Exit" / "Exam Hall 1 Door" |
| `verified_at` | `timestamptz` | Timestamp of check-in |
| `notes` | `text` | Optional note (e.g. "Overstay ₹40 cash collected") |

---

## 4. Key Frontend & User Experience Specifications

### 4.1 Public Customer Client (App-Less Web)
- **Zero App Download Requirement**: Runs smoothly in mobile Chrome, Safari, and in-app browsers (Instagram, WhatsApp).
- **Fast Load**: Bundle size < 50 KB, Time to Interactive (TTI) < 1.2s on standard 3G/4G connections.
- **Adaptive Layout**:
  - If `PARKING`: Shows clean vehicle number input, vehicle type selector (2W/4W), duration pill buttons, and instant UPI button.
  - If `SCHOLARSHIP_TEST`: Shows clean student registration form, class dropdown, exam slot selector, and submit/pay button.

### 4.2 Universal Pass / Admit Card View (`/ticket/[code]`)
- **Digital Pass View**:
  - High-contrast visual styling.
  - Large, clear QR Code (rendered with high error correction).
  - Prominent verification code.
  - Live status indicator:
    - Parking: Live countdown timer + overstay indicator.
    - Scholarship Test: Exam Date & Center information.
- **Printable Admit Card Mode**:
  - One-click **"Print Admit Card / PDF"** button.
  - CSS `@media print` rules that hide navbar, buttons, and backgrounds.
  - Renders official exam header, student photo/initials box, roll number, instructions, and scannable barcode/QR code on a crisp white page.

### 4.3 Staff Gatekeeper Scanner PWA
- **Camera-Based High-Speed Scanner**: Continuously scans QR codes at 60fps with zero lag.
- **Dual Verification Modes**:
  1. *Parking Mode*: Scans pass -> Checks overstay -> If expired, prompts cash collection -> Marks vehicle exited.
  2. *Scholarship Test Mode*: Scans admit card -> Displays student name, roll number, and class -> Marks attendance (`ATTENDED`).
- **Audio-Visual Feedback**:
  - **Success**: Full-screen Green flash + affirmative audio beep ("Verified").
  - **Duplicate Scan**: Full-screen Red flash + warning sound ("Already Used / Attended").
  - **Expired / Unpaid**: Full-screen Amber flash + prompt action.
- **Offline Resilience**: Pre-caches active registrations; stores scanned tickets locally when exam halls have zero mobile network and replays them when back online.

### 4.4 Admin / Operator Command Center
- **Mode Toggle**: In Settings, merchant selects their primary operating mode (`PARKING` or `SCHOLARSHIP_TEST`).
- **Telemetry & Live Counting**:
  - Parking: Vehicles currently parked, today's cash vs. UPI revenue.
  - Scholarship Test: Total applicants, attendance turnout percentage, class-wise distribution.
- **Lead & Data Export**:
  - 1-Click CSV Export formatted for Excel/CRM (Student Name, Phone, Parent Mobile, Class, Attendance status).

---

## 5. Non-Functional Requirements & Security Invariants

1. **Anti-Fraud (Single-Use Invariant)**:  
   Under no circumstances can an admit card or parking pass be checked in twice. Enforced via database row-level locking (`SELECT FOR UPDATE`) and a database `UNIQUE` constraint on `artifact_validations(artifact_id)`.
2. **Server-Side Pricing**:  
   Pass amounts and fees are always computed and verified server-side. The client cannot send a manipulated amount to the payment gateway.
3. **Data Privacy (DPDP Compliance)**:  
   Student and parent phone numbers are scoped strictly to the respective institute via Row Level Security (RLS). No cross-merchant lead sharing.
4. **Offline Capability**:  
   If network drops at the gate or parking basement, gate staff can continue validating passes without crashing or blocking attendees.

---

*This specification serves as the baseline for all implementation tasks in `tasks.md`.*
