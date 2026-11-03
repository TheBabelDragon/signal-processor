"""Append-only host event log with deterministic replay."""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Iterator, List, Optional

from .models import _now_host_ms


class AppendOnlyEventLog:
    def __init__(self, path: Optional[str] = None) -> None:
        self.path = Path(path) if path else None
        self._lock = threading.Lock()
        self._records: List[dict] = []
        self._event_ids: set = set()
        self._duplicates = 0
        if self.path and self.path.exists():
            self._load()

    def _load(self) -> None:
        assert self.path is not None
        with self.path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                self._records.append(rec)
                eid = (rec.get("event") or {}).get("event_id")
                if eid:
                    self._event_ids.add(eid)

    def append(self, event: dict, *, transport: str = "unknown", host_received_ms: Optional[int] = None, diagnostics: Optional[dict] = None) -> bool:
        eid = event.get("event_id")
        host_ms = host_received_ms if host_received_ms is not None else _now_host_ms()
        is_dup = bool(eid and eid in self._event_ids)
        if is_dup:
            self._duplicates += 1
        elif eid:
            self._event_ids.add(eid)
        rec = {
            "log_schema": 1,
            "host_received_ms": host_ms,
            "transport": transport,
            "duplicate": is_dup,
            "diagnostics": diagnostics or {},
            "event": event,
        }
        with self._lock:
            self._records.append(rec)
            if self.path:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with self.path.open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps(rec, default=str) + "\n")
        return not is_dup

    def iter_records(self) -> Iterator[dict]:
        with self._lock:
            for r in self._records:
                yield dict(r)

    def events_in_order(self) -> List[dict]:
        return [r["event"] for r in self.iter_records() if not r.get("duplicate")]

    def count(self) -> int:
        return len(self._records)

    def duplicate_count(self) -> int:
        return self._duplicates

    def clear_memory(self) -> None:
        with self._lock:
            self._records.clear()
            self._event_ids.clear()
            self._duplicates = 0
