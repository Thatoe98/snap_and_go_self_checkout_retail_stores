# BYOD Grocery Checkout Prototype

This project is a BYOD (Bring Your Own Device) staff-less grocery checkout prototype.

- Frontend: Next.js (PWA-style) + Tailwind CSS
- Backend: FastAPI + YOLO snapshot inference + PromptPay slip verification
- Database: Supabase (Postgres)

## Expected Structure

```text
/project-root
  /backend
    main.py
    requirements.txt
    .env                 <-- GEMINI_API_KEY, SUPABASE_URL, SUPABASE_KEY
    best.pt              <-- USER PLACES TRAINED YOLO MODEL HERE
  /frontend
    package.json
    .env.local           <-- NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
    /app
      layout.tsx
      page.tsx
      globals.css
  schema.sql
  README.md
```

## External Setup (Outside Workspace)

1. Create a Supabase project.
2. Open Supabase SQL Editor and run the SQL from `schema.sql`.
3. Train or provide your YOLO model and place it at `backend/best.pt`.
4. Create backend env file:
   - Copy `backend/.env.example` to `backend/.env` and fill values.
5. Create frontend env file:
   - Create `frontend/.env.local` with:
     - `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000`
6. Ensure your mobile phone and dev machine are on the same network for live camera testing.

## Install Dependencies

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend

```powershell
cd frontend
npm install
```

## Run Servers

### Backend

```powershell
cd backend
.\.venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

### Frontend

```powershell
cd frontend
npm run dev
```

## API Overview

- `POST /api/scan-cart`
  - Form field: `file` (JPEG image)
  - Returns detected cart items and total.
- `POST /api/verify-slip`
  - Form fields: `file`, `expected_amount`, `cart_items`
  - Decodes PromptPay slip QR and checks amount.
- `POST /api/assistant`
  - JSON body: `{ "query": "..." }`
  - Returns navigation instructions.
- `GET /health`
  - Health + model/supabase connectivity status.

## Suggested Validation

1. Hit `GET http://localhost:8000/health`.
2. Open `http://localhost:3000` on desktop and mobile.
3. Scan a sample basket image.
4. Upload a PromptPay slip screenshot.
5. Test assistant prompt: "Where is instant noodles?"

## Notes

- `opencv-python-headless` and `pyzbar` may require system libraries on some machines.
- If Windows QR decode fails due to missing zbar DLL, install zbar runtime or use WSL.
- CORS is enabled for local mobile testing.
