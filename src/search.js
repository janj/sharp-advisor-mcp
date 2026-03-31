/**
 * TF-IDF search over the Sharp corpus.
 * Built in-memory at startup — corpus is small enough (~409 chunks) to fit easily.
 */

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
  'the','and','for','are','but','not','you','all','any','can','had','her',
  'was','one','our','out','day','get','has','him','his','how','its','may',
  'new','now','old','see','two','way','who','boy','did','its','let','put',
  'say','she','too','use','that','this','with','have','from','they','been',
  'more','will','also','than','then','when','what','some','into','only',
  'such','their','which','would','there','could','other','these','those',
  'about','after','being','each','much','most','must','over','same','very',
  'were','well','just','even','back','many','made','where','through',
]);

export function buildIndex(chunks) {
  // Compute document frequencies
  const df = new Map();
  const tokenizedChunks = chunks.map(chunk => {
    const tokens = tokenize(chunk.text + ' ' + chunk.chapter);
    const termSet = new Set(tokens);
    for (const term of termSet) {
      df.set(term, (df.get(term) || 0) + 1);
    }
    return tokens;
  });

  const N = chunks.length;

  // Compute TF-IDF vectors (sparse)
  const vectors = tokenizedChunks.map(tokens => {
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    const vec = new Map();
    for (const [term, count] of tf) {
      const idf = Math.log((N + 1) / ((df.get(term) || 0) + 1));
      vec.set(term, (count / tokens.length) * idf);
    }
    return vec;
  });

  return { vectors, df, N };
}

export function search(query, chunks, index, limit = 5) {
  const { vectors, df, N } = index;
  const qTokens = tokenize(query);

  if (qTokens.length === 0) return [];

  // Build query vector
  const qTf = new Map();
  for (const t of qTokens) qTf.set(t, (qTf.get(t) || 0) + 1);
  const qVec = new Map();
  for (const [term, count] of qTf) {
    const idf = Math.log((N + 1) / ((df.get(term) || 0) + 1));
    qVec.set(term, (count / qTokens.length) * idf);
  }

  // Cosine similarity
  const scores = vectors.map((docVec, i) => {
    let dot = 0, docNorm = 0, qNorm = 0;
    for (const [term, qW] of qVec) {
      const dW = docVec.get(term) || 0;
      dot += qW * dW;
    }
    for (const w of docVec.values()) docNorm += w * w;
    for (const w of qVec.values()) qNorm += w * w;
    const sim = (docNorm && qNorm) ? dot / (Math.sqrt(docNorm) * Math.sqrt(qNorm)) : 0;
    return { index: i, score: sim };
  });

  return scores
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => ({
      source: chunks[s.index].title,
      chapter: chunks[s.index].chapter,
      text: chunks[s.index].text,
      relevance_score: Math.round(s.score * 1000) / 1000,
    }));
}
