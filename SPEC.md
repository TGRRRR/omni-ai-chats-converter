# Omni AI Chats Converter

Converts chat exports from AI providers into consistently formatted Markdown files.

**Core Philosophy:**
- **Auto-detect** provider from JSON structure by default
- **Manual override** for edge cases
- **Configurable output format** via settings panel
- **Single consistent output** regardless of source provider
- **Pure browser app** — no Python runtime needed for the main product

---

## Project Structure

```
omni-ai-chats-converter/
├── SPEC.md                    # This file
├── TEST.md                    # Testing guide
├── server.py                  # Local HTTP server (pure stdlib, ~20 lines)
├── build.spec                 # PyInstaller config
│
├── web/                       # THE APP — pure HTML/CSS/JS
│   ├── index.html             # App shell
│   ├── css/
│   │   └── style.css          # Styling (dark/light mode, responsive)
│   ├── js/
│   │   ├── app.js            # UI logic, event handlers, state management
│   │   ├── converter.js       # All conversion logic (parsers + renderer)
│   │   ├── html2md.js         # HTML→Markdown converter
│   │   └── download.js        # File + ZIP download helpers
│   └── assets/
│
└── omni-ai-chats-converter/  # OLD — Python standalone (reference only)
    ├── cli.py
    ├── core/
    └── parsers/
```

**Key point:** `web/` is the entire application. `server.py` is only a static file server that opens a browser window. No logic whatsoever in Python.

---

## Architecture

### Deployment Modes

| Mode | How it runs | What Python does |
|------|-------------|-----------------|
| **GitHub Pages** | Browser opens static URL | Nothing — pure static hosting |
| **Local .exe** | PyInstaller exe starts local server | Serves static files, opens browser |
| **Local dev** | `python server.py` | Serves static files, opens browser |

All three use the **same `web/` directory**.

### Data Flow

```
Input JSON file
    │
    ▼ (FileReader API)
JS parses JSON
    │
    ▼
Auto-detect provider (scored structural heuristics)
    │
    ▼
Provider-specific parser (JS)
    │
    ▼
List of Conversation objects (plain JS objects)
    │
    ▼
Renderer (JS) → List of {filename, content}
    │
    ▼
Display file list + trigger downloads
```

### JavaScript Data Model

```javascript
// Message
{ role: "user" | "assistant" | "system" | "thinking",
  content: string,
  timestamp: Date | null }

// Conversation
{ id: string,
  title: string,
  created_at: Date | null,
  provider: string,
  messages: Message[],
  url: string | null,
  has_thinking: boolean }  // true if any message.role === "thinking"
```

---

## Quick Start

### Web (GitHub Pages)
Open the GitHub Pages URL in any browser.

### Local App
```bash
pip install -r requirements.txt
python server.py
```
Or double-click `OmniAIConverter.exe` (from PyInstaller build).

### Development
```bash
python server.py
# Opens http://localhost:8765
# Edit web/ files, refresh browser
```

---

## Provider Auto-Detection

### Scored Heuristics

Detection is structural, not just key-presence. Each provider has a set of **required fields** with **minimum depth** checks — not just "does `messages` exist" but "does `messages[0].sender` exist".

| Provider | Required Fields | Confidence |
|----------|----------------|------------|
| DeepSeek | `mapping` (dict), `mapping[*].message.fragments` array | High |
| Claude | `chat_messages` (array) OR `messages[0].sender` | High |
| ChatGPT | `messages[0].role` AND no `sender` (distinguishes from Claude) | Medium |
| Gemini | `header` contains "Gemini"/"Bard", OR `safeHtmlItem` present | High |
| Unknown | None of the above matched | — |

Wrapper unwrapping: `conversations`, `chats`, `data`, `items` — applied before detection.

**Confidence scoring:** Each parser's `can_parse()` returns a confidence score (0–1). The detector picks the highest. If the top score is below a threshold, flag as "unknown format".

**Long-term goal:** Replace heuristic scoring with **schema fingerprinting** — define exact expected shapes per provider (required fields, types, value constraints), compute structural similarity, return the best match. This is more robust than rule-based detection.

---

## Layout Configuration

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `frontmatter.title` | true | Include title in YAML |
| `frontmatter.date` | true | Include date in YAML |
| `frontmatter.provider` | true | Include provider in YAML |
| `frontmatter.url` | true | Include URL in YAML (if available) |
| `user_heading` | "# Me" | Heading for user messages |
| `assistant_heading` | "# Assistant" | Heading for AI responses |
| `thinking_heading` | "# Thinking" | Heading for thinking blocks |
| `include_thinking` | true | Include thinking blocks (greyed out if no thinking blocks detected) |
| `separator` | "" | Separator between messages |
| `heading_downscale` | true | Downscale H1 in assistant content |
| `add_title_as_h1` | false | Add title as H1 at file top |
| `timestamp_format` | "%Y-%m-%d" | Date format |
| `gemini_group_gap_minutes` | 30 | Gap (minutes) to split Gemini records into separate conversations |
| `gemini_keep_ungrouped` | false | If true: each Gemini record → separate file (ignore grouping) |

Persisted via `localStorage`.

### Thinking Blocks UI

The "Include thinking blocks" checkbox behavior:
- **Greyed out** by default
- **Becomes active** if the loaded file contains thinking blocks (detected at parse time)
- If `has_thinking: false` on all conversations → checkbox is disabled with label "Include thinking blocks (not available for this file)"
- If `has_thinking: true` → checkbox is enabled with label "Include thinking blocks (DeepSeek)"

### YAML Output

```yaml
---
title: "Conversation Title"
date: 2024-01-15
provider: claude
url: https://claude.ai/chat/...
---

# Me
Hello

# Assistant
Hi there!
```

---

## Supported Providers

### Claude Parser
- Extracts: `chat_messages[]` with `sender`, `text` fields
- Handles nested dicts/lists for content (`{"text": "..."}` or `[{"text": "..."}]`)
- Timestamps from `updated_at` or `created_at`
- No thinking blocks in export format

### DeepSeek Parser
- Parses `mapping` dict with numeric string keys (sorted numerically)
- Fragment types: `REQUEST`→user, `RESPONSE`→assistant, `THINK`/`THOUGHT`/`REASONING`/`CHAIN_OF_THOUGHT`→thinking
- Rich thinking blocks — `has_thinking: true`
- Thinking checkbox is active by default when this provider is detected

### Gemini Parser
- Processes Google Takeout `MyActivity.json` format
- Converts HTML responses to Markdown via `html2md.js` (DOMParser + regex post-processing)
- User prompt from `title` field (strip "Prompted "/"Asked "/"Search " prefixes)
- Groups records into conversations by time gap (default 30 min)
- **Alternative mode:** `gemini_keep_ungrouped: true` — each record → one file
- No thinking blocks, no URL extraction

### ChatGPT Parser (Phase 3)
- Structure similar to DeepSeek (`mapping` tree, `author.role`)
- `has_thinking: false` initially — future o1/o3 exports may include thinking

---

## HTML to Markdown Converter (html2md.js)

Primary approach: **DOMParser** — zero dependencies, handles nesting, entity decoding, `<pre>` blocks correctly. Regex as **post-processing cleanup** only.

### Approach

1. **DOMParser** parses HTML string into a DOM tree
2. **Custom tree walker** traverses DOM, emits Markdown:
   - `<p>`, `<div>` → double newline
   - `<br>` → single newline
   - `<h1>`-`<h6>` → `#` through `######`
   - `<strong>`, `<b>` → `**bold**`
   - `<em>`, `<i>` → `*italic*`
   - `<code>` (inline) → `` `code` ``
   - `<pre><code class="lang-...">` → ` ```lang-...\n...\n``` `
   - `<a href="...">` → `[text](url)`
   - `<img src="..." alt="...">` → `![alt](src)`
   - `<ul>`, `<ol>` → proper list syntax
   - `<table>` → GFM pipe table
   - `<blockquote>` → `> `
   - `<span dir="rtl">` → strip tag, preserve text
   - `<script>`, `<style>` → strip entirely
3. **Regex cleanup pass:**
   - Collapse 3+ newlines → 2
   - Trim trailing whitespace per block
   - Collapse `&nbsp;` / `&#xa0;` → space
   - Google Takeout quirks: strip excessive `<span>` wrappers
4. **Edge cases handled:**
   - `&lt;`, `&gt;`, `&amp;`, `&quot;` → decoded automatically by DOMParser
   - MathML / `<span class="math">` → strip to raw LaTeX or strip entirely
   - colspan/rowspan in tables → emit warning, flatten to pipe-separated text
   - RTL whitespace → normalize without corrupting bidirectional markers

---

## Parser Registry & Generic Fallback

### Registry

Each parser implements:
```javascript
can_parse(json) → { matches: boolean, confidence: number }
parse(json) → Conversation[]
```

Parsers are tried in order of confidence. Highest confidence wins.

### Generic Parse — Opt-In Only

`generic_parse()` is **never called automatically**. If no parser matches:
1. Show a warning banner: "Unknown format — manual provider selection required"
2. List available providers for user to choose from
3. User selects a provider and clicks Convert → that parser's `parse()` is called
4. Only if the user explicitly picks a provider does any parser run

---

## Dependencies

**None.** Zero external JS libraries. Zero Python dependencies for the web app.

Python only needed for:
- `server.py` — stdlib: `http.server`, `threading`, `webbrowser`, `os`, `sys`
- PyInstaller build

---

## Local Server

```python
# server.py — Python stdlib only, ~20 lines
import http.server, threading, webbrowser, os, sys

def start(port=8765):
    root = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    handler = http.server.SimpleHTTPRequestHandler
    server = http.server.HTTPServer(("localhost", port), handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    webbrowser.open(f"http://localhost:{port}/web/index.html")
    input("Server running. Press Enter to stop.\n")
    server.shutdown()
```

---

## Development Phases

### ✅ Phase 1 — Architecture Fixes (DONE)
Python standalone app bugs fixed.

### Phase 2 — Pure JS Web App (IN PROGRESS)
Priority: HIGH.

**Tasks:**
1. `web/js/html2md.js` — DOMParser + regex post-processing HTML→Markdown
2. `web/js/converter.js` — detector (scored heuristics), parsers (claude, deepseek, gemini), renderer, registry
3. `web/js/download.js` — file + ZIP downloads (native browser `Archive` API)
4. `web/js/app.js` — UI logic, state management, event handlers
5. `web/index.html` — app shell (loading overlay, provider pills, drop zone, collapsible settings, results)
6. `web/css/style.css` — modern responsive styling (dark/light, system fonts)
7. `server.py` — local HTTP server
8. `build.spec` — PyInstaller config
9. Test on all vendors (compare output byte-for-byte with Python CLI)
10. Deploy to GitHub Pages

### Phase 3 — New Parsers (ChatGPT, AI Studio, Perplexity)
Priority: HIGH. JSON structures to be provided by user.

Each parser is added to `web/js/converter.js`. Thinking block detection populates `has_thinking` on each Conversation.

### Phase 4 — Help + Feedback + Donate
Priority: MEDIUM.

- Export tutorials: collapsible "How to export?" per provider
- Feedback: "Report a Bug" → GitHub Issues
- Donate: "Support on Ko-Fi"

### Phase 5 — Packaging + CI/CD
Priority: MEDIUM.

- PyInstaller builds for Windows, Linux, macOS
- GitHub Actions on tag push

### Deferred
- **Attachments handling** — extract refs, emit `![]()`, copy to `_attachments/`
- **Visual preview** — Markdown preview pane
- **Schema fingerprinting detector** — replace heuristic scoring with structural similarity matching
- **Filename collision robustness** — improve `sanitize_filename()` to handle edge cases (truncation collisions, `_` → space collisions)

---

## Reference Projects (Read-Only)

| File | Notes |
|------|-------|
| `Reference projects/claude_export_converter.py` | Claude parser reference |
| `Reference projects/gemini-to-obsidian/gemini-to-obsidian.py` | Gemini parser reference |
| `Reference projects/deepseek_export_converter/deepseek_export.py` | DeepSeek parser reference |

These are the reference implementations used to build the JS parsers. The JS versions follow the same logic.
