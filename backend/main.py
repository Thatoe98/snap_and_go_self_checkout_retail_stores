import json
import io
import importlib
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import google.generativeai as genai
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel
from pyzbar.pyzbar import decode as decode_qr
from supabase import Client, create_client
from ultralytics import YOLO

try:
    promptparse = importlib.import_module("promptparse")
except Exception:
    promptparse = None

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

app = FastAPI(title="BYOD Grocery Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception:
        supabase = None

YOLO_MODEL_PATH = Path(__file__).with_name("best.pt")
yolo_model: YOLO | None = None
if YOLO_MODEL_PATH.exists():
    try:
        yolo_model = YOLO(str(YOLO_MODEL_PATH))
    except Exception:
        yolo_model = None

ASSISTANT_SYSTEM_PROMPT = (
    "You are a navigation helper for a small grocery store. "
    "Store layout: Aisle 1 = Drinks, Aisle 2 = Snacks, "
    "Aisle 3 = Instant Food, Aisle 4 = Checkout. "
    "Give clear and short step-by-step directions."
)


class AssistantRequest(BaseModel):
    query: str


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "supabase_connected": bool(supabase),
        "model_loaded": bool(yolo_model),
    }


def _extract_promptpay_amount(payload: str) -> float | None:
    if not payload:
        return None

    if promptparse is not None:
        try:
            parsed = promptparse.parse(payload)
            if isinstance(parsed, dict):
                for key in ("amount", "Amount", "transfer_amount"):
                    val = parsed.get(key)
                    if val is not None:
                        return float(val)
            if hasattr(parsed, "amount") and parsed.amount is not None:
                return float(parsed.amount)
        except Exception:
            pass

    amount_tag = re.search(r"54(\d{2})(\d+(?:\.\d{1,2})?)", payload)
    if amount_tag:
        return float(amount_tag.group(2))

    generic = re.search(r"(\d+\.\d{2})", payload)
    if generic:
        return float(generic.group(1))

    return None


def _fetch_product_by_class(yolo_class_name: str) -> dict[str, Any] | None:
    if not supabase:
        return None
    try:
        response = (
            supabase.table("products")
            .select("id, yolo_class_name, display_name, price, stock_level")
            .eq("yolo_class_name", yolo_class_name)
            .limit(1)
            .execute()
        )
        if response.data:
            return response.data[0]
        return None
    except Exception:
        return None


@app.post("/api/scan-cart")
async def scan_cart(file: UploadFile = File(...)) -> JSONResponse:
    if not yolo_model:
        raise HTTPException(
            status_code=503,
            detail="YOLO model not loaded. Put best.pt in backend/ and restart server.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")

    img_array = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Failed to decode image.")

    results = yolo_model(image, conf=0.6)
    detected_classes: list[str] = []

    for result in results:
        names_map = result.names
        if result.boxes is None:
            continue
        class_ids = result.boxes.cls.tolist() if result.boxes.cls is not None else []
        for cls_id in class_ids:
            idx = int(cls_id)
            class_name = names_map.get(idx, str(idx))
            detected_classes.append(str(class_name))

    counts = Counter(detected_classes)
    items: list[dict[str, Any]] = []

    for class_name, quantity in counts.items():
        product = _fetch_product_by_class(class_name)
        if product:
            unit_price = float(product.get("price", 0.0))
            display_name = product.get("display_name") or class_name
        else:
            unit_price = 0.0
            display_name = class_name

        items.append(
            {
                "class_name": class_name,
                "name": display_name,
                "price": unit_price,
                "quantity": int(quantity),
                "line_total": round(unit_price * quantity, 2),
            }
        )

    total = round(sum(item["line_total"] for item in items), 2)

    return JSONResponse(
        {
            "success": True,
            "items": items,
            "total": total,
        }
    )


@app.post("/api/verify-slip")
async def verify_slip(
    file: UploadFile = File(...),
    expected_amount: float = Form(...),
    cart_items: str = Form("[]"),
) -> JSONResponse:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded slip image is empty.")

    try:
        image = Image.open(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {exc}") from exc

    decoded = decode_qr(image)
    if not decoded:
        raise HTTPException(status_code=400, detail="No QR payload found in uploaded slip.")

    payload = decoded[0].data.decode("utf-8", errors="ignore")
    verified_amount = _extract_promptpay_amount(payload)
    if verified_amount is None:
        raise HTTPException(status_code=400, detail="Could not parse amount from QR payload.")

    match = abs(verified_amount - expected_amount) < 0.01

    parsed_items: list[dict[str, Any]]
    try:
        parsed_items = json.loads(cart_items)
        if not isinstance(parsed_items, list):
            raise ValueError("cart_items must be a JSON array")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid cart_items: {exc}") from exc

    if match and supabase:
        try:
            supabase.table("transactions").insert(
                {
                    "total_amount": verified_amount,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "items_summary": parsed_items,
                }
            ).execute()

            for item in parsed_items:
                class_name = item.get("class_name")
                qty = int(item.get("quantity", 1))
                if not class_name:
                    continue
                product = _fetch_product_by_class(str(class_name))
                if not product:
                    continue
                new_stock = max(int(product.get("stock_level", 0)) - qty, 0)
                supabase.table("products").update({"stock_level": new_stock}).eq(
                    "id", product["id"]
                ).execute()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Database write failed: {exc}") from exc

    return JSONResponse(
        {
            "success": True,
            "verified_amount": round(verified_amount, 2),
            "match": match,
        }
    )


@app.post("/api/assistant")
async def assistant(req: AssistantRequest) -> JSONResponse:
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured.")

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(
            [
                {"role": "user", "parts": [ASSISTANT_SYSTEM_PROMPT]},
                {
                    "role": "user",
                    "parts": [f"Customer question: {req.query}"],
                },
            ]
        )
        text = (response.text or "").strip()
        return JSONResponse({"response": text})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Assistant error: {exc}") from exc
