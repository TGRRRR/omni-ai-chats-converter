import re
from datetime import datetime
from typing import Any, Optional

from core.models import Conversation, Message
from parsers.base import BaseParser


PROVIDER_NAME = "gemini"


def html_to_markdown(html_content) -> str:
    """Convert HTML content to Markdown using html2text."""
    # Handle list format (Google Takeout sometimes wraps in list)
    if isinstance(html_content, list):
        if html_content and isinstance(html_content[0], dict):
            html_content = html_content[0].get("html", "")
        else:
            html_content = ""

    if not html_content:
        return ""

    try:
        import html2text

        h = html2text.HTML2Text()
        h.body_width = 0
        h.protect_links = True
        h.wrap_links = False
        h.unicode_snob = True
        h.escape_snob = True
        h.ignore_emphasis = False
        h.ignore_links = False
        h.ignore_images = False

        # Pre-process HTML
        html_content = html_content.replace("</p><p>", "</p>\n\n<p>")
        html_content = html_content.replace("<br>", "\n")
        html_content = html_content.replace("<br/>", "\n")
        html_content = html_content.replace("<br />", "\n")

        markdown = h.handle(html_content)

        # Post-process
        markdown = re.sub(r"\n{3,}", "\n\n", markdown)
        markdown = re.sub(r"[ \t]+\n", "\n", markdown)
        markdown = re.sub(r"^\s*\n", "", markdown)

        return markdown.strip()
    except ImportError:
        # Fallback: simple regex strip
        return strip_html_to_text(html_content)


def strip_html_to_text(html: str) -> str:
    """Simple HTML to text conversion without html2text."""
    if not html:
        return ""

    # Remove script and style tags with their content
    html = re.sub(
        r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE
    )
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)

    # Replace common block elements with newlines
    for tag in ["p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr"]:
        html = re.sub(f"</{tag}>", "\n", html, flags=re.IGNORECASE)
        html = re.sub(f"<{tag}[^>]*>", "\n", html, flags=re.IGNORECASE)

    # Strip remaining HTML tags
    text = re.sub(r"<[^>]+>", "", html)

    # Clean up whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)

    return text.strip()


class GeminiParser(BaseParser):
    """Parser for Google Takeout Gemini exports."""

    @staticmethod
    def can_parse(json_data: dict | list) -> bool:
        # Handle list of records (Google Takeout format)
        if isinstance(json_data, list):
            for item in json_data:
                if isinstance(item, dict):
                    header = item.get("header", "")
                    products = item.get("products", [])
                    title_url = item.get("titleUrl", "")

                    if "Gemini" in header or "Bard" in header:
                        return True
                    if isinstance(products, list):
                        for p in products:
                            if "Gemini" in str(p) or "Bard" in str(p):
                                return True
                    if "gemini.google.com" in title_url:
                        return True
                    if "safeHtmlItem" in item:
                        return True
            return False

        # Single record dict
        if isinstance(json_data, dict):
            # Check for Gemini Takeout structure
            header = json_data.get("header", "")
            products = json_data.get("products", [])
            title_url = json_data.get("titleUrl", "")

            if "Gemini" in header or "Bard" in header:
                return True
            if isinstance(products, list):
                for p in products:
                    if "Gemini" in str(p) or "Bard" in str(p):
                        return True
            if "gemini.google.com" in title_url:
                return True
            if "safeHtmlItem" in json_data:
                return True
        return False

    def parse(self, json_data: dict | list) -> list[Conversation]:
        """Parse Gemini Takeout JSON into Conversations."""
        # Gemini Takeout comes as a list of activity records
        # We need to group them into conversations

        if not isinstance(json_data, list):
            json_data = [json_data]

        # Filter to only Gemini records
        records = [r for r in json_data if self._is_gemini_record(r)]

        if not records:
            return []

        # Parse each record as messages, then group into conversations
        messages = []
        for record in records:
            msgs = self._parse_record(record)
            messages.extend(msgs)

        if not messages:
            return []

        # Sort by timestamp
        messages.sort(key=lambda m: m.timestamp or datetime.min)

        # Group into conversations based on time gaps (30 min default)
        conversations = self._group_into_conversations(messages)

        result = []
        for i, conv_messages in enumerate(conversations):
            if not conv_messages:
                continue

            # Extract title from first message
            title = self._extract_title_from_messages(conv_messages)

            # Get timestamp from first message
            created_at = conv_messages[0].timestamp

            conv_id = f"{PROVIDER_NAME}_{i}_{hash(title) & 0xFFFFFFFF}"

            result.append(
                Conversation(
                    id=conv_id,
                    title=title,
                    created_at=created_at,
                    provider=PROVIDER_NAME,
                    messages=conv_messages,
                )
            )

        return result

    def _is_gemini_record(self, record: dict) -> bool:
        """Check if record is a Gemini record."""
        header = record.get("header", "")
        products = record.get("products", [])
        title_url = record.get("titleUrl", "")

        if "Gemini" in header or "Bard" in header:
            return True
        if isinstance(products, list):
            for p in products:
                if "Gemini" in str(p) or "Bard" in str(p):
                    return True
        if "gemini.google.com" in title_url:
            return True
        return False

    def _parse_record(self, record: dict) -> list[Message]:
        """Parse a single Takeout record into Messages (user + assistant)."""
        messages = []

        # Extract user prompt (title field, cleaned)
        prompt = record.get("title", "")
        prompt = re.sub(r"^Prompted\s+", "", prompt, flags=re.IGNORECASE)
        prompt = re.sub(r"^Asked\s+", "", prompt, flags=re.IGNORECASE)
        prompt = re.sub(r"^Search\s+", "", prompt, flags=re.IGNORECASE)
        prompt = prompt.strip()

        # Extract timestamp
        timestamp = self._parse_timestamp(record.get("time"))

        # Extract Gemini response (HTML)
        response_html = record.get("safeHtmlItem", "")
        response = html_to_markdown(response_html) if response_html else ""

        # Add user message if there's a prompt
        if prompt:
            messages.append(Message(role="user", content=prompt, timestamp=timestamp))

        # Add assistant message if there's a response
        if response:
            messages.append(
                Message(role="assistant", content=response, timestamp=timestamp)
            )

        return messages

    def _parse_timestamp(self, ts_str: str) -> Optional[datetime]:
        """Parse ISO timestamp string."""
        if not ts_str:
            return None

        formats = [
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S.%f%z",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%d %H:%M:%S",
        ]

        ts_str = ts_str.replace("Z", "+00:00")

        for fmt in formats:
            try:
                return (
                    datetime.fromisoformat(ts_str)
                    if "+" in ts_str
                    else datetime.strptime(ts_str, fmt)
                )
            except (ValueError, TypeError):
                continue

        return None

    def _group_into_conversations(
        self, messages: list[Message], gap_minutes: int = 30
    ) -> list[list[Message]]:
        """Group messages into conversations based on time gaps."""
        if not messages:
            return []

        conversations = []
        current_conv = [messages[0]]

        for i in range(1, len(messages)):
            prev_msg = messages[i - 1]
            curr_msg = messages[i]

            if prev_msg.timestamp and curr_msg.timestamp:
                gap = curr_msg.timestamp - prev_msg.timestamp
                if gap.total_seconds() > gap_minutes * 60:
                    # New conversation
                    conversations.append(current_conv)
                    current_conv = [curr_msg]
                else:
                    current_conv.append(curr_msg)
            else:
                # No timestamp, just add to current
                current_conv.append(curr_msg)

        # Don't forget the last conversation
        if current_conv:
            conversations.append(current_conv)

        return conversations

    def _extract_title_from_messages(self, messages: list[Message]) -> str:
        """Extract conversation title from messages."""
        # Use first user message as title, truncated
        for msg in messages:
            if msg.role == "user":
                content = msg.content.strip()
                if len(content) > 60:
                    content = content[:57] + "..."
                return content or "Untitled Conversation"

        return "Untitled Conversation"
