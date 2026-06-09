// Vercel serverless function — server-side Yahoo Finance proxy (no CORS)
// Route: GET /api/yahoo?path=/v8/finance/chart/NQ%3DF%3Finterval%3D60m%26range%3D2d

const https = require("https");

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0",
        "Accept": "application/json, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://finance.yahoo.com/",
      },
    };
    https.get(url, options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { reject(new Error("Invalid JSON")); }
      });
    }).on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { path } = req.query;
  if (!path) { res.status(400).json({ error: "Missing path param" }); return; }

  const hosts = [
    "https://query1.finance.yahoo.com",
    "https://query2.finance.yahoo.com",
  ];

  for (const host of hosts) {
    try {
      const url = `${host}${path}`;
      const { status, data } = await httpsGet(url);
      if (status !== 200 || !data?.chart?.result?.[0]) continue;
      res.setHeader("Cache-Control", "s-maxage=8, stale-while-revalidate=15");
      res.status(200).json(data);
      return;
    } catch { continue; }
  }

  res.status(502).json({ error: "Yahoo Finance unavailable" });
};
