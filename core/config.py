import json
import os
from pathlib import Path
from typing import Any


DEFAULT_LAYOUT = {
    "frontmatter": {"title": True, "date": True, "provider": True, "url": True},
    "user_heading": "# Me",
    "assistant_heading": "# Assistant",
    "thinking_heading": "# Thinking",
    "include_thinking": True,
    "separator": "",
    "heading_downscale": True,
    "timestamp_format": "%Y-%m-%d",
    "add_title_as_h1": False,
}


def get_config_dir() -> Path:
    """Get the config directory (same folder as the application)."""
    return Path(__file__).parent.parent


def get_default_layout_path() -> Path:
    """Get path to default layout config file."""
    return get_config_dir() / "default_layout.json"


def load_layout(config_path: Path | None = None) -> dict[str, Any]:
    """Load layout configuration from file, or return defaults."""
    if config_path is None:
        config_path = get_default_layout_path()

    if not config_path.exists():
        return DEFAULT_LAYOUT.copy()

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
        # Merge with defaults to ensure all keys exist
        merged = DEFAULT_LAYOUT.copy()
        merged.update(config)
        # Deep-merge frontmatter so partial saves don't wipe keys
        merged["frontmatter"] = {
            **DEFAULT_LAYOUT["frontmatter"],
            **config.get("frontmatter", {}),
        }
        return merged
    except (json.JSONDecodeError, IOError):
        return DEFAULT_LAYOUT.copy()


def save_layout(layout: dict[str, Any], config_path: Path | None = None) -> bool:
    """Save layout configuration to file."""
    if config_path is None:
        config_path = get_default_layout_path()

    try:
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(layout, f, indent=2)
        return True
    except IOError:
        return False
