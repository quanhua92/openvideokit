# RFC 0003 — Asset Intelligence Subsystem

| | |
|---|---|
| **Status** | Draft — awaiting decisions on open questions in §16 |
| **Author** | OpenVideoKit team |
| **Date** | 2026-06-28 |
| **Depends on** | [RFC 0001 — Product & Architecture](./0001-product-architecture.md) (Python control plane, S3 topology, presigned-URL handshake, project document model) |
| **Phase** | **P1 — deferred past v1.** v1 (P0) ships local-only with no cloud library. |
| **Discussion** | `docs/rfc/` |

---

## 1. Summary

OpenVideoKit ships a **massive prepared-asset library** (images, transparent
PNGs, SVG/Lottie, video backdrops, audio/voiceover beds) that users search
and drop into templates. This RFC defines the search, storage, ingestion, and
caching architecture behind that library, and how the **editor** consumes it.

Two-stage rollout:

- **v1 of this RFC — Metadata-only.** Postgres BM25 search over
  tags/title/description. No vectors. Redis optional (presign cache + rate
  limiting).
- **Vision — Semantic search at scale.** Milvus (standalone, S3-backed,
  embedded etcd) for CLIP/SigLIP vectors on images; Redis Streams for async
  ingestion fanout; a Python CLIP sidecar consumes the ingestion stream.

Different asset types get different search strategies — trying to vector-embed
everything is both expensive and unnecessary (§6).

> **Control plane is Python (FastAPI), not Go.** The CLIP sidecar is also
> Python — so ingestion has **no language boundary** in this revision (a
> cohesion win over the prior Go + Python-sidecar split).

---

## 2. Motivation

[RFC 0001 §13](./0001-product-architecture.md) defines an S3 asset vault and
presigned-URL handshake, but treats assets as opaque blobs owned per-project.
The product vision is larger: a **shared, catalogued, searchable library** of
prepared assets that every user can browse and drop into any composition.

That library needs:

- **Open-vocabulary search** for images ("sunset over mountains") — pure
  metadata tagging cannot cover the combinatorial space of visual queries.
- **Cheap search for well-tagged types** (licensed stock video, Lottie) —
  where metadata is already authoritative.
- **Scale** — "massive prepared assets" means the architecture must handle
  10M+ assets without holding all vectors in RAM.
- **Async ingestion** — embedding 10K images in a request handler is
  untenable; ingestion must fan out across workers and survive crashes.
- **A cache layer** — once vector search lands, ANN latency (10–100× slower
  than BM25) justifies result caching aggressively, and multiple FastAPI
  instances need cache coherence.

---

## 3. Goals & Non-Goals

### Goals

1. Per-asset-type search strategies (semantic where it earns its cost,
   metadata where tags are authoritative).
2. Single S3 bucket topology shared with
   [RFC 0001](./0001-product-architecture.md) — raw bytes, thumbnails,
   proxies, and Milvus segments under one bucket.
3. Milvus standalone with S3 tiering and DiskANN — vectors persist to S3,
   only queried subgraphs page into RAM.
4. Redis Streams ingestion pipeline with consumer groups + crash recovery.
5. Two-stage hybrid retrieval (cheap scalar pre-filter → BM25 ⊕ vector rank).
6. Clean v1 → vision staging so metadata-only ships first and Milvus is
   additive, not a rewrite.
7. **Editor consumption** — drop asset → SHA ref lands in the project's
   `index.json` (§14).

### Non-Goals

- Real-time AI asset generation (SDXL/Flux on demand). Separate RFC if/when
  pursued.
- A public marketplace. The library is curated; users do not transact.
- Multi-modal cross-asset recommendations ("assets that go with this one").
- Mobile search UX.

---

## 4. Background — asset types in scope

| Type | Examples | Ingestion cost | Notes |
|---|---|---|---|
| Photos / JPEG | stock photography | Low (1 CLIP call) | Highest visual variety — semantic search essential |
| Transparent PNG / stickers | isolated subjects, logos | Low | Same as photos + `alpha=true` scalar filter |
| SVG / vector graphics | icons, illustrations | Low | Usually well-categorised in packs |
| Lottie animations | motion graphics, spinners | Low (JSON parse) | Text-readable JSON; metadata suffices |
| Video backdrops | 4K loops, b-roll | High (decode + keyframes) | Licensed stock ships rich tags |
| Audio / music beds | underscore, SFX | Medium (decode + fingerprint) | Music is well-tagged (genre, BPM, mood) |
| Voiceover / speech | narration clips | Medium (Whisper) | Search via transcription embedding |

---

## 5. Staging: v1 vs Vision

| Capability | v1 (metadata-only) | Vision (Milvus + scale) |
|---|---|---|
| Search backend | Postgres `tsvector` + GIN (BM25-ish) | Postgres (metadata) **⊕** Milvus (vectors) |
| Image search | Tags + title only | CLIP/SigLIP semantic |
| Video search | Metadata (title, tags, collection) | Metadata (unchanged) |
| Lottie / SVG | Metadata + JSON content | Unchanged |
| Audio (speech) | Metadata | Whisper → text embedding |
| Audio (music) | Metadata (BPM, genre, mood) | Unchanged |
| Ingestion | Synchronous (fast) | Redis Streams + Python CLIP sidecar |
| Hot cache | Optional (presign, rate limit) | Essential (manifest, search, presign, rate limit) |
| Rate limiting | Per-user on upload/auth | Per-user on search (protect Milvus) |
| Redis role | Optional | Load-bearing |

**Pragmatic rule**: Redis becomes load-bearing the day Milvus lands. Before
that, it is optional but nice for presigned-URL caching and auth rate
limiting.

---

## 6. Asset-type → search strategy

The core design principle: **semantic where visual variety matters, metadata
where humans already tag well.**

| Asset type | Primary search | Secondary | Vectors stored? |
|---|---|---|---|
| Photos / JPEG | Semantic (CLIP/SigLIP) | Tag filters | Yes — 1 × 768-dim per image |
| Transparent PNG | Semantic + `alpha=true` filter | Tag filters | Yes |
| SVG / vector | Metadata (BM25) | Optional CLIP on rasterised preview | Optional |
| Lottie | Metadata (layer names, colours, tags) + JSON body BM25 | — | No |
| Video backdrops | **Metadata (BM25)** — see §6.1 | Optional semantic rerank later | v1: no. Vision: optional |
| Audio (speech) | Whisper transcription → text embedding | Metadata | Yes (vision) |
| Audio (music) | Metadata (BPM, mood, genre) | — | No |
| Fonts | Metadata (serif/sans, weight, designer) | Visual similarity on rendered sample | Optional |

### 6.1 Video search — the one decision worth flagging

Three options, in increasing ingest cost:

1. **Metadata-only (v1 choice).** Cheapest. Works because licensed stock APIs
   (Pexels, Storyblocks, etc.) ship rich tags. Ceiling: cannot find "drone
   coastline at golden hour" if nobody tagged "golden hour".
2. **Keyframe semantic.** Sample 1 frame per N seconds → embed each → multiple
   vectors per asset → aggregate scores at query. ~10× vector count of
   metadata-only; expensive ingest.
3. **Whole-clip embedding (VideoCLIP / InternVideo2 / LanguageBind).** One
   vector per clip via a video-language model. Cleaner than keyframe sampling
   but requires a second embedding pipeline alongside image CLIP.

**v1 ships option 1.** Migrate only when the library grows raw/unlabelled
content or users report "I can't find X". This keeps the embedding sidecar
doing one thing (CLIP for images) at launch.

---

## 7. Storage architecture

A **single S3 bucket**, shared with
[RFC 0001 §13](./0001-product-architecture.md), partitioned by prefix:

```
s3://openvideokit/
├── projects/<pid>/assets/<sha256>         ← raw asset bytes (RFC 0001)
├── library/<sha256>                       ← curated library asset bytes (this RFC)
├── thumbnails/<sha256>/<size>.webp        ← browse-grid thumbnails (50/200/400px)
├── proxies/<sha256>/preview-720p.mp4      ← video browse proxies (original fetched only on download)
├── milvus/<collection>/<segment>/...      ← Milvus-managed vector + scalar data (vision)
├── renders/<job-id>.mp4                   ← compiled videos (RFC 0001)
└── manifests/<project-id>/<version>.json  ← cached scene manifests
```

### Cross-cutting concerns

- **CDN** (CloudFront or Cloudflare) in front of the bucket — direct S3
  presigned URLs are too slow for a browse-the-library UX with "massive"
  inventory. One CDN covers raw bytes, thumbnails, and proxies.
- **Deduplication** — content-addressed by SHA-256. Same asset uploaded twice
  → same key → same vectors. Free dedup.
- **Lifecycle policies** — `library/` and `thumbnails/` stay Standard;
  `renders/` tiers to S3-IA after 30 days, Glacier after 90; `milvus/`
  segments stay Standard (Milvus expects low-latency reads).
- **License as a first-class scalar** — searchable, filterable, enforced at
  download. Critical if any asset is restriction-licensed.

---

## 8. Vector store — Milvus (standalone, S3-backed)

### 8.1 Why Milvus

- **Object-storage-first architecture.** Milvus 2.x separates compute from
  storage (S3) by design. Vectors, scalar data, and segment indexes all
  persist to S3 — infinite durability, ~$23/TB/month.
- **DiskANN index.** The ANN graph lives on S3/disk; only the queried subgraph
  pages into RAM. This is what makes billion-vector search affordable.
- **Hybrid search.** Scalar fields alongside vectors, with native BM25 +
  vector fusion. Matches the two-stage retrieval pattern in §11.
- **Tiered storage.** Local NVMe is an mmap cache for hot segments; S3 is the
  source of truth. Same bucket as assets.

### 8.2 Embedded etcd (correction note)

Milvus standalone ships with **embedded etcd** (`ETCD_USE_EMBED=true`),
removing the external etcd *and* MinIO dependencies for standalone mode —
standalone runs as effectively one process. Embedded etcd is
**standalone-only**: cluster/distributed mode still requires external etcd.

```
┌─────────────────────────────────────────────┐
│  Milvus standalone (single process)         │
│   • embedded etcd   (metadata)              │
│   • S3 backend      (vector segments)       │
│   • DiskANN index   (on S3, paged to RAM)   │
│   • local NVMe      (hot segment cache)     │
└──────────────────────┬──────────────────────┘
                       ▼
                  S3 (durability)
```

**One process, not six.** The cluster-mode operational surface only returns
when you need horizontal query scaling or HA.

### 8.3 When to migrate to cluster mode

- QPS saturation — one node cannot serve query load.
- HA requirements — standalone is single-node; failure = downtime.
- Write throughput during bulk ingestion — cluster's data nodes parallelise
  segment flushes.

For a curated, read-heavy library, standalone is typically sufficient up to
surprisingly large scales. S3-backed segments migrate cleanly between
standalone and cluster — cluster is a scale-up path, not a migration.

### 8.4 Collection schema (vision)

```
collection: assets
fields:
  - id              int64         (primary key, auto-id)
  - sha256          varchar(64)   (join key back to Postgres asset rows)
  - embedding       float_vector  (dim=768, CLIP/SigLIP)
  - asset_type      varchar(16)   (image | png | video | lottie | audio)
  - aspect_ratio    float
  - duration_s      float         (video/audio only)
  - license         varchar(32)
  - collection_id   int64
  - tags            array<varchar>

indexes:
  - embedding      : DISKANN  (or HNSW for small corpora)
  - asset_type     : INVERTED
  - license        : INVERTED
  - tags           : INVERTED
```

`sha256` is the join key: Milvus returns hits, FastAPI resolves full asset
rows (metadata, presigned URLs, thumbnails) from Postgres.

---

## 9. Embedding pipeline — Python CLIP sidecar

Milvus does not embed — it only stores and searches vectors. Something has to
produce them.

### 9.1 Where the model runs — decision

| Option | Verdict |
|---|---|
| Hosted API (Jina / Cohere / Vertex multimodal) | Rejected — per-call cost, latency, vendor lock-in |
| **Python sidecar running CLIP** (`transformers` / `onnxruntime`) | **Chosen** — self-hosted, cheap at scale, no language boundary with the now-Python control plane |
| ONNX runtime in-process in the FastAPI app | Rejected for v1 — fiddly GPU support, couples embedding to the API process |

The sidecar is a thin gRPC/HTTP service exposing two calls:

```
EmbedImage(image_bytes)   → float32[768]
EmbedText(text)           → float32[768]
```

It runs as a **consumer of the Redis Streams ingestion pipeline** (§10), not
on the request hot path. FastAPI never touches CLIP directly — clean process
boundary, independent scaling, independent failure mode.

### 9.2 Model choice

- **CLIP** (`openai/clip-vit-base-patch32`) — baseline, 768-dim, well-understood.
- **SigLIP** (`google/siglip-base-patch16-224`) — recommended upgrade;
  better recall, same dimensional budget, batch-friendly.

The `embedding` field dim (§8.4) must match the chosen model. Re-embedding the
corpus is required if the model changes — budget for a one-time bulk re-ingest
job.

---

## 10. Ingestion pipeline — Redis Streams

### 10.1 Why Streams (not Lists, not Pub/Sub)

- **Consumer groups** → multiple worker processes share load.
- **Pending Entries List (PEL)** → if a worker dies mid-job, another claims
  it via `XCLAIM`. No lost work.
- **Replay** → `XRANGE` reads history; useful for debugging and re-running
  failed batches.
- **Backpressure** → `MAXLEN` / `MINID` trimming caps memory.

Pub/Sub is fire-and-forget (no redelivery); Lists lack consumer groups.
Streams is the right structure the moment you have >1 worker or durability
needs.

### 10.2 Flow

```
┌──────────────┐  XADD          ┌─────────────────┐  XREADGROUP    ┌──────────────────┐
│  FastAPI app │ ─────────────► │ Redis Stream    │ ─────────────► │ Python CLIP      │
│ (upload)     │  asset:ingest  │ asset:ingest    │  group=workers │ sidecar (N pods) │
└──────────────┘                │                 │                └─────────┬────────┘
                                └─────────────────┘                          │
                                     ▲                                     │ write vector + scalar
                                     │ XACK                                ▼
                                     │                          ┌──────────────────┐
                                     └──────────────────────────┤ Milvus + Postgres│
                                                                └──────────────────┘
```

**Producer** (FastAPI, on asset upload finalisation):

```
XADD asset:ingest * \
  sha 02ab...      \
  type image       \
  s3key library/02ab...   \
  mime image/jpeg
```

**Consumer** (Python sidecar):

```
XGROUP CREATE asset:ingest workers $ MKVIEW        # once
XREADGROUP GROUP workers worker-3 COUNT 10 BLOCK 5000 STREAMS asset:ingest >
  → for each message:
      download bytes from S3
      vec = EmbedImage(bytes)
      milvus.insert(sha, vec, scalars...)
      postgres.update(sha, status='indexed')
      XACK asset:ingest workers <id>
```

**Crash recovery**: a worker that dies leaves messages in the PEL. A reaper
task periodically calls `XPENDING` + `XAUTOCLAIM` to hand idle messages to
healthy workers after a configurable idle threshold (e.g. 5min).

### 10.3 Backpressure and trimming

- `XADD ... MAXLEN ~ 100000` — soft cap, keeps memory bounded under burst.
- Dead-letter handling: messages that fail N times get moved to
  `asset:ingest:dead` with the error payload, for manual inspection.

---

## 11. Query path — two-stage hybrid retrieval

Pure vector search at scale has poor p99 latency. The production pattern is
two-stage:

```
1. Cheap pre-filter (Milvus scalar / Postgres):
      aspect_ratio ∈ [16/9], license ∈ [cc0, commercial], type=image
        ↓ narrows from millions → thousands

2. Rank on the subset:
      score = α · BM25(tags, title, description)
            + β · cosine(query_vec, asset_vec)
        ↓ hybrid fusion

3. Return top-K with presigned URLs + thumbnails
```

Milvus supports this natively. The `α`/`β` weights are tunable per query type
(default 0.5/0.5; raise `α` for controlled-vocabulary queries, raise `β` for
exploratory visual queries).

### 11.1 v1 query path (metadata-only)

No Milvus in v1 — pure Postgres:

```sql
SELECT sha256, title, thumb_url, ...
FROM assets
WHERE asset_type = $1
  AND license = ANY($2)
ORDER BY ts_rank(search_tsv, websearch_to_tsquery($3)) DESC
LIMIT 24 OFFSET $4;
```

`search_tsv` is a `tsvector` column over `title || ' ' || tags || ' ' ||
description`, indexed with GIN. Genuinely fast for browse-style queries and
needs no additional infra.

---

## 12. Redis roles — cache + coordination

Two distinct jobs, different data structures.

### 12.1 Job A: async work queue (Streams)

Covered in §10.

### 12.2 Job B: hot cache + coordination (dict / hash / zset)

| Key pattern | Structure | TTL | Why cached |
|---|---|---|---|
| `manifest:<project_id>` | String (JSON) | 60s | Scene manifest = multi-join Postgres; invalidate on asset add |
| `presign:<sha>:<op>` | String | 14min (≈ URL TTL − 1min) | Presigning is a signing op; cache just under expiry |
| `asset:<sha>` | Hash | 5min | Hot asset metadata; read on every browse |
| `search:<query_hash>:<filters>` | String (JSON) | 30s | Popular-query result cache; massive payoff once vector search lands |
| `ratelimit:<uid>:search` | Sorted set (sliding window) | rolling | Vector search is expensive; per-user QPS cap |
| `session:<jti>` | String | JWT TTL | JWT validation cache |
| `popular:assets` | Sorted set | 1h | Most-downloaded → drives CDN pre-warming + "trending" |

### 12.3 Cache coherence

Multiple FastAPI instances → cache must be coherent. Pattern: write-through
on mutation + Redis Pub/Sub fan-out for invalidation across instances. Redis
stays the single source of truth; local LRU is just a network-saver.

---

## 13. Data model (cloud additions to RFC 0001)

```sql
-- extends RFC 0001's project_asset table
assets (
  sha256        text PRIMARY KEY,
  asset_type    text NOT NULL,             -- image|png|svg|lottie|video|audio_music|audio_speech
  mime          text NOT NULL,
  size_bytes    bigint NOT NULL,
  width         int, height int,
  duration_s    real,                       -- video/audio
  title         text,
  description   text,
  tags          text[] NOT NULL DEFAULT '{}',
  license       text NOT NULL,              -- cc0|commercial|editorial|...
  collection_id bigint REFERENCES collections,
  source        text,                       -- pexels|storyblocks|user_upload|...
  search_tsv    tsvector,                   -- title || tags || description
  status        text NOT NULL DEFAULT 'ready',  -- ready|embedding|indexed|failed
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON assets USING GIN (search_tsv);
CREATE INDEX ON assets (asset_type, license);
CREATE INDEX ON assets (collection_id);

collections (
  id          bigint PRIMARY KEY,
  name        text NOT NULL,
  source      text,
  license_default text
);

asset_variants (
  sha256      text REFERENCES assets,
  variant     text NOT NULL,                -- thumb_50|thumb_200|thumb_400|proxy_720p
  s3key       text NOT NULL,
  PRIMARY KEY (sha256, variant)
);

ingestion_jobs (                             -- mirrors Redis Stream state for observability
  id          uuid PRIMARY KEY,
  sha256      text REFERENCES assets,
  stage       text NOT NULL,                 -- queued|embedding|writing|done|failed
  attempts    int NOT NULL DEFAULT 0,
  error       text,
  started_at  timestamptz,
  finished_at timestamptz
);
```

`assets.status` is the source-of-truth for whether an asset appears in
semantic results: only `status='indexed'` rows have a corresponding Milvus
vector. v1 rows sit at `status='ready'` and are found only via Postgres
full-text search.

---

## 14. Editor Consumption (how the editor uses the library)

The asset library panel in the editor
([RFC 0001 §7](./0001-product-architecture.md)) consumes this subsystem:

1. **Browse/search** → call FastAPI `GET /assets/search`.
2. **Drop asset onto a slide** → the editor writes the asset's **SHA-256 ref**
   into the slide's `index.json` under `assets` (e.g.,
   `"assets": { "img": "sha256:..." }`), or directly into the slide's
   `index.html` (`<img src="...">`).
3. **Preview** → the content-addressed binary cache
   ([RFC 0001](./0001-product-architecture.md)) resolves the SHA to bytes
   locally; if absent, fetches via presigned URL and caches.
4. **Export** → the assembler copies the asset bytes into the HF workspace's
   `assets/` and stamps the ref.

This means **AI Tier-1 (RFC 0002) never invents asset SHAs** — it emits search
*queries*, the library resolves them, and the editor offers the results for
the user (or AI, with confirmation) to drop in. Grounding by construction.

---

## 15. Risks & Tradeoffs

| Risk | Mitigation |
|---|---|
| Model swap forces full corpus re-embed | Pin model version per asset row; re-ingest job is idempotent and resumable |
| Milvus stdout/index format drift | Pin Milvus version; integration-test schema + queries in CI |
| Redis Stream message loss | PEL + `XAUTOCLAIM` reaper; dead-letter stream for poison messages |
| S3 egress on repeated large-asset fetches | Content-addressed binary cache on client (RFC 0001); CDN in front |
| Vector search latency spikes under load | Result cache (§12.2), rate limiting, two-stage pre-filter (§11) |
| Video metadata-only ceiling | Documented; migration path to keyframe/VideoCLIP in §6.1 |
| License enforcement gaps | License enforced at presign time, not just search filter — fail-closed |
| Embedded-etcd standalone has no HA | Accepted for v2; cluster migration path documented in §8.3 |
| Python sidecar downtime blocks ingestion | Streams buffer in Redis; sidecar catches up on recovery; Postgres reads unaffected |

---

## 16. Open Questions

| # | Question | Owner |
|---|---|---|
| Q1 | CLIP vs SigLIP as the v2 default model? (Recommendation: SigLIP.) | backend |
| Q2 | Milvus index choice — DiskANN (scale) vs HNSW (small corpus, faster build)? | backend |
| Q3 | Hybrid search fusion weights (α/β) — start at 0.5/0.5 and tune from query logs? | product |
| Q4 | Video semantic upgrade trigger — define the UX complaint threshold that justifies keyframe/VideoCLIP investment? | product |
| Q5 | Redis deployment — self-hosted, or ElastiCache/Upstash? | infra |
| Q6 | CLIP sidecar GPU vs CPU — CPU is fine for batch ingest; GPU needed only if query-time text embedding must be <50ms? | infra |
| Q7 | Thumbnail/proxy generation — FastAPI-bridged FFmpeg at upload, or a separate stream consumer? | backend |
| Q8 | Licensing scope — are we ingesting Pexels/Storyblocks/Unsplash APIs, licensing original content, or both? | product/legal |

Q8 is the gating decision — it determines ingestion volume, license
heterogeneity, and whether metadata-only video search (§6.1) is viable at all.

---

## 17. Out of Scope

- AI asset generation on demand (SDXL/Flux). Separate RFC.
- Multi-asset recommendation ("assets that pair with this").
- Per-user private libraries (this RFC covers shared curated library).
- Real-time collaborative asset curation.
- Mobile search UI.

---

## 18. References

- [RFC 0001 — Product & Architecture](./0001-product-architecture.md)
- [RFC 0002 — AI Subsystem](./0002-ai-subsystem.md) (asset-query grounding)
- [RFC 0004 — Credits & Billing](./0004-credits-and-billing.md) (asset-pull pricing)
- Milvus architecture & components: https://milvus.io/docs/main_components.md
- Milvus embedded etcd (standalone only): https://github.com/milvus-io/milvus/discussions/45420
- DiskANN index: https://milvus.io/docs/disk_index.md
- Milvus hybrid search: https://milvus.io/docs/multi-vector-search.md
- `pymilvus`: https://github.com/milvus-io/milvus (Python SDK)
- Redis Streams introduction: https://redis.io/docs/data-types/streams/
- SigLIP model: https://huggingface.co/google/siglip-base-patch16-224
