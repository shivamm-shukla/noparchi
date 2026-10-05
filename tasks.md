# NoParchi Dual-Mode Rebuild — Execution Task Board
## Tasks & Implementation Plan (`tasks.md`)
**Methodology:** Spec-Driven Development (SDD)  
**Spec Reference:** [`spec.md`](./spec.md)  
**Tracking Rule:** Check items `[x]` as they are completed and verified.

---

## 📊 Phase Overview

- [x] **Phase 1: Foundations & Cleanup** (Docker fix, type check, NoParchi name retained)
- [x] **Phase 2: Database Schema & Migration** (Dual-mode schema, metadata, atomic RPCs)
- [x] **Phase 3: Mode 2 — Coaching Scholarship Test Flow** (Banner QR, Student Form, Printable Admit Card)
- [x] **Phase 4: Mode 1 — Parking Operations Polish** (Vehicle flow, duration, overstay cash, exit scan)
- [x] **Phase 5: Staff Gatekeeper Scanner Upgrades** (Attendance check-in mode, student info display, <200ms)
- [x] **Phase 6: Admin Command Center & Mode Switcher** (Telemetry, mode toggle, 1-Click CSV export)
- [x] **Phase 7: End-to-End Testing & Verification** (Automated checks, manual walkthroughs)

---

## 🏷️ Phase 1: Foundations & Cleanup

> **Goal:** Keep "NoParchi" identity, fix historical buildup/bugs, and prepare codebase for dual-mode execution.

- [x] **1.1 Identity Decision**
  - [x] Retain `NoParchi` brand name across app metadata, package.json, and UI.
- [x] **1.2 Clean Up Outdated Code / Docker Bug**
  - [x] Fix `Dockerfile` Line 16: Removed obsolete `npx prisma generate` call that broke container builds.
  - [x] Verify TypeScript and Metro build configs compile cleanly.

---

## 🗄️ Phase 2: Database Schema & Migration

> **Goal:** Extend the PostgreSQL / Supabase schema to support generalized artifacts, custom form metadata, and dual operating modes without breaking existing data.

- [x] **2.1 Migration: Dual-Mode Merchant Support**
  - [x] Add `operating_mode` column to `merchants` table: `'PARKING'` (default) or `'SCHOLARSHIP_TEST'`.
  - [x] Add `branding` JSONB and enhance `settings` JSONB for mode-specific rules.
- [x] **2.2 Migration: Generalized Artifacts & Metadata**
  - [x] Add `metadata` (JSONB) to `transactions` table to store arbitrary form fields (parent phone, class, slot, roll number).
  - [x] Add `primary_name` and `primary_phone` to standardize student identification.
  - [x] Add `attended_at` and `attended_by` columns for exam attendance logging.
- [x] **2.3 Stored Procedures & Service Layer Integration**
  - [x] Create `public_register_scholarship_student` RPC with auto-generated roll number (`SCH-YY-XXXX`).
  - [x] Update `validate_ticket` RPC to handle mode-aware verification and mark attendance.
  - [x] Update `public_checkout_info` and `public_ticket_status` RPCs to pass through mode and metadata.
  - [x] TypeScript database definitions (`src/types/db.ts` & `src/types/index.ts`) and mappers updated.

---

## 🎓 Phase 3: Mode 2 — Coaching Scholarship Test Flow

> **Goal:** Build the complete flow for offline teachers running scholarship exams via physical city banners.

- [x] **3.1 Banner Dynamic QR Generator (`/app/settings` or Dashboard)**
  - [x] Create printable/downloadable Banner QR code generator for teachers (`BannerQRGenerator.tsx`).
  - [x] Allows setting campaign tag/utm parameter (e.g., `banner_main_road`, `school_gate_poster`).
- [x] **3.2 Mobile Web Student Registration Form (`/pay/[merchantId]` or `/e/[merchantId]`)**
  - [x] Detect if merchant is in `SCHOLARSHIP_TEST` mode:
    - Form fields: Student Full Name, Student Mobile, Parent Mobile, Target Class/Stream (8th, 9th, 10th, 11th, 12th, Dropper), Exam Slot.
    - Clean validation (10-digit Indian phone numbers, required fields).
  - [x] Support both ₹0 (Free registration) and paid exam fees (via UPI / Razorpay).
  - [x] Sub-15 second mobile web completion experience.
- [x] **3.3 Digital & Printable Admit Card (`/ticket/[ticketCode]`)**
  - [x] Digital Admit Card view on mobile screen with QR code, Roll Number, Exam Date & Venue.
  - [x] **Printable Admit Card Mode (`@media print`)**:
    - Dedicated **"Download / Print Admit Card (PDF)"** button (`window.print()`).
    - Clean white-paper layout with official exam header, student details, exam guidelines, and barcode/QR.
    - Formatted for standard cyber-cafe A4 printing for students not allowed to carry phones.

---

## 🚗 Phase 4: Mode 1 — Parking Operations Polish

> **Goal:** Ensure the parking operations workflow is robust, seamless, and fully aligned with the updated schema.

- [x] **4.1 Parking Checkout Experience (`/pay/[merchantId]`)**
  - [x] Ensure parking form renders cleanly when merchant mode is `PARKING`:
    - Vehicle number plate input (auto-formatting uppercase & spacing).
    - Quick-select vehicle type chips (2-Wheeler, 4-Wheeler).
    - Duration selector pills (1 hr, 2 hrs, 4 hrs, Day Pass).
    - Direct UPI Intent app launch (`upi://pay`).
- [x] **4.2 Parking Pass Display (`/ticket/[ticketCode]`)**
  - [x] Live countdown timer showing time left.
  - [x] Overstay alert banner if vehicle has stayed past expiration.
  - [x] One-click pass extension request.
- [x] **4.3 Counter Pass Issuance (`NewTicketModal.tsx`)**
  - [x] Ensure parking attendants can quickly issue cash passes to walk-up drivers at the gate.

---

## 📱 Phase 5: Staff Gatekeeper Scanner Upgrades

> **Goal:** Upgrade the Scanner tab to handle both Parking Exits and Exam Attendance Check-in with sub-200ms response times.

- [x] **5.1 Dual-Mode Scanner Viewfinder (`/app/app/(tabs)/scanner.tsx`)**
  - [x] Adjust camera scanner UX to detect current merchant `operating_mode`.
- [x] **5.2 Mode-Aware Validation Modal (`ValidationModal.tsx`)**
  - [x] **In `SCHOLARSHIP_TEST` Mode**:
    - On Valid Scan: Full-screen **GREEN** state showing:
      - Student Name (Large font)
      - Roll Number & Class/Stream
      - "ATTENDANCE RECORDED ✅"
    - On Duplicate Scan: Full-screen **RED** state showing:
      - "ALREADY ATTENDED ❌"
      - Time of prior entry & staff member who checked them in.
  - [x] **In `PARKING` Mode**:
    - On Valid Scan: **GREEN** ("VEHICLE CLEARED").
    - On Overstay Scan: **AMBER** ("OVERSTAY DUE: ₹X") with one-tap "Collect Cash & Exit" button.
    - On Already Used: **RED** ("ALREADY EXITED").
- [x] **5.3 High-Speed Physical Paper Scanning Support**
  - [x] Barcode/QR detector works on printed paper admit cards.
  - [x] Maintain 3-tier offline store (`offlineScanStore.ts`) so attendance can be marked even if the exam hall has no internet.

---

## 📊 Phase 6: Admin Command Center & Mode Switcher

> **Goal:** Equip teachers and parking operators with the exact telemetry, settings, and exports they need.

- [x] **6.1 Operating Mode Switcher (`/app/app/(tabs)/settings.tsx`)**
  - [x] In Settings, add an **"Operating Mode"** selector:
    - `[ 🚗 Parking & Valet ]`
    - `[ 🎓 Scholarship Test / Coaching ]`
  - [x] Switching modes instantly adapts the Dashboard, Forms, and Scanner without data loss.
- [x] **6.2 Teacher Dashboard Telemetry (`/app/app/(tabs)/index.tsx`)**
  - [x] When in `SCHOLARSHIP_TEST` mode, display:
    - Total Registered Students
    - Present Today (Attended via scanner)
    - Absent Students count
    - Turnout Percentage (%)
  - [x] When in `PARKING` mode, display:
    - Active Parked Vehicles
    - Today's Total Collection (Cash + UPI)
    - Total Exited Vehicles
- [x] **6.3 1-Click CSV Lead Export (`/app/app/(tabs)/ledger.tsx`)**
  - [x] Add **"Export Student Leads (CSV)"** button:
    - Exports: Student Name, Student Phone, Parent Phone, Class, Stream, Roll No, Registration Date, Attendance Status (Present/Absent).
    - Critical feature for teachers to follow up with parents for course admissions!

---

## 🧪 Phase 7: End-to-End Testing & Verification

> **Goal:** Validate both workflows through automated tests and end-to-end simulations.

- [x] **7.1 Automated Logic & Verification Tests (`scripts/test-dual-mode.mjs`)**
  - [x] Test for Mode 2: Student registration ➔ Admit card generation ➔ Gate attendance scan.
  - [x] Test for Mode 1: Vehicle entry ➔ Duration calculation ➔ Overstay calculation.
  - [x] Verify CSV lead generation format and escaping.
- [x] **7.2 Clean TypeScript Compilation Baseline**
  - [x] `npm run typecheck` (`tsc --noEmit`) passes with 0 errors across all routes and components.

---

*This document is dynamically updated as implementation progresses. Check off items as they pass verification.*
