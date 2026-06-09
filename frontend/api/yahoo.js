// Vercel serverless function — proxies Yahoo Finance with no CORS issues
// Deployed at: /api/yahoo?path=/v8/finance/chart/NQ%3DF?interval=1d&range=5d

export default async function handler(req, res) {
  // CORS headers so the browser accepts the response
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { path } = req.query;
  if (!path) { res.status(400).json({ error: "Missing path" }); return; }

  const hosts = [
    "https://query1.finance.yahoo.com",
    "https://query2.finance.yahoo.com",
  ];

  for (const host of hosts) {
    try {
      const url = `${host}${path}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://finance.yahoo.com",
        },
      });

      if (!response.ok) continue;
      const data = await response.json();
      if (!data?.chart?.result?.[0]) continue;

      res.setHeader("Cache-Control", "s-maxage=8, stale-while-revalidate=30");
      res.status(200).json(data);
      return;
    } catch { continue; }
  }

  res.status(502).json({ error: "Yahoo Finance unavailable" });
}
