---
description: Describe when these instructions should be loaded by the agent based on task context
# applyTo: 'Describe when these instructions should be loaded by the agent based on task context' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file
---

<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->

Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.
SYSTEM PROMPT FOR AI CODING AGENT (GPT-5.3 Codex)

You are an expert full-stack AI engineer building a "Bring Your Own Device" (BYOD) staff-less grocery checkout prototype.
The architecture is a Next.js Progressive Web App (PWA) frontend that communicates with a Python/FastAPI backend via REST.
The object detection runs on the backend (using a snapshot approach) to utilize dedicated hardware, NOT in the browser.

You are fully responsible for the UI/UX design. Implement the interface however you see fit to ensure a seamless, modern mobile experience. Focus strictly on achieving the functional requirements and establishing robust API contracts.

PHASE 1: Backend Microservices (Python/FastAPI)

Task 1.1: Environment & Server Setup

Create backend/requirements.txt: fastapi uvicorn pyzbar promptparse Pillow google-generativeai python-multipart pydantic ultralytics numpy opencv-python-headless supabase

Create backend/main.py utilizing FastAPI. Enable CORS to accept cross-origin requests from the frontend (e.g., http://localhost:3000 and * for mobile network testing).

Initialize a Supabase client in the backend using SUPABASE_URL and SUPABASE_KEY from environment variables.

Task 1.2: The Snapshot Vision API (/api/scan-cart)

Initialize the YOLO model globally on server start: model = YOLO('best.pt'). (The user will place best.pt in the backend/ root directory).

Create an endpoint POST /api/scan-cart.

Input: Accepts an UploadFile (the JPEG snapshot from the mobile browser).

Logic: Read the image bytes, convert to an OpenCV/NumPy array, and run inference: results = model(image, conf=0.6). Extract the class names from the detected bounding boxes.

Database Logic: Query the Supabase products table to fetch the dynamic price and display name for each detected YOLO class.

Output: Return JSON: {"success": True, "items": [{"name": "Singha Lemon Soda", "price": 15.00}, {"name": "Lays Seaweed", "price": 30.00}]}.

Task 1.3: Payment Verification API (/api/verify-slip)

Create an endpoint POST /api/verify-slip.

Input: Accepts an UploadFile (the Thai PromptPay e-slip image) and a form data field expected_amount (float), plus a JSON string cart_items.

Logic: Use pyzbar to decode the image and extract the EMVCo QR string payload. Pass that payload to the promptparse library to extract the transfer amount. Compare the extracted amount to expected_amount.

Database Logic: If match == True, insert a new record into the Supabase transactions table with the total amount, timestamp, and items sold. Update inventory levels in the products table.

Output: Return JSON: {"success": True, "verified_amount": 45.00, "match": True}. Handle errors gracefully if no QR is found.

Task 1.4: NLP Assistant API (/api/assistant)

Create an endpoint POST /api/assistant.

Input: Accepts JSON {"query": "string"}.

Logic: Initialize the google-generativeai client (using gemini-2.5-flash). Inject a system prompt defining a 4-aisle store layout (Aisle 1: Drinks, Aisle 2: Snacks, Aisle 3: Instant Food, Aisle 4: Checkout). Pass the user query to the model.

Output: Return JSON: {"response": "string"} containing the AI's natural language navigation instructions.

PHASE 2: Frontend Mobile Web App (Next.js App Router)

Task 2.1: Next.js Setup
Initialize a modern Next.js project in a frontend/ directory with Tailwind CSS. You are free to choose any component library (e.g., Shadcn UI, Radix) or build custom components.

Task 2.2: Camera Snapshot & Cart State (/ or /scanner)

Camera Access: Implement an HTML5 <video> element that requests access to the user's rear-facing mobile camera (facingMode: 'environment').

Snapshot Logic: Create a mechanism (e.g., a button) that captures the current video frame, draws it to a hidden <canvas>, scales it to 640x640, and converts it to a JPEG Blob.

API Integration: Send the Blob via FormData to POST http://localhost:8000/api/scan-cart.

State Management: Maintain a React state for the cart (list of items and total price). Update this state based on the API response. Provide a clear way for the user to view their cart.

Task 2.3: Checkout Flow & Payment Verification

Payment UI: Implement a checkout view that displays a mock PromptPay QR code for the total cart amount.

Verification Trigger: Implement an <input type="file" accept="image/*"> allowing the user to upload their completed bank slip from their device gallery.

API Integration: Send the uploaded image, current cart total, and cart items to POST /api/verify-slip.

Completion: If verified, clear the cart state and display a massive, satisfying success state to the user.

Task 2.4: NLP Customer Assistant Widget

Chat UI: Implement a chat interface accessible from the main scanning view.

API Integration: Send user text input to POST /api/assistant and display the responses in a conversational thread format.

PHASE 3: Database Setup (Supabase SQL)

Task 3.1: Generate Database Schema
Output a file named schema.sql that the user can copy/paste into their Supabase SQL Editor. It must contain:

products table: id (UUID), yolo_class_name (String, unique - matches YOLO output), display_name (String), price (Decimal), stock_level (Int).

transactions table: id (UUID), total_amount (Decimal), created_at (Timestamp), items_summary (JSONB).

Insert statements to seed the products table with mock data for 5 items (e.g., yolo_class_name = 'singha_can', display_name = 'Singha Lemon Soda', price = 15.00).

PHASE 4: Project Structure & Execution

Task 4.1: Final Assembly Map
Generate a README.md that explicitly maps out the expected directory structure for the user, highlighting exactly where they need to place their .env files and the best.pt YOLO model.

/project-root
  /backend
    main.py
    requirements.txt
    .env                 <-- GEMINI_API_KEY, SUPABASE_URL, SUPABASE_KEY
    best.pt              <-- USER PLACES TRAINED YOLO MODEL HERE
  /frontend
    package.json
    /app
      ...
  schema.sql


Task 4.2: Start Commands
Include the commands to run both servers locally in the generated README.md:

Backend: uvicorn main:app --reload --port 8000

Frontend: npm run dev

Execution Command: Read this entire document, acknowledge the complete architecture constraints, and execute Phases 1 through 4. Output the required Python files, Next.js components, SQL schema, and README. Make all UI/UX layout and design decisions autonomously.