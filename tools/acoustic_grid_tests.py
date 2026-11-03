#!/usr/bin/env python3
"""Scalable acoustic grid tests: identity, correlation, clock, persistence, 64-node sim."""
from __future__ import annotations

import sys
import tempfile
import unittest
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from acoustic_transport import (
    can_use_for_tdoa,
    example_hello,
    example_rx,
    example_tx,
    make_clock_id,
    validate_event,
)
from acoustic_grid.clock_service import ClockService, can_use_for_tdoa_v2
from acoustic_grid.correlation import ProbeCorrelationIndex
from acoustic_grid.ingest import GridIngest
from acoustic_grid.models import Observation, SampleCounterSemantics
from acoustic_grid.persistence import AppendOnlyEventLog
from acoustic_grid.registry import GridRegistry


def _hello(node: str, boot: str, seq: int = 1) -> dict:
    e = example_hello(node, boot_id=boot)
    e["sequence"] = seq
    e["event_id"] = str(uuid.uuid4())
    return e


def _tx(node: str, boot: str, seq: int, sc: int, tus: int) -> dict:
    e = example_tx(node, boot, seq, sc, tus)
    e["event_id"] = str(uuid.uuid4())
    e["ping_id"] = f"{node}:{boot}:{seq}"
    return e


def _rx(node, boot, seq, sc, rus, peer_node, peer_boot, peer_seq) -> dict:
    e = example_rx(node, boot, seq, sc, rus, peer_node_id=peer_node, peer_boot_id=peer_boot, peer_sequence=peer_seq)
    e["event_id"] = str(uuid.uuid4())
    e["ping_id"] = f"{peer_node}:{peer_boot}:{peer_seq}"
    return e


class TestSampleCounterSemantics(unittest.TestCase):
    def test_frame_not_multiplied_by_channels(self):
        s = SampleCounterSemantics()
        self.assertFalse(s.channel_count_affects_counter)

    def test_existing_transport_still_valid(self):
        ok, _ = validate_event(example_hello("n1"))
        self.assertTrue(ok)


class TestIdentityLifecycle(unittest.TestCase):
    def test_many_nodes_register(self):
        reg = GridRegistry()
        for i in range(32):
            reg.register_from_event(_hello(f"esp32-{i:03d}", f"boot-{i}"))
        self.assertEqual(len(reg.list_nodes()), 32)

    def test_reboot_new_boot_id(self):
        reg = GridRegistry()
        reg.register_from_event(_hello("esp32-a", "boot-1", seq=5))
        reg.register_from_event(_hello("esp32-a", "boot-2", seq=1))
        self.assertEqual(reg.get_node("esp32-a").boot_id, "boot-2")
        self.assertEqual(len([s for s in reg.list_sessions() if s.node_id == "esp32-a"]), 2)

    def test_sequence_reset_only_on_new_boot(self):
        reg = GridRegistry()
        reg.register_from_event(_hello("n1", "b1", seq=10))
        reg.register_from_event(_tx("n1", "b1", 11, 100, 1000))
        self.assertGreaterEqual(reg.get_session("n1", "b1").sequence_high_water, 11)
        reg.register_from_event(_hello("n1", "b2", seq=1))
        self.assertEqual(reg.get_session("n1", "b2").sequence_high_water, 1)

    def test_reconnect_same_session(self):
        reg = GridRegistry()
        reg.register_from_event(_hello("n1", "b1"))
        reg.register_from_event(_tx("n1", "b1", 2, 1, 1))
        self.assertEqual(len(reg.list_nodes()), 1)

    def test_sequence_gap_recorded(self):
        reg = GridRegistry()
        reg.register_from_event(_hello("n1", "b1", seq=1))
        reg.register_from_event(_tx("n1", "b1", 5, 1, 1))
        self.assertTrue(any(g["got"] == 5 for g in reg._seq_gaps))


class TestEventCorrelation(unittest.TestCase):
    def test_one_probe_many_receivers(self):
        idx = ProbeCorrelationIndex()
        tx = _tx("tx0", "b0", 3, 1000, 50_000)
        idx.ingest_event(tx)
        for i in range(5):
            idx.ingest_event(_rx(f"rx{i}", f"br{i}", 1, 1100, 51_000, "tx0", "b0", 3))
        self.assertEqual(len(idx.observations_for(tx["ping_id"])), 5)

    def test_missing_receivers_supported(self):
        idx = ProbeCorrelationIndex()
        tx = _tx("tx0", "b0", 1, 1, 1)
        idx.ingest_event(tx)
        self.assertEqual(idx.missing_receivers(tx["ping_id"], ["rx0", "rx1"]), ["rx0", "rx1"])

    def test_duplicate_observation(self):
        idx = ProbeCorrelationIndex()
        rx = _rx("rx0", "b", 1, 1, 1, "tx", "bt", 1)
        self.assertTrue(idx.add_observation(Observation.from_rx_event(rx)))
        self.assertFalse(idx.add_observation(Observation.from_rx_event(rx)))

    def test_independent_sequences_on_different_nodes(self):
        a = _tx("n1", "b1", 42, 1, 1)
        b = _tx("n2", "b2", 42, 1, 1)
        self.assertEqual(a["sequence"], b["sequence"])
        self.assertNotEqual(a["clock_id"], b["clock_id"])


class TestClockRelationships(unittest.TestCase):
    def test_unknown_rejected(self):
        ok, reason, _ = can_use_for_tdoa_v2("c1", "c2", ClockService())
        self.assertFalse(ok)

    def test_matching_sequence_does_not_sync(self):
        a = example_tx("n1", "b1", 42, 1, 1)
        b = example_rx("n2", "b2", 7, 1, 1, peer_sequence=42, peer_node_id="n1", peer_boot_id="b1")
        ok, _ = can_use_for_tdoa(a, b)
        self.assertFalse(ok)

    def test_valid_relationship_accepted(self):
        svc = ClockService()
        svc.create_estimate("c1", "c2", 100, 50, valid_for_ms=10_000)
        ok, reason, unc = can_use_for_tdoa_v2("c1", "c2", svc, max_uncertainty_us=100)
        self.assertTrue(ok)

    def test_stale_rejected(self):
        svc = ClockService()
        rel = svc.create_estimate("c1", "c2", 0, 10, valid_for_ms=-1)
        rel.valid_until_host_ms = 1
        svc.expire_stale(host_ms=999999)
        ok, _, _ = can_use_for_tdoa_v2("c1", "c2", svc, host_ms=999999)
        self.assertFalse(ok)

    def test_drift_increases_uncertainty(self):
        svc = ClockService()
        svc.create_estimate("c1", "c2", 0, 10)
        rel = svc.get_relationship("c1", "c2")
        self.assertGreater(rel.propagated_uncertainty_us(1_000_000, drift_ppm=10), rel.propagated_uncertainty_us(0))

    def test_negative_uncertainty_rejected(self):
        self.assertEqual(ClockService().create_estimate("c1", "c2", 0, -5).status, "rejected")

    def test_invert_direction(self):
        svc = ClockService()
        svc.create_estimate("c1", "c2", 250, 20)
        self.assertEqual(svc.get_relationship("c2", "c1").offset_us, -250)

    def test_same_clock_ok(self):
        ok, _, unc = can_use_for_tdoa_v2("c1", "c1", ClockService())
        self.assertTrue(ok)
        self.assertEqual(unc, 0)


class TestPersistenceReplay(unittest.TestCase):
    def test_append_and_replay_registry(self):
        with tempfile.TemporaryDirectory() as td:
            log = AppendOnlyEventLog(str(Path(td) / "events.jsonl"))
            ingest = GridIngest(log=log)
            for i in range(8):
                ingest.handle(_hello(f"n{i}", f"b{i}"), transport="test")
            rebuilt = ingest.replay(list(log.iter_records()))
            self.assertEqual(len(rebuilt.registry.list_nodes()), 8)

    def test_duplicate_event_id(self):
        log = AppendOnlyEventLog()
        e = _hello("n1", "b1")
        self.assertTrue(log.append(e))
        self.assertFalse(log.append(e))

    def test_timestamps_not_rewritten(self):
        e = _tx("n1", "b1", 2, 99, 12345)
        log = AppendOnlyEventLog()
        log.append(e, host_received_ms=999)
        rec = list(log.iter_records())[0]
        self.assertEqual(rec["event"]["tx_actual_at_us"], 12345)


class TestScale64(unittest.TestCase):
    def test_64_nodes_concurrent_probes(self):
        ingest = GridIngest()
        n = 64
        for i in range(n):
            self.assertTrue(ingest.handle(_hello(f"node-{i:03d}", f"boot-{i:03d}"))["ok"])
        for t in range(8):
            tx = _tx(f"node-{t:03d}", f"boot-{t:03d}", 2, 1000 + t, 10_000 + t)
            ingest.handle(tx)
            for r in range(3):
                rid = 8 + (t * 3 + r) % (n - 8)
                ingest.handle(_rx(f"node-{rid:03d}", f"boot-{rid:03d}", 2, 2000 + r, 11_000 + r,
                                  f"node-{t:03d}", f"boot-{t:03d}", 2))
        ingest.handle(_tx("node-000", "boot-000", 5, 1, 1))
        ingest.handle(_hello("node-001", "boot-001-re"))
        stats = ingest.correlation.stats()
        self.assertGreaterEqual(stats["probes"], 8)
        self.assertEqual(ingest.registry.topology_snapshot()["node_count"], n)
        ok, _, _ = can_use_for_tdoa_v2(make_clock_id("node-000", "boot-000"),
                                       make_clock_id("node-010", "boot-010"), ingest.clocks)
        self.assertFalse(ok)

    def test_64_replay_consistency(self):
        ingest = GridIngest()
        for i in range(64):
            ingest.handle(_hello(f"n{i}", f"b{i}"))
        for i in range(16):
            ingest.handle(_tx(f"n{i}", f"b{i}", 2, i, i * 100))
        rebuilt = ingest.replay(list(ingest.log.iter_records()))
        self.assertEqual(len(rebuilt.registry.list_nodes()), 64)
        self.assertEqual(rebuilt.correlation.stats()["probes"], 16)


class TestIngestTwoNodePath(unittest.TestCase):
    def test_two_node_acceptance_shape(self):
        ingest = GridIngest()
        ingest.handle(_hello("esp32-a", "boot-a"))
        ingest.handle(_hello("esp32-b", "boot-b"))
        tx = _tx("esp32-a", "boot-a", 2, 48000, 1_000_000)
        ingest.handle(tx)
        ingest.handle(_rx("esp32-b", "boot-b", 2, 49000, 1_001_200, "esp32-a", "boot-a", 2))
        self.assertEqual(ingest.registry.online_count(), 2)
        self.assertEqual(len(ingest.correlation.observations_for(tx["ping_id"])), 1)
        ok, _, _ = can_use_for_tdoa_v2(make_clock_id("esp32-a", "boot-a"),
                                       make_clock_id("esp32-b", "boot-b"), ingest.clocks)
        self.assertFalse(ok)


if __name__ == "__main__":
    unittest.main()
