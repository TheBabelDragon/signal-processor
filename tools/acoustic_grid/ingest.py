"""Multi-source event ingest coordinator for the acoustic grid."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .clock_service import ClockService
from .correlation import ProbeCorrelationIndex
from .persistence import AppendOnlyEventLog
from .registry import GridRegistry

try:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from acoustic_transport import validate_event  # type: ignore
except Exception:
    def validate_event(event: dict):
        if not isinstance(event, dict):
            return False, "not object"
        for k in ("schema_version", "event_type", "node_id", "boot_id", "sequence", "clock_id"):
            if k not in event:
                return False, f"missing {k}"
        return True, "ok"


class GridIngest:
    def __init__(self, registry=None, clocks=None, correlation=None, log=None) -> None:
        self.registry = registry or GridRegistry()
        self.clocks = clocks or ClockService()
        self.correlation = correlation or ProbeCorrelationIndex()
        self.log = log or AppendOnlyEventLog()
        self.rejected = 0
        self.accepted = 0

    def handle(self, event: dict, *, transport: str = "unknown", host_received_ms: Optional[int] = None) -> Dict[str, Any]:
        ok, msg = validate_event(event)
        if not ok:
            self.rejected += 1
            return {"ok": False, "reason": msg}
        is_dup = self.registry.note_event_id(event.get("event_id"))
        self.log.append(event, transport=transport, host_received_ms=host_received_ms,
                        diagnostics={"validate": msg, "duplicate_event_id": is_dup})
        if is_dup:
            self.rejected += 1
            return {"ok": False, "reason": "duplicate_event_id", "duplicate": True}
        node = self.registry.register_from_event(event, host_ms=host_received_ms)
        ping_id = self.correlation.ingest_event(event)
        self.accepted += 1
        return {"ok": True, "node_id": node.node_id, "boot_id": node.boot_id, "ping_id": ping_id, "status": node.status}

    def snapshot(self) -> dict:
        return {
            "registry": self.registry.topology_snapshot(),
            "clocks": self.clocks.snapshot(),
            "correlation": self.correlation.stats(),
            "log_count": self.log.count(),
            "accepted": self.accepted,
            "rejected": self.rejected,
        }

    def replay(self, records: List[dict]) -> "GridIngest":
        fresh = GridIngest(registry=GridRegistry(), clocks=ClockService(),
                           correlation=ProbeCorrelationIndex(), log=AppendOnlyEventLog())
        for rec in records:
            ev = rec.get("event")
            if not isinstance(ev, dict):
                continue
            fresh.handle(ev, transport=rec.get("transport") or "replay", host_received_ms=rec.get("host_received_ms"))
        return fresh
