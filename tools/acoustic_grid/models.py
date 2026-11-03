"""Versioned logical entities for the N-node acoustic grid.\n\nTransport-independent. Serial/WebSocket carry the same structures.\n"""
from __future__ import annotations

import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


def _now_host_ms() -> int:
    return int(time.time() * 1000)


@dataclass
class SampleCounterSemantics:
    """Audio frame counter semantics.\n\n    sample_counter counts frames; one frame = one simultaneous sample across channels.\n    Channel count does NOT multiply the counter. sample_rate is frames per second.\n    """

    definition: str = (
        "sample_counter is a monotonically increasing count of audio frames; "
        "one frame is one simultaneous multi-channel sample set."
    )
    sample_rate_unit: str = "frames_per_second"
    counter_unit: str = "frames"
    channel_count_affects_counter: bool = False
    resets_on_reboot: bool = True
    resets_on_audio_restart: bool = True
    dma_overrun_behavior: str = (
        "report overrun event; do not invent continuity across lost buffers"
    )
    missing_when_unavailable: bool = True


@dataclass
class GridNode:
    node_id: str
    boot_id: str
    clock_id: str
    firmware_version: str = "unknown"
    hardware_profile: str = "generic"
    capabilities: Dict[str, Any] = field(default_factory=dict)
    status: str = "discovered"
    last_seen_host_ms: Optional[int] = None
    sequence_high_water: int = 0
    sample_rate: Optional[float] = None
    channel_count: int = 1
    sample_format: str = "unknown"

    def touch(self, host_ms: Optional[int] = None) -> None:
        self.last_seen_host_ms = host_ms if host_ms is not None else _now_host_ms()

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_hello(cls, event: dict) -> "GridNode":
        node_id = str(event["node_id"])
        boot_id = str(event["boot_id"])
        clock_id = str(event.get("clock_id") or f"{node_id}:{boot_id}")
        caps = event.get("capabilities") if isinstance(event.get("capabilities"), dict) else {}
        return cls(
            node_id=node_id,
            boot_id=boot_id,
            clock_id=clock_id,
            firmware_version=str(event.get("firmware_version") or "unknown"),
            hardware_profile=str(event.get("hardware_profile") or caps.get("profile") or "generic"),
            capabilities=dict(caps),
            status="online",
            last_seen_host_ms=_now_host_ms(),
            sequence_high_water=int(event.get("sequence") or 1),
            sample_rate=event.get("sample_rate"),
            channel_count=int(caps.get("channel_count") or event.get("channel_count") or 1),
            sample_format=str(caps.get("sample_format") or "unknown"),
        )


@dataclass
class Probe:
    """Globally unique acoustic transmission experiment (ping_id)."""

    ping_id: str
    origin_node_id: str
    origin_boot_id: str
    origin_sequence: int
    probe_id: str = "chirp-lf-v1"
    schema_version: int = 2
    protocol_version: int = 1
    frequency_start_hz: Optional[float] = None
    frequency_end_hz: Optional[float] = None
    duration_ms: Optional[float] = None
    tx_scheduled_at_us: Optional[int] = None
    tx_actual_at_us: Optional[int] = None
    sample_counter: Optional[int] = None
    sample_rate: Optional[float] = None
    origin_clock_id: Optional[str] = None
    notes: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_tx_event(cls, event: dict, ping_id: Optional[str] = None) -> "Probe":
        node_id = str(event["node_id"])
        boot_id = str(event["boot_id"])
        seq = int(event["sequence"])
        pid = ping_id or event.get("ping_id") or f"{node_id}:{boot_id}:{seq}"
        return cls(
            ping_id=str(pid),
            origin_node_id=node_id,
            origin_boot_id=boot_id,
            origin_sequence=seq,
            probe_id=str(event.get("probe_id") or "chirp-lf-v1"),
            schema_version=int(event.get("schema_version") or 2),
            frequency_start_hz=event.get("frequency_start_hz"),
            frequency_end_hz=event.get("frequency_end_hz"),
            duration_ms=event.get("duration_ms"),
            tx_scheduled_at_us=event.get("tx_scheduled_at_us"),
            tx_actual_at_us=event.get("tx_actual_at_us"),
            sample_counter=event.get("sample_counter"),
            sample_rate=event.get("sample_rate"),
            origin_clock_id=event.get("clock_id") or f"{node_id}:{boot_id}",
            notes=event.get("notes"),
        )


@dataclass
class Observation:
    observation_id: str
    ping_id: str
    observer_node_id: str
    observer_boot_id: str
    observer_sequence: int
    observer_clock_id: str
    sample_counter: Optional[int] = None
    sample_rate: Optional[float] = None
    rx_detected_at_us: Optional[int] = None
    correlation_peak: Optional[float] = None
    confidence: Optional[float] = None
    input_rms: Optional[float] = None
    clipped: bool = False
    quality: str = "unknown"
    rejection_reason: Optional[str] = None
    peer_node_id: Optional[str] = None
    peer_boot_id: Optional[str] = None
    peer_sequence: Optional[int] = None
    notes: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_rx_event(cls, event: dict, ping_id: Optional[str] = None) -> "Observation":
        node_id = str(event["node_id"])
        boot_id = str(event["boot_id"])
        seq = int(event["sequence"])
        peer_seq = event.get("peer_sequence")
        peer_node = event.get("peer_node_id")
        peer_boot = event.get("peer_boot_id")
        if ping_id:
            pid = ping_id
        elif event.get("ping_id"):
            pid = event["ping_id"]
        elif peer_node and peer_boot and peer_seq is not None:
            pid = f"{peer_node}:{peer_boot}:{int(peer_seq)}"
        else:
            pid = f"unknown:{node_id}:{boot_id}:{seq}"
        et = event.get("event_type")
        quality = "miss" if et == "miss" else ("ok" if event.get("confidence") else "unknown")
        return cls(
            observation_id=str(event.get("event_id") or uuid.uuid4()),
            ping_id=str(pid),
            observer_node_id=node_id,
            observer_boot_id=boot_id,
            observer_sequence=seq,
            observer_clock_id=str(event.get("clock_id") or f"{node_id}:{boot_id}"),
            sample_counter=event.get("sample_counter"),
            sample_rate=event.get("sample_rate"),
            rx_detected_at_us=event.get("rx_detected_at_us"),
            correlation_peak=event.get("correlation_peak"),
            confidence=event.get("confidence"),
            input_rms=event.get("input_rms"),
            clipped=bool(event.get("clipped")),
            quality=quality,
            rejection_reason=event.get("rejection_reason") or event.get("notes"),
            peer_node_id=peer_node,
            peer_boot_id=peer_boot,
            peer_sequence=int(peer_seq) if peer_seq is not None else None,
            notes=event.get("notes"),
        )


@dataclass
class ClockRelationship:
    relationship_id: str
    source_clock_id: str
    target_clock_id: str
    offset_us: Optional[int] = None
    relative_rate: Optional[float] = None
    uncertainty_us: Optional[int] = None
    estimation_method: str = "unspecified"
    observation_start_us: Optional[int] = None
    observation_end_us: Optional[int] = None
    valid_from_host_ms: Optional[int] = None
    valid_until_host_ms: Optional[int] = None
    calibration_age_ms: Optional[int] = None
    status: str = "unknown"
    notes: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)

    def is_valid_now(self, host_ms: Optional[int] = None, max_uncertainty_us: Optional[int] = None) -> bool:
        if self.status in ("unknown", "rejected", "expired"):
            return False
        if self.offset_us is None or self.uncertainty_us is None:
            return False
        if self.uncertainty_us < 0:
            return False
        now = host_ms if host_ms is not None else _now_host_ms()
        if self.valid_until_host_ms is not None and now > self.valid_until_host_ms:
            return False
        if max_uncertainty_us is not None and self.uncertainty_us > max_uncertainty_us:
            return False
        return self.status in ("estimated", "validated")

    def propagated_uncertainty_us(self, elapsed_source_us: int, drift_ppm: float = 0.0) -> int:
        base = int(self.uncertainty_us or 0)
        if elapsed_source_us < 0:
            elapsed_source_us = abs(elapsed_source_us)
        drift_term = int(abs(elapsed_source_us) * abs(drift_ppm) * 1e-6)
        return base + drift_term
