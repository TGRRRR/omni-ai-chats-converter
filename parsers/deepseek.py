import re
from datetime import datetime

from core.models import Conversation, Message
from parsers.base import BaseParser


PROVIDER_NAME = "deepseek"


class DeepSeekParser(BaseParser):
    """Parser for DeepSeek chat exports."""

    @staticmethod
    def can_parse(json_data: dict | list) -> bool:
        # Handle list of conversations
        if isinstance(json_data, list):
            for item in json_data:
                if (
                    isinstance(item, dict)
                    and "mapping" in item
                    and isinstance(item.get("mapping"), dict)
                ):
                    return True
            return False

        # Single conversation dict
        if isinstance(json_data, dict):
            # Has mapping (DeepSeek's signature structure)
            if "mapping" in json_data and isinstance(json_data.get("mapping"), dict):
                return True
        return False

    def parse(self, json_data: dict | list) -> list[Conversation]:
        """Parse DeepSeek JSON into Conversations."""
        # Normalize to list of conversations
        conversations = []
        if isinstance(json_data, list):
            conversations = json_data
        elif isinstance(json_data, dict):
            # Check for wrapper keys
            for key in ("chats", "conversations"):
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
        title = data.get("title", f"Untitled {index}")

        # Extract timestamp
        created_at = self._extract_timestamp(data)

        # Extract messages from mapping
        messages = self._extract_messages_from_mapping(data)

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

    def _extract_timestamp(self, data: dict) -> datetime | None:
        """Extract creation timestamp."""
        timestamp = data.get("create_time") or data.get("inserted_at")
        if timestamp is None:
            return None

        try:
            if isinstance(timestamp, (int, float)):
                return datetime.fromtimestamp(timestamp)
            # Handle ISO string
            ts_str = str(timestamp).replace("T", " ").split(".")[0]
            return datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
        except (ValueError, OSError):
            return None

    def _extract_messages_from_mapping(self, data: dict) -> list[Message]:
        """Extract messages from DeepSeek's mapping structure."""
        mapping = data.get("mapping", {})
        if not isinstance(mapping, dict):
            return []

        # Sort by numeric ID to ensure chronological order
        def get_sort_key(item):
            key, _ = item
            match = re.search(r"\d+", key)
            return int(match.group()) if match else 0

        sorted_items = sorted(mapping.items(), key=get_sort_key)

        messages = []
        for msg_id, msg_data in sorted_items:
            if not isinstance(msg_data, dict) or msg_id == "root":
                continue

            message = msg_data.get("message")
            if not message or not isinstance(message, dict):
                continue

            # Extract fragments (DeepSeek's message parts)
            fragments = message.get("fragments", [])

            # Fallback for older exports without fragments
            if not fragments and "content" in message:
                role = message.get("author", {}).get("role", "unknown")
                msg_type = "REQUEST" if role == "user" else "RESPONSE"
                fragments = [{"type": msg_type, "content": message["content"]}]

            for fragment in fragments:
                if not isinstance(fragment, dict):
                    continue

                msg_type = fragment.get("type", "TEXT").upper()
                content = fragment.get("content", "")

                if not content or not content.strip():
                    continue

                # Determine role from fragment type
                if msg_type in ("REQUEST",):
                    role = "user"
                elif msg_type in ("RESPONSE",):
                    role = "assistant"
                elif msg_type in ("THINK", "THOUGHT", "REASONING", "CHAIN_OF_THOUGHT"):
                    role = "thinking"
                else:
                    role = "assistant"

                timestamp = self._extract_message_timestamp(message)

                messages.append(
                    Message(role=role, content=str(content), timestamp=timestamp)
                )

        return messages

    def _extract_message_timestamp(self, msg: dict) -> datetime | None:
        """Extract message timestamp."""
        timestamp = msg.get("create_time")
        if timestamp is None:
            return None

        try:
            if isinstance(timestamp, (int, float)):
                return datetime.fromtimestamp(timestamp)
        except (ValueError, OSError):
            pass
        return None
