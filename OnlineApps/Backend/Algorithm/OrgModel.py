"""
Dynamic organizational model for GO-TR (multi-perspective conformance).

Replaces the hardcoded DataFrames in ``GO_TR.py`` (``df_res_tab``,
``df_activity_entity``, ``df_activity_function``) and the hardcoded calls in
``Neo4jFunc.generate_organizational_model``.

The model is described in YAML or JSON (see ``models/org_model.repair.yaml``)
and is materialized into Neo4j using the existing graph conventions:

    (:Transition {type:'master'})-[:EXECUTED_BY]->(:Entity {eName, kind})
    (:Entity)-[:ROLE]->(:Resource {rName})
    (:Entity)-[:SUPERVISED_BY|TO_ROOT]->(:Entity)
    (:Transition)-[:WRITE]->(:Variable {type:'master'})-[:READ]->(:Transition)

Activity rules (required role / team / team variable / written variables) are
stored as properties on the master ``Transition`` node so GO-TR can read them
straight from Neo4j at runtime.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import yaml

from . import Neo4jFunc as neo4j_func

ALLOWED_HIERARCHY_RELS = ("TO_ROOT", "SUPERVISED_BY")
ALLOWED_VARIABLE_SOURCES = ("any", "event_attrs", "case_attrs", "event")


class OrgModelError(ValueError):
    def __init__(self, errors: List[str]):
        self.errors = errors
        super().__init__("Org model tidak valid:\n- " + "\n- ".join(errors))


@dataclass
class VariableSpec:
    name: str
    attribute: str
    source: str = "any"
    default: Optional[str] = "unknown"


@dataclass
class ActivityRule:
    activity: str
    role: Optional[str] = None
    team: Optional[str] = None
    team_variable: Optional[str] = None
    allowed_teams: List[str] = field(default_factory=list)
    writes: List[str] = field(default_factory=list)
    executed_by: List[str] = field(default_factory=list)


@dataclass
class OrgModel:
    process: str
    roots: List[str]
    roles: List[str]
    teams: List[str]
    hierarchy: List[Dict[str, str]]
    resources: Dict[str, List[str]]
    variables: Dict[str, VariableSpec]
    activities: Dict[str, ActivityRule]
    raw: Dict[str, Any] = field(default_factory=dict)
    source: str = ""

    # ------------------------------------------------------------------ info
    @property
    def entities(self) -> List[str]:
        return list(dict.fromkeys([*self.roots, *self.roles, *self.teams]))

    def entity_kind(self, name: str) -> str:
        if name in self.roots:
            return "root"
        if name in self.roles:
            return "role"
        return "team"

    def summary(self) -> Dict[str, Any]:
        return {
            "process": self.process,
            "source": self.source,
            "roots": self.roots,
            "roles": self.roles,
            "teams": self.teams,
            "num_resources": len(self.resources),
            "resources": self.resources,
            "variables": {k: vars(v) for k, v in self.variables.items()},
            "activities": {
                k: {
                    "role": r.role,
                    "team": r.team,
                    "team_variable": r.team_variable,
                    "allowed_teams": r.allowed_teams,
                    "writes": r.writes,
                    "executed_by": r.executed_by,
                }
                for k, r in self.activities.items()
            },
        }

    # ------------------------------------------------------------ validation
    def validate_against_process(self, process_activities: Iterable[str]) -> List[str]:
        """Return human-readable warnings (never raises)."""
        process_activities = {a for a in process_activities if a}
        warnings: List[str] = []

        unmodeled = sorted(process_activities - set(self.activities))
        if unmodeled:
            warnings.append(
                f"{len(unmodeled)} aktivitas di process model tidak punya aturan organisasi "
                f"(org-check akan di-skip): {unmodeled}"
            )
        unknown = sorted(set(self.activities) - process_activities)
        if unknown:
            warnings.append(f"Aktivitas di org model yang tidak ada di process model: {unknown}")

        for var_name in self.variables:
            writers = [a for a, r in self.activities.items() if var_name in r.writes]
            readers = [a for a, r in self.activities.items() if r.team_variable == var_name]
            if readers and not writers:
                warnings.append(f"Variabel '{var_name}' dibaca oleh {readers} tetapi tidak pernah ditulis.")

        members: Dict[str, List[str]] = {}
        for res, ents in self.resources.items():
            for e in ents:
                members.setdefault(e, []).append(res)
        for rule in self.activities.values():
            if rule.role and rule.role not in members and not self._has_subordinates(rule.role):
                warnings.append(f"Role '{rule.role}' (aktivitas '{rule.activity}') tidak memiliki resource.")
        return warnings

    def _has_subordinates(self, entity: str) -> bool:
        return any(h["parent"] == entity for h in self.hierarchy)

    # ------------------------------------------------------------- neo4j I/O
    def apply_to_neo4j(self, session) -> Dict[str, int]:
        """Materialize the org model into Neo4j (replaces any previous org model)."""
        neo4j_func.clear_organizational_model(session)

        for name in self.entities:
            neo4j_func.createEntity(session, name, self.entity_kind(name))
        for res in self.resources:
            neo4j_func.createResource(session, res)

        for h in self.hierarchy:
            if h["rel"] == "TO_ROOT":
                neo4j_func.createRelationship_entity_to_root(session, h["child"], h["parent"])
            else:
                neo4j_func.createRelationship_entity_supervise_entity(session, h["child"], h["parent"])

        for res, ents in self.resources.items():
            for ent in ents:
                neo4j_func.createRelationship_resource_to_Entity(session, res, ent)

        for var in self.variables.values():
            neo4j_func.createVariable(session, var.name, "", var.attribute, var.source, var.default)

        for rule in self.activities.values():
            for ent in rule.executed_by:
                neo4j_func.createRelationship_task_to_entity(session, rule.activity, ent)
            for var_name in rule.writes:
                neo4j_func.createRelationship_task_to_variable(session, rule.activity, var_name)
            if rule.team_variable:
                neo4j_func.createRelationship_variable_to_task(session, rule.team_variable, rule.activity)
            neo4j_func.set_transition_org_rule(
                session, rule.activity, rule.role, rule.team, rule.team_variable, rule.writes
            )

        return {
            "entities": len(self.entities),
            "resources": len(self.resources),
            "activities": len(self.activities),
            "variables": len(self.variables),
        }


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------
def _as_list(value, field_name: str, errors: List[str]) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, (list, tuple)):
        return [str(v) for v in value]
    errors.append(f"'{field_name}' harus berupa list atau string.")
    return []


def parse_org_model(data: Dict[str, Any], source: str = "") -> OrgModel:
    if not isinstance(data, dict):
        raise OrgModelError(["Root dokumen harus berupa object/mapping."])

    errors: List[str] = []
    entities = data.get("entities") or {}
    roots = _as_list(entities.get("roots"), "entities.roots", errors)
    roles = _as_list(entities.get("roles"), "entities.roles", errors)
    teams = _as_list(entities.get("teams"), "entities.teams", errors)
    known = set(roots) | set(roles) | set(teams)
    if not known:
        errors.append("Minimal satu entity (roles/teams) harus didefinisikan.")

    hierarchy: List[Dict[str, str]] = []
    for i, h in enumerate(data.get("hierarchy") or []):
        child, parent = h.get("child"), h.get("parent")
        rel = str(h.get("rel", "TO_ROOT")).upper()
        if rel not in ALLOWED_HIERARCHY_RELS:
            errors.append(f"hierarchy[{i}].rel '{rel}' tidak valid ({ALLOWED_HIERARCHY_RELS}).")
        for n in (child, parent):
            if n not in known:
                errors.append(f"hierarchy[{i}] mereferensikan entity tidak dikenal: '{n}'.")
        hierarchy.append({"child": child, "parent": parent, "rel": rel})

    resources: Dict[str, List[str]] = {}
    for res, ents in (data.get("resources") or {}).items():
        ents = _as_list(ents, f"resources.{res}", errors)
        for e in ents:
            if e not in known:
                errors.append(f"Resource '{res}' mereferensikan entity tidak dikenal: '{e}'.")
        resources[str(res)] = ents

    variables: Dict[str, VariableSpec] = {}
    for name, spec in (data.get("variables") or {}).items():
        spec = spec or {}
        if isinstance(spec, str):
            spec = {"attribute": spec}
        source_ = str(spec.get("source", "any"))
        if source_ not in ALLOWED_VARIABLE_SOURCES:
            errors.append(f"variables.{name}.source '{source_}' tidak valid ({ALLOWED_VARIABLE_SOURCES}).")
        default = spec.get("default", "unknown")
        variables[str(name)] = VariableSpec(
            name=str(name),
            attribute=str(spec.get("attribute", name)),
            source=source_,
            default=None if default is None else str(default),
        )

    activities: Dict[str, ActivityRule] = {}
    for act, spec in (data.get("activities") or {}).items():
        spec = spec or {}
        act = str(act)
        rule = ActivityRule(activity=act, role=spec.get("role"))
        team = spec.get("team")
        if isinstance(team, dict):
            rule.team_variable = team.get("variable")
            rule.allowed_teams = _as_list(team.get("allowed"), f"activities.{act}.team.allowed", errors)
            if not rule.team_variable:
                errors.append(f"activities.{act}.team: field 'variable' wajib jika team berupa object.")
            elif rule.team_variable not in variables:
                errors.append(f"activities.{act}.team.variable '{rule.team_variable}' belum didefinisikan di 'variables'.")
            if not rule.allowed_teams:
                rule.allowed_teams = list(teams)
        elif team is not None:
            rule.team = str(team)

        rule.writes = _as_list(spec.get("writes"), f"activities.{act}.writes", errors)
        for w in rule.writes:
            if w not in variables:
                errors.append(f"activities.{act}.writes '{w}' belum didefinisikan di 'variables'.")

        explicit = _as_list(spec.get("executed_by"), f"activities.{act}.executed_by", errors)
        derived = [e for e in [rule.role, rule.team, *rule.allowed_teams] if e]
        rule.executed_by = list(dict.fromkeys(explicit or derived))
        for e in rule.executed_by + ([rule.role] if rule.role else []):
            if e not in known:
                errors.append(f"activities.{act} mereferensikan entity tidak dikenal: '{e}'.")
        activities[act] = rule

    if errors:
        raise OrgModelError(list(dict.fromkeys(errors)))

    return OrgModel(
        process=str(data.get("process", "")),
        roots=roots,
        roles=roles,
        teams=teams,
        hierarchy=hierarchy,
        resources=resources,
        variables=variables,
        activities=activities,
        raw=data,
        source=source,
    )


def parse_org_model_text(text: str, fmt: Optional[str] = None, source: str = "") -> OrgModel:
    fmt = (fmt or "").lower().lstrip(".")
    try:
        if fmt == "json":
            data = json.loads(text)
        else:  # YAML is a superset of JSON -> also handles JSON input
            data = yaml.safe_load(text)
    except (json.JSONDecodeError, yaml.YAMLError) as exc:
        raise OrgModelError([f"Gagal mem-parsing dokumen ({fmt or 'yaml'}): {exc}"]) from exc
    return parse_org_model(data, source=source)


def load_org_model(path) -> OrgModel:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"File org model tidak ditemukan: {path}")
    return parse_org_model_text(path.read_text(encoding="utf-8"), path.suffix, source=str(path))


def dump_org_model_yaml(data: Dict[str, Any]) -> str:
    return yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
