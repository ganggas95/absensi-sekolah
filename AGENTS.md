# AGENTS.md — AI Agent Execution Context & Guidelines

Welcome, AI Agent (Cursor, Windsurf, Claude Dev, or Cline). This document establishes the entry points, architecture constraints, and execution workflows for the **Absensi Siswa SMPI Bina Cendekia Aqwam** monorepo project.

---

## 1. Monorepo Directory Layout

```text
.
├── AGENTS.md                             # This instructions file
├── system-prompt.md                       # Core AI behavior directives & rules
├── architecture-and-schema.md            # ERD, DB models, and features detail
├── api-specifications.md                 # Complete FastAPI REST endpoint reference
│
├── apps/
│   ├── backend/                          # FastAPI Application
│   │   ├── app/
│   │   │   ├── api/                      # Routes / Endpoint definitions
│   │   │   ├── core/                     # Config, Auth, Security, JWT
│   │   │   ├── db/                       # SQLAlchemy models & DB sessions
│   │   │   ├── schemas/                  # Pydantic schemas (V2)
│   │   │   ├── services/                 # Logic: Card PDFs, QR codes, Reports
│   │   │   └── main.py                   # FastAPI entrypoint
│   │   ├── alembic/                      # Database migrations
│   │   ├── requirements.txt              # Dependencies
│   │   └── Dockerfile
│   │
│   └── frontend/                         # Next.js Application (Pages Router / Pure Client)
│       ├── src/
│       │   ├── components/               # Mobile-first UI & Printable Card components
│       │   ├── pages/                    # Next.js Pages Router routes
│       │   ├── services/                 # React Query / Axios API clients
│       │   ├── styles/                   # Tailwind CSS & Print styles
│       │   └── types/                    # TypeScript Interfaces
│       ├── package.json
│       ├── tailwind.config.js
│       └── Dockerfile
│
└── docker-compose.yml                    # Local multi-container development
```

---

## 2. Core Operational Mandates

### 🚫 Strict Security Rule: NO React Server Components (RSC)
* **Router:** Exclusively use **Next.js Pages Router** inside `apps/frontend/src/pages/`.
* **Rendering:** Perform Client-Side Rendering (CSR). Fetch all data asynchronously using **TanStack Query (React Query)** or **SWR**.
* **Rationale:** Avoids RSC vulnerability vectors and maintains clean separation between frontend and backend in this monorepo.

###📱 Mobile-First First Methodology
* All UI components must prioritize small viewport screens (smartphones used by teachers during attendance marking).
* Touch targets must be at least `44x44px`.
* Layouts must start with mobile styling and scale up using Tailwind breakpoints (`md:`, `lg:`).

### 🔎 Filter Modal Convention
* Present list filters inside the existing `ModalDialog` pattern; do not move filter controls inline into the page toolbar.
* Keep filter controls accessible and mobile-friendly, with clear apply and reset actions.

### ✅ Frontend E2E Completion Gate
* Every frontend feature or bug fix must end with Playwright E2E tests covering the changed behavior; add or update tests when existing coverage is insufficient.
* Run the relevant E2E test, then the full frontend E2E suite before declaring the work complete.
* If tests expose a product bug, fix it and rerun the affected test and full suite. If the suite is blocked by infrastructure, report the blocker and do not claim E2E verification.
* Follow `docs/frontend-e2e-testing.md` for the isolated test stack and commands.

### 🎴 Student ID Card Printing (`Cetak Kartu Pelajar`)
* Support single card printing via `react-to-print` on client side.
* Support batch PDF generation on backend (`weasyprint` / `reportlab`).
* Standard ID Card dimension: CR80 (`85.6mm x 53.98mm`).
* Must render student photo, NISN, and dynamic Barcode/QR Code.

---

## 3. Tech Stack Reference

| Layer | Technology | Key Libraries |
| :--- | :--- | :--- |
| **Backend** | Python (FastAPI) | `sqlalchemy`, `pydantic-v2`, `qrcode`, `weasyprint`, `openpyxl`, `python-jose` |
| **Frontend** | React / Next.js (TS) | `pages router`, `@tanstack/react-query`, `axios`, `tailwindcss`, `react-to-print`, `lucide-react` |
| **Database** | PostgreSQL | Native SQL DDL in `architecture-and-schema.md` |

---

## 4. Agent Checklist Before Code Generation

1. **Check System Directives:** Always consult `system-prompt.md`.
2. **Schema Integrity:** Verify foreign key constraints against `architecture-and-schema.md`.
3. **API Alignment:** Ensure endpoint routes match the paths and payload specifications in `api-specifications.md`.
4. **Monorepo Path Verification:** Place all Python code strictly inside `apps/backend/` and TypeScript code strictly inside `apps/frontend/`.

---