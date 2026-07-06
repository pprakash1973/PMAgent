# PM Agent — AI-Powered PMO Platform

Enterprise project management office (PMO) platform where AI performs the majority of routine PM work — artifact generation, tracking, reporting, prediction, and recommendation — while human PMs validate and approve.

Built from [PRD v2.1](../PM_Agent_PRD_Enterprise_v2.md).

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL via Prisma 7 |
| Auth | NextAuth v5 (credentials + Google OAuth) |
| AI | Anthropic Claude API (claude-sonnet-4-6) |
| UI | Tailwind CSS v4 + Radix UI primitives |
| Deployment | Vercel (frontend + API) + Railway (PostgreSQL) |
| Email | Resend |

## Features (MVP)

- **3-persona RBAC**: Project Manager · Delivery Manager · Delivery Head · Admin
- **Dual engagement modes**: Detailed (full tracking in PM Agent) or Governance (client tools + lightweight reporting)
- **AI artifact generation**: 22-artifact catalog — Charter, RAID, WBS, Milestones, RACI, Status Reports, and more
- **Natural-language project creation**: describe your project in plain text; AI infers all structured fields
- **AI copilot chat**: contextual assistant per project for on-demand commands
- **Weekly status reporting**: structured form → AI-generated executive summary + RAG score + recommendations
- **Portfolio dashboard**: health distribution, at-risk projects, SPI/CPI, upcoming milestones
- **Executive dashboard**: org-wide delivery health, budget roll-up, trend view
- **Artifact versioning**: every edit (AI, manual, or upload) creates an immutable version

## Quick Start (Local)

### Prerequisites
- Node.js 20+
- PostgreSQL database

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
NEXTAUTH_SECRET="your-32-char-secret"
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
| Delivery Manager | dm@pmAgent.dev | Password123! |
| Delivery Head | head@pmAgent.dev | Password123! |
| Admin | admin@pmAgent.dev | Password123! |

---

## Deploy to Vercel + Railway

### 1. Railway — PostgreSQL

1. Create a [Railway](https://railway.app) project
2. Add a PostgreSQL service
3. Copy the `DATABASE_URL` from Railway

### 2. Vercel — App Deployment

1. Import this repo at [vercel.com/new](https://vercel.com/new)
2. Add environment variables in Vercel dashboard:
   - `DATABASE_URL` (from Railway)
   - `NEXTAUTH_SECRET` (generate: `openssl rand -base64 32`)
   - `NEXTAUTH_URL` (your Vercel domain, e.g. `https://pm-agent.vercel.app`)
   - `ANTHROPIC_API_KEY`
3. Deploy — Vercel auto-runs `prisma generate && next build`

### 3. Migrate Database

After first deploy, run from Railway shell or locally with production `DATABASE_URL`:

```bash
npm run db:push
npm run db:seed   # optional demo data
```

---

## Project Structure

```
src/
├── app/
│   ├── api/                   # REST API routes
│   │   ├── auth/              # NextAuth + register
│   │   ├── projects/          # CRUD + artifacts + status + risks
│   │   ├── portfolio/         # Delivery Manager aggregates
│   │   └── chat/              # AI copilot endpoint
│   ├── dashboard/
│   │   ├── page.tsx           # PM home dashboard
│   │   ├── projects/          # Project list + detail + new
│   │   ├── portfolio/         # Delivery Manager view
│   │   └── executive/         # Delivery Head view
│   ├── login/                 # Auth pages
│   └── register/
├── components/
│   ├── ui/                    # Button, Card, Badge, Input, Select, Toaster…
│   ├── sidebar.tsx            # Role-aware navigation
│   ├── artifact-panel.tsx     # Artifact generation + viewer
│   ├── chat-panel.tsx         # AI copilot sidebar
│   └── status-form.tsx        # Weekly status + AI summary
├── lib/
│   ├── ai.ts                  # Anthropic Claude integration
│   ├── auth.ts                # NextAuth config
│   ├── db.ts                  # Prisma client singleton
│   └── utils.ts               # Helpers, artifact catalog, constants
└── middleware.ts              # Auth guard

prisma/
├── schema.prisma              # 23-model database schema
├── seed.ts                    # Demo users + sample project
└── prisma.config.ts           # Prisma 7 config (datasource URL)
```

## Roadmap

See [PRD Section 19](../PM_Agent_PRD_Enterprise_v2.md#19-release-roadmap-mvp--v2--v3):

- **V2**: Predictive engine (schedule/cost/risk), document upload & reconcile, Jira/ADO/Teams integrations, conversational chat commands
- **V3**: Executive AI reporting, Power BI/SAP integrations, advanced portfolio insights, SOC 2 Type II

## License

Private — Enterprise Edition
