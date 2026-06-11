from services.production_exposure import (
    calculate_total_equipment_lifecycle_exposure,
    calculate_covered_assessed_exposure,
    calculate_uncovered_assessed_exposure,
    production_exposure_hours,
    production_exposure_monetary_value,
)


def test_production_exposure_hours_uses_max_of_closed_range():
    assert production_exposure_hours(3) == 24.0
    assert production_exposure_hours(4) == 72.0
    assert production_exposure_hours(2) == 8.0


def test_production_exposure_hours_open_ended_uses_min_bound():
    assert production_exposure_hours(5) == 72.0


def test_total_lifecycle_exposure_sums_assessed_equipment_only():
    nodes = [
        {"id": "a", "criticality": {"production_impact": 3}},
        {"id": "b", "criticality": {"production_impact": 0}},
        {"id": "c", "criticality": None},
        {"id": "d", "criticality": {"production_impact": 4}},
    ]
    total, count = calculate_total_equipment_lifecycle_exposure(nodes, hourly_cost=500.0)
    assert count == 2
    assert total == production_exposure_monetary_value(3, 500.0) + production_exposure_monetary_value(4, 500.0)


def test_covered_assessed_exposure_sums_program_equipment_only():
    nodes = [
        {"id": "a", "criticality": {"production_impact": 3}},
        {"id": "d", "criticality": {"production_impact": 4}},
    ]
    covered, count = calculate_covered_assessed_exposure(nodes, {"a"}, hourly_cost=500.0)
    assert count == 1
    assert covered == production_exposure_monetary_value(3, 500.0)


def test_uncovered_assessed_exposure_sums_equipment_without_program():
    nodes = [
        {"id": "a", "criticality": {"production_impact": 3}},
        {"id": "d", "criticality": {"production_impact": 4}},
    ]
    uncovered, count = calculate_uncovered_assessed_exposure(nodes, {"a"}, hourly_cost=500.0)
    assert count == 1
    assert uncovered == production_exposure_monetary_value(4, 500.0)
