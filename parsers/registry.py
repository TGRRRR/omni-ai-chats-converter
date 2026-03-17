from core.models import Conversation
from parsers.base import BaseParser
from parsers import claude, deepseek, gemini


PARSERS: list[BaseParser] = [
    claude.ClaudeParser(),
    deepseek.DeepSeekParser(),
    gemini.GeminiParser(),
]


def get_parser(provider: str) -> BaseParser | None:
    """Get parser instance by provider name."""
    provider_map = {
        "claude": claude.ClaudeParser,
        "deepseek": deepseek.DeepSeekParser,
        "gemini": gemini.GeminiParser,
    }
    parser_class = provider_map.get(provider.lower())
    if parser_class:
        return parser_class()
    return None


def get_all_parsers() -> list[BaseParser]:
    """Get all available parsers."""
    return PARSERS


def parse_json(
    json_data: dict | list, provider: str | None = None
) -> list[Conversation]:
    """
    Parse JSON data using the appropriate parser.

    Args:
        json_data: The parsed JSON
        provider: Optional provider hint. If None, auto-detects.

    Returns:
        List of Conversations
    """
    # Try specified provider first
    if provider and provider != "unknown":
        parser = get_parser(provider)
        if parser and parser.can_parse(json_data):
            return parser.parse(json_data)

    # Try each parser in order
    for parser in PARSERS:
        if parser.can_parse(json_data):
            return parser.parse(json_data)

    # Fallback: try to parse generically
    return generic_parse(json_data)


def generic_parse(json_data: dict | list) -> list[Conversation]:
    """
    Generic parsing attempt for unknown formats.
    Tries to extract conversations from any JSON structure.
    """
    from core.models import Message

    conversations = []

    # Normalize to list
    items = []
    if isinstance(json_data, list):
        items = json_data
    elif isinstance(json_data, dict):
        # Try common wrapper keys
        for key in ("conversations", "chats", "data", "items", "results"):
            if key in json_data and isinstance(json_data[key], list):
                items = json_data[key]
                break
        if not items:
            items = [json_data]

    for i, item in enumerate(items):
        if not isinstance(item, dict):
            continue

        # Try to extract messages
        messages = []
        msg_list = (
            item.get("messages") or item.get("chat_messages") or item.get("history")
        )

        if msg_list and isinstance(msg_list, list):
            for msg in msg_list:
                if not isinstance(msg, dict):
                    continue

                # Try to get role and content
                role = (
                    msg.get("role")
                    or msg.get("sender")
                    or msg.get("author", "assistant")
                )
                content = (
                    msg.get("content") or msg.get("text") or msg.get("message", "")
                )

                if content:
                    if role in ("human", "user"):
                        role = "user"
                    else:
                        role = "assistant"

                    messages.append(Message(role=role, content=str(content)))

        if messages:
            title = item.get("title") or item.get("name") or f"Conversation {i + 1}"

            conversations.append(
                Conversation(
                    id=f"unknown_{i}_{hash(title) & 0xFFFFFFFF}",
                    title=str(title),
                    created_at=None,
                    provider="unknown",
                    messages=messages,
                )
            )

    return conversations
