"""Dynamic N-node grid registry. No fixed anchor count."""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from .models import GridNode, _now_host_ms


class GridRegistry:
    """Persistent node_id is stable; each boot_id is a separate session."""

    def __init__(self) -> None:
        self._nodes: Dict[str, GridNode] = {}
        self._sessions: Dict[Tuple[str, str], GridNode] = {}
        self._event_ids_seen: set = set()
        self._seq_gaps: List[dict] = []

    def register_from_event(self, event: dict, host_ms: Optional[int] = None) -> GridNode:
        if "node_id" not in event or "boot_id" not in event:
            raise ValueError("event missing node_id/boot_id")
        node = GridNode.from_hello(event) if event.get("event_type") == "hello" else self._node_from_any(event)
        node.touch(host_ms)
        key = (node.node_id, node.boot_id)
        prev = self._sessions.get(key)
        if prev is not None:
            if event.get("sequence") is not None:
                seq = int(event["sequence"])
                if prev.sequence_high_water and seq > prev.sequence_high_water + 1:
                    self._seq_gaps.append({
                        "node_id": node.node_id,
                        "boot_id": node.boot_id,
                        "expected_next": prev.sequence_high_water + 1,
                        "got": seq,
                    })
                node.sequence_high_water = max(prev.sequence_high_water, seq)
            node.capabilities = {**prev.capabilities, **node.capabilities}
            node.status = "online"
        else:
            if event.get("sequence") is not None:
                node.sequence_high_water = int(event["sequence"])
            if node.node_id in self._nodes and self._nodes[node.node_id].boot_id != node.boot_id:
                old = self._nodes[node.node_id]
                old.status = "offline"
                self._sessions[(old.node_id, old.boot_id)] = old
        self._sessions[key] = node
        self._nodes[node.node_id] = node
        return node

    def _node_from_any(self, event: dict) -> GridNode:
        node_id = str(event["node_id"])
        boot_id = str(event["boot_id"])
        existing = self._sessions.get((node_id, boot_id))
        if existing:
            return GridNode(
                node_id=existing.node_id,
                boot_id=existing.boot_id,
                clock_id=existing.clock_id,
                firmware_version=existing.firmware_version,
                hardware_profile=existing.hardware_profile,
                capabilities=dict(existing.capabilities),
                status="online",
                sequence_high_water=existing.sequence_high_water,
                sample_rate=existing.sample_rate or event.get("sample_rate"),
                channel_count=existing.channel_count,
                sample_format=existing.sample_format,
            )
        return GridNode.from_hello({**event, "event_type": "hello"})

    def note_event_id(self, event_id: Optional[str]) -> bool:
        if not event_id:
            return False
        if event_id in self._event_ids_seen:
            return True
        self._event_ids_seen.add(event_id)
        return False

    def mark_offline(self, node_id: str, host_ms: Optional[int] = None) -> None:
        n = self._nodes.get(node_id)
        if n:
            n.status = "offline"
            n.touch(host_ms)

    def get_node(self, node_id: str) -> Optional[GridNode]:
        return self._nodes.get(node_id)

    def get_session(self, node_id: str, boot_id: str) -> Optional[GridNode]:
        return self._sessions.get((node_id, boot_id))

    def list_nodes(self) -> List[GridNode]:
        return list(self._nodes.values())

    def list_sessions(self) -> List[GridNode]:
        return list(self._sessions.values())

    def online_count(self) -> int:
        return sum(1 for n in self._nodes.values() if n.status == "online")

    def topology_snapshot(self) -> dict:
        return {
            "schema": "grid_topology_v1",
            "node_count": len(self._nodes),
            "session_count": len(self._sessions),
            "online": self.online_count(),
            "nodes": [n.to_dict() for n in self._nodes.values()],
            "sequence_gaps": list(self._seq_gaps[-64:]),
            "host_ms": _now_host_ms(),
        }

    def restore_from_snapshot(self, snap: dict) -> None:
        self._nodes.clear()
        self._sessions.clear()
        for nd in snap.get("nodes") or []:
            node = GridNode(
                node_id=nd["node_id"],
                boot_id=nd["boot_id"],
                clock_id=nd["clock_id"],
                firmware_version=nd.get("firmware_version", "unknown"),
                hardware_profile=nd.get("hardware_profile", "generic"),
                capabilities=dict(nd.get("capabilities") or {}),
                status=nd.get("status", "discovered"),
                last_seen_host_ms=nd.get("last_seen_host_ms"),
                sequence_high_water=int(nd.get("sequence_high_water") or 0),
                sample_rate=nd.get("sample_rate"),
                channel_count=int(nd.get("channel_count") or 1),
                sample_format=nd.get("sample_format", "unknown"),
            )
            self._nodes[node.node_id] = node
            self._sessions[(node.node_id, node.boot_id)] = node
