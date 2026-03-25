// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from this file's directory (so it works regardless of cwd).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const port = Number(process.env.PORT || 3001); // 后端运行在 3001 端口，避开 Vite 的 3000

app.use(cors());
app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY;
const apiKeyPreview = apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : '(missing)';
console.log('[gemini-proxy] GEMINI_API_KEY:', apiKeyPreview);

// Here this is server-only. If apiKey is missing, we fail fast with a clear error.
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(apiKey) });
});

// Generic proxy for generateContent
app.post('/api/gemini/generate-content', async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY on server' });
    }
    const { model, contents, config } = req.body || {};
    if (!model || !contents) {
      return res.status(400).json({ error: 'Missing required fields: model, contents' });
    }
    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });
    res.json({ text: response.text });
  } catch (error) {
    console.error("Gemini generate-content proxy error:", error);
    res.status(500).json({ error: String(error) });
  }
});

// Generic proxy for embedContent
app.post('/api/gemini/embed-content', async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY on server' });
    }
    const { model, contents } = req.body || {};
    if (!model || !contents) {
      return res.status(400).json({ error: 'Missing required fields: model, contents' });
    }
    const response = await ai.models.embedContent({ model, contents });
    res.json({ embeddings: response.embeddings || [] });
  } catch (error) {
    console.error("Gemini embed-content proxy error:", error);
    res.status(500).json({ error: String(error) });
  }
});

app.listen(port, () => {
  console.log(`安全代理服务器已启动，监听端口: http://localhost:${port}`);
});