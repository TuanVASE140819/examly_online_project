# CBRN-e API — backend starter

This is a **starter scaffold**, not a security-audited production server. It contains a PostgreSQL Prisma schema, JWT login, role checks, exam creation, room join, participant decision endpoints, audit rows, and authenticated Socket.IO teacher-room subscriptions.

## Setup
1. Install Node.js LTS and PostgreSQL.
2. Copy `.env.example` to `.env`; set `DATABASE_URL` and a cryptographically random `JWT_SECRET` of at least 32 characters.
3. Install and generate/migrate:

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

4. Create the first teacher account through a controlled seed/admin workflow. Do not expose public self-registration that lets users choose `TEACHER` or `ADMIN`. The current starter intentionally does not provide an unsafe public registration endpoint.
5. API health: `GET http://localhost:4000/api/v1/health`.

## Included endpoints
- `POST /api/v1/auth/login`
- `POST /api/v1/exams` (teacher/admin)
- `POST /api/v1/exams/join`
- `GET /api/v1/exams/:examId/participants` (owner/admin)
- `POST /api/v1/exams/:examId/participants/:participantId/decision` (owner/admin)

Socket event `exam:join` currently permits the exam owner/admin to subscribe to teacher-room updates.

## Before production
- Room codes use `crypto.randomBytes` and a SHA-256 lookup hash. Before production, review code length, expiry, retry limits and rotation policy.
- Add robust teacher bootstrap/registration, refresh/logout/session revocation, password reset, email verification and account lockout policies.
- Implement start/end exam, question/option management, student authorization and own-participation socket subscriptions, autosave, submit, grading, timeout jobs, pagination, rate limits and full audit coverage.
- Add integration/E2E tests, CSRF strategy if using cookies, structured observability, DB backup/restore, migration review, and security review.
- Review Prisma schema and uniqueness constraints for the chosen student identity model. A null `userId` does not prevent duplicate anonymous joins, so anonymous participation needs an explicit deduplication/session policy.
