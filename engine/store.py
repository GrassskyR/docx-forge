import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

from .schemas import FormatProfile
from .defaults import national_profile


def merge(base: dict, patch: dict) -> dict:
    result = dict(base)
    for key, value in patch.items():
        result[key] = merge(result.get(key, {}), value) if isinstance(value, dict) else value
    return result


class Store:
    def __init__(self, path: Path | str = "data/profiles.db") -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        builtin = national_profile()
        with self.connect() as database:
            database.execute(
                "CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,payload TEXT NOT NULL)"
            )
            database.execute(
                "CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)"
            )
            database.execute(
                "INSERT OR IGNORE INTO profiles VALUES(?,?)",
                (builtin.id, builtin.model_dump_json()),
            )
            database.execute("INSERT OR IGNORE INTO settings VALUES('active',?)", (builtin.id,))

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def save(self, profile: FormatProfile) -> FormatProfile:
        with self.connect() as database:
            database.execute(
                "INSERT OR REPLACE INTO profiles VALUES(?,?)",
                (profile.id, profile.model_dump_json()),
            )
        return profile

    def get(self, profile_id: str) -> FormatProfile:
        with self.connect() as database:
            row = database.execute(
                "SELECT payload FROM profiles WHERE id=?", (profile_id,)
            ).fetchone()
        if not row:
            raise KeyError(profile_id)
        return FormatProfile.model_validate_json(row[0])

    def list(self) -> list[FormatProfile]:
        with self.connect() as database:
            return [
                FormatProfile.model_validate_json(row[0])
                for row in database.execute("SELECT payload FROM profiles ORDER BY rowid")
            ]

    @property
    def active_id(self) -> str:
        with self.connect() as database:
            return database.execute("SELECT value FROM settings WHERE key='active'").fetchone()[0]

    def set_active(self, profile_id: str) -> None:
        self.get(profile_id)
        with self.connect() as database:
            database.execute("UPDATE settings SET value=? WHERE key='active'", (profile_id,))

    def fork(self, profile_id: str, name: str, patch: dict) -> FormatProfile:
        data = merge(self.get(profile_id).model_dump(), patch)
        data.update(id=str(uuid4()), name=name, source_type="inherited", parent_id=profile_id)
        return self.save(FormatProfile.model_validate(data))

    def delete(self, profile_id: str) -> None:
        if profile_id in (self.active_id, national_profile().id):
            raise ValueError("不能删除当前或内置预设")
        self.get(profile_id)
        with self.connect() as database:
            database.execute("DELETE FROM profiles WHERE id=?", (profile_id,))
