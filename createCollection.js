// createCollection.js
import { QdrantClient } from '@qdrant/js-client-rest';
import fs from 'fs';
import { pipeline as transformersPipeline } from '@xenova/transformers';

export const COLLECTION_NAME = "legal_documents";
export const qdrant = new QdrantClient({ host: "35.201.41.168", port: 6333 });

let embeddingPipeline = null;

export async function initializeEmbeddingModel() {
  if (embeddingPipeline) return embeddingPipeline;

  try {
    embeddingPipeline = await transformersPipeline(
      "feature-extraction",
      "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
    );
    console.log("✅ Embedding model initialized.");
    return embeddingPipeline;
  } catch (err) {
    console.error("❌ Failed to initialize embedding model:", err);
    throw new Error("Embedding model initialization failed");
  }
}


export async function setupCollection() {
  try {
    const collectionInfo = await qdrant.getCollection(COLLECTION_NAME);
    console.log("Collection already exists:", collectionInfo);
    return collectionInfo;
  } catch (err) {
    if (err.statusText.includes('Not Found')) {
      const newCollection = await qdrant.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 384,
          distance: "Cosine",
          on_disk: true
        }
      });
      console.log("Collection created:", newCollection);
      return newCollection;
    }
    throw err;
  }
}

export async function extractTextFromFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text;
  } catch (error) {
    console.error('Error reading text file:', error);
    throw new Error('Failed to read text file');
  }
}

export async function getEmbedding(text) {
  if (!embeddingPipeline) {
    await initializeEmbeddingModel();
  }

  try {
    const output = await embeddingPipeline(text, {
      pooling: "mean"
    });
    return Array.from(output.data);
  } catch (err) {
    console.error("Embedding generation error:", err);
    throw new Error("Failed to generate embedding");
  }
}