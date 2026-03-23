- [ ] Build Omni AI Chats Converter #productivity
- [ ] Сделать прогу для конверта json в md #productivity
- [x] Analyze possibility for omni AI chat exporter to be made as obsidian plugin? #productivity

Features: For separator let's just provide several options in a select UI. Options should be like 1. No 2. --- 3. *** 4. some other available for Obsidian formats, etc. 5. Custom Let's add the reader view for the markdown viewer, which would properly display YAML properties, headings, tables, etc  
Small things:  
Bug: When I toggle thinking on/off for deepseek chats, it doesn't update (until I toggle some other settings) Feature: Use real provider icons (favicons) for the chips—find official favicon URLs online.

what if we can upload several files with chats from various providers all at once? 



Okay, let's move to the phase 2, new parsers. For Perplexity I am not sure. I am using my own parser, which currently exports JSONs for individual chats, not a single JSON file. So I could eventually adjust that my project to compile everything into a single JSON, but idk.. or maybe I could make this app support these files separately.. IDK yet, so let's not do a perplexity parser yet, move it to later phases.



I want a single simple app to convert the exports from various AIs sites like ChatGPT, Claude, DeepSeek, Gemini, Google AI Studio (and probably others to add) from json chats (or whatever format the input uses) into a bunch of .md files with formatting users could define.
I want it to be a GUI app that would 
1. Have buttons on the side to select the provided json from specific vendor (since I guess I couldn't automatically define from where is this json, couldn't I?)
2. Have a file viewer where I could define the final formatting of the md (define yaml properties, select what to add and what not to add, define how the headings in chats would be, etc) + make it save the default layout so imports from various providers have the same layout)
I used to build separate exported for Gemini, DeepSeek and Claude, had to work on the Perplexity exporter that would automate exporting from browser, since it doesn't have a native export option. Found a GPT converter option, but it's bloated. 
I want it to use minimal dependencies and ship as a single app. Maybe also provide a CLI access so AI Agents could use it as well? 
Nothing exactly matching your spec exists. Here's what's out there and how to build yours properly:
## Existing Tools (All Fall Short)
|Tool|Type|Providers|Customizable format|GUI|
|---|---|---|---|---|
|`sugurutakahashi/ai-chat-md-export` [[github](https://github.com/sugurutakahashi-1234/ai-chat-md-export)]​|CLI (npm/TS)|ChatGPT, Claude only|Fixed format|❌|
|`revivalstack/ai-chat-exporter` [[github](https://github.com/revivalstack/ai-chat-exporter)]​|Tampermonkey|ChatGPT, Claude, Copilot, Gemini|YAML + TOC|❌|
|AI Exporter (Chrome ext) [[chromewebstore.google](https://chromewebstore.google.com/detail/ai-exporter-save-chatgpt/kagjkiiecagemklhmhkabbalfpbianbe)]​|Browser ext|10+ platforms|None|❌|
|`kuchin/chatgpt-markdown` [[github](https://github.com/kuchin/chatgpt-markdown)]​|CLI (Python)|ChatGPT only|`config.json`|❌|
None are local desktop GUI apps with unified multi-provider + format customization.
## Auto-Detection Viability
You **can** structurally fingerprint most formats:
- **ChatGPT** → top-level `mapping` key with node tree, `author.role`
- **Claude** → `chat_messages[]` with `sender: "human"|"assistant"`
- **DeepSeek** → different schema, detectable
- **Google AI Studio** → distinct schema with `runSettings`, `chunks[]`
- **Gemini Takeout** → comes as ZIP inside Google Takeout, has `conversations[]`
- **Perplexity** → your custom `perplexport` format[[github](https://github.com/sugurutakahashi-1234/ai-chat-md-export)]​
> Auto-detect as default, but keep vendor buttons as manual override for edge cases where schemas overlap or unknown future formats.
## Recommended Stack
Given your Python background + single-binary goal + CLI dual access:
- **GUI**: `tkinter` (stdlib, zero deps) — ugly but ships as single `.exe` via PyInstaller. OR `customtkinter` (1 pip dep) for modern look
- **YAML frontmatter**: `PyYAML` (1 dep) or `ruamel.yaml`
- **Template engine**: `string.Template` (stdlib) or `Jinja2` (if you want power)
- **CLI layer**: `argparse` (stdlib) — detect mode by whether args are passed
- **Packaging**: `PyInstaller` → `--onefile` for single binary
Total external deps: **1–3** (vs. Electron-based tools needing 100MB node_modules).
## Unified `Conversation` Dataclass
`
```
@dataclass
class Message:
    role: str          # "user" | "assistant" | "system"
    content: str
    timestamp: datetime | None
@dataclass  
class Conversation:
    id: str
    title: str
    created_at: datetime | None
    provider: str      # "chatgpt" | "claude" | etc.
    messages: list[Message]
```
All parsers output this. The renderer consumes only this — provider-agnostic.
## Format Template Config (saved as `default_layout.json`)
```
{
  "yaml_frontmatter": {
    "enabled": true,
    "fields": ["title", "created_at", "provider", "tags"]
  },
  "filename_pattern": "{date}_{title}.md",
  "user_heading": "## 👤 User",
  "assistant_heading": "## 🤖 {provider}",
  "separator": "---",
  "include_timestamps": true,
  "timestamp_format": "%Y-%m-%d %H:%M"
}
```
## CLI Interface (for AI Agents)
bash
```
# Auto-detect provider
aic convert input.json -o ./output/
# Manual provider
aic convert input.json -p chatgpt -o ./output/
# Custom layout
aic convert input.json --layout my_layout.json
# Pipe-friendly
aic convert input.json --stdout | grep "keyword"
```
> Your existing `deepseek_export_converter` and `perplexport` parsers are the hardest part — just wrap them in the `parsers/` module interface and the rest is plumbing.