#!/usr/bin/env python3
"""Acoustic transport primitives: CRC, binary framing, logical event validation.

Transport-independent logical events (schema_version 2) with optional
serial binary framing (frame_version 1). See ACOUSTIC_TRANSPORT.md.
"""
from __future__ import annotations

import json
import struct
import uuid
from typing import Any, Optional, Tuple

MAGIC = b"AP"
FRAME_VERSION = 1
PAYLOAD_JSON = 1
MAX_PAYLOAD = 2048

REQUIRED_V2 = ("schema_version", "event_type", "node_id", "boot_id", "sequence", "clock_id")
EVENT_TYPES = frozenset({"hello", "status", "tx", "rx", "miss", "sync", "emit", "detection"})


def crc16_ccitt_false(data: bytes) -> int:
    """CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, xorout 0."""
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def encode_frame(payload: bytes, payload_type: int = PAYLOAD_JSON) -> bytes:
    if len(payload) > MAX_PAYLOAD:
        raise ValueError(f"payload too large: {len(payload)} > {MAX_PAYLOAD}")
    header_body = struct.pack(">BBH", FRAME_VERSION, payload_type, len(payload)) + payload
    crc = crc16_ccitt_false(header_body)
    return MAGIC + header_body + struct.pack(">H", crc)


def try_decode_frame(buf: bytes) -> Tuple[Optional[bytes], bytes]:
    """Parse one frame from the front of buf.

    Returns (payload_or_None, remaining_buffer).
    If incomplete, returns (None, buf) unchanged.
    If corrupt magic/CRC, skips one byte and retries via remaining.
    """
    if len(buf) < 8:
        return None, buf
    idx = buf.find(MAGIC)
    if idx < 0:
        return None, b""
    if idx > 0:
        buf = buf[idx:]
    if len(buf) < 8:
        return None, buf
    frame_version, payload_type, length = struct.unpack(">BBH", buf[2:6])
    if frame_version != FRAME_VERSION or payload_type != PAYLOAD_JSON:
        return None, buf[1:]
    if length > MAX_PAYLOAD:
        return None, buf[1:]
    total = 6 + length + 2
    if len(buf) < total:
        return None, buf
    body = buf[2 : 6 + length]
    crc_recv = struct.unpack(">H", buf[6 + length : total])[0]
    crc_calc = crc16_ccitt_false(body)
    if crc_recv != crc_calc:
        return None, buf[1:]
    payload = buf[6 : 6 + length]
    return payload, buf[total:]


def encode_ndjson(event: dict, prefix: bool = True) -> bytes:
    line = json.dumps(event, separators=(",", ":"), default=str)
    if prefix:
        line = "AP " + line
    return (line + "\n").encode("utf-8")


def parse_ndjson_line(line: str) -> Optional[dict]:
    line = line.strip()
    if not line:
        return None
    if line.startswith("AP "):
        line = line[3:].strip()
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None
    return obj


def make_clock_id(node_id: str, boot_id: str) -> str:
    return f"{node_id}:{boot_id}"


def validate_event(event: dict) -> Tuple[bool, str]:
    """Lightweight schema_version 2 validation (no external jsonschema dep)."""
    if not isinstance(event, dict):
        return False, "not an object"
    for key in REQUIRED_V2:
        if key not in event:
            return False, f"missing {key}"
    if event.get("schema_version") != 2:
        return False, f"schema_version must be 2, got {event.get('schema_version')}"
    et = event.get("event_type")
    if et not in EVENT_TYPES:
        return False, f"invalid event_type {et!r}"
    if not isinstance(event.get("node_id"), str) or not event["node_id"]:
        return False, "node_id required"
    if not isinstance(event.get("boot_id"), str) or not event["boot_id"]:
        return False, "boot_id required"
    seq = event.get("sequence")
    if not isinstance(seq, int) or isinstance(seq, bool) or seq < 1:
        return False, "sequence must be integer >= 1"
    if not isinstance(event.get("clock_id"), str) or not event["clock_id"]:
        return False, "clock_id required"
    if event.get("clock_offset_estimate_us") is not None and event.get("clock_uncertainty_us") is None:
        return True, "ok_with_unbounded_offset"
    return True, "ok"


def can_use_for_tdoa(event_a: dict, event_b: dict) -> Tuple[bool, str]:
    """Guardrail: refuse TDoA if clocks are not bound with uncertainty.

    This does NOT compute TDoA — only answers whether a future solver
    is allowed to treat the pair as time-aligned.
    """
    if event_a.get("clock_id") == event_b.get("clock_id"):
        return True, "same_clock_domain"
    ua = event_a.get("clock_uncertainty_us")
    ub = event_b.get("clock_uncertainty_us")
    if ua is None or ub is None:
        return False, "cross_clock_without_uncertainty"
    if not isinstance(ua, int) or not isinstance(ub, int):
        return False, "uncertainty_not_integer"
    return True, "cross_clock_with_uncertainty"


def new_boot_id() -> str:
    return str(uuid.uuid4())


def example_hello(node_id: str, boot_id: Optional[str] = None, sample_rate: int = 48000) -> dict:
    boot_id = boot_id or new_boot_id()
    return {
        "schema_version": 2,
        "event_id": str(uuid.uuid4()),
        "event_type": "hello",
        "node_id": node_id,
        "boot_id": boot_id,
        "sequence": 1,
        "clock_id": make_clock_id(node_id, boot_id),
        "sample_rate": sample_rate,
        "sample_counter": 0,
        "tx_scheduled_at_us": None,
        "tx_actual_at_us": None,
        "rx_detected_at_us": None,
        "clock_offset_estimate_us": None,
        "clock_uncertainty_us": None,
        "probe_id": None,
        "mode": "live",
        "clipped": False,
        "notes": "session bootstrap",
    }


def example_tx(
    node_id: str,
    boot_id: str,
    sequence: int,
    sample_counter: int,
    tx_actual_at_us: int,
    sample_rate: int = 48000,
) -> dict:
    return {
        "schema_version": 2,
        "event_id": str(uuid.uuid4()),
        "event_type": "tx",
        "node_id": node_id,
        "boot_id": boot_id,
        "sequence": sequence,
        "clock_id": make_clock_id(node_id, boot_id),
        "sample_rate": sample_rate,
        "sample_counter": sample_counter,
        "tx_scheduled_at_us": tx_actual_at_us,
        "tx_actual_at_us": tx_actual_at_us,
        "rx_detected_at_us": None,
        "clock_offset_estimate_us": None,
        "clock_uncertainty_us": None,
        "probe_id": "chirp-lf-v1",
        "frequency_start_hz": 1800,
        "frequency_end_hz": 4200,
        "duration_ms": 40,
        "mode": "live",
        "clipped": False,
        "notes": None,
    }


def example_rx(
    node_id: str,
    boot_id: str,
    sequence: int,
    sample_counter: int,
    rx_detected_at_us: int,
    peer_node_id: Optional[str] = None,
    peer_boot_id: Optional[str] = None,
    peer_sequence: Optional[int] = None,
    sample_rate: int = 48000,
    confidence: float = 0.9,
) -> dict:
    return {
        "schema_version": 2,
        "event_id": str(uuid.uuid4()),
        "event_type": "rx",
        "node_id": node_id,
        "boot_id": boot_id,
        "sequence": sequence,
        "clock_id": make_clock_id(node_id, boot_id),
        "sample_rate": sample_rate,
        "sample_counter": sample_counter,
        "tx_scheduled_at_us": None,
        "tx_actual_at_us": None,
        "rx_detected_at_us": rx_detected_at_us,
        "clock_offset_estimate_us": None,
        "clock_uncertainty_us": None,
        "probe_id": "chirp-lf-v1",
        "frequency_start_hz": 1800,
        "frequency_end_hz": 4200,
        "duration_ms": 40,
        "correlation_peak": confidence,
        "confidence": confidence,
        "peer_node_id": peer_node_id,
        "peer_boot_id": peer_boot_id,
        "peer_sequence": peer_sequence,
        "mode": "live",
        "clipped": False,
        "notes": None,
    }
