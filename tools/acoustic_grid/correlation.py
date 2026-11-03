"""Correlate probes and multi-receiver observations by ping_id."""
from __future__ import annotations

from typing import Dict, List, Optional, Set

from .models import Observation, Probe


class ProbeCorrelationIndex:
    def __init__(self) -> None:
        self._probes: Dict[str, Probe] = {}
        self._obs: Dict[str, List[Observation]] = {}
        self._obs_ids: Set[str] = set()
        self._duplicate_obs: int = 0

    def add_probe(self, probe: Probe) -> Probe:
        self._probes[probe.ping_id] = probe
        self._obs.setdefault(probe.ping_id, [])
        return probe

    def add_observation(self, obs: Observation) -> bool:
        if obs.observation_id in self._obs_ids:
            self._duplicate_obs += 1
            return False
        self._obs_ids.add(obs.observation_id)
        self._obs.setdefault(obs.ping_id, []).append(obs)
        return True

    def ingest_event(self, event: dict) -> Optional[str]:
        et = event.get("event_type")
        if et == "tx":
            p = Probe.from_tx_event(event)
            self.add_probe(p)
            return p.ping_id
        if et in ("rx", "miss", "detection"):
            o = Observation.from_rx_event(event)
            self.add_observation(o)
            return o.ping_id
        return None

    def observations_for(self, ping_id: str) -> List[Observation]:
        return list(self._obs.get(ping_id, []))

    def probe(self, ping_id: str) -> Optional[Probe]:
        return self._probes.get(ping_id)

    def missing_receivers(self, ping_id: str, expected_node_ids: List[str]) -> List[str]:
        seen = {o.observer_node_id for o in self.observations_for(ping_id)}
        return [n for n in expected_node_ids if n not in seen]

    def stats(self) -> dict:
        return {
            "probes": len(self._probes),
            "observation_groups": len(self._obs),
            "total_observations": sum(len(v) for v in self._obs.values()),
            "duplicate_observations": self._duplicate_obs,
        }

    def snapshot(self) -> dict:
        return {
            "schema": "probe_correlation_v1",
            "probes": {k: v.to_dict() for k, v in self._probes.items()},
            "observations": {k: [o.to_dict() for o in v] for k, v in self._obs.items()},
            "duplicate_observations": self._duplicate_obs,
        }

    def restore_from_snapshot(self, snap: dict) -> None:
        self._probes.clear()
        self._obs.clear()
        self._obs_ids.clear()
        self._duplicate_obs = int(snap.get("duplicate_observations") or 0)
        for pid, pd in (snap.get("probes") or {}).items():
            self._probes[pid] = Probe(**{k: pd.get(k) for k in Probe.__dataclass_fields__})
        for pid, obs_list in (snap.get("observations") or {}).items():
            self._obs[pid] = []
            for od in obs_list:
                o = Observation(**{k: od.get(k) for k in Observation.__dataclass_fields__})
                self._obs[pid].append(o)
                self._obs_ids.add(o.observation_id)
