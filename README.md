# PM Agent — AI-Powered PMO Platform

Enterprise project management office (PMO) platform where AI performs the majority of routine PM work — artifact generation, tracking, reporting, prediction, and recommendation — while human PMs validate and approve.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL via Prisma 7 |
| Auth | NextAuth v5 (credentials + Google OAuth) |
| AI | Anthropic Claude API (claude-sonnet-4-6) |
| UI | Tailwind CSS v4 + Radix UI primitives |
| Deployment | Vercel (frontend + API) + Railway/Neon (PostgreSQL) |
| Email | Resend |

## Features

- **4-persona RBAC**: Project Manager · Program Manager · Delivery Head · Admin
- **Dual engagement modes**: Detailed (full tracking in PM Agent) or Governance (client tools + lightweight reporting)
- **AI artifact generation**: 22-artifact catalog — Charter, RAID, WBS, Milestones, RACI, Status Reports, EVM, and more
- **Natural-language project creation**: describe your project in plain text; AI infers all structured fields
- **AI copilot chat**: contextual assistant per project for on-demand commands
- **Weekly status reporting**: structured form → AI-generated executive summary + RAG score + recommendations
- **Portfolio dashboard**: health distribution, at-risk projects, SPI/CPI, upcoming milestones
- **Program Manager dashboard**: cross-project view, escalations, watchlist
- **Executive dashboard**: org-wide delivery health, budget roll-up, trend view
- **Artifact versioning**: every edit (AI, manual, or upload) creates an immutable version
- **Cost tracking**: EVM strip — CPI, SPI, cost burndown chart
- **Phase gates**: structured phase progression with gate reviews

---

## Quick Start (Local)

### Prerequisites
- Node.js 20+
- PostgreSQL database (Railway, Neon, or local)

### Setup

```bash
git clone https://github.com/pprakash1973/PMAgent.git
cd PMAgent

npm install

# Copy and configure environment
cp .env.example .env.local
# Edit .env.local — set DATABASE_URL, NEXTAUTH_SECRET, ANTHROPIC_API_KEY
```

### Environment Variables

```env
DATABASE_URL="postgresql://user:pass@host:5432/pm_agent?schema=public"
NEXTAUTH_SECRET="your-32-char-secret"          # openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
ANTHROPIC_API_KEY="sk-ant-..."

# Optional
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
RESEND_API_KEY=""
EMAIL_FROM="noreply@yourdomain.com"
```

### Database

```bash
# Push schema to your PostgreSQL database
npm run db:push

# Seed with demo users and sample project
npm run db:seed
```

### Run

```bash
npm run dev
# → http://localhost:3000
```

### Demo Logins (after seeding)

| Role | Email | Password |
|---|---|---|
| Project Manager | pm@pmAgent.dev | Password123! |
| Program Manager | dm@pmAgent.dev | Password123! |
| Delivery Head | head@pmAgent.dev | Password123! |
| Admin | admin@pmAgent.dev | Password123! |

---

## Deploy to Vercel + Railway/Neon

### 1. Database — Railway or Neon PostgreSQL

**Railway:**
1. Create a [Railway](https://railway.app) project → Add PostgreSQL service
2. Copy the `DATABASE_URL` connection string

**Neon (recommended for Vercel):**
1. Create a [Neon](https://neon.tech) project
2. Copy the pooled connection string as `DATABASE_URL`

### 2. Vercel — App Deployment

1. Fork or import this repo at [vercel.com/new](https://vercel.com/new)
2. Add the following **Environment Variables** in the Vercel dashboard:

| Variable | Value |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string from Railway/Neon |
| `NEXTAUTH_SECRET` | Random 32-char string (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Your Vercel domain, e.g. `https://pm-agent.vercel.app` |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (`sk-ant-...`) |

3. **Deploy** — Vercel auto-runs `prisma generate`, migration scripts, and `next build` (configured in `vercel.json`)

### 3. Seed Database (first deploy only)

After the first successful deploy, run from your local machine with the production `DATABASE_URL`:

```bash
DATABASE_URL="<your-prod-url>" npm run db:seed
```

This creates demo users and a sample project so you can log in immediately.

---

## Project Structure

```
prisma/
├── schema.prisma              # Full database schema (25+ models)
├── seed.ts                    # Demo users + sample project
└── prisma.config.ts           # Prisma 7 datasource config

scripts/
├── migrate-admin-module.js    # Adds Admin/Cluster/BU tables (idempotent)
├── migrate-pgm-phase.js       # Adds PGM role fields (idempotent)
└── migrate-pgm-phase2.js      # Adds escalation tables (idempotent)

src/
├── app/
│   ├── api/                   # REST API routes
│   │   ├── auth/              # NextAuth + register
│   │   ├── projects/          # CRUD + artifacts + status + risks + cost
│   │   ├── portfolio/         # Program Manager + Delivery Head aggregates
│   │   ├── pgm/               # Program Manager dashboard APIs
│   │   ├── escalations/       # Escalation lifecycle APIs
│   │   └── chat/              # AI copilot endpoint
│   ├── dashboard/
│   │   ├── page.tsx           # PM home dashboard
│   │   ├── projects/          # Project list + detail + new
│   │   ├── program/           # Program Manager views
│   │   ├── portfolio/         # Delivery Manager view
│   │   └── executive/         # Delivery Head view
│   ├── login/
│   └── register/
├── components/
│   ├── ui/                    # Button, Card, Badge, Input, Select, Toaster…
│   ├── app-shell.tsx          # Role-aware layout shell with nav rail
│   ├── artifact-panel.tsx     # Artifact generation + viewer
│   ├── chat-panel.tsx         # AI copilot sidebar
│   └── status-form.tsx        # Weekly status + AI summary
└── lib/
    ├── ai.ts                  # Anthropic Claude integration (streaming)
    ├── auth.ts                # NextAuth config
    ├── db.ts                  # Prisma client singleton
    ├── artifact-sync.ts       # Syncs artifact content into live DB tables
    ├── export-xlsx.ts         # Artifact XLSX export
    ├── guardrails.ts          # Pre-generation artifact guardrails
    ├── model-router.ts        # AI model routing per task type
    └── utils.ts               # Helpers, artifact catalog, constants
```

## Roadmap

- **V2**: Predictive engine (schedule/cost/risk), document upload & reconcile, Jira/ADO/Teams integrations
- **V3**: Executive AI reporting, Power BI/SAP integrations, advanced portfolio insights, SOC 2 Type II

## License

Private — Enterprise Edition
