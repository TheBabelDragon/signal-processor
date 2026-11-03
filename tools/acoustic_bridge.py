#!/usr/bin/env python3
"""Local acoustic transport bridge: serial (NDJSON / binary) → SSE + HTTP.

Does not solve TDoA. Does not feed neurofeedback. Host-only tool, same
pattern as tools/echo_bridge.py.

    python tools/acoustic_bridge.py --serial /dev/ttyUSB0 --port 8766
    python tools/acoustic_bridge.py --stdin --port 8766

SSE:  GET http://127.0.0.1:8766/events
POST: POST http://127.0.0.1:8766/event  (JSON body = logical event)
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
from acoustic_transport import (  # noqa: E402
    parse_ndjson_line,
    try_decode_frame,
    validate_event,
)


class EventBus:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.latest = ""
        self.seq = 0
        self.history: list[str] = []
        self.max_history = 256

    def publish(self, event: dict) -> bool:
        ok, msg = validate_event(event)
        if not ok:
            print(f"[acoustic-bridge] reject: {msg}", file=sys.stderr)
            return False
        line = json.dumps(event, default=str)
        with self.lock:
            self.latest = line
            self.seq += 1
            self.history.append(line)
            if len(self.history) > self.max_history:
                self.history = self.history[-self.max_history :]
        print(f"[acoustic-bridge] #{self.seq} {event.get('event_type')} node={event.get('node_id')} seq={event.get('sequence')}")
        return True

    def snapshot(self):
        with self.lock:
            return self.seq, self.latest

    def recent(self, n: int = 32):
        with self.lock:
            return list(self.history[-n:])


def serial_reader(path: str, bus: EventBus, stop: threading.Event) -> None:
    try:
        import serial  # type: ignore
    except ImportError:
        print("[acoustic-bridge] pyserial not installed; use --stdin or pip install pyserial", file=sys.stderr)
        return
    ser = serial.Serial(path, baudrate=115200, timeout=0.1)
    print(f"[acoustic-bridge] serial open {path}")
    buf = b""
    text_carry = ""
    while not stop.is_set():
        chunk = ser.read(512)
        if not chunk:
            time.sleep(0.01)
            continue
        buf += chunk
        while True:
            payload, buf = try_decode_frame(buf)
            if payload is None:
                break
            try:
                obj = json.loads(payload.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            if isinstance(obj, dict):
                bus.publish(obj)
        try:
            text_carry += buf.decode("utf-8", errors="ignore")
            buf = b""
        except Exception:
            continue
        while "\n" in text_carry:
            line, text_carry = text_carry.split("\n", 1)
            obj = parse_ndjson_line(line)
            if obj:
                bus.publish(obj)


def stdin_reader(bus: EventBus, stop: threading.Event) -> None:
    print("[acoustic-bridge] reading NDJSON from stdin")
    while not stop.is_set():
        line = sys.stdin.readline()
        if not line:
            time.sleep(0.05)
            continue
        obj = parse_ndjson_line(line)
        if obj:
            bus.publish(obj)


def make_handler(bus: EventBus):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            print("[acoustic-bridge]", fmt % args)

        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "content-type")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            self.send_header("Cache-Control", "no-cache")

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_POST(self):
            if not self.path.startswith("/event"):
                self.send_response(404)
                self.end_headers()
                return
            n = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(n).decode("utf-8", errors="replace")
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                obj = parse_ndjson_line(raw)
            if not isinstance(obj, dict) or not bus.publish(obj):
                self.send_response(400)
                self._cors()
                self.end_headers()
                return
            body = b'{"ok":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path in ("/", "/health"):
                seq, latest = bus.snapshot()
                body = json.dumps({"ok": True, "seq": seq, "has_event": bool(latest)}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._cors()
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if self.path.startswith("/latest"):
                seq, latest = bus.snapshot()
                body = (latest or "{}").encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._cors()
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if self.path.startswith("/history"):
                body = json.dumps(bus.recent(50)).encode()
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
                        seq, latest = bus.snapshot()
                        if seq != last and latest:
                            self.wfile.write(f"data: {latest}\n\n".encode())
                            self.wfile.flush()
                            last = seq
                        time.sleep(0.05)
                except BrokenPipeError:
                    return
            self.send_response(404)
            self.end_headers()

    return Handler


def main() -> None:
    ap = argparse.ArgumentParser(description="Acoustic transport bridge")
    ap.add_argument("--serial", default="", help="Serial device path (e.g. /dev/ttyUSB0)")
    ap.add_argument("--stdin", action="store_true", help="Read NDJSON from stdin")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8766)
    args = ap.parse_args()

    bus = EventBus()
    stop = threading.Event()

    if args.serial:
        threading.Thread(target=serial_reader, args=(args.serial, bus, stop), daemon=True).start()
    if args.stdin or not args.serial:
        if not args.serial:
            threading.Thread(target=stdin_reader, args=(bus, stop), daemon=True).start()

    httpd = ThreadingHTTPServer((args.host, args.port), make_handler(bus))
    print(f"acoustic-bridge sse  http://{args.host}:{args.port}/events")
    print(f"acoustic-bridge post http://{args.host}:{args.port}/event")
    print(f"acoustic-bridge health http://{args.host}:{args.port}/health")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        stop.set()


if __name__ == "__main__":
    main()
