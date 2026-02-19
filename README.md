# FocusFlow

FocusFlow is an AI-powered collaborative productivity web app for deep work. It combines personal task planning, group focus collaboration, timed focus sessions, AI summaries, and break-recovery workflows into a single system.

## Why FocusFlow

Modern work is fragmented across tasks, tabs, chats, and meetings. FocusFlow addresses this by:
- Turning task lists into actionable AI plans
- Running structured focus sessions with role-based control
- Keeping teams synced in real time
- Nudging users back when breaks become overdue

## Core Features

### Personal Productivity
- Personal dashboard with persisted tasks
- AI-generated personal execution plan
- Inline task suggestion/ghost input support

### Group Collaboration
- Group join/create flow
- Group task board with persistence
- Role-based permissions (admin/member)
- Shared AI group plan and team summary

### Focus Sessions
- Admin-controlled session timer duration
- Member join with session goal
- Live timer and end-session flow
- Session recap submission and visibility
- Past session list with per-user delete option

### Break Intelligence
- Breaks enabled only after eligibility window
- Session timer pause while break is active
- Break-over popup + controlled relaxation flow
- Recovery action capture when overdue
- Escalation path via email when required

### Agentic + Real-time
- Focus monitoring context endpoints
- AI nudge endpoints
- Team recap synthesis using Groq
- Real-time recap sync via Pusher

## Tech Stack

- **Next.js 16 (App Router)** + **TypeScript**
- **NextAuth.js** for authentication (GitHub / Email, optional Google)
- **Prisma ORM** + **PostgreSQL (Neon)**
- **Groq SDK** for planning/summarization/nudges
- **Pusher** for real-time synchronization
- **Tailwind CSS v4** + token-based light/dark theming

## Project Structure (High Level)

- `src/app/` - pages and API routes
- `src/app/api/` - backend endpoints (tasks, groups, sessions, auth, AI)
- `src/lib/` - auth, prisma, agent, utility logic
- `prisma/` - schema and migrations
- `src/components/` - shared UI components

## Prerequisites

- Node.js 20+
- npm 10+
- A PostgreSQL database (Neon recommended)
- GitHub OAuth app credentials
- Groq API key

## Environment Variables

Create `.env.local` in the project root.

### Required

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_random_secret_32_plus_chars

DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=verify-full

GITHUB_ID=your_github_oauth_client_id
GITHUB_SECRET=your_github_oauth_client_secret

GROQ_API_KEY=your_groq_api_key
```

## Local Setup

1. Clone repository
```bash
git clone <your-repo-url>
cd focusflow
```

2. Install dependencies
```bash
npm install
```

3. Create env file
```bash
cp .env.example .env.local
```
If `.env.example` is not present, create `.env.local` manually using the variables above.

4. Generate Prisma client
```bash
npx prisma generate
```

5. Sync schema to database
```bash
npx prisma db push
```

6. Start dev server
```bash
npm run dev
```

7. Open app
- `http://localhost:3000`

## Useful Commands

```bash
npm run dev        # run locally
npm run lint       # lint code
npm run build      # production build
npx prisma studio  # inspect database
```

## Authentication Notes

- Sign-in page is `/signin`
- If you switch auth providers/accounts and see login mismatch errors, sign out and clear localhost auth cookies, then sign in again.
- GitHub OAuth callback URL should be:
  - `http://localhost:3000/api/auth/callback/github`

## Deployment Notes

- Set all required environment variables in your hosting platform.
- Use a production PostgreSQL URL for `DATABASE_URL`.
- Set `NEXTAUTH_URL` to your deployed domain.

## Current Status

FocusFlow is in active feature-development phase. Core architecture is stable and designed for extension (more agent workflows, stronger analytics, and richer collaboration controls).

