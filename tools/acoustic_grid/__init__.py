"""Scalable N-node acoustic grid host-side foundation.

Does not compute positions. Does not feed neurofeedback.
Preserves transport contract from tools/acoustic_transport.py.
"""

from .models import (
    ClockRelationship,
    GridNode,
    Observation,
    Probe,
    SampleCounterSemantics,
)
from .registry import GridRegistry
from .clock_service import ClockService, can_use_for_tdoa_v2
from .correlation import ProbeCorrelationIndex
from .persistence import AppendOnlyEventLog

__all__ = [
    "ClockRelationship",
    "GridNode",
    "Observation",
    "Probe",
    "SampleCounterSemantics",
    "GridRegistry",
    "ClockService",
    "can_use_for_tdoa_v2",
    "ProbeCorrelationIndex",
    "AppendOnlyEventLog",
]

__version__ = "0.1.0"
