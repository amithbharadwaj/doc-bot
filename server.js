const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { pipeline: transformersPipeline } = require('@xenova/transformers');

const app = express();
const upload = multer({ dest: 'uploads/' });
const COLLECTION_NAME = "legal_documents";

// Initialize Qdrant client
const qdrant = new QdrantClient({ host: "localhost", port: 6333 });

// Initialize text embedding model
// let embeddingPipeline;
// (async () => {
//   try {
//     embeddingPipeline = await transformersPipeline(
//       "feature-extraction",
//       "Xenova/all-MiniLM-L6-v2"
//     );
//     console.log("Embedding model loaded successfully");
//   } catch (err) {
//     console.error("Failed to load embedding model:", err);
//     process.exit(1);
//   }
// })();

// Initialize MULTILINGUAL embedding model
let embeddingPipeline;
(async () => {
  embeddingPipeline = await transformersPipeline(
    "feature-extraction",
    "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
  );
  console.log("Multilingual model ready");
})();

// Create collection if not exists
async function setupCollection() {
  try {
    await qdrant.getCollection(COLLECTION_NAME);
  } catch {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: { size: 384, distance: "Cosine" }
    });
  }
}
setupCollection();

// Extract text from TXT file
async function extractTextFromFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text;
  } catch (error) {
    console.error('Error reading text file:', error);
    throw new Error('Failed to read text file');
  }
}

// Generate embeddings
async function getEmbedding(text) {
  if (!embeddingPipeline) {
    throw new Error("Embedding model not initialized");
  }
  const output = await embeddingPipeline(text, { pooling: 'mean' });
  return Array.from(output.data);
}

// Routes
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) throw new Error("No file uploaded");
    
    const fileExt = req.file.originalname.split('.').pop().toLowerCase();
    if (fileExt !== 'txt') {
      throw new Error("Only TXT files are allowed");
    }

    const text = await extractTextFromFile(req.file.path);
    const embedding = await getEmbedding(text);
    const docId = uuidv4();

    await qdrant.upsert(COLLECTION_NAME, {
      points: [{
        id: docId,
        vector: embedding,
        payload: {
          text: text,
          filename: req.file.originalname
        }
      }]
    });

    res.json({
      status: "success",
      doc_id: docId,
      filename: req.file.originalname,
      text_length: text.length
    });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (req.file?.path) fs.unlinkSync(req.file.path);
  }
});

app.get('/search', async (req, res) => {
  try {
    const { query, top_k = 1 } = req.query;
    if (!query) throw new Error("Query parameter is required");

    const embedding = await getEmbedding(query);
    const results = await qdrant.search(COLLECTION_NAME, {
      vector: embedding,
      limit: parseInt(top_k)
    });

    res.json({
      query: query,
      results: results.map(hit => ({
        score: hit.score,
        text: hit.payload.text,
        filename: hit.payload.filename || "unknown"
      }))
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(8080, () => console.log('Server running on http://localhost:8080'));
