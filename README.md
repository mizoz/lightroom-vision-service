# Lightroom Vision Service

> Local HTTP service that provides AI vision analysis for Lightroom photos using Alibaba Cloud's Coding Plan (Qwen-VL / Kimi-K2.5).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

## 🔐 Security-First Architecture

This service is designed with security as the top priority:

```
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR LOCAL MACHINE                           │
│                                                                 │
│  ┌──────────────┐         ┌─────────────────┐                  │
│  │   Lightroom  │ ──────▶ │  Vision Service │                  │
│  │   Plugin     │  :3456  │  (localhost)    │                  │
│  │  (NO KEY)    │         │  (HOLDS KEY)    │                  │
│  └──────────────┘         └────────┬────────┘                  │
│                                    │                            │
└────────────────────────────────────┼────────────────────────────┘
                                     │ HTTPS
                                     ▼
                          ┌─────────────────────┐
                          │  Alibaba Cloud      │
                          │  Coding Plan API    │
                          │  (Qwen-VL / Kimi)   │
                          └─────────────────────┘
```

### Why This Design?

| Component | Security Benefit |
|-----------|------------------|
| **Plugin has NO API key** | Even if plugin is compromised, key is safe |
| **Service on localhost only** | No external access, firewall-protected |
| **Key in `.env` only** | Never committed to git, never logged |
| **Coding Plan compliance** | Service is the "coding tool" (allowed), not the plugin |

### Security Checklist

- ✅ API key stored in `.env` (gitignored)
- ✅ No keys in source code, logs, or error messages
- ✅ Localhost-only binding (127.0.0.1)
- ✅ Input validation on all endpoints
- ✅ SQLite cache stays local
- ✅ No photo data persisted (only hashes + results)

---

## Features

| Feature | Description |
|---------|-------------|
| **Alt Text** | Accessibility-focused image descriptions |
| **Keywords** | Search-optimized tags for organization |
| **Captions** | Engaging photo captions |
| **Smart Caching** | SQLite cache prevents re-processing (saves quota) |
| **Usage Tracking** | Monitor API calls, cache hit rates |
| **Batch Processing** | Analyze hundreds of photos efficiently |

---

## Quick Start

### 1. Install

```bash
git clone https://github.com/mizoz/lightroom-vision-service.git
cd lightroom-vision-service
npm install
```

### 2. Configure

```bash
cp .env.example .env
nano .env  # Add your API key
```

**Get your API key:**
1. Go to [Alibaba Cloud Model Studio](https://modelstudio.console.alibabacloud.com/)
2. Subscribe to **Coding Plan Lite** ($3 first month)
3. Copy your key (format: `sk-sp-xxxxx`)
4. Paste into `.env`

### 3. Run

```bash
npm start
```

Service runs on `http://localhost:3456`

---

## API Reference

### Health Check

```bash
GET http://localhost:3456/health
```

### Analyze Single Image

```bash
POST http://localhost:3456/api/v1/analyze
Content-Type: application/json

{
  "image": "base64_encoded_jpeg",
  "promptType": "alt_text",
  "useCache": true
}
```

**Response:**
```json
{
  "success": true,
  "cached": false,
  "data": {
    "alt_text": "A person hiking on a mountain trail...",
    "keywords": ["hiking", "mountain", "outdoor"],
    "model_used": "qwen3.5-plus",
    "processing_time_ms": 2340
  }
}
```

### Batch Analysis

```bash
POST http://localhost:3456/api/v1/analyze/batch
Content-Type: application/json

{
  "images": ["base64_1", "base64_2", "..."],
  "promptType": "alt_text"
}
```

### Usage Statistics

```bash
GET http://localhost:3456/api/v1/stats
```

**Response:**
```json
{
  "today": {
    "requests": 47,
    "cache_hits": 35,
    "cache_hit_rate": "74.5%",
    "avg_processing_time_ms": 2890
  },
  "cache": {
    "total_cached": 312
  }
}
```

### Clear Cache

```bash
# Clear all
DELETE http://localhost:3456/api/v1/cache

# Clear old (older than 7 days)
DELETE http://localhost:3456/api/v1/cache?olderThanDays=7
```

---

## Configuration

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `ALIBABA_API_KEY` | — | ✅ | Your Coding Plan API key |
| `ALIBABA_BASE_URL` | `https://coding-intl.dashscope.aliyuncs.com/apps/anthropic` | ✅ | Coding Plan endpoint |
| `VISION_MODEL` | `qwen3.5-plus` | — | Model to use |
| `PORT` | `3456` | — | Service port |
| `DEBUG` | `false` | — | Enable debug logging |

### Available Models (Coding Plan)

| Model | Best For | Speed | Quota |
|-------|----------|-------|-------|
| `qwen3.5-plus` | General vision, alt text | Fast | Medium |
| `kimi-k2.5` | Detailed analysis | Medium | Medium-High |
| `glm-5` | Simple tasks | Fastest | Low |

---

## Prompt Types

| Type | Output | Use Case |
|------|--------|----------|
| `alt_text` | Accessibility description | WCAG compliance |
| `keywords` | Comma-separated tags | Search/organization |
| `caption` | 1-2 sentence caption | Social media, albums |
| `detailed` | Full analysis with sections | Archives, catalogs |

---

## Caching Strategy

### How It Works

1. Image is hashed (SHA256) before processing
2. Hash + prompt type = cache key
3. Results stored in SQLite (`data/vision-cache.db`)
4. Subsequent requests for same image hit cache (instant)

### Benefits

| Metric | Without Cache | With Cache |
|--------|---------------|------------|
| API calls | 1 per photo | 1 per unique photo |
| Response time | 3-5 seconds | <1 second |
| Quota usage | High | 80-90% lower |

### Cache Management

```bash
# View stats
curl http://localhost:3456/api/v1/stats

# Clear old entries (older than 7 days)
curl -X DELETE "http://localhost:3456/api/v1/cache?olderThanDays=7"

# Clear all
curl -X DELETE http://localhost:3456/api/v1/cache
```

---

## Quota & Pricing (Coding Plan Lite)

| Period | Quota | Cost |
|--------|-------|------|
| First month | 18,000 requests | $3 |
| Renewal | 18,000 requests | $5/month |

### Real-World Usage

| Scenario | Photos/Month | Quota Used |
|----------|--------------|------------|
| Light user | 500 | ~5% |
| Moderate | 2,000 | ~20% |
| Heavy | 5,000 | ~50% |

**Note:** With caching enabled, similar photos (duplicates, bursts) don't consume additional quota.

---

## Troubleshooting

### Service Won't Start

```bash
# Check .env exists
ls -la .env

# Verify Node version (18+)
node --version

# Check port availability
netstat -tlnp | grep 3456
```

### "API Key Not Configured"

```bash
# Verify key is set
grep ALIBABA_API_KEY .env

# Restart after editing .env
npm start
```

### High Latency

- **First call:** 3-5s (normal, API round-trip)
- **Cached calls:** <1s
- **Consistently slow:** Check network, API quota status

### API Errors

Check logs for details. Common issues:

| Error | Cause | Fix |
|-------|-------|-----|
| Invalid API key | Wrong format or expired | Verify `sk-sp-xxxxx` format |
| Wrong endpoint | Using pay-as-you-go URL | Use Coding Plan URL |
| Quota exceeded | Monthly limit reached | Wait or upgrade plan |

---

## Development

```bash
# Run with auto-reload
npm run dev

# View logs
tail -f logs/*.log  # if logging enabled
```

---

## Related Projects

- [Lightroom Vision Plugin](https://github.com/mizoz/lightroom-vision-plugin) — Lightroom Classic integration
- [Complete Setup Guide](https://github.com/mizoz/lightroom-vision-plugin/blob/main/SETUP.md) — End-to-end instructions

---

## License

MIT — See [LICENSE](LICENSE) for details.

---

## Security Note

**Never commit `.env` to git.** The `.gitignore` file excludes it by default. If you accidentally commit a key:

1. Rotate it immediately in Alibaba Cloud console
2. Remove from git history: `git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch .env' --prune-empty --tag-name-filter cat -- --all`
3. Push: `git push origin --force --all`
