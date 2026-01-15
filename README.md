# Affordable CRM (Starter Scaffold)

This is a **starter scaffold** for a Housecall Pro–style service CRM built with:
- FastAPI (API + server-rendered pages)
- SQLAlchemy + Alembic (DB)
- Auth (email/password) using secure password hashing + signed cookie session
- Multi-location (Locations table + user->location membership)
- Background tasks placeholders for Email/SMS
- Stripe placeholders for invoicing and Tap to Pay workflows (device-side handled by Stripe reader/SDK)

## Quick start (local)
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

Open: http://127.0.0.1:8000

## Render
- Set `PYTHON_VERSION` (optional), `DATABASE_URL`, `SECRET_KEY`, `SESSION_COOKIE_NAME`
- Build: `pip install -r requirements.txt`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
