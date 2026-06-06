"""Phase 2: background apply-strategy jobs."""
from services.background_jobs import _serialize_job_result


def test_serialize_job_result_dict():
    assert _serialize_job_result({"programs_created": 3}) == {"programs_created": 3}


def test_serialize_job_result_scalar():
    assert _serialize_job_result(42) == 42


def test_serialize_job_result_list():
    assert _serialize_job_result([1, 2]) == [1, 2]
