# Project Name: NoParchi (Smart QR & WhatsApp Commerce App)
# Target Platform: Universal App (Expo React Native for Android/iOS/Web)
# Tech Stack: Expo (React Native), Tailwind CSS (Nativewind), Supabase (PostgreSQL & Auth), Prisma ORM

## Context & Vision
Build a multi-tenant Micro-SaaS application designed for the unorganized sector (parking contractors, local events, street food). The system eliminates paper tickets by providing a frictionless flow: End-customers scan a dynamic QR code via any UPI app/camera, pay via a lightweight web-view, and instantly receive a digital PDF ticket on WhatsApp. Merchants use this app to track revenue and verify tickets.

## Core Architecture & Roles (Dynamic RBAC)
The system uses a dynamic Role-Based Access Control (RBAC) managed strictly by the Merchant (Owner):
1. **Owner:** Has absolute 'Root' privileges. Can view the ledger, withdraw funds, generate/download the custom branded QR, and configure the system.
2. **Staff (Gatekeeper):** A restricted role. By default, staff members only have access to the 'QR Scanner' (to verify customer exit passes) and 'Today's Basic Activity'.
3. **Access Management:** The Owner has a dedicated "Staff Management" UI in the Settings tab where they can dynamically toggle specific permissions for each staff member (e.g., `can_view_ledger`, `can_verify_tickets`, `can_issue_refund`).

## Database Schema Requirements (Prisma)
Design the Supabase/PostgreSQL schema via Prisma with strict multi-tenant data isolation:
- `Merchant`: id, businessName, location, upiId, configSettings (JSON for pricing/rates), createdAt.
- `User`: id, merchantId (relation), isOwner (Boolean), phone, name, passcode.
- `StaffPermission`: A relational table or JSONB column inside `User` tracking dynamic toggles: `{ can_view_ledger: boolean, can_edit_settings: boolean, can_verify_tickets: boolean }`.
- `Transaction`: id, merchantId, amount, vehicleNumber (optional), status (ENUM: PENDING, SUCCESS, FAILED), paymentRef, createdAt.
- `TicketValidation`: Tracks when a staff member scans a customer's WhatsApp ticket at the exit. Fields: id, transactionId, scannedByUserId, timestamp. 
  *Crucial:* Ensure robust concurrency handling so that if two staff members scan the same ticket within milliseconds, only one entry succeeds and the other receives an "Already Used" error.

## Step-by-Step Execution Plan for AI

### Phase 1: Setup & Scaffolding
- Initialize an Expo app using Expo Router for file-based navigation.
- Configure Tailwind CSS (Nativewind v4) for cross-platform styling.
- Setup Supabase client and Prisma ORM inside the project.

### Phase 2: Backend & Database Engine
- Generate the `schema.prisma` file based on the requirements above. Ensure correct relations between Merchant, User, and Transactions.
- Create Supabase Edge Functions/API routes to handle:
  1. Creating a new Transaction.
  2. Validating a ticket QR.

### Phase 3: Frontend UI & Navigation (Expo Router)
- Build a Bottom Tab Navigation layout.
- **Tab 1 (Dashboard/Home):** Display today's revenue, total scans, and a real-time live activity list (Use Supabase Realtime subscriptions). Provide a component to view/download the Merchant's active QR.
- **Tab 2 (Ledger):** Historical transaction data with date filters (Today, Yesterday, This Week). Visible only to users with `can_view_ledger` permission.
- **Tab 3 (Scanner):** Integrate `expo-camera`. Allows Staff/Owners to scan the QR code present on the customer's WhatsApp ticket. Upon successful scan, display a green "Verified" modal. If scanned again, display a red "Invalid/Already Used" modal.
- **Tab 4 (Settings):** 
  - Profile info and WhatsApp Engine connection status.
  - **Staff Management Module:** Owner can add new staff and toggle their RBAC permissions dynamically.

### Phase 4: Integrations & Placeholders
- Create an abstract placeholder utility function `sendWhatsAppTicket(transactionId)` to be integrated with Meta Cloud API later.
- Build a reusable UI component for the "Custom Branded QR" that dynamically overlays the Merchant's initial/logo in the center of the QR code.

## Coding Guidelines
- Strictly use TypeScript. Provide complete and precise interfaces/types for all components and database models.
- Build modular, reusable UI components (Cards, Buttons, Modals, Status Badges).
- The UI must follow a modern, minimal SaaS aesthetic: Dark Slate (`#0F172A`) backgrounds for headers, clean white cards, and Vibrant Emerald Green (`#10B981`) accents for success/revenue indicators.
- Prioritize offline-first or optimistic UI updates where applicable to ensure the app feels lightning-fast in low-network zones (like crowded melas or basements).