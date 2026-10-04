"""
Dynamic process model loader for GO-TR.

Replaces the hardcoded ``datacsv_repair.csv`` bootstrap in ``Main.py``.
Supported sources:

* ``.csv``          -> process discovery (Inductive Miner) with configurable column mapping
* ``.xes``/``.xes.gz`` -> process discovery (Inductive Miner) using standard XES keys
* ``.pnml``         -> normative Petri net imported as-is (no discovery)

Besides the Petri net and its reachability graph, the loader pre-computes the
markings needed for dynamic case-completion detection (see
``ProcessModel.terminal_markings`` / ``ProcessModel.completable_markings``),
so the consumer no longer needs to know the name of the last activity.
"""
from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, FrozenSet, List, Optional, Set

import pandas as pd
import pm4py
from pm4py.objects.petri_net.obj import Marking
from pm4py.objects.petri_net.utils import reachability_graph as rg_utils

SUPPORTED_EXTENSIONS = (".csv", ".xes", ".xes.gz", ".pnml")
DEFAULT_RG_TIMEOUT_SEC = 60

MarkingKey = FrozenSet[str]


@dataclass
class ProcessModel:
    net: object
    im: Marking
    fm: Marking
    ts: object
    trans_name: List[Optional[str]]
    states: List[str]
    places: List[str]
    activities: List[str]
    initial_places: List[str]
    final_places: List[str]
    terminal_markings: Set[MarkingKey] = field(default_factory=set)
    completable_markings: Set[MarkingKey] = field(default_factory=set)
    source: str = ""
    source_type: str = ""
    stats: Dict[str, object] = field(default_factory=dict)

    def summary(self) -> Dict[str, object]:
        return {
            "source": self.source,
            "source_type": self.source_type,
            "activities": self.activities,
            "num_activities": len(self.activities),
            "num_places": len(self.places),
            "num_transitions": len(self.net.transitions),
            "num_invisible_transitions": sum(1 for t in self.net.transitions if t.label is None),
            "num_states": len(self.states),
            "initial_places": self.initial_places,
            "final_places": self.final_places,
            "num_terminal_markings": len(self.terminal_markings),
            "num_completable_markings": len(self.completable_markings),
            **self.stats,
        }


def _suffix(path: Path) -> str:
    name = path.name.lower()
    return ".xes.gz" if name.endswith(".xes.gz") else path.suffix.lower()


def _marking_key(marking: Marking) -> MarkingKey:
    return frozenset(p.name for p, count in marking.items() if count > 0)


# ---------------------------------------------------------------------------
# Readers
# ---------------------------------------------------------------------------
def _read_csv(path: Path, case_col: str, activity_col: str, timestamp_col: Optional[str]) -> pd.DataFrame:
    df = pd.read_csv(path, sep=None, engine="python")
    missing = [c for c in (case_col, activity_col) if c not in df.columns]
    if missing:
        raise ValueError(
            f"Kolom {missing} tidak ditemukan di CSV. Kolom tersedia: {list(df.columns)}"
        )

    ts_key = timestamp_col if timestamp_col else "__gotr_timestamp"
    parsed = None
    if timestamp_col and timestamp_col in df.columns and df[timestamp_col].notna().any():
        parsed = pd.to_datetime(df[timestamp_col], errors="coerce", utc=True)
        if parsed.isna().all():
            parsed = None

    if parsed is None:
        # Same behaviour as the original bootstrap: synthetic, order-preserving timestamps
        df[ts_key] = pd.date_range(start=datetime.now(), periods=len(df), freq="15s")
    else:
        df[ts_key] = parsed

    df[case_col] = df[case_col].astype(str)
    df[activity_col] = df[activity_col].astype(str)
    return pm4py.format_dataframe(df, case_id=case_col, activity_key=activity_col, timestamp_key=ts_key)


def _discover(log_df: pd.DataFrame, noise_threshold: float):
    event_log = pm4py.convert_to_event_log(log_df)
    return pm4py.discover_petri_net_inductive(event_log, noise_threshold=noise_threshold)


def _read_pnml(path: Path):
    net, im, fm = pm4py.read_pnml(str(path), auto_guess_final_marking=True)
    if not im:
        sources = [p for p in net.places if not p.in_arcs]
        if len(sources) != 1:
            raise ValueError("PNML tidak memiliki initial marking dan source place tidak unik.")
        im = Marking({sources[0]: 1})
    if not fm:
        sinks = [p for p in net.places if not p.out_arcs]
        if len(sinks) != 1:
            raise ValueError("PNML tidak memiliki final marking dan sink place tidak unik.")
        fm = Marking({sinks[0]: 1})
    return net, im, fm


# ---------------------------------------------------------------------------
# Completion analysis
# ---------------------------------------------------------------------------
def compute_completion_markings(outgoing: Dict[Marking, Dict[object, Marking]], fm: Marking):
    """
    Returns ``(terminal, completable)`` as sets of frozensets of place names.

    * completable: the final marking is reachable using *only* silent transitions.
    * terminal:    completable AND no visible transition can fire anymore from any
                   marking reachable through silent moves (the case cannot continue
                   legally -> it is safe to finalize, even in models with loops).
    """
    fm_key = _marking_key(fm)

    # Reverse adjacency restricted to silent transitions
    silent_reverse: Dict[Marking, Set[Marking]] = {}
    for m, outs in outgoing.items():
        for t, nm in outs.items():
            if t.label is None:
                silent_reverse.setdefault(nm, set()).add(m)

    final_markings = [m for m in outgoing if _marking_key(m) == fm_key]
    completable: Set[Marking] = set(final_markings)
    queue = deque(final_markings)
    while queue:
        current = queue.popleft()
        for prev in silent_reverse.get(current, ()):
            if prev not in completable:
                completable.add(prev)
                queue.append(prev)

    def silent_closure(start: Marking) -> Set[Marking]:
        seen = {start}
        stack = [start]
        while stack:
            m = stack.pop()
            for t, nm in outgoing.get(m, {}).items():
                if t.label is None and nm not in seen:
                    seen.add(nm)
                    stack.append(nm)
        return seen

    terminal: Set[Marking] = set()
    for m in completable:
        closure = silent_closure(m)
        if not any(t.label is not None for cm in closure for t in outgoing.get(cm, {})):
            terminal.add(m)

    return {_marking_key(m) for m in terminal}, {_marking_key(m) for m in completable}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def build_process_model(net, im, fm, *, source: str = "", source_type: str = "",
                        rg_timeout_sec: int = DEFAULT_RG_TIMEOUT_SEC) -> ProcessModel:
    started = time.time()
    params = {rg_utils.Parameters.MAX_ELAB_TIME: rg_timeout_sec}
    incoming, outgoing, _ = rg_utils.marking_flow_petri(net, im, parameters=params)
    ts = rg_utils.construct_reachability_graph_from_flow(incoming, outgoing)
    rg_truncated = (time.time() - started) >= rg_timeout_sec

    trans_name = [t.label for t in net.transitions]
    trans_name.extend(["START", "END"])

    terminal, completable = compute_completion_markings(outgoing, fm)

    return ProcessModel(
        net=net,
        im=im,
        fm=fm,
        ts=ts,
        trans_name=trans_name,
        states=[s.name for s in ts.states],
        places=[p.name for p in net.places],
        activities=sorted({t.label for t in net.transitions if t.label is not None}),
        initial_places=sorted(p.name for p in im),
        final_places=sorted(p.name for p in fm),
        terminal_markings=terminal,
        completable_markings=completable,
        source=source,
        source_type=source_type,
        stats={
            "rg_build_seconds": round(time.time() - started, 3),
            "rg_truncated": rg_truncated,
        },
    )


def load_process_model(path, *, case_col: str = "case_id", activity_col: str = "activity",
                       timestamp_col: Optional[str] = "timestamp", noise_threshold: float = 0.0,
                       rg_timeout_sec: int = DEFAULT_RG_TIMEOUT_SEC) -> ProcessModel:
    """Load a process model from ``.csv``, ``.xes``, ``.xes.gz`` or ``.pnml``."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"File model tidak ditemukan: {path}")

    ext = _suffix(path)
    if ext == ".csv":
        df = _read_csv(path, case_col, activity_col, timestamp_col)
        net, im, fm = _discover(df, noise_threshold)
        source_type = "discovered:csv"
    elif ext in (".xes", ".xes.gz"):
        df = pm4py.read_xes(str(path))
        net, im, fm = _discover(df, noise_threshold)
        source_type = "discovered:xes"
    elif ext == ".pnml":
        net, im, fm = _read_pnml(path)
        source_type = "pnml"
    else:
        raise ValueError(f"Format '{ext}' tidak didukung. Gunakan salah satu: {SUPPORTED_EXTENSIONS}")

    model = build_process_model(net, im, fm, source=str(path), source_type=source_type,
                                rg_timeout_sec=rg_timeout_sec)
    model.stats["noise_threshold"] = noise_threshold if source_type.startswith("discovered") else None
    return model


def is_marking_terminal(model: ProcessModel, current_marking) -> bool:
    return frozenset(current_marking or []) in model.terminal_markings


def is_marking_completable(model: ProcessModel, current_marking) -> bool:
    return frozenset(current_marking or []) in model.completable_markings
