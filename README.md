# Omni AI Chats Converter

Convert AI chat exports to Markdown. Client-side, privacy-first — your data never leaves your browser.

**Live demo:** [tgrrrr.github.io/omni-ai-chats-converter](https://tgrrrr.github.io/omni-ai-chats-converter/)

## Supported Providers

| Provider | Auto-detect | Notes |
|----------|:-----------:|-------|
| ChatGPT  | Yes         | conversations.json exports |
| Claude   | Yes         | chat_messages format |
| DeepSeek | Yes         | fragments-based format |
| Gemini   | Yes         | Takeout JSON format |

## Features

- **Auto-detection** — drop a JSON file and the provider is identified automatically
- **YAML frontmatter** — optional title, date, provider, and URL metadata
- **Thinking blocks** — include/exclude DeepSeek and Claude thinking output
- **Custom headings** — configure user, assistant, and thinking section headings
- **Message separators** — `---`, `***`, or none
- **Timestamp formatting** — strftime-style date format
- **Gemini grouping** — group scattered records into conversations with configurable time gap
- **Compact output** — strip blank lines while preserving tables
- **Heading downscale** — shift markdown headings to avoid conflicts
- **Live preview** — built-in markdown viewer with raw/render toggle
- **Bulk ZIP download** — export all conversations at once
- **Dark/light theme** — matches your system preference

## Usage

1. Export your chat history from your AI provider (JSON format)
2. Open the web app
3. Drag and drop the JSON file
4. Adjust settings if needed
5. Click a result to preview, or download individual files / a ZIP

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| User heading | `# Me` | Markdown heading for user messages |
| Assistant heading | `# Assistant` | Markdown heading for assistant messages |
| Thinking heading | `# Thinking` | Markdown heading for thinking blocks |
| Downscale headings | On | Shifts markdown headings down to avoid nesting conflicts |
| Add H1 title | Off | Prepends a `# Title` heading |
| Include thinking | Off | Includes thinking/reasoning blocks |
| Compact user | Off | Strips excess blank lines from user messages |
| Compact assistant | Off | Strips excess blank lines from assistant messages |
| Separator | None | `---` or `***` between message blocks |
| Date format | `%Y-%m-%d` | Timestamp format using strftime placeholders |
| Gemini group gap | 30 min | Time gap threshold for grouping Gemini records |

## Development

No build step required. The app is pure HTML/CSS/JS — just open `web/index.html` in a browser or serve the `web/` directory with any static file server.

```bash
# Quick local server
cd web/
python -m http.server 8080
```

## Deployment

The site is deployed to GitHub Pages via the `gh-pages` branch. Pushing to `main` triggers automatic deployment through GitHub Actions (see `.github/workflows/deploy.yml`).

## License

MIT