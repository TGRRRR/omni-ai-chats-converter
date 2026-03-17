import json
from typing import Optional


PROVIDER_DEEPSEEK = "deepseek"
PROVIDER_CLAUDE = "claude"
PROVIDER_GEMINI = "gemini"
PROVIDER_CHATGPT = "chatgpt"
PROVIDER_UNKNOWN = "unknown"


def detect_provider(json_data: dict | list) -> str:
    """
    Auto-detect the provider from JSON structure.
    Returns provider string or PROVIDER_UNKNOWN if detection fails.
    """
    if isinstance(json_data, list):
        # For lists, check first item
        if json_data:
            return _detect_from_item(json_data[0])
        return PROVIDER_UNKNOWN

    if isinstance(json_data, dict):
        # Check for DeepSeek's mapping structure
        if "mapping" in json_data and isinstance(json_data.get("mapping"), dict):
            return PROVIDER_DEEPSEEK

        # Check for Claude/ChatGPT style with chat_messages
        if "chat_messages" in json_data and isinstance(
            json_data["chat_messages"], list
        ):
            return PROVIDER_CLAUDE

        # Check for Claude/ChatGPT with messages array
        if "messages" in json_data and isinstance(json_data["messages"], list):
            first_msg = json_data["messages"][0] if json_data["messages"] else {}
            if isinstance(first_msg, dict) and "sender" in first_msg:
                return PROVIDER_CLAUDE
            if isinstance(first_msg, dict) and "role" in first_msg:
                return PROVIDER_CHATGPT

        # Check for wrapper keys
        for key in ("conversations", "chats", "data", "items"):
            if key in json_data and isinstance(json_data[key], list):
                return detect_provider(json_data[key])

        # Check for Gemini Takeout (MyActivity style)
        if _looks_like_gemini_takeout(json_data):
            return PROVIDER_GEMINI

    return PROVIDER_UNKNOWN


def _detect_from_item(item: dict) -> str:
    """Detect provider from a single conversation/item."""
    if not isinstance(item, dict):
        return PROVIDER_UNKNOWN

    # DeepSeek: has mapping
    if "mapping" in item and isinstance(item.get("mapping"), dict):
        return PROVIDER_DEEPSEEK

    # Claude: has chat_messages
    if "chat_messages" in item:
        return PROVIDER_CLAUDE

    # Check messages for role/sender
    messages = item.get("messages", [])
    if messages and isinstance(messages[0], dict):
        first_msg = messages[0]
        if "sender" in first_msg:
            return PROVIDER_CLAUDE
        if "role" in first_msg:
            return PROVIDER_CHATGPT

    # Gemini Takeout record
    if _looks_like_gemini_takeout(item):
        return PROVIDER_GEMINI

    return PROVIDER_UNKNOWN


def _looks_like_gemini_takeout(data: dict) -> bool:
    """Check if data looks like Google Takeout Gemini export."""
    if isinstance(data, dict):
        # Check header or products for Gemini/Bard
        header = data.get("header", "")
        products = data.get("products", [])
        title_url = data.get("titleUrl", "")

        if "Gemini" in header or "Bard" in header:
            return True
        if isinstance(products, list):
            for p in products:
                if "Gemini" in str(p) or "Bard" in str(p):
                    return True
        if "gemini.google.com" in title_url:
            return True
        # Has safeHtmlItem indicates Gemini response
        if "safeHtmlItem" in data:
            return True

    return False


def load_json_file(file_path: str) -> Optional[dict | list]:
    """Load and parse a JSON file."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError, UnicodeDecodeError):
        return None


def detect_provider_from_file(file_path: str) -> str:
    """Detect provider from a JSON file."""
    data = load_json_file(file_path)
    if data is None:
        return PROVIDER_UNKNOWN
    return detect_provider(data)


PROVIDER_DISPLAY_NAMES = {
    PROVIDER_DEEPSEEK: "DeepSeek",
    PROVIDER_CLAUDE: "Claude",
    PROVIDER_GEMINI: "Gemini",
    PROVIDER_CHATGPT: "ChatGPT",
    PROVIDER_UNKNOWN: "Unknown",
}
