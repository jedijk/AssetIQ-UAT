"""Ownership matrix and upsert caller guard tests."""
from pathlib import Path

from services.reliability_graph import GRAPH_SYNC_HANDLERS
from services.reliability_graph_ownership import (
    EDGE_OWNERS,
    validate_ontology_relations,
    validate_ownership_covers_handlers,
    scan_unapproved_upsert_callers,
)
from services.reliability_ontology import RELATIONS

BACKEND = Path(__file__).resolve().parents[1]


def test_all_dispatch_handlers_have_owners():
  gaps = validate_ownership_covers_handlers(frozenset(GRAPH_SYNC_HANDLERS.keys()))
  assert gaps == [], gaps


def test_ontology_relations_have_owners():
  gaps = validate_ontology_relations(RELATIONS)
  assert gaps == [], gaps


def test_no_unapproved_upsert_callers_in_services():
  violations = scan_unapproved_upsert_callers(BACKEND / "services")
  assert violations == [], violations


def test_ownership_matrix_nonempty():
  assert len(EDGE_OWNERS) >= 30
