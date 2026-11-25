import pytest
from engine.store import Store


def test_persistence_fork_delete(tmp_path):
    path = tmp_path / "db"
    s = Store(path)
    child = s.fork(s.active_id, "child", {"styles": {"body": {"font_size_pt": 14}}})
    s.set_active(child.id)
    again = Store(path)
    assert again.active_id == child.id and again.get(child.id).styles["body"].font_size_pt == 14
    assert again.get(child.parent_id).styles["body"].font_size_pt == 16
    with pytest.raises(ValueError):
        s.delete(child.id)
    s.set_active(child.parent_id)
    s.delete(child.id)
    with pytest.raises(KeyError):
        s.get(child.id)
