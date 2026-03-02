# Lightroom Vision Service

Local HTTP service that provides AI vision analysis for Lightroom photos using Alibaba Cloud's Coding Plan (Qwen-VL / Kimi-K2.5).

## Features

- **Alt Text Generation** - Accessibility-focused image descriptions
- **Keyword Extraction** - Search-optimized tags for photo organization
- **Caption Writing** - Engaging photo captions
- **Detailed Analysis** - Comprehensive image breakdown
- **Smart Caching** - SQLite cache prevents re-processing same photos
- **Usage Tracking** - Monitor API usage and cache hit rates

## Why This Architecture?

Alibaba's Coding Plan terms restrict usage to "coding tools" like OpenClaw. This service acts as the bridge:

```
Lightroom Plugin → localhost:3456 → Alibaba Coding Plan API
```

The service (not the plugin) holds the API key and makes compliant API calls.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your Alibaba Cloud Coding Plan API key:

```env
ALIBABA_API_KEY=sk-sp-xxxxx
ALIBABA_BASE_URL=https://coding-intl.dashscope.aliyuncs.com/apps/anthropic
VISION_MODEL=qwen3.5-plus
PORT=3456
```

### 3. Get Your API Key

1. Go to [Alibaba Cloud Model Studio Console](https://modelstudio.console.alibabacloud.com/)
2. Subscribe to Coding Plan (Lite: $3 first month)
3. Get your exclusive API key from the Coding Plan page
4. **Important:** Use the Coding Plan endpoint, not the pay-as-you-go endpoint

### 4. Start the Service

```bash
npm start
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/v1/analyze` | POST | Single image analysis |
| `/api/v1/analyze/batch` | POST | Batch analysis |
| `/api/v1/stats` | GET | Usage statistics |
| `/api/v1/cache` | DELETE | Clear cache |

### Example: Analyze Image

```bash
curl -X POST http://localhost:3456/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "image": "base64_encoded_image_data",
    "promptType": "alt_text",
    "useCache": true
  }'
```

### Response

```json
{
  "success": true,
  "cached": false,
  "data": {
    "alt_text": "A person hiking on a mountain trail...",
    "keywords": ["hiking", "mountain", "trail", "outdoor"],
    "model_used": "qwen3.5-plus",
    "processing_time_ms": 2340
  }
}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ALIBABA_API_KEY` | (required) | Your Coding Plan API key |
| `ALIBABA_BASE_URL` | `https://coding-intl.dashscope.aliyuncs.com/apps/anthropic` | API endpoint |
| `VISION_MODEL` | `qwen3.5-plus` | Model to use |
| `PORT` | `3456` | Service port |
| `DEBUG` | `false` | Enable debug logging |

## Available Models (Coding Plan)

| Model | Best For | Quota Usage |
|-------|----------|-------------|
| `qwen3.5-plus` | General vision, alt text | Medium |
| `kimi-k2.5` | Detailed analysis | Medium-High |
| `glm-5` | Fast, simple tasks | Low |

## Caching

- Images are hashed (SHA256) before caching
- Cache is stored in `data/vision-cache.db` (SQLite)
- Cache entries include: image hash, prompt type, result, model used
- Clear cache: `DELETE /api/v1/cache?olderThanDays=7`

## Usage Stats

```bash
curl http://localhost:3456/api/v1/stats
```

Returns today's requests, cache hit rate, and average processing time.

## Security

- **No API key in Lightroom plugin** - Key stays in service's `.env`
- **Localhost only** - Service binds to 127.0.0.1 by default
- **No logging of sensitive data** - API keys never logged
- **Input validation** - Base64 images validated before processing

## Troubleshooting

### "Cannot connect to service"

1. Check service is running: `curl http://localhost:3456/health`
2. Check port isn't blocked: `netstat -tlnp | grep 3456`
3. Restart service: `npm start`

### "API key not configured"

1. Verify `.env` file exists (not `.env.example`)
2. Check `ALIBABA_API_KEY` is set correctly
3. Restart service after editing `.env`

### "Invalid response from Vision Service"

1. Check API key is valid (Coding Plan, not pay-as-you-go)
2. Verify endpoint URL matches Coding Plan format
3. Check model is available in your plan

## License

MIT

## Related

- [Lightroom Vision Plugin](../lightroom-vision-plugin) - Lightroom Classic plugin
