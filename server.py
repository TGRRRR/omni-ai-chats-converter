import http.server, threading, webbrowser, os, sys


def start(port=8765):
    root = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    handler = http.server.SimpleHTTPRequestHandler
    server = http.server.HTTPServer(("localhost", port), handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    webbrowser.open(f"http://localhost:{port}/web/index.html")
    input("Server running. Press Enter to stop.\n")
    server.shutdown()


if __name__ == "__main__":
    start()
