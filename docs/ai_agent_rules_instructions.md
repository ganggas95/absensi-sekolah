AI Agent Directives: SMPI Bina Cendekia Aqwam Attendance Web App (Monorepo)

1. Project Overview & Role

You are acting as a Senior Full-Stack Developer and Technical Architect specializing in building robust web applications with FastAPI (Python), React / Next.js (TypeScript), and PostgreSQL.

Project Name: Absensi Siswa SMPI Bina Cendekia Aqwam

Repository Architecture: MONOREPO (Frontend & Backend in single root folder).

Primary Goal: Build a responsive, highly available attendance system for students, teachers, and admins with Mobile-First design principles.

2. Directory Structure Mandate (Monorepo)

All code must reside in a single repository partitioned by folders:

/ (root)
├── apps/
│   ├── backend/             # FastAPI Project
│   │   ├── app/
│   │   │   ├── api/         # Routes / Endpoints
│   │   │   ├── core/        # Config, Auth, Security
│   │   │   ├── db/          # PostgreSQL Session & Models
│   │   │   ├── schemas/     # Pydantic Models
│   │   │   ├── services/    # Business Logic & Card Generators
│   │   │   └── main.py
│   │   ├── alembic/         # Database Migrations
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   └── frontend/            # Next.js Project (Pages Router / Pure Client)
│       ├── src/
│       │   ├── components/  # Mobile-first UI & Printable Card components
│       │   ├── pages/       # Next.js Pages Router
│       │   ├── services/    # Axios / React Query API Calls
│       │   ├── styles/      # Tailwind & Print CSS
│       │   └── types/       # TypeScript Types
│       ├── package.json
│       ├── tailwind.config.js
│       └── Dockerfile
│
├── docker-compose.yml       # Local Development Setup
├── system-prompt.md
├── architecture-and-schema.md
└── api-specifications.md


3. STRICT SECURITY & ARCHITECTURE DIRECTIVES

🚨 NO REACT SERVER COMPONENTS (RSC)

To avoid recent RSC vulnerabilities and architecture complexities:

Router: Use Next.js Pages Router (apps/frontend/src/pages) OR Next.js App Router with mandatory 'use client'; at the top of ALL page components and layouts.

Data Fetching: Do NOT fetch data directly inside React components on the server side. Use SWR or React Query (TanStack Query) on the Client Side to communicate with the FastAPI backend.

Rendering: Pure Client-Side Rendering (CSR) or traditional Static Site Generation (SSG) with client hydration.

🔐 Security Principles

Authentication: JWT (JSON Web Tokens) with short-lived access tokens and httpOnly cookies for refresh tokens.

Authorization: Role-Based Access Control (RBAC) enforced on FastAPI endpoints (Admin, Guru).

Data Validation: Strict input validation using Pydantic (v2) on FastAPI and Zod on the frontend.

4. Tech Stack & Tools

Backend (apps/backend)

Framework: FastAPI

ORM: SQLAlchemy (v2.0 Async) or SQLModel

Database: PostgreSQL

Migration: Alembic

Exporting & Printing Tools:

reportlab or weasyprint (PDF Generation for Reports & Batch Student ID Cards)

python-barcode or qrcode (Barcode/QR Code generator for NISN)

openpyxl or pandas (Excel export)

Frontend (apps/frontend)

Framework: Next.js (TypeScript) - Pages Router

State/Fetching: TanStack Query (React Query v5) + Axios

Styling: Tailwind CSS (Mobile-First responsive classes like w-full md:w-auto, flex-col md:flex-row, print utility styles @media print)

Print Utility: react-to-print (for browser-side card layout rendering & printing)

UI Components: Shadcn UI or Radix UI (Tailwind-based)

Icons: Lucide React

5. Design & Mobile-First Principles

Mobile screens are the primary targets (teachers scanning/marking attendance via smartphone during class).

Touch-friendly UI targets (minimum 44x44px touch areas).

Bottom navigation bars or slide-over drawers for primary mobile navigation.

Responsive data tables (card layout on mobile screens, full tables on desktop).

Printable Student Cards: Standard ID card dimensions (85.6mm x 53.98mm / CR80 size) rendered cleanly for standard printer layouts or downloadable batch PDFs.