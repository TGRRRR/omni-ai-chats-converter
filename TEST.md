# Testing Guide

This file documents how to test the Omni AI Converter web app. Run these steps after any code changes.

## Test Data

All JSON test files are in `../Chats/` (repo root):
- `Claude.json` — Claude export (28 conversations)
- `deepseek.json` — DeepSeek export (59 conversations, has thinking blocks)
- `Google.json` — Google Takeout Gemini (1816 activity records → ~666 grouped)
- `chatGPT.json` — ChatGPT export (598 conversations)

---

## Running the Web App

**Development:**
```bash
python server.py
# Opens http://localhost:8765
# Edit web/ files, refresh browser
```

**GitHub Pages:** Open the deployed URL.

---

## Quick Test (all vendors)

1. Open `web/index.html` in browser (or the deployed URL)
2. Upload each JSON file and verify conversion

---

## Verification Steps

### 1. Provider auto-detection
- Upload `Claude.json` → "Claude" highlighted
- Upload `deepseek.json` → "DeepSeek" highlighted
- Upload `Google.json` → "Gemini" highlighted
- Upload `chatGPT.json` → "ChatGPT" highlighted

### 2. Thinking checkbox behavior
- Load `Claude.json` → "Include thinking blocks" checkbox is **disabled** (greyed out), label says "(not available for this file)"
- Load `deepseek.json` → "Include thinking blocks" checkbox is **enabled but unchecked** (opt-in), label says "(DeepSeek)"
- Toggle thinking on → verify `# Thinking` blocks present in output
- Toggle thinking off → verify `# Thinking` blocks disappear from output

### 3. Manual override
- Load a file, manually switch provider → conversion still works

### 4. Unknown format handling
- Load a JSON file that doesn't match any parser → warning banner "Unknown format — manual provider selection required" appears
- User selects a provider → conversion proceeds

### 5. Settings
- Toggle all frontmatter fields
- Change heading labels
- Set separator to `---` → rendered as solid line in viewer
- Set separator to `***` → rendered as dotted line in viewer
- Toggle heading downscale
- Toggle `add_title_as_h1`
- Toggle `user_compact` → empty lines removed from user messages
- Toggle `assistant_compact` → empty lines removed from assistant messages
- Verify each change reflected in output

### 6. Gemini grouping settings
- Load `Google.json` with default settings (30-min gap) → ~666 files
- Set `gemini_keep_ungrouped: true` → ~1816 files (one per record)
- Set `gemini_group_gap_minutes` to 5 → more files (stricter grouping)
- Set `gemini_group_gap_minutes` to 120 → fewer files (looser grouping)

### 7. Viewer panel
- Click any result card → viewer panel opens on right
- Viewer shows rendered markdown by default
- Toggle button switches between rendered preview and raw markdown text
- Close button (×) closes viewer panel
- Compact mode changes visible in viewer immediately

### 8. Downloads
- Individual file download → file saves with correct name
- "Download All as ZIP" → single ZIP with all .md files, correct filenames

### 9. Settings persistence
- Change settings, reload page → settings retained from localStorage

### 10. Large file performance
- Load `Google.json` (1816 records) → should not hang browser
- Loading indicator visible during parse

### 11. Error handling
- Upload invalid JSON → error message shown, no crash
- Upload empty file → graceful error

---

## Special Cases to Check

- DeepSeek thinking blocks (`# Thinking`)
- DeepSeek citations (`[citation:N]`)
- Gemini HTML→Markdown (`* ` lists, ` ``` ` code blocks, `**bold**`)
- Cyrillic/Unicode text
- Tables render correctly with compact mode (blank line preserved before table)
- Compact mode removes empty lines but preserves paragraph structure
- No duplicate filenames

---

## Regression Checklist (after any change)

- [ ] Provider auto-detection works for all 4 providers
- [ ] Thinking blocks correct in DeepSeek output
- [ ] HTML→Markdown correct in Gemini output (lists, code, bold, links)
- [ ] Heading downscale works correctly (`#` → `##`, `##` → `###`, etc.)
- [ ] Compact mode removes empty lines but preserves table formatting
- [ ] Separator renders correctly (`---` solid, `***` dotted)
- [ ] Viewer panel renders markdown (YAML, headings, code, tables)
- [ ] No duplicate filenames
- [ ] Cyrillic/Unicode not garbled
- [ ] Settings persist across page reload
- [ ] Downloads work (individual files and ZIP)
- [ ] Large files don't freeze the browser
