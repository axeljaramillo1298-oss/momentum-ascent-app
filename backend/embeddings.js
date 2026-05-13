const crypto = require("node:crypto");

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < len; i++) {
    const x = Number(a[i]) || 0;
    const y = Number(b[i]) || 0;
    dot += x * y;
    magA += x * x;
    magB += y * y;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (!denom) return 0;
  return dot / denom;
}

function findKNearest(queryEmbedding, allEmbeddings, k = 5) {
  if (!Array.isArray(queryEmbedding) || !Array.isArray(allEmbeddings)) return [];
  const top = Math.max(1, Number(k) || 5);
  const scored = allEmbeddings
    .map((entry) => {
      if (!entry || !Array.isArray(entry.embedding)) return null;
      return {
        pickId: entry.pickId,
        similarity: cosineSimilarity(queryEmbedding, entry.embedding),
      };
    })
    .filter(Boolean);
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, top);
}

async function generateEmbedding(text, options = {}) {
  const model = String(options.model || "text-embedding-3-small");
  const apiKey = String(options.apiKey || process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("openai_key_required");
  const input = String(text == null ? "" : text);
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input, model }),
  });
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      body = "";
    }
    throw new Error("embedding_failed: " + res.status + " " + String(body || "").slice(0, 200));
  }
  const data = await res.json();
  const embedding = data && data.data && data.data[0] ? data.data[0].embedding : null;
  if (!Array.isArray(embedding)) {
    throw new Error("embedding_failed: invalid_response");
  }
  return embedding;
}

function hashText(text) {
  return crypto
    .createHash("sha256")
    .update(String(text || ""))
    .digest("hex")
    .slice(0, 16);
}

module.exports = { cosineSimilarity, findKNearest, generateEmbedding, hashText };
