"""Run the public corpus from verified source bytes to independently audited previews."""

import pytest

from eval.real_docs_checks import manifest, run_real_doc


@pytest.mark.parametrize("entry", manifest(), ids=lambda entry: entry["file"])
def test_locked_document_round_trip(entry, tmp_path):
    result = run_real_doc(entry, tmp_path)
    assert result["lint_report"]["passed"] and result["preview"]
