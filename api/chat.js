const STRICT_MODEL = "gemini-3.5-flash-lite";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, errorCode: "METHOD_NOT_ALLOWED", message: "Use POST /api/chat" });
  }

  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GeminiAPIKey ||
    process.env.GOOGLE_API_KEY ||
    ""
  ).trim();

  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      errorCode: "MISSING_API_KEY",
      message: "GEMINI_API_KEY is not set in Vercel Environment Variables."
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body || "{}"); } catch { body = {}; }
  }
  body = body || {};

  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(STRICT_MODEL) +
    ":generateContent";

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: body.contents,
        ...(body.systemInstruction ? { systemInstruction: body.systemInstruction } : {}),
        ...(body.generationConfig ? { generationConfig: body.generationConfig } : {})
      })
    });

    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      const text =
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "";
      return res.status(200).json({
        ok: true,
        source: "gemini",
        model: STRICT_MODEL,
        text,
        candidates: data.candidates
      });
    }

    const errMsg = data?.error?.message || `Gemini HTTP ${r.status}`;
    return res.status(r.status).json({
      ok: false,
      errorCode: r.status === 429 ? "QUOTA_EXCEEDED" : `UPSTREAM_${r.status}`,
      message: errMsg
    });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      errorCode: "NETWORK_ERROR",
      message: "Failed to reach Gemini 3.5 Flash-Lite API."
    });
  }
}
