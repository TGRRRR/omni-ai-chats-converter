import os
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from pathlib import Path
from typing import Optional

from core import config, detector, renderer
from parsers import registry


PROVIDERS = [
    ("Auto-detect", "auto"),
    ("Claude", "claude"),
    ("DeepSeek", "deepseek"),
    ("Gemini", "gemini"),
]


class OmniConverterApp:
    """Main application window."""

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Omni AI Converter")
        self.root.geometry("700x600")
        self.root.resizable(True, True)

        # State
        self.input_file: str = ""
        self.output_folder: str = ""
        self.selected_provider: str = "auto"
        self.layout = config.load_layout()
        self.detected_provider: str = "unknown"

        # Create UI
        self._create_widgets()
        self._layout_widgets()

    def _create_widgets(self):
        """Create all widgets."""
        # Main container with paned window
        self.main_paned = ttk.PanedWindow(self.root, orient=tk.HORIZONTAL)
        self.main_paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Left panel - Provider selection
        left_frame = ttk.LabelFrame(self.main_paned, text="Provider", padding=10)
        self.main_paned.add(left_frame, weight=1)

        self.provider_var = tk.StringVar(value="auto")
        for label, value in PROVIDERS:
            rb = ttk.Radiobutton(
                left_frame,
                text=label,
                value=value,
                variable=self.provider_var,
                command=self._on_provider_changed,
            )
            rb.pack(anchor=tk.W, pady=2)

        self.detected_label = ttk.Label(
            left_frame, text="", foreground="blue", font=("TkDefaultFont", 9, "italic")
        )
        self.detected_label.pack(anchor=tk.W, pady=(10, 0))

        # Right panel - Main content
        right_frame = ttk.Frame(self.main_paned)
        self.main_paned.add(right_frame, weight=3)

        # File selection
        file_frame = ttk.LabelFrame(right_frame, text="Files", padding=10)
        file_frame.pack(fill=tk.X, padx=5, pady=5)

        input_row = ttk.Frame(file_frame)
        input_row.pack(fill=tk.X, pady=2)
        ttk.Label(input_row, text="Input:").pack(side=tk.LEFT)
        self.input_path_label = ttk.Label(
            input_row, text="(no file selected)", foreground="gray"
        )
        self.input_path_label.pack(side=tk.LEFT, padx=5)
        ttk.Button(input_row, text="Select...", command=self._select_input_file).pack(
            side=tk.RIGHT
        )

        output_row = ttk.Frame(file_frame)
        output_row.pack(fill=tk.X, pady=2)
        ttk.Label(output_row, text="Output:").pack(side=tk.LEFT)
        self.output_path_label = ttk.Label(
            output_row, text="(no folder selected)", foreground="gray"
        )
        self.output_path_label.pack(side=tk.LEFT, padx=5)
        ttk.Button(
            output_row, text="Select...", command=self._select_output_folder
        ).pack(side=tk.RIGHT)

        # Settings panel
        settings_frame = ttk.LabelFrame(right_frame, text="Layout Settings", padding=10)
        settings_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Frontmatter toggles
        fm_frame = ttk.Frame(settings_frame)
        fm_frame.pack(anchor=tk.W)
        ttk.Label(fm_frame, text="Frontmatter:").pack(side=tk.LEFT)

        self.fm_title_var = tk.BooleanVar(
            value=self.layout.get("frontmatter", {}).get("title", True)
        )
        self.fm_date_var = tk.BooleanVar(
            value=self.layout.get("frontmatter", {}).get("date", True)
        )
        self.fm_provider_var = tk.BooleanVar(
            value=self.layout.get("frontmatter", {}).get("provider", True)
        )
        self.fm_url_var = tk.BooleanVar(
            value=self.layout.get("frontmatter", {}).get("url", True)
        )

        ttk.Checkbutton(
            fm_frame,
            text="Title",
            variable=self.fm_title_var,
            command=self._update_layout,
        ).pack(side=tk.LEFT, padx=5)
        ttk.Checkbutton(
            fm_frame,
            text="Date",
            variable=self.fm_date_var,
            command=self._update_layout,
        ).pack(side=tk.LEFT, padx=5)
        ttk.Checkbutton(
            fm_frame,
            text="Provider",
            variable=self.fm_provider_var,
            command=self._update_layout,
        ).pack(side=tk.LEFT, padx=5)
        ttk.Checkbutton(
            fm_frame,
            text="URL",
            variable=self.fm_url_var,
            command=self._update_layout,
        ).pack(side=tk.LEFT, padx=5)

        # Headings
        headings_frame = ttk.Frame(settings_frame)
        headings_frame.pack(fill=tk.X, pady=5)

        ttk.Label(headings_frame, text="User heading:").grid(
            row=0, column=0, sticky=tk.W, pady=2
        )
        self.user_heading_var = tk.StringVar(
            value=self.layout.get("user_heading", "# Me")
        )
        ttk.Entry(headings_frame, textvariable=self.user_heading_var, width=25).grid(
            row=0, column=1, padx=5, pady=2
        )

        ttk.Label(headings_frame, text="Assistant heading:").grid(
            row=1, column=0, sticky=tk.W, pady=2
        )
        self.assistant_heading_var = tk.StringVar(
            value=self.layout.get("assistant_heading", "# Assistant")
        )
        ttk.Entry(
            headings_frame, textvariable=self.assistant_heading_var, width=25
        ).grid(row=1, column=1, padx=5, pady=2)

        ttk.Label(headings_frame, text="Thinking heading:").grid(
            row=2, column=0, sticky=tk.W, pady=2
        )
        self.thinking_heading_var = tk.StringVar(
            value=self.layout.get("thinking_heading", "# Thinking")
        )
        ttk.Entry(
            headings_frame, textvariable=self.thinking_heading_var, width=25
        ).grid(row=2, column=1, padx=5, pady=2)

        # Options
        options_frame = ttk.Frame(settings_frame)
        options_frame.pack(anchor=tk.W, pady=5)

        self.include_thinking_var = tk.BooleanVar(
            value=self.layout.get("include_thinking", True)
        )
        ttk.Checkbutton(
            options_frame,
            text="Include thinking blocks",
            variable=self.include_thinking_var,
            command=self._update_layout,
        ).pack(anchor=tk.W)

        self.heading_downscale_var = tk.BooleanVar(
            value=self.layout.get("heading_downscale", True)
        )
        ttk.Checkbutton(
            options_frame,
            text="Downscale headings in assistant content",
            variable=self.heading_downscale_var,
            command=self._update_layout,
        ).pack(anchor=tk.W)

        self.add_title_as_h1_var = tk.BooleanVar(
            value=self.layout.get("add_title_as_h1", False)
        )
        ttk.Checkbutton(
            options_frame,
            text="Add title as H1 at top of file",
            variable=self.add_title_as_h1_var,
            command=self._update_layout,
        ).pack(anchor=tk.W)

        # Separator
        sep_frame = ttk.Frame(settings_frame)
        sep_frame.pack(fill=tk.X, pady=5)
        ttk.Label(sep_frame, text="Separator:").pack(side=tk.LEFT)
        self.separator_var = tk.StringVar(value=self.layout.get("separator", ""))
        ttk.Entry(sep_frame, textvariable=self.separator_var, width=10).pack(
            side=tk.LEFT, padx=5
        )

        # Action buttons
        action_frame = ttk.Frame(right_frame)
        action_frame.pack(fill=tk.X, padx=5, pady=10)

        self.convert_btn = ttk.Button(
            action_frame, text="Convert", command=self._convert, state=tk.DISABLED
        )
        self.convert_btn.pack(side=tk.LEFT, padx=5)

        ttk.Button(
            action_frame, text="Save Settings", command=self._save_settings
        ).pack(side=tk.LEFT, padx=5)
        ttk.Button(
            action_frame, text="Load Defaults", command=self._load_defaults
        ).pack(side=tk.LEFT, padx=5)

        # Status bar
        self.status_var = tk.StringVar(value="Ready")
        status_bar = ttk.Label(
            right_frame, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W
        )
        status_bar.pack(fill=tk.X, padx=5, pady=(0, 5))

    def _layout_widgets(self):
        """Layout widgets (handled in _create_widgets with pack)."""
        pass

    def _select_input_file(self):
        """Select input JSON file."""
        filename = filedialog.askopenfilename(
            title="Select JSON file",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
        )
        if filename:
            self.input_file = filename
            self.input_path_label.config(text=Path(filename).name, foreground="black")
            self._auto_detect_provider()
            self._update_convert_button()

    def _select_output_folder(self):
        """Select output folder."""
        folder = filedialog.askdirectory(title="Select output folder")
        if folder:
            self.output_folder = folder
            self.output_path_label.config(text=folder, foreground="black")
            self._update_convert_button()

    def _auto_detect_provider(self):
        """Auto-detect provider from input file."""
        if not self.input_file:
            return

        self.status_var.set("Detecting provider...")
        self.root.update()

        detected = detector.detect_provider_from_file(self.input_file)
        self.detected_provider = detected

        display_names = {
            "claude": "Claude",
            "deepseek": "DeepSeek",
            "gemini": "Gemini",
            "chatgpt": "ChatGPT",
            "unknown": "Unknown",
        }

        if detected != "unknown":
            self.detected_label.config(
                text=f"Detected: {display_names.get(detected, detected)}"
            )
            # If user hasn't manually selected, auto-select detected
            if self.provider_var.get() == "auto":
                self.provider_var.set(detected)
        else:
            self.detected_label.config(text="Could not auto-detect")

        self.status_var.set("Ready")

    def _on_provider_changed(self):
        """Handle provider selection change."""
        self.selected_provider = self.provider_var.get()

    def _update_layout(self):
        """Update layout from UI values."""
        self.layout["frontmatter"] = {
            "title": self.fm_title_var.get(),
            "date": self.fm_date_var.get(),
            "provider": self.fm_provider_var.get(),
            "url": self.fm_url_var.get(),
        }
        self.layout["user_heading"] = self.user_heading_var.get()
        self.layout["assistant_heading"] = self.assistant_heading_var.get()
        self.layout["thinking_heading"] = self.thinking_heading_var.get()
        self.layout["include_thinking"] = self.include_thinking_var.get()
        self.layout["heading_downscale"] = self.heading_downscale_var.get()
        self.layout["add_title_as_h1"] = self.add_title_as_h1_var.get()
        self.layout["separator"] = self.separator_var.get()

    def _update_convert_button(self):
        """Enable/disable convert button based on input."""
        if self.input_file and self.output_folder:
            self.convert_btn.config(state=tk.NORMAL)
        else:
            self.convert_btn.config(state=tk.DISABLED)

    def _convert(self):
        """Perform the conversion."""
        if not self.input_file or not self.output_folder:
            return

        self._update_layout()
        self.status_var.set("Converting...")
        self.convert_btn.config(state=tk.DISABLED)
        self.root.update()

        try:
            # Load JSON
            json_data = detector.load_json_file(self.input_file)
            if json_data is None:
                raise ValueError("Failed to load JSON file")

            # Get provider
            provider = self.provider_var.get()
            if provider == "auto":
                provider = (
                    self.detected_provider
                    if self.detected_provider != "unknown"
                    else None
                )

            # Parse
            conversations = registry.parse_json(json_data, provider)
            if not conversations:
                raise ValueError("No conversations found in the file")

            # Render
            rendered = renderer.render_conversations(conversations, self.layout)

            # Write files
            output_path = Path(self.output_folder)
            count = 0
            for filename, content in rendered:
                filepath = output_path / filename
                # Handle duplicates
                counter = 1
                while filepath.exists():
                    stem = filepath.stem
                    ext = filepath.suffix
                    filepath = output_path / f"{stem} {counter}{ext}"
                    counter += 1

                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                count += 1

            self.status_var.set(f"Done: {count} files created")
            messagebox.showinfo(
                "Success", f"Successfully converted {count} conversation(s)!"
            )

        except Exception as e:
            self.status_var.set(f"Error: {str(e)}")
            messagebox.showerror("Error", str(e))

        finally:
            self.convert_btn.config(state=tk.NORMAL)

    def _save_settings(self):
        """Save layout settings to file."""
        self._update_layout()
        if config.save_layout(self.layout):
            messagebox.showinfo("Settings", "Settings saved successfully!")
        else:
            messagebox.showerror("Error", "Failed to save settings")

    def _load_defaults(self):
        """Reset layout to defaults."""
        self.layout = config.DEFAULT_LAYOUT.copy()

        # Update UI
        self.fm_title_var.set(self.layout["frontmatter"]["title"])
        self.fm_date_var.set(self.layout["frontmatter"]["date"])
        self.fm_provider_var.set(self.layout["frontmatter"]["provider"])
        self.fm_url_var.set(self.layout["frontmatter"]["url"])
        self.user_heading_var.set(self.layout["user_heading"])
        self.assistant_heading_var.set(self.layout["assistant_heading"])
        self.thinking_heading_var.set(self.layout["thinking_heading"])
        self.include_thinking_var.set(self.layout["include_thinking"])
        self.heading_downscale_var.set(self.layout["heading_downscale"])
        self.add_title_as_h1_var.set(self.layout["add_title_as_h1"])
        self.separator_var.set(self.layout["separator"])

        messagebox.showinfo("Settings", "Settings reset to defaults")


def main():
    """Main entry point."""
    root = tk.Tk()
    app = OmniConverterApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
