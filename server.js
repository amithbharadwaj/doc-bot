import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { QdrantClient } from '@qdrant/js-client-rest';
import { pipeline as transformersPipeline } from '@xenova/transformers';
import path from 'path';
import { fileURLToPath } from 'url';

// Initialize Express app
const app = express();

// Configure __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });
const COLLECTION_NAME = "legal_documents";

// Initialize Qdrant client
const qdrant = new QdrantClient({ host: "localhost", port: 6333 });

// Initialize MULTILINGUAL embedding model
let embeddingPipeline;
(async () => {
  try {
    embeddingPipeline = await transformersPipeline(
      "feature-extraction",
      "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
    );
    console.log("Multilingual model ready");
  } catch (err) {
    console.error("Failed to initialize model:", err);
    process.exit(1);
  }
})();

// Create collection if not exists
async function setupCollection() {
  try {
    await qdrant.getCollection(COLLECTION_NAME);
    console.log("Collection already exists");
  } catch {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: { size: 384, distance: "Cosine" }
    });
    console.log("Collection created");
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

app.get('/generateImage', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) throw new Error("Query parameter is required");

    // Hardcoded Bearer token
    const authToken = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjQzNSwidXNlck5hbWUiOiI5OTkqKioqOTk5MyIsInJvbGUiOjUsImlhdCI6MTc0MzUxODg3NiwiZXhwIjoxNzQ0MTIzNjc2fQ.3d-RFe6qHb_QqOGlNlKRCTPHPo4C1U-8FJOdUJlT_zw";

    // 1. Get magic prompt first
    const promptResponse = await fetch('http://58.61.147.179:58109/magic_prompt/generate/', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text_instruction: query,
        ref_image_url: "",
        user_locale: "en"
      })
    });

    const promptData = await promptResponse.json();

    // 2. Prepare and call image generation API
    const template = promptData.template || {
      category_id: "61",
      camera_id: "10",
      style_id: "1",
      atmosphere_id: "1",
      graphics_id: "1"
    };

    const imageGenPayload = {
      projectId: 4228,
      designLibraryName: "Architecture",
      designLibraryId: 31,
      firstTierName: "Social Spaces",
      firstTierId: 2002,
      secondTierName: "Outdoor Market",
      secondTierId: 2017,
      styleId: parseInt(template.style_id),
      orientation: 0,
      imageRatio: 0,
      cameraViewName: "general",
      cameraViewId: parseInt(template.camera_id),
      atmosphereId: parseInt(template.atmosphere_id),
      language: "en",
      teamId: 206,
      imageCount: 1,
      additionalPrompt: promptData.positive_prompt,
      additionalNegativePrompt: promptData.negative_prompt || "",
      privateModel: "",
      referenceImage: [],
      graphicStyleId: parseInt(template.graphics_id),
      seed: -1
    };

    // Call image generation API with authorization
    const imageResponse = await fetch('https://aigc.airilab.net:58013/api/GenerateWorkflow/Text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': authToken
      },
      body: JSON.stringify(imageGenPayload)
    });

    // Process event stream to get generation ID
    let generationId = null;
    const reader = imageResponse.body.getReader();
    const decoder = new TextDecoder();
    let responseText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      responseText += chunk;

      // Check for API Complete message to extract generationId
      const completeMatch = chunk.match(/API Complete,id:([a-f0-9-]+),projectName:(\d+)/);
      if (completeMatch) {
        generationId = completeMatch[1];
        break;
      }
    }

    if (!generationId) {
      throw new Error("Failed to get generation ID from image generation API");
    }

    // 3. Get final image results with authorization
    const resultPayload = {
      projectId: 4228,
      language: "en",
      desiredGenerationId: generationId,
      teamId: 206
    };

    const resultResponse = await fetch('https://aigc.airilab.net:58013/api/CrudRouters/getOneRecord', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authToken
      },
      body: JSON.stringify(resultPayload)
    });

    const resultData = await resultResponse.json();

    // Validate the response structure
    if (!resultData.data.projectGenerationModel ||
      !resultData.data.projectGenerationModel[0] ||
      !resultData.data.projectGenerationModel[0].projectMedias ||
      !resultData.data.projectGenerationModel[0].projectMedias[0]) {
      throw new Error("Invalid response structure from image generation API");
    }

    const mediaItem = resultData.data.projectGenerationModel[0].projectMedias[0];

    // 4. Return final response with proper error handling
    res.json({
      status: "success",
      original_query: query,
      generation_id: generationId,
      image_url: mediaItem.url || null,
      thumbnail_url: mediaItem.thumbnail || null,
      prompts: mediaItem.prompts || "No prompt information available",
      style: mediaItem.style || "Unknown",
      camera: mediaItem.camera || "Unknown",
      full_response: resultData
    });

  } catch (err) {
    console.error("Image generation error:", err);
    res.status(500).json({
      status: "error",
      error: err.message,
      details: "Failed to complete image generation workflow",
      generation_id: generationId || null,
      original_query: query || null
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = 8080;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));