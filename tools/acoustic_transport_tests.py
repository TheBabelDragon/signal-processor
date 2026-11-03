#!/usr/bin/env python3
"""Unit tests for acoustic transport framing, CRC, and schema guards."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from acoustic_transport import (
    can_use_for_tdoa,
    crc16_ccitt_false,
    encode_frame,
    encode_ndjson,
    example_hello,
    example_rx,
    example_tx,
    make_clock_id,
    parse_ndjson_line,
    try_decode_frame,
    validate_event,
)


class TestCRC(unittest.TestCase):
    def test_known_vector(self):
        payload = b'{"schema_version":2}'
        frame = encode_frame(payload)
        self.assertTrue(frame.startswith(b"AP"))
        out, rest = try_decode_frame(frame)
        self.assertEqual(out, payload)
        self.assertEqual(rest, b"")

    def test_crc_changes_with_data(self):
        a = crc16_ccitt_false(b"\x01\x01\x00\x02ab")
        b = crc16_ccitt_false(b"\x01\x01\x00\x02ac")
        self.assertNotEqual(a, b)


class TestFraming(unittest.TestCase):
    def test_roundtrip_event(self):
        ev = example_hello("esp32-aabbccdd")
        payload = json.dumps(ev, separators=(",", ":")).encode()
        frame = encode_frame(payload)
        out, rest = try_decode_frame(frame)
        self.assertIsNotNone(out)
        self.assertEqual(json.loads(out), ev)
        self.assertEqual(rest, b"")

    def test_corrupt_crc_rejected(self):
        ev = example_hello("esp32-aabbccdd")
        payload = json.dumps(ev).encode()
        frame = bytearray(encode_frame(payload))
        frame[-1] ^= 0xFF
        out, rest = try_decode_frame(bytes(frame))
        self.assertIsNone(out)

    def test_partial_buffer(self):
        ev = example_hello("esp32-x")
        frame = encode_frame(json.dumps(ev).encode())
        out, rest = try_decode_frame(frame[:5])
        self.assertIsNone(out)
        self.assertEqual(rest, frame[:5])

    def test_ndjson_prefix(self):
        ev = example_hello("esp32-x")
        line = encode_ndjson(ev).decode()
        self.assertTrue(line.startswith("AP "))
        parsed = parse_ndjson_line(line)
        self.assertEqual(parsed["node_id"], "esp32-x")
        self.assertEqual(parsed["event_type"], "hello")


class TestSchema(unittest.TestCase):
    def test_hello_valid(self):
        ok, msg = validate_event(example_hello("esp32-1"))
        self.assertTrue(ok)

    def test_missing_boot_id(self):
        ev = example_hello("esp32-1")
        del ev["boot_id"]
        ok, msg = validate_event(ev)
        self.assertFalse(ok)
        self.assertIn("boot_id", msg)

    def test_schema_version_required_2(self):
        ev = example_hello("esp32-1")
        ev["schema_version"] = 1
        ok, msg = validate_event(ev)
        self.assertFalse(ok)

    def test_sequence_monotonic_start(self):
        ev = example_hello("esp32-1")
        self.assertEqual(ev["sequence"], 1)
        ev["sequence"] = 0
        ok, msg = validate_event(ev)
        self.assertFalse(ok)

    def test_clock_id_format(self):
        node, boot = "esp32-1", "boot-abc"
        self.assertEqual(make_clock_id(node, boot), "esp32-1:boot-abc")
        ev = example_tx(node, boot, 2, 1000, 50000)
        self.assertEqual(ev["clock_id"], make_clock_id(node, boot))


class TestClockDiscipline(unittest.TestCase):
    def test_same_clock_ok(self):
        boot = "b1"
        a = example_tx("n1", boot, 2, 100, 1000)
        b = example_rx("n1", boot, 3, 200, 2000)
        ok, reason = can_use_for_tdoa(a, b)
        self.assertTrue(ok)
        self.assertEqual(reason, "same_clock_domain")

    def test_cross_clock_without_uncertainty_refused(self):
        a = example_tx("n1", "b1", 2, 100, 1000)
        b = example_rx("n2", "b2", 5, 200, 2000, peer_node_id="n1", peer_boot_id="b1", peer_sequence=2)
        ok, reason = can_use_for_tdoa(a, b)
        self.assertFalse(ok)
        self.assertEqual(reason, "cross_clock_without_uncertainty")

    def test_cross_clock_with_uncertainty_allowed(self):
        a = example_tx("n1", "b1", 2, 100, 1000)
        b = example_rx("n2", "b2", 5, 200, 2000)
        a["clock_offset_estimate_us"] = 0
        a["clock_uncertainty_us"] = 50
        b["clock_offset_estimate_us"] = 120
        b["clock_uncertainty_us"] = 80
        ok, reason = can_use_for_tdoa(a, b)
        self.assertTrue(ok)
        self.assertEqual(reason, "cross_clock_with_uncertainty")

    def test_sequence_match_does_not_imply_sync(self):
        """Peer sequence equality is scheduling metadata, not clock sync."""
        a = example_tx("n1", "b1", 42, 100, 1000)
        b = example_rx("n2", "b2", 7, 200, 2000, peer_sequence=42, peer_node_id="n1", peer_boot_id="b1")
        ok, reason = can_use_for_tdoa(a, b)
        self.assertFalse(ok)
        self.assertEqual(b["peer_sequence"], a["sequence"])


class TestTwoNodeScenario(unittest.TestCase):
    def test_independent_observations(self):
        boot_a, boot_b = "boot-a", "boot-b"
        tx = example_tx("esp32-a", boot_a, sequence=3, sample_counter=48000, tx_actual_at_us=1_000_000)
        rx = example_rx(
            "esp32-b",
            boot_b,
            sequence=9,
            sample_counter=49000,
            rx_detected_at_us=1_001_200,
            peer_node_id="esp32-a",
            peer_boot_id=boot_a,
            peer_sequence=3,
        )
        self.assertTrue(validate_event(tx)[0])
        self.assertTrue(validate_event(rx)[0])
        self.assertNotEqual(tx["clock_id"], rx["clock_id"])
        ok, _ = can_use_for_tdoa(tx, rx)
        self.assertFalse(ok)


if __name__ == "__main__":
    unittest.main()
