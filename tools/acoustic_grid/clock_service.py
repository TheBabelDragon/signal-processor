"""Clock relationship service — separate from acoustic event fields."""
from __future__ import annotations

import uuid
from typing import Dict, List, Optional, Tuple

from .models import ClockRelationship, _now_host_ms


def can_use_for_tdoa_v2(
    clock_a: str,
    clock_b: str,
    service: "ClockService",
    *,
    max_uncertainty_us: int = 5000,
    host_ms: Optional[int] = None,
    elapsed_source_us: int = 0,
    drift_ppm: float = 0.0,
) -> Tuple[bool, str, Optional[int]]:
    if clock_a == clock_b:
        return True, "same_clock_domain", 0
    rel = service.get_relationship(clock_a, clock_b)
    if rel is None:
        return False, "no_relationship", None
    if not rel.is_valid_now(host_ms=host_ms, max_uncertainty_us=max_uncertainty_us):
        return False, f"invalid_or_stale:{rel.status}", None
    unc = rel.propagated_uncertainty_us(elapsed_source_us, drift_ppm=drift_ppm)
    if unc > max_uncertainty_us:
        return False, "propagated_uncertainty_exceeds_limit", unc
    return True, "relationship_valid", unc


class ClockService:
    def __init__(self) -> None:
        self._rels: Dict[Tuple[str, str], ClockRelationship] = {}
        self._history: List[ClockRelationship] = []

    def put(self, rel: ClockRelationship) -> ClockRelationship:
        if rel.uncertainty_us is not None and rel.uncertainty_us < 0:
            rel.status = "rejected"
            rel.notes = (rel.notes or "") + " negative uncertainty"
        self._rels[(rel.source_clock_id, rel.target_clock_id)] = rel
        self._history.append(rel)
        return rel

    def create_estimate(
        self, source_clock_id: str, target_clock_id: str, offset_us: int, uncertainty_us: int,
        *, method: str = "manual", relative_rate: float = 1.0, valid_for_ms: int = 60_000, status: str = "estimated",
    ) -> ClockRelationship:
        now = _now_host_ms()
        rel = ClockRelationship(
            relationship_id=str(uuid.uuid4()),
            source_clock_id=source_clock_id,
            target_clock_id=target_clock_id,
            offset_us=offset_us,
            relative_rate=relative_rate,
            uncertainty_us=uncertainty_us,
            estimation_method=method,
            valid_from_host_ms=now,
            valid_until_host_ms=now + valid_for_ms,
            calibration_age_ms=0,
            status=status if uncertainty_us >= 0 else "rejected",
        )
        return self.put(rel)

    def get_relationship(self, source_clock_id: str, target_clock_id: str) -> Optional[ClockRelationship]:
        if source_clock_id == target_clock_id:
            return ClockRelationship(
                relationship_id="identity", source_clock_id=source_clock_id, target_clock_id=target_clock_id,
                offset_us=0, relative_rate=1.0, uncertainty_us=0, estimation_method="identity", status="validated",
            )
        direct = self._rels.get((source_clock_id, target_clock_id))
        if direct:
            return direct
        inv = self._rels.get((target_clock_id, source_clock_id))
        if inv and inv.offset_us is not None and inv.uncertainty_us is not None:
            return ClockRelationship(
                relationship_id=inv.relationship_id + ":inv",
                source_clock_id=source_clock_id, target_clock_id=target_clock_id,
                offset_us=-inv.offset_us,
                relative_rate=(1.0 / inv.relative_rate) if inv.relative_rate else None,
                uncertainty_us=inv.uncertainty_us, estimation_method=inv.estimation_method + "+invert",
                valid_from_host_ms=inv.valid_from_host_ms, valid_until_host_ms=inv.valid_until_host_ms,
                calibration_age_ms=inv.calibration_age_ms, status=inv.status, notes="inverted",
            )
        return None

    def expire_stale(self, host_ms: Optional[int] = None) -> int:
        now = host_ms if host_ms is not None else _now_host_ms()
        n = 0
        for rel in self._rels.values():
            if rel.valid_until_host_ms is not None and now > rel.valid_until_host_ms and rel.status != "expired":
                rel.status = "expired"
                n += 1
        return n

    def snapshot(self) -> dict:
        return {"schema": "clock_service_v1", "relationships": [r.to_dict() for r in self._rels.values()], "host_ms": _now_host_ms()}

    def restore_from_snapshot(self, snap: dict) -> None:
        self._rels.clear()
        for rd in snap.get("relationships") or []:
            rel = ClockRelationship(**{k: rd.get(k) for k in ClockRelationship.__dataclass_fields__})
            self.put(rel)

    def list_relationships(self) -> List[ClockRelationship]:
        return list(self._rels.values())
