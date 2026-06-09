// Vercel serverless function — server-side Yahoo Finance proxy (no CORS)
// Route: GET /api/yahoo?path=/v8/finance/chart/NQ%3DF%3Finterval%3D60m%26range%3D2d

const https = require("https");

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://finance.yahoo.com/",
        "Origin": "https://finance.yahoo.com",
      },
    };
    const req = https.get(url, options, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          reject(new Error(`Invalid JSON (status ${res.statusCode}): ${body.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=8, stale-while-revalidate=15");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  let { path } = req.query;
  if (!path) {
    res.status(400).json({ error: "Missing ?path= param" });
    return;
  }

  // path arrives as a string like "/v8/finance/chart/NQ%3DF?interval=60m&range=2d"
  // Make sure it starts with /
  if (!path.startsWith("/")) path = "/" + path;

  const hosts = [
    "https://query1.finance.yahoo.com",
    "https://query2.finance.yahoo.com",
  ];

  for (const host of hosts) {
    try {
      const url = `${host}${path}`;
      const { status, data } = await httpsGet(url);
      if (status === 200 && data?.chart?.result?.[0]) {
        res.status(200).json(data);
        return;
      }
    } catch (err) {
      // try next host
    }
  }

  res.status(502).json({ error: "Yahoo Finance unavailable — both hosts failed" });
};
