# Tasks
- [ ] Come up with a better shorter name..?
- [ ] Implement ChatGPT import
- [ ] Turn into Obsidian Plugin
- [ ] Implement proper Gemini import
- [ ] Implement Multi-import
- [ ] Implement Gemini AI Studio import
- [ ] Implement handling attachments like documents and images
# Overview
> Converts chat exports from AI providers into consistently formatted Markdown files.
## Features
- Auto-detect provider from JSON structure by default
- Configurable output format via settings panel
- Single consistent output regardless of source provider
- Pure browser app via GitHub pages + local version
## Background
This project started because existing tools were either CLI-only, vendor-specific, or required complex setups. The goal was a single app that handles ChatGPT, Claude, DeepSeek, Gemini, and eventually other providers
	- with fully customizable markdown output formatting.
### Other options
| Tool | Type | Providers | Customizable Format |
|------|------|-----------|-------------------|
| `ai-chat-md-export` | CLI (npm/TS) | ChatGPT, Claude only | Fixed format |
| `ai-chat-exporter` | Tampermonkey | ChatGPT, Claude, Copilot, Gemini | YAML + TOC |
| AI Exporter (Chrome) | Browser ext | 10+ platforms | None |
| `chatgpt-markdown` | CLI (Python) | ChatGPT only | `config.json` |
None were local desktop GUI apps with unified multi-provider support + format customization.
# Architecture
## File tree
```
omni-ai-chats-converter/
├── SPEC.md                    # This file
├── TEST.md                    # Testing guide
├── server.py                  # Local HTTP server (pure stdlib, ~17 lines)
├── default_layout.json        # Default layout settings
│
└── web/                       # THE APP
	- pure HTML/CSS/JS
    ├── index.html             # App shell (two-column layout)
    ├── css/
    │   └── style.css          # Styling (dark/light mode, responsive, viewer panel)
    └── js/
        ├── app.js             # UI logic, state management, markdown preview renderer
        ├── converter.js       # All conversion logic (detector, 4 parsers, renderer)
        ├── html2md.js         # HTML→Markdown converter
        ├── download.js        # File + ZIP download helpers
        └── jszip.min.js      # JSZip library for ZIP generation
```
**Key point:** `web/` is the entire application. `server.py` is a minimal static file server that opens a browser window. One vendored dependency (JSZip) for ZIP generation.
## Dependencies
| Library | Purpose | Source |
|---------|---------|--------|
| JSZip | ZIP file generation | Vendored (`js/jszip.min.js`) |
| DOMParser | HTML→Markdown parsing | Built-in browser API |
| FileReader API | File upload handling | Built-in browser API |
- **Zero external dependencies** for the web app itself. Python only needed for `server.py`
- stdlib only: `http.server`, `threading`, `webbrowser`, `os`, `sys`
## Deployments
- GitHub Pages: Browser opens static URL
- Local server: `python server.py`
## Data Flow
```
Input JSON file
↓ (FileReader API)
JS parses JSON
↓
Auto-detect provider (scored structural heuristics)
↓
Provider-specific parser (JS)
↓
List of Conversation objects (plain JS objects)
↓
Renderer (JS) → List of {filename, content}
↓
Display file list in results panel (lightweight cards)
↓
Click card → generate preview DOM for that note only (lazy rendering)
↓
Download individual files or ZIP archive
```
## Viewer Panel
- The viewer panel displays converted markdown with
	- Rendered view: Formatted markdown with proper styling
	- Raw view: Plain text markdown source
	- Toggle button: Switch between rendered and raw views
	- Drag resize: Left-edge handle for adjusting panel width
	- Close button: Dismiss the viewer
- Markdown rendering features
	- YAML frontmatter display
	- Heading hierarchy with proper styling
	- Code blocks with syntax highlighting class
	- Blockquotes with accent border
	- Tables with alternating row colors
	- Nested lists with bullet hierarchy (disc → circle → square)
	- Horizontal separators (solid/dotted)
	- External links with `rel="noopener noreferrer"` for security
**XSS Prevention:**
Links are validated before rendering:
- Allowed protocols: `http:`, `https:`, `mailto:`, `#`, `/`
- Unsafe links (e.g., `javascript:`, `data:`) render as greyed-out text with tooltip
## JavaScript Data Model
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
# Features
## Providers
### Supported Providers
#### Claude
- Extracts: `chat_messages[]` with `sender`, `text` fields
- Handles nested dicts/lists for content (`{"text": "..."}` or `[{"text": "..."}]`)
- Timestamps from `updated_at` or `created_at`
- No thinking blocks in export format
#### DeepSeek
- Parses `mapping` dict with numeric string keys (sorted by `message.create_time`)
- Fragment types: `REQUEST`→user, `RESPONSE`→assistant, `THINK`/`THOUGHT`/`REASONING`/`CHAIN_OF_THOUGHT`→thinking
- Rich thinking blocks
	- `has_thinking: true` when thinking fragments detected
#### Gemini
- Processes Google Takeout `MyActivity.json` format
- Converts HTML responses to Markdown via `html2md.js` (DOMParser + regex post-processing)
- User prompt from `title` field (strip "Prompted "/"Asked "/"Search " prefixes)
- Groups records into conversations by time gap (default 30 min)
- **Alternative mode:** `gemini_keep_ungrouped: true`
	- each record → one file
- No thinking blocks, no URL extraction
#### ChatGPT
- Structure similar to DeepSeek (`mapping` tree, `author.role`)
- Parses `content.parts[]` for message text
- `has_thinking: false`
	- future o1/o3 exports may include thinking
### Provider Detection
You **can** structurally fingerprint most formats:
- **ChatGPT** → top-level `mapping` key with node tree, `author.role`
- **Claude** → `chat_messages[]` with `sender: "human"|"assistant"`
- **DeepSeek** → different schema with `fragments[]`
- **Gemini Takeout** → `header` contains "Gemini"/"Bard", `safeHtmlItem` present
- **Perplexity** → custom `perplexport` format
Auto-detect as default, with manual vendor buttons for edge cases or unknown future formats.
### Scored Heuristics
Detection is structural, not just key-presence. Each provider has a set of **required fields** with **minimum depth** checks
	- not just "does `messages` exist" but "does `messages[0].sender` exist".

| Provider | Required Fields                                                | Confidence |
| -------- | -------------------------------------------------------------- | ---------- |
| DeepSeek | `mapping` (dict), `mapping[*].message.fragments` array         | High       |
| Claude   | `chat_messages` (array) OR `messages[0].sender`                | High       |
| ChatGPT  | `messages[0].role` AND no `sender` (distinguishes from Claude) | Medium     |
| Gemini   | `header` contains "Gemini"/"Bard", OR `safeHtmlItem` present   | High       |
| Unknown  | None of the above matched                                      |            |
Wrapper unwrapping: `conversations`, `chats`, `data`, `items`
	- applied before detection.
**Confidence scoring:** Each parser's `can_parse()` returns a confidence score (0–1). The detector picks the highest. If the top score is below a threshold, flag as "unknown format".
**Long-term goal:** Replace heuristic scoring with **schema fingerprinting**
	- define exact expected shapes per provider (required fields, types, value constraints), compute structural similarity, return the best match. This is more robust than rule-based detection.
### Parser Selection & Fallback
Each parser implements:
```javascript
can_parse(json) → { matches: boolean, confidence: number }
parse(json) → Conversation[]
```
Parsers are tried in order of confidence. Highest confidence wins.
`generic_parse()` is **never called automatically**. If no parser matches:
1. Show a warning banner: "Unknown format: manual provider selection required"
2. List available providers for user to choose from
3. User selects a provider and clicks Convert → that parser's `parse()` is called
4. Only if the user explicitly picks a provider does any parser run
## Layout
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
| `include_thinking` | **false** | Include thinking blocks (opt-in; greyed out if no thinking blocks detected) |
| `separator` | "" | Separator between messages: `---` (solid) or `***` (dotted) |
| `heading_downscale` | true | Downscale headings in assistant content (`#` → `##`, `##` → `###`, etc.) |
| `add_title_as_h1` | false | Add title as H1 at file top |
| `timestamp_format` | "%Y-%m-%d" | Date format |
| `gemini_group_gap_minutes` | 30 | Gap (minutes) to split Gemini records into separate conversations |
| `gemini_keep_ungrouped` | false | If true: each Gemini record → separate file (ignore grouping) |
| `user_compact` | false | Remove empty lines in user messages (preserve 1 blank line before tables) |
| `assistant_compact` | false | Remove empty lines in assistant messages (preserve 1 blank line before tables) |
Persisted via `localStorage`.
### Thinking Blocks UI
The "Include thinking blocks" checkbox behavior:
- **Opt-in by default** (disabled until thinking blocks are detected)
- **Becomes active** if the loaded file contains thinking blocks (detected at parse time)
- If `has_thinking: false` on all conversations → checkbox is disabled with label "Include thinking blocks (not available for this file)"
- If `has_thinking: true` → checkbox is enabled with label "Include thinking blocks (DeepSeek)"
### Compact Mode
When `user_compact` or `assistant_compact` is enabled, consecutive empty lines are removed from message content. A single blank line is preserved before tables to ensure proper markdown rendering. Both options work independently.
### Markdown Output
```YAML
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
## HTML -> .MD
- **DOMParser** - zero dependencies, handles nesting, entity decoding, `<pre>` blocks correctly. Regex as **post-processing cleanup** only.
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
   - `<ul>`, `<ol>` → proper list syntax with **recursive nested list support**
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
   - `&lt;`, `&gt;`, `&amp;`, `&quot;` → decoded automatically by DOMParser (no double-unescaping)
   - MathML / `<span class="math">` → strip to raw LaTeX or strip entirely
   - colspan/rowspan in tables → emit warning, flatten to pipe-separated text
   - RTL whitespace → normalize without corrupting bidirectional markers
   - **Nested lists** → proper indentation with `  ` prefix for sub-items
# Development
## Core Implementation Complete
1. ✅ `web/js/html2md.js`
	- DOMParser + regex post-processing HTML→Markdown with nested list support
2. ✅ `web/js/converter.js`
	- detector (scored heuristics), 4 parsers (claude, deepseek, gemini, chatgpt), renderer, registry
3. ✅ `web/js/download.js`
	- file + ZIP downloads via JSZip
4. ✅ `web/js/app.js`
	- UI logic, state management, event handlers, markdown preview renderer with nested list support
5. ✅ `web/index.html`
	- app shell (two-column layout, provider pills, accessible drop zone, compact settings, viewer panel)
6. ✅ `web/css/style.css`
	- modern responsive styling (dark/light, system fonts, viewer panel with drag resize, nested list styling)
7. ✅ `web/js/jszip.min.js`
	- vendored JSZip library for reliable ZIP generation
8. ✅ `server.py`
	- local HTTP server (Python stdlib)
## Phase 1: Critical Fixes (v1.1)
- **ZIP Download**
	- Replaced broken `Archive` API with JSZip, proper async generation
- **XSS Vulnerability**
	- Fixed link parsing to whitelist safe protocols only (`http:`, `https:`, `mailto:`, `#`, `/`)
- **Keyboard Accessibility**
	- Drop zone now focusable with Enter/Space, proper `sr-only` class on file input, `aria-label` attributes
- **ARIA Support**
	- Added `aria-hidden` to decorative SVGs, `aria-label` to interactive buttons
## Phase 2: High Priority Fixes (v1.2)
- **Nested Lists (html2md)**
	- Proper recursive handling with `  ` indentation prefix
- **Viewer Panel Resizing**
	- JS-based drag handle on left edge (replaces janky CSS `resize`)
- **Nested Lists (Viewer)**
	- CSS styling for proper bullet hierarchy (disc → circle → square)
## Phase 3: Performance & Robustness (Planned)
- **Windows Filename Sanitization**
	- Handle reserved names (CON, PRN, AUX, COM1-9, LPT1-9), trailing periods
- **Settings Desync**
	- Remove manual `thinkingCb` fetch, ensure all settings flow through `state.layout`
- **Null/Empty Content**
	- Graceful handling of empty messages
- **Thread Blocking**
	- Implement via chunked processing with `requestIdleCallback`
	- Parse JSON in small batches to avoid UI freeze on large files
- **DOM Node Explosion**
	- Lazy DOM approach: only generate preview DOM for the note user clicked on
	- Result cards remain as lightweight data until needed
## Phase 4: UI/UX Polish (Planned)
- **Search Bar**
	- Filter results by filename/content
- **Theme Toggle**
	- Override `prefers-color-scheme` with manual control
- **Bulk Selection**
	- Checkboxes on result cards for selective export
- **Responsiveness**
	- Improve mobile close button (larger touch target)
	- Better breakpoint behavior for mixed screen sizes
- **Browser Compatibility**
	- Make app browser-agnostic as much as possible
	- Consistent styling across browsers (Firefox sliders, etc.)
## Phase 5: Parser Decision (TBD)
- **Custom vs. Library Parsers**
	- Keep custom markdown parsers vs. switch to marked.js + Turndown.js
	- Decision deferred until more edge cases surface
	- Custom: full control, smaller bundle
	- Library: more robust, larger bundle
## Phase 6: Future Enhancements
- **Export tutorials**
	- collapsible "How to export?" per provider
- **Attachments handling** 
	- extract refs, emit `![]()`, copy to `_attachments/`
- **Filename collision robustness**
	- improve `sanitize_filename()` to handle edge cases
- **New parsers**
	- AI Studio, Perplexity, or other providers (JSON structures to be provided)
- **Schema fingerprinting detector**
	- replace heuristic scoring with structural similarity matching
- Table from notes
	- create a full table out of notes using filename and YAML properties, make A-Z sorting possible based on YAML properties
- Support importing multiple files at once, automatically group by provider
# Obsidian Plugin Version (Planned)
A native Obsidian plugin version is planned after the web version is complete. This would integrate directly with Obsidian vaults.
## Architecture Differences
| Component | Web App | Obsidian Plugin |
|-----------|---------|-----------------|
| File Input | Drag-drop zone | Modal with HTML5 file input |
| Settings | Custom panel + localStorage | `PluginSettingTab` + `loadData()`/`saveData()` |
| Preview | Side panel viewer | Modal with tabs (raw/rendered) |
| Output | ZIP download | Direct `app.vault.create()` into vault |
| UI | Two-column layout | Command palette → Modal workflow |
## Code Reuse
**Can be reused (minimal changes):**
- `converter.js` — parser logic (pure JS)
- `html2md.js` — HTML→Markdown conversion
- Provider detection logic
- Settings data model (map to Obsidian API)
**Needs rewriting:**
- Entry point → TypeScript `main.ts` extending `Plugin`
- UI layer → Obsidian Modals
- File output → `app.vault.create()` instead of ZIP
- Settings UI → `PluginSettingTab`
## Proposed Workflow
```
User runs command: "Omni AI Converter: Import chats"
    ↓
Modal opens with file drop zone
    ↓
User drops JSON file
    ↓
Auto-detect provider, show preview
    ↓
User clicks "Import to vault"
    ↓
Files created directly in vault (e.g., Chats/GPT/Conversation.md)
```
## Advantages
- Direct vault integration — no ZIP download/unzip
- Native Obsidian UI feel
- Keyboard shortcuts via command palette
- Built-in settings persistence
- Potential for automation (watch folder, auto-import)
## Tradeoffs
- Obsidian-only (users must have Obsidian installed)
- TypeScript required (current JS needs conversion)
- Separate codebase to maintain (or share core logic via npm package)
## Estimated Effort
| Task | Effort |
|------|--------|
| Plugin scaffold (manifest, main.ts, build config) | 1-2 hours |
| Port converter logic | 2-3 hours |
| Build modal UI with file input | 3-4 hours |
| Settings tab | 1-2 hours |
| Vault file creation logic | 1 hour |
| Testing | 2-3 hours |
| **Total** | **10-15 hours** |
