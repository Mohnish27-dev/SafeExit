# NITP-SafeExit 🚀

NITP-SafeExit is a comprehensive student outing and hostel safety management system designed for hostels/universities. Outings need no request or approval: the student shows their QR at the security gate, the exit scan starts the outing and the entry scan ends it, and anyone not back by 8:00 PM is flagged overdue. It also covers leave applications (which caretakers approve), SOS alerts, and delay notices.

## 📋 Features

- **Role-Based Access Control**: Different dashboards for Students, Caretakers, and Security Guards.
- **Outings, logged at the gate**:
  - No form, no destination, no approval — boys and girls (nearby or market) alike.
  - The exit scan creates the outing; everyone is due back by 8:00 PM, and late returns are flagged.
- **QR Code Verification**:
  - Each student has one permanent identity QR (the college ID card works too).
  - Security guards scan it once; the gate logs an exit or an entry from the student's current status.
- **Leave Applications**: filed by the student, approved by caretakers (or escalated to wardens).
- **Secure Authentication**:
  - Built with JWT and `bcryptjs` for secure password hashing and session management.
  - Includes boilerplate for WebAuthn/Passkeys integration (`@simplewebauthn`).

## 🛠 Tech Stack

### Frontend (`/safeexit`)
- **Framework**: [Next.js 16](https://nextjs.org/) (React 19)
- **Styling**: Tailwind CSS v4, Canvas Confetti
- **Forms & Validation**: React Hook Form, Zod
- **UI Components**: Lucide React, Sonner (Toasts)
- **QR Code Tools**: `react-qr-code`, `qrcode`, `@yudiel/react-qr-scanner`

### Backend (`/backend`)
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JSON Web Tokens (JWT), bcryptjs
- **Passkeys**: `@simplewebauthn/server`

## 📁 Project Structure

```text
SafeExit/
├── backend/                  # Node.js + Express Backend
│   ├── src/
│   │   ├── config/           # Database config
│   │   ├── controllers/      # Route handlers
│   │   ├── middlewares/      # Auth & Role middlewares
│   │   ├── models/           # Mongoose schemas (User, OutingRequest, LeaveApplication)
│   │   ├── routes/           # API routes (auth, outing, leave)
│   │   └── utils/            # Utilities (JWT generation)
│   └── package.json
│
└── safeexit/                 # Next.js Frontend
    ├── src/
    │   └── app/
    │       ├── dashboard/    # Role-based dashboards (student, caretaker, security)
    │       ├── components/   # Reusable UI components
    │       ├── lib/          # Utilities and API helpers
    │       ├── hooks/        # Custom React hooks
    │       └── api/          # Next.js API Routes (if any)
    └── package.json
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- MongoDB Database (Local or MongoDB Atlas)
- npm, yarn, or pnpm

### 1. Clone the repository

```bash
git clone <repository-url>
cd SafeExit
```

### 2. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `backend` directory with the following variables:
   ```env
   PORT=5000
   DATABASE_URL=postgres://safeexit:password@127.0.0.1:5432/safeexit
   JWT_SECRET=your_jwt_secret_key
   NODE_ENV=development
   FRONTEND_URL=http://localhost:3000
   ```
   *The backend runs on PostgreSQL. If you do not have a database yet, follow
   `backend/db/postgres/README.md` — it covers Docker, WSL2 and a native Windows install —
   then apply the schema with `npm run pg:schema`.*
4. Start the backend server:
   ```bash
   npm run dev
   ```
   *The backend will run on `http://localhost:5000`.*

### 3. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd safeexit
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. (Optional) Create a `.env.local` file if you need to override the backend API URL:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:5000/api
   ```
   To use the gate commissioning tools, add the flag below. Both routes return
   **404 unless it is set**, in dev and in production alike:
   ```env
   # /scanner-check — inspect the exact payload a USB scanner sends
   # /gate-cards    — print the CONFIRM / CANCEL control barcodes
   SCANNER_TOOLS=1
   ```
   It is read at runtime (no `NEXT_PUBLIC_` prefix, so it never reaches the
   browser bundle) — flipping it needs a restart, not a rebuild. In Docker, set it
   per-deploy: `SCANNER_TOOLS=1 docker compose up -d frontend`.
4. Start the frontend development server:
   ```bash
   npm run dev
   ```
   *The frontend will run on `http://localhost:3000`.*

## 🔐 User Roles & Usage Flow

1. **Student**: 
   - Registers/Logs in.
   - To go out, shows their permanent QR to security at the gate — no request needed.
   - Shows the same QR when returning, by 8:00 PM.
   - Applies for leave in the portal for overnight / multi-day trips.
2. **Caretaker**:
   - Logs in to the Caretaker Dashboard.
   - Reviews pending leave applications; approves, rejects, or forwards them to the warden.
   - Watches overdue returns, delay notices, and SOS alerts.
3. **Security (Guard)**:
   - Logs in to the Security Dashboard.
   - Uses the built-in QR Scanner to scan student QR codes.
   - Matches the face to the photo on screen; the scan logs "Out" or "Returned" automatically.

## 📜 License

This project is licensed under the ISC License.
