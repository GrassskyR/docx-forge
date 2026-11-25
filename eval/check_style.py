"""Verify the source layout constraints without adding project dependencies."""

import io
import re
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    errors: list[str] = []
    scopes = ("engine/*.py", "engine/tests/*.py", "agent/src/*.ts", "eval/*.py")
    for pattern in scopes:
        for path in ROOT.glob(pattern):
            source = path.read_text(encoding="utf-8")
            relative = path.relative_to(ROOT)
            for number, line in enumerate(source.splitlines(), 1):
                if len(line) > 110:
                    errors.append(f"{relative}:{number} exceeds 110 characters")
            if path.suffix == ".py":
                tokens = tokenize.generate_tokens(io.StringIO(source).readline)
                for token in tokens:
                    if token.type == tokenize.OP and token.string == ";":
                        errors.append(f"{relative}:{token.start[0]} packs statements")
            else:
                for number, line in enumerate(source.splitlines(), 1):
                    code = re.sub(r"""(["'`])(?:\\.|[^\\])*?\1""", "", line)
                    if re.search(r";\s*\S", code) and not re.search(r"\bfor\s*\(", code):
                        errors.append(f"{relative}:{number} packs statements")

    web = (ROOT / "web/index.html").read_text(encoding="utf-8").splitlines()
    if len(web) < 180 or max(map(len, web)) > 160:
        errors.append(
            "web/index.html must have at least 180 lines and at most 160 characters per line"
        )
    for name in ("notice", "request", "minutes", "letter"):
        skill = (ROOT / f"agent/skills/{name}.md").read_text(encoding="utf-8")
        if len(skill.splitlines()) < 40:
            errors.append(f"{name}.md must have at least 40 lines")

    if errors:
        print("\n".join(errors))
        return 1
    print(f"Source layout PASS, Web {len(web)} lines, four Skills each at least 40 lines")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
