# NITP-SafeExit 🚀

NITP-SafeExit is a comprehensive student outing and complaint management system designed for hostels/universities. It streamlines the process of requesting outings, approving them by caretakers, and verifying student exits/entries at the security gate using QR codes. It also features a complaint management system for students to report issues.

## 📋 Features

- **Role-Based Access Control**: Different dashboards for Students, Caretakers, and Security Guards.
- **Outing Management**:
  - Students can raise outing requests (destination, purpose, out/in time).
  - Caretakers can approve or reject these requests.
- **QR Code Verification**:
  - Approved requests generate a unique QR code for the student.
  - Security guards scan the QR code to mark students as "Out" or "Returned" at the gate.
- **Complaint System**:
  - Students can lodge complaints directly from their dashboard.
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
│   │   ├── models/           # Mongoose schemas (User, OutingRequest, Complaint)
│   │   ├── routes/           # API routes (auth, outing, complaint)
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
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret_key
   NODE_ENV=development
   FRONTEND_URL=http://localhost:3000
   ```
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
4. Start the frontend development server:
   ```bash
   npm run dev
   ```
   *The frontend will run on `http://localhost:3000`.*

## 🔐 User Roles & Usage Flow

1. **Student**: 
   - Registers/Logs in.
   - Submits a new Outing Request.
   - Once approved, views the generated QR code.
   - Shows the QR code to security while leaving and returning.
2. **Caretaker**:
   - Logs in to the Caretaker Dashboard.
   - Reviews pending outing requests.
   - Approves or Rejects requests with remarks.
3. **Security (Guard)**:
   - Logs in to the Security Dashboard.
   - Uses the built-in QR Scanner to scan student QR codes.
   - Verifies identity and updates status to "Out" or "Returned".

## 📜 License

This project is licensed under the ISC License.
