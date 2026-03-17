from abc import ABC, abstractmethod
from core.models import Conversation


class BaseParser(ABC):
    """Abstract base class for all parsers."""

    @abstractmethod
    def parse(self, json_data: dict | list) -> list[Conversation]:
        """
        Parse JSON data into Conversation objects.

        Args:
            json_data: The parsed JSON (dict or list)

        Returns:
            List of Conversation objects
        """
        pass

    @staticmethod
    @abstractmethod
    def can_parse(json_data: dict | list) -> bool:
        """
        Check if this parser can handle the given JSON structure.

        Args:
            json_data: The parsed JSON (dict or list)

        Returns:
            True if this parser can handle the data
        """
        pass
