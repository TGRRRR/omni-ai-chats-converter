from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Message:
    """Represents a single message in a conversation."""

    role: str  # "user" | "assistant" | "system" | "thinking"
    content: str  # The message content (already converted to markdown)
    timestamp: Optional[datetime] = None

    def __post_init__(self):
        if self.role not in ("user", "assistant", "system", "thinking"):
            self.role = "assistant"


@dataclass
class Conversation:
    """Represents a complete conversation from any AI provider."""

    id: str
    title: str
    created_at: Optional[datetime]
    provider: str  # "claude" | "deepseek" | "gemini" | "chatgpt" | etc.
    messages: list[Message] = field(default_factory=list)
    url: Optional[str] = None  # Source URL if available

    def __post_init__(self):
        if not self.id:
            self.id = f"{self.provider}_{hash(self.title)}"
