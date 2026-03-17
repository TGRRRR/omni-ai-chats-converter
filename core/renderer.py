import re
from core.models import Conversation, Message


def downscale_headings(text: str) -> str:
    """Increase heading level by 1 (e.g., # → ##, ## → ###)."""
    return re.sub(r"^(#{1,5})(?=\s)", r"#\1", text, flags=re.MULTILINE)


def has_h1(text: str) -> bool:
    """Check if text contains an H1 heading (# at start of line)."""
    return bool(re.search(r"^#(?=\s)", text, re.MULTILINE))


def render_message(message: Message, layout: dict) -> str:
    """Render a single message to Markdown."""
    # Select heading based on role
    if message.role == "user":
        heading = layout.get("user_heading", "# Me")
    elif message.role == "thinking":
        heading = layout.get("thinking_heading", "# Thinking")
    else:  # assistant or system
        heading = layout.get("assistant_heading", "# Assistant")

    # Content (with heading downscaling if enabled and content has H1)
    content = message.content
    if message.role == "assistant" and layout.get("heading_downscale", True):
        if has_h1(content):
            content = downscale_headings(content)

    return f"{heading}\n{content}"


def render_conversation(conversation: Conversation, layout: dict) -> str:
    """Render a single conversation to Markdown string."""
    output = []

    # YAML Frontmatter
    frontmatter = layout.get("frontmatter", {})
    if any(frontmatter.values()):
        output.append("---\n")
        if frontmatter.get("title"):
            title_escaped = conversation.title.replace('"', '""')
            output.append(f'title: "{title_escaped}"\n')
        if frontmatter.get("date") and conversation.created_at:
            date_format = layout.get("timestamp_format", "%Y-%m-%d")
            date_str = conversation.created_at.strftime(date_format)
            output.append(f"date: {date_str}\n")
        if frontmatter.get("provider"):
            output.append(f"provider: {conversation.provider}\n")
        if frontmatter.get("url") and conversation.url:
            output.append(f"url: {conversation.url}\n")
        output.append("---\n\n")

    # Conversation title (optional)
    if layout.get("add_title_as_h1", False):
        output.append(f"# {conversation.title}\n")

    # Messages
    include_thinking = layout.get("include_thinking", True)
    separator = layout.get("separator", "")

    for i, message in enumerate(conversation.messages):
        # Skip thinking if disabled
        if message.role == "thinking" and not include_thinking:
            continue

        rendered = render_message(message, layout)
        output.append(rendered)

        # Separator between messages (but not after the last one)
        if separator and i < len(conversation.messages) - 1:
            next_msg = conversation.messages[i + 1]
            if next_msg.role != "thinking" or include_thinking:
                output.append(f"\n{separator}\n")
        else:
            output.append("\n")

    return "".join(output)


def render_conversations(
    conversations: list[Conversation], layout: dict
) -> list[tuple[str, str]]:
    """
    Render multiple conversations to Markdown.
    Returns a list of (filename, content) tuples.
    """
    results = []
    used_titles = {}

    for conversation in conversations:
        content = render_conversation(conversation, layout)

        # Generate filename from title
        base_filename = sanitize_filename(conversation.title) + ".md"
        filename = get_unique_filename(base_filename, used_titles)
        used_titles[filename] = True

        results.append((filename, content))

    return results


def sanitize_filename(name: str) -> str:
    """Sanitize a string to be used as a valid filename."""
    # Remove invalid filesystem characters
    name = re.sub(r'[<>:"/\\|?*]', "", name)
    # Remove control characters
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
    # Normalize whitespace
    name = re.sub(r"\s+", " ", name).strip()
    # Truncate to reasonable length
    if len(name) > 150:
        name = name[:147] + "..."
    return name or "Untitled"


def get_unique_filename(base: str, used: dict) -> str:
    """Get a unique filename by appending a counter if needed."""
    if base not in used:
        return base

    base_name, ext = (
        os.path.splitext(base) if "os" in globals() else (base.rsplit(".", 1)[0], ".md")
    )
    counter = 1
    while f"{base_name} {counter}{ext}" in used:
        counter += 1
    return f"{base_name} {counter}{ext}"


import os
