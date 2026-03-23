# Testing Guide

This file documents how to test the Omni AI Converter web app. Run these steps after any code changes.

---

## Test Data

All JSON test files are in `../Chats/` (repo root):
- `Claude.json` — Claude export (28 conversations)
- `deepseek.json` — DeepSeek export (59 conversations, has thinking blocks)
- `Google.json` — Google Takeout Gemini (1816 activity records → ~666 grouped)
- `chatGPT.json` — ChatGPT export (598 conversations)

---

# Quick Start
## Web (GitHub Pages)
Open the GitHub Pages URL in any browser.
## Local Development
```bash
python server.py
# Opens http://localhost:8765
# Edit web/ files, refresh browser
```

## Running the Web App

**Development:**
```bash
python server.py
# Opens http://localhost:8765
# Edit web/ files, refresh browser
```

**GitHub Pages:** Open the deployed URL.

---

## Manual Testing

### Quick Test (all vendors)
1. Open `web/index.html` in browser (or the deployed URL)
2. Upload each JSON file and verify conversion

### Verification Steps

#### 1. Provider auto-detection
- Upload `Claude.json` → "Claude" highlighted
- Upload `deepseek.json` → "DeepSeek" highlighted
- Upload `Google.json` → "Gemini" highlighted
- Upload `chatGPT.json` → "ChatGPT" highlighted

#### 2. Thinking checkbox behavior
- Load `Claude.json` → "Include thinking blocks" checkbox is **disabled** (greyed out)
- Load `deepseek.json` → checkbox is **enabled but unchecked** (opt-in)
- Toggle thinking on → verify `# Thinking` blocks appear in output
- Toggle thinking off → verify `# Thinking` blocks disappear

#### 3. Settings
- Toggle all frontmatter fields
- Change heading labels
- Set separator to `---` → rendered as solid line
- Set separator to `***` → rendered as dotted line
- Toggle heading downscale
- Toggle `add_title_as_h1`
- Toggle `user_compact` → empty lines removed from user messages
- Toggle `assistant_compact` → empty lines removed from assistant messages

#### 4. Gemini grouping settings
- Load `Google.json` (30-min gap) → ~666 files
- Set `gemini_keep_ungrouped: true` → ~1816 files
- Adjust `gemini_group_gap_minutes` → verify file count changes

#### 5. Viewer panel
- Click any result card → viewer panel opens
- Toggle between rendered markdown and raw text
- Close button (×) closes panel
- **Drag resize handle** (left edge) → panel width adjusts smoothly

#### 6. Downloads
- Individual file download → correct filename
- "Download All as ZIP" → single `.zip` file containing all `.md` files
- ZIP file opens correctly in file explorer (verify with Google.json ~666 files)

#### 5b. Nested Lists (Gemini)
- Load `Google.json` → look for conversations with nested bullet points
- Verify nested items render with proper indentation (`  ` prefix)
- Viewer should show proper bullet hierarchy (disc → circle → square)

#### 7. Settings persistence
- Change settings, reload page → settings retained

#### 8. Error handling
- Upload invalid JSON → error message shown
- Upload empty file → graceful error

#### 9. Accessibility
- **Keyboard navigation**: Tab to drop zone → press Enter/Space → file dialog opens
- **Screen reader**: Drop zone has proper `role="button"`, `tabindex="0"`, `aria-label`
- **Icon buttons**: Download/close buttons have `aria-label` attributes
- **Decorative SVGs**: Have `aria-hidden="true"` (ignored by screen readers)

---

## Special Cases

- DeepSeek thinking blocks (`# Thinking`)
- DeepSeek citations (`[citation:N]`)
- Gemini HTML→Markdown (`* ` lists, ` ``` ` code, `**bold**`)
- **Nested lists** (Gemini) — proper `  ` indentation, visual hierarchy in viewer
- Cyrillic/Unicode text preserved
- Tables with compact mode (blank line before table preserved)
- No duplicate filenames
- XSS prevention (unsafe links rendered as greyed text)

---

## Regression Checklist

After modifying any parser, renderer, or detector:

- [ ] Provider auto-detection works for all 4 providers
- [ ] Thinking blocks correct in DeepSeek output
- [ ] HTML→Markdown correct in Gemini output
- [ ] Nested lists render correctly (verify with Gemini exports)
- [ ] Heading downscale works (`#` → `##`, `##` → `###`, etc.)
- [ ] Compact mode preserves table formatting
- [ ] Separators render correctly (`---` solid, `***` dotted)
- [ ] Viewer panel renders markdown correctly
- [ ] Viewer panel drag resize works smoothly
- [ ] No duplicate filenames
- [ ] Cyrillic/Unicode not garbled
- [ ] Settings persist across reload
- [ ] Downloads work (individual file)
- [ ] Downloads work (ZIP file — opens correctly, contains all .md files)
- [ ] Large files don't freeze browser
- [ ] XSS prevention works (links with `javascript:` show as greyed out)

---

## Future: Automated Testing

Potential automation options (not implemented yet):

| Approach | Tests | Setup |
|---------|-------|-------|
| **Node.js unit tests** | `converter.js` logic directly | `node tests/converter.test.js` |
| **Playwright** | Full browser UI automation | `npx playwright test` |
| **Jest** | All JS with mocking | `jest tests/` |

To add Node.js tests:
```bash
# Test converter.js directly (no browser needed)
node -e "
const Converter = require('./web/js/converter.js');
const fs = require('fs');
// ... run test assertions
"
```

To add Playwright tests:
```bash
npm install -D @playwright/test
npx playwright install
```
