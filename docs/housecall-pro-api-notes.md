# Housecall Pro API Notes

Source: `/Users/brandonwilson/Downloads/ilovepdf_merged.pdf`

The uploaded PDF is a 213-page export of the Housecall Pro public API docs. The CRM scaffold includes an integration client at `server/src/modules/integrations/housecall-pro.service.ts` and can be expanded endpoint by endpoint.

## Auth Seen In PDF

- Base URL: `https://api.housecallpro.com`
- API-key format shown: `Authorization: Token {api-key}`
- Some pages also reference application API key and OAuth client credentials flows.

## Endpoint Areas Seen In PDF

- Customers: create, list, get, addresses
- Jobs: create, list, get, schedule, dispatch, appointments, notes, links, tags, attachments
- Job line items: add, bulk update, update, delete
- Estimates: create, list, get, approve, decline, options, notes, attachments, links
- Employees: list
- Invoices: list, get, job invoices
- Leads: create and convert
- Lead sources
- Tags
- Webhook subscriptions
- Company and schedule availability
- Checklists
- Price book materials, categories, and price forms

## First Sync Targets

1. Import customers and addresses.
2. Import employees as technicians.
3. Import jobs and appointments.
4. Import invoices.
5. Add webhook ingestion so new Housecall Pro activity can update this CRM.

All imported records should be mapped into the selected CRM location. For example, Housecall Pro data for an El Centro branch should be attached to that location's `locationId` so it remains separated from other branches.

Live credentials should only be added to `.env` on the server.
