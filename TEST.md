# Testing Guide

This file documents how to test the Omni AI Converter. Run these steps after any code changes.

## Test Data

All JSON test files are in `../Chats/` (repo root):
- `Claude.json` — Claude export (28 conversations)
- `deepseek.json` — DeepSeek export (59 conversations, has thinking blocks)
- `Google.json` — Google Takeout Gemini (1816 activity records → ~666 grouped)
- `chatGPT.json` — ChatGPT export (598 conversations)

Export outputs go to `../Exports/{Claude,Deepseek,Google}/`.

---

## Python CLI Tests (legacy — reference implementation)

### Quick Test (all vendors)

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

### Verification Steps

**1. Check CLI output** — no errors.

**2. Spot-check output files** — one per vendor:

```
Claude — YAML frontmatter with date + provider, # Me / # Assistant headings
DeepSeek — same + # Thinking blocks, [citation:N] patterns
Gemini — grouped multi-turn, HTML→Markdown lists/code/bold
```

**3. Verify expected file counts:**

| Vendor   | Input items | Expected output files |
|----------|-------------|---------------------|
| Claude   | 28         | ~27                 |
| DeepSeek | 59         | ~59                 |
| Gemini   | 1816 recs  | ~666 (grouped)      |

**4. Special cases:**
- DeepSeek thinking blocks (`# Thinking`)
- DeepSeek citations (`[citation:N]`)
- Gemini HTML→Markdown (`* ` lists, ` ``` ` code blocks, `**bold**`)
- Cyrillic/Unicode text
- No duplicate filenames (e.g. `file 1 1.md`)

### Syntax & Import Check

```bash
python -m py_compile core/renderer.py core/config.py parsers/registry.py parsers/gemini.py cli.py gui/app.py
python -c "from core import renderer, config; from parsers import registry; from gui import app; print('All imports OK')"
```

---

## Web App Tests (main implementation)

### Running the web app

**Development:**
```bash
python server.py
# Opens http://localhost:8765
# Edit web/ files, refresh browser
```

**GitHub Pages:** Open the deployed URL.

### Quick Test (all vendors)

1. Open `web/index.html` in browser
2. Upload each JSON file and verify conversion

### Verification Steps

**1. Provider auto-detection**
- Upload `Claude.json` → "Claude" highlighted
- Upload `deepseek.json` → "DeepSeek" highlighted
- Upload `Google.json` → "Gemini" highlighted

**2. Thinking checkbox behavior**
- Load `Claude.json` → "Include thinking blocks" checkbox is **disabled** (greyed out), label says "(not available for this file)"
- Load `deepseek.json` → "Include thinking blocks" checkbox is **enabled**, label says "(DeepSeek)"
- Toggle thinking off → verify `# Thinking` blocks disappear from output
- Toggle thinking on → verify `# Thinking` blocks present in output

**3. Manual override**
- Load `deepseek.json`, manually switch to "Claude" → conversion still works (parser falls through to generic_parse)
- Or: force a wrong provider, verify graceful handling

**4. Unknown format handling**
- Load a JSON file that doesn't match any parser → warning banner "Unknown format — manual provider selection required" appears
- User selects a provider → conversion proceeds
- Generic parse is **never called automatically**

**5. Settings**
- Toggle all frontmatter fields
- Change heading labels
- Toggle separator
- Toggle heading downscale
- Toggle `add_title_as_h1`
- Verify each change reflected in output

**6. Gemini grouping settings**
- Load `Google.json` with default settings (30-min gap) → ~666 files
- Set `gemini_keep_ungrouped: true` → ~1816 files (one per record)
- Set `gemini_group_gap_minutes` to 5 → more files (stricter grouping)
- Set `gemini_group_gap_minutes` to 120 → fewer files (looser grouping)

**7. Downloads**
- Individual file download → file saves with correct name
- "Download All as ZIP" → single ZIP with all .md files, correct filenames

**8. Settings persistence**
- Change settings, reload page → settings retained from localStorage

**9. Large file performance**
- Load `Google.json` (1816 records) → should not hang browser
- Loading indicator visible during parse

**10. Error handling**
- Upload invalid JSON → error message shown, no crash
- Upload empty file → graceful error

### Output Comparison (web vs CLI)

Web output must match CLI output for the same layout settings. Compare:

| Check | Claude | DeepSeek | Gemini |
|-------|--------|----------|--------|
| Frontmatter fields | ✓ | ✓ | ✓ |
| Heading labels | ✓ | ✓ | ✓ |
| Thinking blocks | N/A | ✓ | N/A |
| Thinking toggle | N/A | ✓ | N/A |
| HTML→Markdown quality | — | — | ✓ |
| Cyrillic/Unicode | ✓ | ✓ | ✓ |
| File count (default) | ✓ | ✓ | ✓ |
| File count (ungrouped) | — | — | ✓ |

---

## Regression Checklist (after any change)

After modifying any parser, renderer, or detector:

- [ ] All Python CLI tests still pass
- [ ] All web app tests still pass
- [ ] Thinking blocks correct in DeepSeek output
- [ ] HTML→Markdown correct in Gemini output (lists, code, bold, links)
- [ ] No duplicate filenames
- [ ] Cyrillic/Unicode not garbled
- [ ] Settings persist across page reload
