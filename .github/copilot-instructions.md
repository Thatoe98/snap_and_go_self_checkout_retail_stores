# Project Guidelines

## Architecture
- Frontend lives in `frontend/` and is a Next.js App Router mobile-first web app.
- Backend lives in `backend/` and is FastAPI with three core APIs: `scan-cart`, `verify-slip`, and `assistant`.
- Object detection runs only on backend using YOLO model file `backend/best.pt`.
- Supabase is the source of truth for products, prices, stock, and transactions.

## Code Style
- Use TypeScript for frontend app code.
- Prefer small, clear helper functions over large endpoint handlers.
- Keep API responses stable and backward compatible with current frontend.
- Add input validation and graceful error responses for all API endpoints.

## Build and Test
- Backend setup: `cd backend && python -m venv .venv && .\.venv\Scripts\activate && pip install -r requirements.txt`
- Backend run: `cd backend && .\.venv\Scripts\activate && uvicorn main:app --reload --port 8000`
- Frontend setup: `cd frontend && npm install`
- Frontend run: `cd frontend && npm run dev`
- Frontend checks: `cd frontend && npm run lint && npm run typecheck && npm run build`

## Conventions
- `POST /api/scan-cart` expects multipart `file` and returns `items` + `total`.
- `POST /api/verify-slip` expects multipart `file`, `expected_amount`, and JSON-string `cart_items`.
- `POST /api/assistant` expects JSON with `query`.
- Keep `schema.sql` as the canonical DB schema for Supabase bootstrap.
- Never hardcode secrets; load from `.env` or `.env.local`.
