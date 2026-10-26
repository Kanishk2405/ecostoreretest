const MODEL_CASCADE = [
  "gemini-1.5-flash",
  "gemini-1.5-pro"
];
const DEFAULT_MODEL = "gemini-1.5-flash";

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

  const modelsToTry = [...MODEL_CASCADE];

  let lastStatus = 502;
  let lastMsg = "";
  for (const candidateModel of modelsToTry) {
    const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(candidateModel) + ":generateContent";
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: body.contents,
          ...(body.systemInstruction ? { systemInstruction: body.systemInstruction } : {}),
          ...(body.generationConfig ? { generationConfig: body.generationConfig } : {})
        })
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim() || "";
        return res.status(200).json({ ok: true, source: "gemini", model: candidateModel, text, candidates: data.candidates });
      }
      lastStatus = r.status;
      lastMsg = data?.error?.message || ("Gemini HTTP " + r.status);
      if (r.status === 404 || /no longer available|not found|not supported/i.test(lastMsg)) continue;
      break;
    } catch (err) {
      return res.status(502).json({ ok: false, errorCode: "NETWORK_ERROR", message: "Failed to reach Gemini API." });
    }
  }
  return res.status(lastStatus).json({
    ok: false,
    errorCode: lastStatus === 429 ? "QUOTA_EXCEEDED" : "UPSTREAM_" + lastStatus,
    message: lastMsg || ("Gemini HTTP " + lastStatus)
  });
}
