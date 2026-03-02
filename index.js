const express = require('express');
const Database = require('better-sqlite3');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3456;
const DEBUG = process.env.DEBUG === 'true';

// Middleware
app.use(express.json({ limit: '50mb' }));

// Logging middleware (sanitized)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Initialize SQLite database
const dbPath = path.join(__dirname, 'data', 'vision-cache.db');
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_hash TEXT UNIQUE NOT NULL,
    prompt_type TEXT NOT NULL,
    alt_text TEXT,
    keywords TEXT,
    model_used TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_hash TEXT,
    prompt_type TEXT,
    model_used TEXT,
    cache_hit INTEGER,
    duration_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_cache_hash ON cache(image_hash);
  CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_log(created_at);
`);

// Simple hash function for image caching
function hashImage(base64Image) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(base64Image).digest('hex').substring(0, 16);
}

// Prompts for different photo types
const PROMPTS = {
  alt_text: `You are an expert at writing alt text for images for accessibility purposes. Your job is to receive an image and write a short alt text that describes its contents objectively.

<instructions>
  - Keep the description factual and objective. Omit subjective details such as the mood of the image.
  - Use present participles (verbs ending in -ing) without auxiliary verbs when describing actions (for example, "a dog running on the beach," not "a dog runs on the beach").
  - Do not specify if the image is in color or black and white.
  - Follow Chicago Manual of Style 18 conventions.
  - The alt text must be less than 1,000 characters.
  - Output ONLY the alt text itself with no preamble, explanation, or additional text.
</instructions>`,

  keywords: `Analyze this image and extract 10-15 relevant keywords or short phrases that would help someone find this photo in a search. Include:
- Main subjects and objects
- Location/setting (if visible)
- Activities or actions
- Style/genre (e.g., portrait, landscape, macro)
- Time indicators (season, time of day) if relevant

Output ONLY a comma-separated list of keywords, no numbering, no explanations.`,

  caption: `Write a concise, engaging caption for this photo (1-2 sentences). Include:
- What's happening in the image
- Context that adds interest
- Factual details only (no speculation)

Output ONLY the caption text.`,

  detailed: `Provide a comprehensive analysis of this image including:
1. Main subject and composition
2. Setting and context
3. Lighting and mood
4. Technical aspects (focus on what's visible, not camera settings)
5. Suggested keywords (comma-separated)

Format your response with clear sections. Be thorough but concise.`
};

// Cache functions
function getCached(imageHash, promptType) {
  const stmt = db.prepare('SELECT * FROM cache WHERE image_hash = ? AND prompt_type = ?');
  return stmt.get(imageHash, promptType);
}

function setCache(imageHash, promptType, altText, keywords, model) {
  const stmt = db.prepare(`
    INSERT INTO cache (image_hash, prompt_type, alt_text, keywords, model_used)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(image_hash, prompt_type) DO UPDATE SET
      alt_text = excluded.alt_text,
      keywords = excluded.keywords,
      model_used = excluded.model_used,
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(imageHash, promptType, altText, keywords, model);
}

function logUsage(imageHash, promptType, model, cacheHit, duration) {
  const stmt = db.prepare(`
    INSERT INTO usage_log (image_hash, prompt_type, model_used, cache_hit, duration_ms)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(imageHash, promptType, model, cacheHit ? 1 : 0, duration);
}

// Vision API call
async function callVisionAPI(imageBase64, promptType, model) {
  const apiKey = process.env.ALIBABA_API_KEY;
  const baseUrl = process.env.ALIBABA_BASE_URL;
  
  if (!apiKey) {
    throw new Error('ALIBABA_API_KEY not configured');
  }

  const prompt = PROMPTS[promptType] || PROMPTS.alt_text;
  
  const payload = {
    model: model || process.env.VISION_MODEL || 'qwen3.5-plus',
    max_tokens: promptType === 'keywords' ? 200 : 500,
    messages: [
      {
        role: 'system',
        content: prompt
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`
            }
          },
          {
            type: 'text',
            text: promptType === 'alt_text' 
              ? 'Generate alt text for this image.'
              : promptType === 'keywords'
              ? 'Extract keywords from this image.'
              : promptType === 'caption'
              ? 'Write a caption for this image.'
              : 'Analyze this image in detail.'
          }
        ]
      }
    ]
  };

  const startTime = Date.now();
  
  const response = await axios.post(baseUrl, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    timeout: 30000
  });

  const duration = Date.now() - startTime;
  
  if (DEBUG) {
    console.log(`API call completed in ${duration}ms`);
  }

  return {
    text: response.data.content?.[0]?.text || response.data.choices?.[0]?.message?.content || '',
    duration
  };
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Main vision analysis endpoint
app.post('/api/v1/analyze', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { image, promptType = 'alt_text', model, useCache = true } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'Image (base64) is required' });
    }

    const imageHash = hashImage(image);
    
    // Check cache first
    if (useCache) {
      const cached = getCached(imageHash, promptType);
      if (cached) {
        logUsage(imageHash, promptType, cached.model_used, true, 0);
        return res.json({
          success: true,
          cached: true,
          data: {
            alt_text: cached.alt_text,
            keywords: cached.keywords ? cached.keywords.split(',').map(k => k.trim()) : []
          }
        });
      }
    }

    // Call vision API
    const result = await callVisionAPI(image, promptType, model);
    
    // Extract alt text and keywords based on prompt type
    let altText = '';
    let keywords = [];
    
    if (promptType === 'keywords') {
      keywords = result.text.split(',').map(k => k.trim()).filter(k => k);
      altText = ''; // Will need separate call for alt text
    } else if (promptType === 'alt_text') {
      altText = result.text.trim();
    } else {
      altText = result.text.trim();
    }

    // Cache the result
    setCache(imageHash, promptType, altText, keywords.join(','), model || process.env.VISION_MODEL);
    
    // Log usage
    logUsage(imageHash, promptType, model || process.env.VISION_MODEL, false, result.duration);

    res.json({
      success: true,
      cached: false,
      data: {
        alt_text: altText,
        keywords: keywords,
        model_used: model || process.env.VISION_MODEL,
        processing_time_ms: result.duration
      }
    });

  } catch (error) {
    console.error('Vision analysis error:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Vision analysis failed'
    });
  }
});

// Batch analysis endpoint (for multiple photos)
app.post('/api/v1/analyze/batch', async (req, res) => {
  try {
    const { images, promptType = 'alt_text', model } = req.body;
    
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ error: 'images array is required' });
    }

    const results = [];
    
    for (const image of images) {
      try {
        const response = await axios.post(`http://localhost:${PORT}/api/v1/analyze`, {
          image,
          promptType,
          model,
          useCache: true
        });
        results.push({ success: true, ...response.data });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }

    res.json({
      success: true,
      total: images.length,
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });

  } catch (error) {
    console.error('Batch analysis error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Usage stats endpoint
app.get('/api/v1/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  
  const todayStats = db.prepare(`
    SELECT 
      COUNT(*) as total_requests,
      SUM(cache_hit) as cache_hits,
      AVG(duration_ms) as avg_duration
    FROM usage_log 
    WHERE DATE(created_at) = ?
  `).get(today);

  const cacheStats = db.prepare(`
    SELECT COUNT(*) as cached_images FROM cache
  `).get();

  res.json({
    success: true,
    today: {
      requests: todayStats.total_requests || 0,
      cache_hits: todayStats.cache_hits || 0,
      cache_hit_rate: todayStats.total_requests > 0 
        ? ((todayStats.cache_hits / todayStats.total_requests) * 100).toFixed(1) + '%' 
        : '0%',
      avg_processing_time_ms: Math.round(todayStats.avg_duration || 0)
    },
    cache: {
      total_cached: cacheStats.cached_images || 0
    }
  });
});

// Clear cache endpoint
app.delete('/api/v1/cache', (req, res) => {
  const { olderThanDays } = req.query;
  
  if (olderThanDays) {
    const stmt = db.prepare(`
      DELETE FROM cache WHERE created_at < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(olderThanDays);
    res.json({ success: true, deleted: result.changes });
  } else {
    db.exec('DELETE FROM cache');
    res.json({ success: true, message: 'Cache cleared' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║     Lightroom Vision Service                           ║
║     Running on http://localhost:${PORT}                   ║
║                                                        ║
║     Endpoints:                                         ║
║     GET  /health          - Health check               ║
║     POST /api/v1/analyze  - Single image analysis      ║
║     POST /api/v1/analyze/batch - Batch analysis        ║
║     GET  /api/v1/stats    - Usage statistics           ║
║     DELETE /api/v1/cache  - Clear cache                ║
╚════════════════════════════════════════════════════════╝
  `);
});
