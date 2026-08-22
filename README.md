# 🚀 NoParchi - Smart QR Commerce Ecosystem

## 📖 Overview
NoParchi aims to digitize the unorganized micro-service sector (parking lots, local events, street food) by completely replacing paper receipts with a zero-friction, app-less Smart QR and WhatsApp ticketing ecosystem.

## ⚙️ Core Modules
- **Customer Web-View:** A lightweight web interface triggered via QR scan for instant UPI payments.
- **WhatsApp Ticketing Engine:** Automated delivery of digital passes/receipts via Meta Cloud API.
- **Owner Dashboard (App):** Real-time revenue tracking, ledger history, and multi-tenant configurations.
- **Dynamic RBAC & Staff App:** Staff management system where the Owner dynamically controls permissions. Includes an inbuilt camera scanner for gatekeepers to verify customer WhatsApp tickets upon exit, preventing fraud and duplicate entries.

## 🛠️ Tech Stack
- **Frontend / Client:** Expo (React Native) + Nativewind (Tailwind CSS)
- **Backend & Auth:** Supabase Edge Functions
- **Database & ORM:** PostgreSQL managed via Prisma ORM
- **AI Automation:** Built alongside Antigravity CLI
