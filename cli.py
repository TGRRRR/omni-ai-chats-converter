import argparse
import json
import os
import sys
from pathlib import Path

# Fix Windows console encoding
if sys.platform == "win32":
    import io

    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Add parent dir to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from core import detector, renderer
from parsers import registry


def main():
    parser = argparse.ArgumentParser(description="Omni AI Converter - CLI")
    parser.add_argument("input", help="Input JSON file")
    parser.add_argument("-o", "--output", help="Output folder (default: same as input)")
    parser.add_argument(
        "-p",
        "--provider",
        choices=["auto", "claude", "deepseek", "gemini"],
        default="auto",
        help="Provider (default: auto-detect)",
    )
    parser.add_argument("--layout", help="Custom layout config JSON file")
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Print output to stdout instead of writing files",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")

    args = parser.parse_args()

    # Load JSON
    if args.verbose:
        print(f"Loading: {args.input}")

    json_data = detector.load_json_file(args.input)
    if json_data is None:
        print(f"Error: Failed to load JSON from {args.input}", file=sys.stderr)
        sys.exit(1)

    # Detect provider
    if args.provider == "auto":
        detected = detector.detect_provider(json_data)
        print(f"Auto-detected provider: {detected}")
        provider = detected if detected != "unknown" else None
    else:
        provider = args.provider if args.provider != "auto" else None

    # Load layout
    if args.layout:
        with open(args.layout, "r", encoding="utf-8") as f:
            layout = json.load(f)
    else:
        from core import config

        layout = config.load_layout()

    if args.verbose:
        print(f"Using provider: {provider or 'auto'}")
        print(f"Layout: {layout}")

    # Parse
    conversations = registry.parse_json(json_data, provider)

    if not conversations:
        print("Error: No conversations found", file=sys.stderr)
        sys.exit(1)

    print(f"Parsed {len(conversations)} conversation(s)")

    if args.verbose:
        for i, conv in enumerate(conversations):
            print(f"  [{i}] {conv.title} ({len(conv.messages)} messages)")

    # Render
    rendered = renderer.render_conversations(conversations, layout)

    # Output
    if args.stdout:
        for filename, content in rendered:
            print(f"=== {filename} ===")
            print(content)
            print()
    else:
        if args.output:
            output_dir = Path(args.output)
        else:
            input_path = Path(args.input)
            output_dir = input_path.parent / f"{input_path.stem}_converted"

        count = renderer.write_rendered_files(rendered, output_dir)
        print(f"Created {count} file(s) in {output_dir}")


if __name__ == "__main__":
    main()
