# CivicLedger — Blockchain-Based Transport & Traffic Governance System

![CivicLedger Architecture](https://img.shields.io/badge/Blockchain-Ethereum%20%2F%20Solidity-627EEA?logo=ethereum&logoColor=white)
![Smart Contracts](https://img.shields.io/badge/Contracts-OpenZeppelin%20v5-4E5EE4?logo=openzeppelin&logoColor=white)
![Backend](https://img.shields.io/badge/Backend-Node.js%20%2F%20Express-339933?logo=node.js&logoColor=white)
![Database](https://img.shields.io/badge/Database-MongoDB%20v8-47A248?logo=mongodb&logoColor=white)
![Frontend](https://img.shields.io/badge/Frontend-React%2018%20%2F%20Vite-61DAFB?logo=react&logoColor=black)
![Tests](https://img.shields.io/badge/Hardhat%20Tests-38%20Passing-brightgreen)

CivicLedger is an end-to-end, decentralized full-stack web application that unifies **Driving License Issuance**, **Vehicle Title Registry**, **Motor Insurance Verification**, and **Traffic Violation Enforcement** using cryptographic state anchoring on the Ethereum blockchain.

---

## 🌟 Key Features

1. **Digital Driving License Management**
   - Issued by authorized Regional Transport Officers (RTO).
   - Real-time demerit points tracking with automated threshold enforcement.
   - License suspension and revocation synchronized to smart contracts.
   - Digital Driving License Card with cryptographic QR code representation.

2. **Vehicle Title & Asset Registry**
   - Unique Vehicle Identification Number (VIN) and engine specification mapping.
   - Prevention of counterfeit titles and stolen vehicle registrations.

3. **Motor Insurance Verification**
   - Direct policy publishing by certified insurance underwriters.
   - Instant roadside policy validity check for traffic police officers.

4. **Traffic Violations & Fine Settlements**
   - Digital challan generation with offense presets and evidence recording.
   - Demerit penalty points applied directly to offender's driving record.
   - Instant fine payment processing with on-chain settlement receipts.

5. **Public Cryptographic Verification Portal**
   - Anyone can verify any transport document by reference number.
   - Compares the calculated SHA-256 off-chain state hash directly against the on-chain smart contract anchor to prove 100% authenticity.

6. **Web3 Ledger Explorer & Audit Trail**
   - Live block height, smart contract address, and transaction logs.
   - Full administrative audit trail for compliance and governance reviews.

---

## 🏗 System Architecture

CivicLedger implements a **Dual-Storage Cryptographic Anchoring Pattern**:
- **Off-Chain Storage (MongoDB)**: High-performance read/write storage for citizen personal data, vehicle specs, and search indexes.
- **On-Chain Storage (Ethereum)**: Immutable smart contracts (`TrafficRecordRegistry.sol`) storing 32-byte SHA-256 state commitments and version histories.
- **Access Control (Solidity)**: Strict separation of powers using OpenZeppelin `AccessControl`.

---

## 🚀 Quickstart Guide (Step-by-Step)

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **MongoDB**: Local MongoDB instance running on `localhost:27017` or MongoDB Atlas URI

---

### Step 1: Install Dependencies
Open a terminal in the root `civicledger/` directory:
```bash
# Install blockchain dependencies
npm run blockchain:install

# Install backend dependencies
npm run backend:install

# Install frontend dependencies
npm run frontend:install
```

---

### Step 2: Start Local Ethereum Blockchain Node
In **Terminal 1**:
```bash
cd blockchain
npx hardhat node
```
*This starts a local Ethereum testnet with 20 pre-funded test accounts on `http://127.0.0.1:8545`.*

---

### Step 3: Deploy Smart Contracts
In **Terminal 2**:
```bash
cd blockchain
npx hardhat run scripts/deploy.js --network localhost
```
*Output will display the deployed contract address (e.g. `0x5FbDB2315678afecb367f032d93F642f64180aa3`).*

---

### Step 4: Seed Database with Demo Records
In **Terminal 2**:
```bash
cd backend
npm run seed
```
*This seeds demo users, licenses, vehicles, insurance policies, and violations.*

---

### Step 5: Start Backend API Server
In **Terminal 2**:
```bash
cd backend
npm run dev
```
*Backend API will run at `http://localhost:5000`.*

---

### Step 6: Start Frontend Application
In **Terminal 3**:
```bash
cd frontend
npm run dev
```
*Frontend will launch at `http://localhost:5173`.*

---

## 👥 Demo Evaluation Accounts

On the Login screen, click any of the pre-configured role buttons for instant pre-filling:

| Role | Email | Password | Scope of Access |
| :--- | :--- | :--- | :--- |
| **System Administrator** | `admin@civicledger.gov` | `Admin@123` | Full access across all modules, users, and audit logs |
| **Licensing Officer (RTO)** | `rto.officer@civicledger.gov` | `Officer@123` | Issue and renew licenses, register vehicles |
| **Traffic Police Officer** | `traffic.cop@civicledger.gov` | `Police@123` | Issue traffic challans, assess demerit points, roadside checks |
| **Insurance Agent** | `agent@safeinsure.com` | `Agent@123` | Issue and renew vehicle insurance policies |
| **Citizen / Driver** | `john.driver@example.com` | `Driver@123` | View digital license card, registered vehicles, pay fines |

---

## 🧪 Running Automated Tests

### 1. Smart Contract Unit Tests (38 Tests)
```bash
cd blockchain
npx hardhat test
```

### 2. Frontend Build Validation
```bash
cd frontend
npm run build
```

---

## 📁 Repository Directory Structure

```
civicledger/
├── package.json                   # Root monorepo orchestration scripts
├── README.md                      # Complete project documentation
├── docs/                          # In-depth architectural & viva documentation
│   ├── ARCHITECTURE.md            # Detailed dual-storage design & formulas
│   ├── API_DOCUMENTATION.md       # Full REST API specification
│   ├── ACADEMIC_VIVA_GUIDE.md     # Viva presentation and defense Q&A
│   └── SMART_CONTRACTS.md         # Contract functions and role security
├── blockchain/                    # Hardhat Ethereum project
│   ├── contracts/                 # Solidity smart contracts
│   │   └── TrafficRecordRegistry.sol
│   ├── scripts/                   # Deployment scripts
│   ├── test/                      # Comprehensive test suite (38 passing tests)
│   └── hardhat.config.js
├── backend/                       # Express.js REST API
│   ├── config/                    # Database & blockchain provider config
│   ├── controllers/               # Auth, License, Vehicle, Insurance, Violation controllers
│   ├── middleware/                # JWT verification & role-based access control
│   ├── models/                    # Mongoose schemas with deterministic hash hooks
│   ├── routes/                    # API route definitions
│   ├── scripts/                   # Database seed script
│   ├── services/                  # Ethers.js blockchain sync service
│   ├── tests/                     # Integration tests
│   └── server.js                  # Express application entry point
└── frontend/                      # React 18 + Vite Web Application
    ├── src/
    │   ├── components/            # Navbar, Sidebar, Footer, Modal, Badges
    │   ├── context/               # AuthContext state provider
    │   ├── layouts/               # MainLayout (with role protection) & AuthLayout
    │   ├── pages/                 # Home, Login, Register, Dashboard, Licenses,
    │   │                          # Vehicles, Insurance, Violations, Verify, Blockchain
    │   ├── services/              # Axios API service client
    │   ├── styles/                # CSS design system (globals.css)
    │   └── utils/                 # Roles, statuses, demo user constants
    ├── index.html
    └── vite.config.js
```

---

## 📜 Academic Review & Project Defense Highlights
- **No Costly On-Chain Overhead**: Uses deterministic SHA-256 state commitments instead of storing large documents on Ethereum.
- **Verifiable Without Login**: The public verification portal allows roadside enforcement or prospective vehicle buyers to check authenticity without needing administrative credentials.
- **Separation of Powers**: Enforced cryptographically at both the API layer and the Solidity smart contract layer.
- **Full Audit Traceability**: Append-only version history guarantees transparent historical tracking of license suspensions and challan payments.
