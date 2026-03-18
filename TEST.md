# Testing Guide

This file documents how to test the Omni AI Converter. Run these steps after any code changes.

## Prerequisites

All JSON test files are in `../Chats/` (project root):
- `Claude.json` — Claude export (28 conversations)
- `deepseek.json` — DeepSeek export (59 conversations)
- `Google.json` — Google Takeout Gemini (1816 activity records → ~666 conversations)
- `chatGPT.json` — ChatGPT export (598 conversations)

Export outputs go to `../Exports/{Claude,Deepseek,Google}/`.

## Quick Test (all vendors)

From the `omni-ai-chats-converter/` directory:

```bash
# Claude
python cli.py "../Chats/Claude.json" -o "../Exports/Claude"

# DeepSeek
python cli.py "../Chats/deepseek.json" -o "../Exports/Deepseek"

# Google/Gemini
python cli.py "../Chats/Google.json" -o "../Exports/Google"
```

Expected output:
- Claude: auto-detected as `claude`, ~27 files
- DeepSeek: auto-detected as `deepseek`, ~59 files
- Google: auto-detected as `gemini`, ~666 files

## Verification Steps

### 1. Check CLI output
Ensure no errors: `Error: Failed to load JSON`, `Error: No conversations found`.

### 2. Spot-check output files
Read one file from each vendor to verify correct structure:

**Claude** — should have YAML frontmatter with `date` + `provider`, `# Me` / `# Assistant` headings:
```
---
date: 2024-12-07
provider: claude
---

# Me
[user message]
# Assistant
[assistant response]
```

**DeepSeek** — same structure, may include `# Thinking` blocks, citations in content:
```
---
date: 2025-01-29
provider: deepseek
---

# Thinking
[chain of thought]
# Me
[user message]
# Assistant
[assistant response with citations]
```

**Google/Gemini** — grouped multi-turn conversations, HTML converted to Markdown lists/code:
```
---
date: 2025-06-09
provider: gemini
---

# Me
[user message]
# Assistant
[markdown content — lists, code blocks, links preserved]
```

### 3. Verify expected file counts
| Vendor   | Input items | Expected output files |
|----------|------------|---------------------|
| Claude   | 28         | ~27                 |
| DeepSeek | 59         | ~59                 |
| Gemini   | 1816 recs  | ~666 (grouped)      |

### 4. Check special cases

- **DeepSeek thinking blocks**: look for `# Thinking` in output
- **DeepSeek citations**: look for `[citation:N]` patterns
- **Gemini HTML→Markdown**: look for `* ` lists, ` ``` ` code blocks, `**bold**`
- **Cyrillic/Unicode**: all three vendors contain non-ASCII text — verify no garbling
- **Duplicate filenames**: ensure no filename collisions (e.g. `file 1 1.md`)

## Syntax & Import Check

Before committing, verify all modules compile and import cleanly:

```bash
python -m py_compile core/renderer.py core/config.py parsers/registry.py parsers/gemini.py cli.py gui/app.py
python -c "from core import renderer, config; from parsers import registry; from gui import app; print('All imports OK')"
```

## Running the GUI

```bash
python main.py
```

Test the critical path:
1. Select a JSON file — provider should auto-detect
2. Select an output folder
3. Hit Convert — should succeed with file count message
4. Verify files appear in output folder

## Manual Override Testing

Force a wrong provider to test fallback:

```bash
# Force Gemini parser on Claude file (should fail gracefully, try generic_parse)
python cli.py "../Chats/Claude.json" -p gemini -o "/tmp/test_wrong_parser"
```
