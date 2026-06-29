# CONSUL

**AI OCR & FWA Analysis Platform**

CONSUL is an enterprise-grade platform for healthcare professionals, delivering deterministic AI OCR document extraction, FWA (Fraud, Waste, and Abuse) analysis, and claim verification. Built for hospitals, clinics, and healthcare institutions that demand standardized, auditable clinical workflows with high precision.

---

## Tech Stack

| Layer          | Technology                                                      |
| -------------- | --------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router) with React 19 and TypeScript            |
| Styling        | Tailwind CSS v4 (via `@tailwindcss/postcss`)                    |
| Database       | PostgreSQL (Supabase-hosted) via Prisma ORM v7                  |
| Auth           | Custom JWT-based (bcryptjs + jose)                              |
| AI Gateway     | Provider-configurable via Vercel AI SDK-compatible driver        |
| AI OCR Model   | SnapText (Flux Model) for document extraction                   |
| Workflow       | Background workflow runner for FWA validation steps              |
| Validation     | Zod v4 for runtime schema validation                            |
| UI Primitives  | Radix UI + Lucide React icons + class-variance-authority         |
| Fonts          | Geist Sans & Geist Mono (via `next/font/google`)                |

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/                        # Auth route group (login, register)
│   ├── api/
│   │   ├── auth/                      # Auth API routes (login, register, logout)
│   │   └── v1/                        # Versioned REST API
│   │       ├── claims/                # Claim validation endpoints
│   │       ├── documents/             # Document management
│   │       ├── drugs/                 # Drug database endpoints
│   │       ├── jobs/                  # Background job management
│   │       ├── ocr/                   # OCR and SnapText endpoints
│   │       ├── providers/             # Healthcare provider endpoints
│   │       └── tariff/                # Tariff/billing endpoints
│   ├── dashboard/
│   │   ├── claim-review/              # FWA & Claim Review workspace
│   │   ├── master-data/               # Master data management
│   │   └── settings/                  # User & org settings
│   ├── api-docs/                      # API reference (Scalar)
│   ├── compliance/                    # Compliance pages
│   ├── privacy/                       # Privacy policy
│   ├── terms/                         # Terms of service
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                       # Landing page
├── components/
│   ├── dashboard/                     # Dashboard layout & shell
│   ├── landing/                       # Landing page sections
│   ├── providers/                     # React context providers
│   └── ui/                            # Shared UI primitives
├── lib/
│   ├── ai/                            # AI service gateway
│   ├── evidence/                      # Medical references and confidence scoring
│   ├── fwa/                           # Fraud, Waste, Abuse triage engine
│   ├── snaptext/                      # OCR Provider integration (Flux)
│   ├── middleware/                     # Route middleware utilities
│   ├── auth.ts                        # JWT & password hashing
│   ├── db.ts                          # Prisma client singleton
│   ├── rbac.ts                        # Role-based access control
│   └── ...                            # Utilities (rate-limit, credits, etc.)
├── workflows/
│   └── claim-validation/              # FWA Claim validation workflow steps
└── generated/prisma/                  # Auto-generated Prisma client
prisma/
├── schema.prisma                      # Database schema
└── migrations/                        # Migration files
prisma.config.ts                       # Prisma 7 config (datasource URL)
docs/
└── architecture-and-data-contract.md  # Unified architecture & canonical data contract
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL (or Supabase account)
- PowerShell (Windows)

### Setup

```powershell
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Seed initial data (optional)
npm run seed:kfa-drugs

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL=              # PostgreSQL connection string (Supabase pooler)
DIRECT_URL=                # Direct connection URL (for migrations)

# Authentication
JWT_SECRET=                # Secret key for JWT signing

# Supabase
SUPABASE_URL=              # Supabase project URL
SUPABASE_SERVICE_KEY=      # Supabase service role key

# AI OCR
SNAPTEXT_OCR_MODEL_ID=Flux # The SnapText model ID to use

# AI Gateway
AI_PROVIDER=               # AI provider identifier
AI_API_KEY=                # AI provider API key
AI_MODEL=                  # AI model name
AI_BASE_URL=               # AI provider base URL (if custom)
```

---

## Available Scripts

| Command                    | Description                              |
| -------------------------- | ---------------------------------------- |
| `npm run dev`              | Start development server                 |
| `npm run build`            | Build production bundle                  |
| `npm start`                | Start production server                  |
| `npm run lint`             | Run ESLint                               |
| `npm run seed:kfa-drugs`   | Seed KFA drug database                   |
| `npx prisma generate`     | Regenerate Prisma client                 |
| `npx prisma migrate dev`  | Run migrations (development)             |
| `npx prisma studio`       | Open Prisma Studio (database GUI)        |
| `npx tsc --noEmit`        | TypeScript type-check (no output)        |

---

## Key Features

- **AI OCR Extraction (Flux)** — Precision extraction of medical data and structures from EMR and claim documents.
- **FWA Analysis Engine** — Automated detection of Fraud, Waste, and Abuse through deterministic rules and data lake correlation.
- **Confidence & Evidence Scoring** — Provides clinical reasoning and references (FDA, WHO, PubMed) for human-in-the-loop verification.
- **Claim Validation** — Multi-step background workflow for validating insurance claims against master data and policy rules.
- **Master Data Management** — KFA-compliant drug reference, ICD-10 diagnosis, and hospital tariff lookup.
- **Document Management** — Upload and manage clinical documents via Supabase Storage.
- **API Platform** — Versioned REST API (`/api/v1/`) with Scalar-powered documentation.
- **Role-Based Access** — Multi-tenant RBAC with organization-level permissions.

---

## Deployment

Optimized for [Vercel](https://vercel.com). The `postinstall` script automatically generates the Prisma client during deployment.

**Pre-deployment checklist:**
1. `npx tsc --noEmit` exits clean
2. `npm run lint` passes
3. Environment variables configured in Vercel dashboard
4. Database migrations applied to production

---

## Contributing

See [AGENTS.md](./AGENTS.md) for the complete development rulebook, including design standards, code quality requirements, and mandatory verification steps.
