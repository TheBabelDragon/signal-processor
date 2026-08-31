#!/usr/bin/env python3
"""Tail Echo/MetaField FieldObservation JSONL and serve it to the processor.

Does not drive ultrasonic emitters. Echo Grid keeps --body --drive.

    python visualization/dashboard.py --csi --metafield-log /tmp/metafield/echo.jsonl
    python tools/echo_bridge.py --file /tmp/metafield/echo.jsonl --port 8765
"""
from __future__ import annotations

import argparse
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Tail:
    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        self.latest = ""
        self.seq = 0
        self._stop = False

    def run(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.touch()
        with self.path.open("r", encoding="utf-8") as fh:
            fh.seek(0, 2)
            while not self._stop:
                line = fh.readline()
                if not line:
                    time.sleep(0.05)
                    continue
                line = line.strip()
                if line.startswith("OBS "):
                    line = line[4:]
                if not line:
                    continue
                try:
                    json.loads(line)
                except json.JSONDecodeError:
                    continue
                with self.lock:
                    self.latest = line
                    self.seq += 1

    def snapshot(self) -> tuple[int, str]:
        with self.lock:
            return self.seq, self.latest


def make_handler(tail: Tail):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:
            print("[echo-bridge]", fmt % args)

        def _cors(self) -> None:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache")

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_GET(self) -> None:
            if self.path in ("/", "/health"):
                seq, latest = tail.snapshot()
                body = json.dumps({"ok": True, "seq": seq, "has_obs": bool(latest)}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._cors()
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if self.path.startswith("/latest"):
                seq, latest = tail.snapshot()
                body = (latest or "{}").encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._cors()
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if self.path.startswith("/events"):
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self._cors()
                self.end_headers()
                last = -1
                try:
                    while True:
                        seq, latest = tail.snapshot()
                        if seq != last and latest:
                            self.wfile.write(f"data: {latest}\n\n".encode())
                            self.wfile.flush()
                            last = seq
                        time.sleep(0.08)
                except BrokenPipeError:
                    return
            self.send_response(404)
            self.end_headers()

    return Handler


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="/tmp/metafield/echo.jsonl")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    tail = Tail(Path(args.file))
    threading.Thread(target=tail.run, daemon=True).start()
    httpd = ThreadingHTTPServer((args.host, args.port), make_handler(tail))
    print(f"echo-bridge sse http://{args.host}:{args.port}/events")
    print(f"tailing {args.file}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
