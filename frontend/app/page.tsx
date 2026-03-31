"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CartItem = {
  class_name: string;
  name: string;
  price: number;
  quantity: number;
  line_total: number;
  max_confidence?: number;
  avg_confidence?: number;
};

type AssistantMessage = {
  from: "user" | "bot";
  text: string;
};

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

function toLineTotal(price: number, quantity: number): number {
  return Math.round(price * quantity * 100) / 100;
}

function normalizeItem(item: CartItem): CartItem {
  return {
    ...item,
    quantity: Math.max(1, Number(item.quantity) || 1),
    line_total: toLineTotal(Number(item.price) || 0, Math.max(1, Number(item.quantity) || 1)),
  };
}

function mergeCartItems(current: CartItem[], incoming: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();

  for (const baseItem of current) {
    const item = normalizeItem(baseItem);
    map.set(item.class_name, item);
  }

  for (const incomingItem of incoming) {
    const item = normalizeItem(incomingItem);
    const existing = map.get(item.class_name);
    if (!existing) {
      map.set(item.class_name, item);
      continue;
    }

    const quantity = existing.quantity + item.quantity;
    const price = item.price || existing.price;
    map.set(item.class_name, {
      class_name: item.class_name,
      name: item.name || existing.name,
      price,
      quantity,
      line_total: toLineTotal(price, quantity),
    });
  }

  return Array.from(map.values());
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [pendingScanItems, setPendingScanItems] = useState<CartItem[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [status, setStatus] = useState("Point your camera at your basket and tap Scan.");
  const [slipStatus, setSlipStatus] = useState<string>("");
  const [assistantInput, setAssistantInput] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { from: "bot", text: "Need help finding products? Ask me where to go." },
  ]);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function setupCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (err) {
        setStatus(`Camera permission error: ${String(err)}`);
      }
    }

    setupCamera();

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.line_total, 0),
    [cart],
  );

  const pendingTotal = useMemo(
    () => pendingScanItems.reduce((sum, item) => sum + item.line_total, 0),
    [pendingScanItems],
  );

  function adjustPendingQuantity(className: string, delta: number) {
    setPendingScanItems((prev) =>
      prev
        .map((item) => {
          if (item.class_name !== className) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          return {
            ...item,
            quantity: nextQty,
            line_total: toLineTotal(item.price, nextQty),
          };
        })
        .filter((item): item is CartItem => item !== null),
    );
  }

  function adjustCartQuantity(className: string, delta: number) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.class_name !== className) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          return {
            ...item,
            quantity: nextQty,
            line_total: toLineTotal(item.price, nextQty),
          };
        })
        .filter((item): item is CartItem => item !== null),
    );
  }

  function cancelPendingScan() {
    setPendingScanItems([]);
    setIsConfirmOpen(false);
    setStatus("Scan discarded. Scan again when ready.");
  }

  function acceptPendingScan() {
    if (pendingScanItems.length === 0) {
      setIsConfirmOpen(false);
      return;
    }

    setCart((prev) => mergeCartItems(prev, pendingScanItems));
    setPendingScanItems([]);
    setIsConfirmOpen(false);
    setStatus("Items confirmed and added to cart.");
    setSuccess(false);
  }

  async function captureAndScan() {
    if (!videoRef.current || !canvasRef.current || busy || isConfirmOpen) return;

    setBusy(true);
    setStatus("Analyzing snapshot...");

    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");

      canvas.width = 640;
      canvas.height = 640;
      ctx.drawImage(video, 0, 0, 640, 640);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("Snapshot failed");

      const form = new FormData();
      form.append("file", blob, "snapshot.jpg");

      const response = await fetch(`${BACKEND}/api/scan-cart`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "scan-cart failed");
      }

      const data = await response.json();
      const items: CartItem[] = Array.isArray(data.items)
        ? (data.items as CartItem[]).map((item) => normalizeItem(item))
        : [];

      if (items.length === 0) {
        setStatus("No new product detected. Try another angle. Existing cart remains unchanged.");
      } else {
        setPendingScanItems(items);
        setIsConfirmOpen(true);
        setStatus("Review scan result before adding to cart.");
      }
      setSuccess(false);
    } catch (err) {
      setStatus(`Scan failed: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadSlip(file: File) {
    setSlipStatus("Verifying slip...");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("expected_amount", total.toFixed(2));
      form.append("cart_items", JSON.stringify(cart));

      const response = await fetch(`${BACKEND}/api/verify-slip`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "verify-slip failed");
      }

      const data = await response.json();
      if (data.match) {
        setSlipStatus(`Payment confirmed: ${Number(data.verified_amount).toFixed(2)} THB`);
        setSuccess(true);
        setCart([]);
      } else {
        setSlipStatus(
          `Amount mismatch. Expected ${total.toFixed(2)} THB, verified ${Number(data.verified_amount).toFixed(2)} THB`,
        );
        setSuccess(false);
      }
    } catch (err) {
      setSlipStatus(`Verification failed: ${String(err)}`);
      setSuccess(false);
    }
  }

  async function askAssistant() {
    const query = assistantInput.trim();
    if (!query) return;

    setAssistantInput("");
    setMessages((prev) => [...prev, { from: "user", text: query }]);

    try {
      const response = await fetch(`${BACKEND}/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "assistant failed");
      }

      const data = await response.json();
      setMessages((prev) => [...prev, { from: "bot", text: data.response ?? "No response" }]);
    } catch (err) {
      setMessages((prev) => [...prev, { from: "bot", text: `Error: ${String(err)}` }]);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      {isConfirmOpen ? (
        <section className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-lg p-4 md:p-5">
            <h2 className="text-2xl font-bold">Confirm Detected Items</h2>
            <p className="mt-1 text-sm text-ink/80">
              Please confirm the item and quantity before adding to cart.
            </p>

            <div className="mt-4 space-y-2">
              {pendingScanItems.map((item) => (
                <div
                  key={`pending-${item.class_name}`}
                  className="rounded-lg border border-ink/10 bg-white px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{item.name}</p>
                    <p className="font-bold">{item.price.toFixed(2)} THB</p>
                  </div>
                  {typeof item.max_confidence === "number" ? (
                    <p className="mt-1 text-xs text-ink/70">
                      Confidence: {(item.max_confidence * 100).toFixed(1)}%
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => adjustPendingQuantity(item.class_name, -1)}
                        className="rounded-md border border-ink/20 px-3 py-1 font-bold"
                      >
                        -
                      </button>
                      <span className="min-w-10 text-center font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => adjustPendingQuantity(item.class_name, 1)}
                        className="rounded-md border border-ink/20 px-3 py-1 font-bold"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-sm font-semibold">{item.line_total.toFixed(2)} THB</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-ink/10 bg-[#f7efe7] p-3">
              <p className="text-sm uppercase text-ink/70">This Scan Total</p>
              <p className="text-2xl font-bold">{pendingTotal.toFixed(2)} THB</p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={cancelPendingScan}
                className="w-full rounded-xl border border-ink/20 bg-white px-4 py-2 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={acceptPendingScan}
                disabled={pendingScanItems.length === 0}
                className="w-full rounded-xl bg-ember px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:bg-ember/60"
              >
                Accept To Cart
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mb-6 animate-rise rounded-3xl border border-ink/10 bg-[#fff4e6] p-5 md:p-7">
        <h1 className="text-3xl font-bold md:text-5xl">SnapCart</h1>
        <p className="mt-2 max-w-2xl text-sm md:text-base">
          BYOD grocery checkout using one camera snapshot, fast AI cart reading, and slip verification.
        </p>
      </section>

      {success ? (
        <section className="card mb-6 animate-pulseRing p-8 text-center">
          <h2 className="text-4xl font-extrabold text-ember md:text-6xl">PAID!</h2>
          <p className="mt-3 text-lg">Enjoy your shopping. Your checkout is complete.</p>
          <button
            onClick={() => setSuccess(false)}
            className="mt-6 rounded-xl bg-ink px-5 py-3 font-semibold text-sand"
          >
            Start New Cart
          </button>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="card animate-rise p-4 md:p-5">
          <h2 className="text-2xl font-bold">Scanner</h2>
          <p className="mb-3 mt-1 text-sm">{status}</p>
          <div className="relative overflow-hidden rounded-2xl border border-ink/10 bg-black">
            <video ref={videoRef} className="h-[340px] w-full object-cover md:h-[420px]" muted playsInline />
            <div className="pointer-events-none absolute inset-0 border-4 border-dashed border-sand/60" />
          </div>
          <canvas ref={canvasRef} className="hidden" />

          <button
            onClick={captureAndScan}
            disabled={!cameraReady || busy || isConfirmOpen}
            className="mt-4 w-full rounded-xl bg-ember px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-ember/60"
          >
            {busy ? "Scanning..." : "Scan Cart Snapshot"}
          </button>
        </section>

        <section className="card animate-rise p-4 md:p-5">
          <h2 className="text-2xl font-bold">Checkout</h2>
          <div className="mt-3 space-y-2">
            {cart.length === 0 ? <p className="text-sm">No items in cart yet.</p> : null}
            {cart.map((item) => (
              <div
                key={item.class_name}
                className="flex items-center justify-between rounded-lg border border-ink/10 bg-white px-3 py-2"
              >
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      onClick={() => adjustCartQuantity(item.class_name, -1)}
                      className="rounded-md border border-ink/20 px-2 py-0.5 text-sm font-bold"
                    >
                      -
                    </button>
                    <span className="min-w-8 text-center text-xs font-semibold">Qty {item.quantity}</span>
                    <button
                      onClick={() => adjustCartQuantity(item.class_name, 1)}
                      className="rounded-md border border-ink/20 px-2 py-0.5 text-sm font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
                <p className="font-bold">{item.line_total.toFixed(2)} THB</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-ink/10 bg-[#f7efe7] p-3">
            <p className="text-sm uppercase text-ink/70">Total</p>
            <p className="text-3xl font-bold">{total.toFixed(2)} THB</p>
          </div>

          <div className="mt-4 rounded-2xl border border-ink/10 bg-white p-3">
            <p className="font-semibold">PromptPay Mock QR</p>
            <svg viewBox="0 0 160 160" className="mt-2 w-full max-w-[220px] rounded-md border border-ink/20 bg-white">
              <rect x="0" y="0" width="160" height="160" fill="#fff" />
              <rect x="12" y="12" width="40" height="40" fill="#1f1a17" />
              <rect x="108" y="12" width="40" height="40" fill="#1f1a17" />
              <rect x="12" y="108" width="40" height="40" fill="#1f1a17" />
              <rect x="65" y="65" width="8" height="8" fill="#1f1a17" />
              <rect x="82" y="65" width="8" height="8" fill="#1f1a17" />
              <rect x="65" y="82" width="8" height="8" fill="#1f1a17" />
              <rect x="82" y="82" width="8" height="8" fill="#1f1a17" />
            </svg>
            <p className="mt-2 text-sm">Amount: {total.toFixed(2)} THB</p>
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-semibold">Upload Payment Slip</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadSlip(f);
              }}
              className="block w-full rounded-lg border border-ink/20 bg-white p-2 text-sm"
            />
          </label>
          {slipStatus ? <p className="mt-2 text-sm font-medium">{slipStatus}</p> : null}
        </section>
      </div>

      <section className="card mt-6 animate-rise p-4 md:p-5">
        <h2 className="text-2xl font-bold">Store Assistant</h2>
        <div className="mt-3 h-56 overflow-y-auto rounded-xl border border-ink/10 bg-white p-3">
          {messages.map((m, i) => (
            <div key={`${m.from}-${i}`} className={`mb-2 ${m.from === "user" ? "text-right" : "text-left"}`}>
              <span
                className={`inline-block max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  m.from === "user" ? "bg-ink text-sand" : "bg-[#f6eee4]"
                }`}
              >
                {m.text}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={assistantInput}
            onChange={(e) => setAssistantInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void askAssistant();
              }
            }}
            placeholder="Where can I find instant noodles?"
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
          />
          <button onClick={() => void askAssistant()} className="rounded-xl bg-mint px-4 py-2 font-bold text-ink">
            Send
          </button>
        </div>
      </section>
    </main>
  );
}
