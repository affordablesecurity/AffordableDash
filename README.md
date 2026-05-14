# Locksmith CRM

A server-ready CRM foundation for a locksmith company, modeled around the workflows in Housecall Pro, Workiz, and Autopilot-style follow-up systems.

## What is included

- Express + TypeScript API
- PostgreSQL database schema with Prisma
- JWT auth and role-based user records
- Public signup with username/email login
- Multi-location organization model for separated branches
- Location-specific API access with generated bearer tokens
- Customers, addresses, technicians, jobs, notes, line items, invoices, payments, and messages
- Stripe payment intent + webhook integration points
- VoIP.ms SMS integration point
- Housecall Pro sync client based on the uploaded API PDF
- React/Vite dashboard starter
- Docker Compose for local Postgres

## Local setup

```bash
cd "/Users/brandonwilson/Documents/New project/locksmith-crm"
cp .env.example .env
npm install
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

The API runs on `http://localhost:4100`.
The dashboard runs on `http://localhost:5173`.

Seed login:

```txt
owner
ChangeMe123!
```

The seed account belongs to the demo `El Centro` location. Additional locations can be created through `POST /api/locations`, and users can switch active locations through `POST /api/auth/switch-location`.

## Location API access

Each location can generate its own API keys from the dashboard or through:

```http
POST /api/location-api-keys
Authorization: Bearer user_jwt
Content-Type: application/json

{
  "name": "El Centro Partner API",
  "scopes": ["customers:read", "jobs:read"]
}
```

The response includes a one-time token like `lcrm_live_...`. External systems use it against the location-scoped API:

```http
GET /location-api/v1/jobs
Authorization: Bearer lcrm_live_generated_token
```

That token only sees the location it was generated for.

## Security model

- Private dashboard data lives behind `/api/*` routes that require a signed user JWT.
- External division access uses `/location-api/v1/*` with a location-specific bearer token.
- Location API keys are hashed in the database; the full token is shown only once.
- Stripe webhooks require Stripe's webhook signature.
- Housecall Pro webhooks can require `HOUSECALL_PRO_WEBHOOK_SECRET`.
- Unknown routes return a generic `404` and the app disables Express fingerprinting.

## Server deployment notes

Use PostgreSQL in production, set strong secrets in `.env`, run `npm run build`, run Prisma migrations, and serve `server/dist/index.js` behind Nginx or your host's Node process manager.

Never commit live API keys. Add Stripe, VoIP.ms, and Housecall Pro credentials only on the server.
