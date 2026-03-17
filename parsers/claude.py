import re
from datetime import datetime
from typing import Any

from core.models import Conversation, Message
from parsers.base import BaseParser


PROVIDER_NAME = "claude"


class ClaudeParser(BaseParser):
    """Parser for Claude chat exports."""

    @staticmethod
    def can_parse(json_data: dict | list) -> bool:
        # Handle list of conversations (Claude export format)
        if isinstance(json_data, list):
            for item in json_data:
                if isinstance(item, dict) and "chat_messages" in item:
                    return True
            return False

        # Single conversation dict
        if isinstance(json_data, dict):
            # Has chat_messages
            if "chat_messages" in json_data:
                return True
            # Has messages with sender field
            if "messages" in json_data and isinstance(json_data.get("messages"), list):
                first_msg = json_data["messages"][0]
                if isinstance(first_msg, dict) and "sender" in first_msg:
                    return True
        return False

    def parse(self, json_data: dict | list) -> list[Conversation]:
        """Parse Claude JSON into Conversations."""
        # Normalize to list of conversations
        conversations = []
        if isinstance(json_data, list):
            conversations = json_data
        elif isinstance(json_data, dict):
            # Check for wrapper keys
            for key in ("conversations", "chats", "data", "items"):
                if key in json_data and isinstance(json_data[key], list):
                    conversations = json_data[key]
                    break
            # Single conversation
            if not conversations:
                conversations = [json_data]

        result = []
        for i, conv in enumerate(conversations):
            if not isinstance(conv, dict):
                continue

            conversation = self._parse_conversation(conv, i)
            if conversation:
                result.append(conversation)

        return result

    def _parse_conversation(self, data: dict, index: int) -> Conversation | None:
        """Parse a single conversation."""
        # Extract title
        title = self._extract_title(data)

        # Extract timestamp
        created_at = self._extract_timestamp(data)

        # Extract messages
        messages = self._extract_messages(data)

        if not messages:
            return None

        # Generate ID
        conv_id = f"{PROVIDER_NAME}_{index}_{hash(title) & 0xFFFFFFFF}"

        return Conversation(
            id=conv_id,
            title=title,
            created_at=created_at,
            provider=PROVIDER_NAME,
            messages=messages,
        )

    def _extract_title(self, data: dict) -> str:
        """Extract conversation title from various possible fields."""
        title_fields = ["name", "title", "conversation_title", "subject"]
        for field in title_fields:
            if field in data and data[field]:
                return str(data[field])

        # Try first message for fallback
        messages = self._get_message_list(data)
        if messages:
            first_msg = messages[0]
            if isinstance(first_msg, dict):
                content = self._extract_text(first_msg)
                if content:
                    return f"Conversation {content[:50]}"

        return "Untitled Conversation"

    def _extract_timestamp(self, data: dict) -> datetime | None:
        """Extract creation timestamp."""
        timestamp = data.get("updated_at") or data.get("created_at")
        if timestamp is None:
            return None

        try:
            if isinstance(timestamp, (int, float)):
                return datetime.fromtimestamp(timestamp)
            # Handle ISO string (truncate to date portion)
            ts_str = str(timestamp)[:10]
            return datetime.strptime(ts_str, "%Y-%m-%d")
        except (ValueError, OSError):
            return None

    def _get_message_list(self, data: dict) -> list:
        """Extract message list from various possible fields."""
        message_fields = ["chat_messages", "messages", "conversation", "history"]
        for field in message_fields:
            if field in data and isinstance(data[field], list):
                return data[field]
        return []

    def _extract_messages(self, data: dict) -> list[Message]:
        """Extract messages from conversation data."""
        raw_messages = self._get_message_list(data)
        messages = []

        for raw_msg in raw_messages:
            if not isinstance(raw_msg, dict):
                continue

            role = self._extract_role(raw_msg)
            content = self._extract_text(raw_msg)

            if not content:
                continue

            timestamp = self._extract_message_timestamp(raw_msg)

            messages.append(Message(role=role, content=content, timestamp=timestamp))

        return messages

    def _extract_role(self, msg: dict) -> str:
        """Extract message role from various possible fields."""
        sender_fields = ["sender", "role", "author", "from"]
        for field in sender_fields:
            if field in msg:
                value = str(msg[field]).lower()
                if value in ("human", "user"):
                    return "user"
                elif value in ("assistant", "ai", "assistant_message", "ai_message"):
                    return "assistant"
                elif value in ("system",):
                    return "system"
        return "assistant"  # Default to assistant

    def _extract_text(self, msg: dict) -> str:
        """Extract text content from message."""
        text_fields = ["text", "content", "message", "body"]
        for field in text_fields:
            if field not in msg:
                continue

            text = msg[field]

            # Handle nested dict with 'text' key
            if isinstance(text, dict) and "text" in text:
                text = text["text"]

            # Handle list of parts
            elif isinstance(text, list):
                text_parts = []
                for part in text:
                    if isinstance(part, dict) and "text" in part:
                        text_parts.append(part["text"])
                    elif isinstance(part, str):
                        text_parts.append(part)
                text = "\n".join(text_parts)

            if text:
                return str(text)

        return ""

    def _extract_message_timestamp(self, msg: dict) -> datetime | None:
        """Extract message timestamp."""
        timestamp = msg.get("create_time") or msg.get("timestamp")
        if timestamp is None:
            return None

        try:
            if isinstance(timestamp, (int, float)):
                return datetime.fromtimestamp(timestamp)
        except (ValueError, OSError):
            pass
        return None
