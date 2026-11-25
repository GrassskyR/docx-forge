"""Run synthetic, public document, repair and matched model benchmarks."""

import argparse
import json
import os
import subprocess
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))

from engine.defaults import national_profile
from engine.linter import lint
from engine.nl_parser import flatten, load_env, parse
from engine.ooxml_extractor import extract
from engine.renderer import render
from engine.repair import repair_docx
from engine.schemas import FormatProfile
from engine.store import merge
from engine.tests.test_renderer_and_linter import damage_docx
from eval.real_docs_checks import NOTICE, manifest, run_real_doc, twips, verify_locked_file

SAMPLES = ROOT / "fixtures"
LLM_GROUPS = ("nl", "baseline", "system_before", "system_after")
RETRIES = 3
REQUEST_TIMEOUT = 180


def fixture_gate() -> tuple[list[dict], list[dict], list[dict]]:
    """Validate counts, uniqueness, Word magic bytes and the pinned corpus."""
    fixtures = [json.loads(path.read_text()) for path in sorted(SAMPLES.glob("*.json"))]
    assert len(fixtures) == len({fixture["file"] for fixture in fixtures}) == 20
    assert len(list(SAMPLES.glob("*.docx"))) == 15
    assert len(list(SAMPLES.glob("*.doc"))) == 5
    formats = [json.dumps(fixture["expected_assertions"], sort_keys=True) for fixture in fixtures]
    assert len(set(formats)) == 20
    fingerprints = set()
    for fixture in fixtures:
        source = SAMPLES / fixture["file"]
        payload = source.read_bytes()
        fingerprints.add(sha256(payload).digest())
        expected_magic = (
            b"PK\x03\x04" if source.suffix == ".docx" else bytes.fromhex("D0CF11E0A1B11AE1")
        )
        assert payload.startswith(expected_magic), source.name
    assert len(fingerprints) == 20
    numbered = sum(fixture["expected_assertions"]["page.show_page_number"] for fixture in fixtures)
    assert numbered >= 10
    cases = [json.loads(line) for line in (ROOT / "nl_instructions.jsonl").read_text().splitlines()]
    assert (
        len(cases)
        == len({case["instruction"] for case in cases})
        == len({case["id"] for case in cases})
        == 30
    )
    assert Counter(case["category"] for case in cases) == {
        "complete": 10,
        "defaults": 8,
        "colloquial": 6,
        "incremental": 6,
    }
    corpus = manifest()
    for entry in corpus:
        verify_locked_file(entry)
    print(
        f"20/20 unique fixtures, {numbered}/20 use PAGE, 30/30 unique instructions, 16/16 SHA256",
        flush=True,
    )
    return fixtures, cases, corpus


def assertions(profile: FormatProfile, expected: dict) -> list[dict]:
    fields = flatten(profile.model_dump())
    checks = []
    for field, target in expected.items():
        observed = fields.get(field)
        if field.startswith("page.margin_") and isinstance(observed, (float, int)):
            passed = twips(target) == twips(observed)
        else:
            passed = target == observed
        checks.append({"field": field, "expected": target, "actual": observed, "passed": passed})
    return checks


def rate(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def field_summary(rows: list[dict]) -> dict:
    checks = [check for row in rows for check in row["checks"]]
    correct = sum(check["passed"] for check in checks)
    return {
        "correct": correct,
        "total": len(checks),
        "accuracy": rate(correct, len(checks)),
        "documents": len(rows),
    }


def passed(row: dict) -> bool:
    return row.get("lint_report", {}).get("passed", False)


def baseline_summary(rows: list[dict]) -> dict:
    valid = [row for row in rows if row["status"] not in {"network_error", "request_error"}]
    count = sum(passed(row) for row in valid)
    crashes = sum(row["status"] == "code_error" for row in valid)
    violations = Counter(
        item["field"] for row in valid for item in row.get("lint_report", {}).get("violations", [])
    )
    return {
        "passed": count,
        "total": len(rows),
        "overall_pass_rate": rate(count, len(rows)),
        "valid_responses": len(valid),
        "valid_response_pass_rate": rate(count, len(valid)),
        "network_errors": sum(row["status"] == "network_error" for row in rows),
        "request_errors": sum(row["status"] == "request_error" for row in rows),
        "code_errors": crashes,
        "code_error_rate": rate(crashes, len(valid)),
        "violation_counts": dict(sorted(violations.items())),
    }


def percentage(value: float | None) -> str:
    return f"{value:.2%}" if value is not None else "—"


def write_report(results: dict) -> None:
    summary = results["summary"]
    synthetic, natural = summary["extraction"], summary["nl"]
    baseline = summary["baseline"]
    real = results["real_docs"]
    repairs = results["fault_injection"]
    lines = [
        "# V2 实测报告",
        "",
        f"运行时间 {results['timestamp']}，模型 `{results['model'] or '未启用'}`。",
        "",
        "| 评测项 | 实测 |",
        "|---|---:|",
        f"| 合成格式提取字段 | {synthetic['correct']}/{synthetic['total']} "
        f"（{percentage(synthetic['accuracy'])}） |",
        f"| 合成范本重渲染独立审计 | {summary['synthetic_render_passed']}/{len(results['extraction'])} |",
        f"| 真实公文提取、母版剥离、独立审计与 PNG | {len(real)}/16 |",
        f"| NL 金标准字段 | {natural['correct']}/{natural['total']}（{percentage(natural['accuracy'])}） |",
        f"| 系统修复前金标准审计 | {summary['system_before_passed']}/{len(results['system_before'])} |",
        f"| 系统修复后金标准审计 | {summary['system_after_passed']}/{len(results['system_after'])} |",
        f"| Baseline 总通过率（含请求失败） | {baseline['passed']}/{baseline['total']} "
        f"（{percentage(baseline['overall_pass_rate'])}） |",
        f"| Baseline 有效响应通过率 | {baseline['passed']}/{baseline['valid_responses']} "
        f"（{percentage(baseline['valid_response_pass_rate'])}） |",
        f"| Baseline 脚本错误率（有效响应内） | {baseline['code_errors']}/{baseline['valid_responses']} "
        f"（{percentage(baseline['code_error_rate'])}） |",
        "",
        f"Baseline 最终网络失败 {baseline['network_errors']} 条，其他无有效响应 {baseline['request_errors']} 条。",
        f"NL 最终网络失败 {summary['nl_network_errors']} 条。",
        f"修复注入文档通过数由 {summary['fault_before_passed']}/{len(repairs)} "
        f"增加到 {summary['fault_after_passed']}/{len(repairs)}。",
        "",
        "## 真实公文",
        "",
        "| 文档 | 审计项 | PNG 页数 |",
        "|---|---:|---:|",
    ]
    if results.get("reaudited_at"):
        lines.insert(4, f"以最终审计器复核产物的时间为 {results['reaudited_at']}。")
    for row in real:
        lines.append(f"| {row['file']} | {row['lint_report']['checked']} | {len(row['preview'])} |")
    lines += [
        "",
        "## 单轮故障注入实测",
        "",
        "| 样本 | 违规前 → 后 | 独立审计得分前 → 后 |",
        "|---|---:|---:|",
    ]
    for row in repairs:
        before, after = row["before"], row["after"]
        lines.append(
            f"| {row['id']} | {len(before['violations'])} → {len(after['violations'])} "
            f"| {before['score']:.2f}% → {after['score']:.2f}% |"
        )
    lines += ["", "## Baseline 有效响应逐字段违规", ""]
    lines.extend(f"- `{field}` {count} 次" for field, count in baseline["violation_counts"].items())
    lines += [
        "",
        "## 评测口径",
        "",
        "- 合成及真实轨均从磁盘提取，页边距按整数 twips 比对。真实原件先核对清单 SHA256。",
        "- 两组使用相同正文 AST 和目标格式审计。Baseline 获得完整目标预设，系统从指令与父预设解析。",
        "- 两类模型请求的每次超时均为 180 秒，暂时性请求失败最多重试 3 次，退避为 1、2、4 秒。",
        "- 有效响应口径保留脚本执行失败与格式不合规。脚本在独立目录、隔离文件系统与网络中执行。",
        "- 系统修复依据自身预设的独立审计结果定向修改 OOXML。目标预设用于评分。",
        "- 本报告使用本次运行的样本和模型响应。样本内结果用于衡量本任务覆盖的排版。",
        "- 逐项断言、请求尝试、审计差异与产物目录详见 `results.json`。",
    ]
    (ROOT / "report.md").write_text("\n".join(lines) + "\n")


def persist(results: dict) -> None:
    results["summary"] = {
        "extraction": field_summary(results["extraction"]),
        "nl": field_summary(results["nl"]),
        "nl_network_errors": sum(row["status"] == "network_error" for row in results["nl"]),
        "baseline": baseline_summary(results["baseline"]),
        "synthetic_render_passed": sum(passed(row) for row in results["deterministic_render"]),
        "system_before_passed": sum(passed(row) for row in results["system_before"]),
        "system_after_passed": sum(passed(row) for row in results["system_after"]),
        "fault_before_passed": sum(row["before"]["passed"] for row in results["fault_injection"]),
        "fault_after_passed": sum(row["after"]["passed"] for row in results["fault_injection"]),
    }
    target = ROOT / "results.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(target)
    write_report(results)


def deterministic(results: dict, fixtures: list[dict], corpus: list[dict], folder: Path) -> None:
    for fixture in fixtures:
        sample_id = fixture["id"]
        profile = extract(SAMPLES / fixture["file"], sample_id, folder / "templates")
        checks = assertions(profile, fixture["expected_assertions"])
        results["extraction"].append({**fixture, "checks": checks})
        output = render(NOTICE, profile, folder / "synthetic" / f"{sample_id}.docx")
        report = lint(output, profile)
        results["deterministic_render"].append(
            {"id": sample_id, "lint_report": report.model_dump()}
        )
        assert report.passed, (sample_id, report)
        print(
            "SYNTHETIC",
            sample_id,
            f"{sum(item['passed'] for item in checks)}/{len(checks)}",
            flush=True,
        )
    for entry in corpus:
        identifier = Path(entry["file"]).stem
        result = run_real_doc(entry, folder / "real" / identifier)
        results["real_docs"].append(result)
        print("PUBLIC", entry["file"], "PASS", flush=True)
    for index in range(1, 11):
        repair_folder = folder / "faults" / f"{index:02}"
        profile = national_profile()
        profile.red_header.enabled = True
        profile.styles["body"].font_size_pt = 11 + index
        profile.page.margin_right_mm = 21 + index
        source = render(NOTICE, profile, repair_folder / "damaged.docx")
        assert lint(source, profile).passed
        damage_docx(source)
        before = lint(source, profile)
        assert before.violations and not before.passed
        output = repair_docx(source, profile, before.violations, repair_folder / "repaired.docx")
        after = lint(output, profile)
        assert after.passed and not after.violations, after.model_dump()
        results["fault_injection"].append(
            {
                "id": f"{index:02}",
                "before": before.model_dump(),
                "after": after.model_dump(),
                "damaged_docx": str(source),
                "repaired_docx": str(output),
            }
        )
        print("REPAIR", index, f"{len(before.violations)} → 0", flush=True)


def transient(error: Exception) -> bool:
    return isinstance(error, APIConnectionError) or (
        isinstance(error, APIStatusError)
        and (error.status_code in {408, 409, 429} or error.status_code >= 500)
    )


def model_request(call, attempts: list[dict]):
    for index in range(RETRIES + 1):
        started = time.monotonic()
        try:
            value = call()
        except Exception as error:
            attempts.append(
                {
                    "seconds": round(time.monotonic() - started, 2),
                    "error": type(error).__name__,
                    "status_code": getattr(error, "status_code", None),
                }
            )
            if index == RETRIES or not transient(error):
                raise
            delay = 2**index
            attempts[-1]["backoff_seconds"] = delay
            time.sleep(delay)
        else:
            attempts.append({"seconds": round(time.monotonic() - started, 2), "status": "response"})
            return value


def model_status(error: Exception) -> str:
    return (
        "network_error"
        if isinstance(error, (APITimeoutError, APIConnectionError))
        else "request_error"
    )


def target_profiles(case: dict) -> tuple[FormatProfile, FormatProfile]:
    initial = merge(national_profile().model_dump(), case.get("base_patch", {}))
    base = FormatProfile.model_validate(initial)
    for field, value in case["expected_assertions"].items():
        *parent_fields, leaf = field.split(".")
        target = initial
        for parent in parent_fields:
            target = target[parent]
        target[leaf] = value
    return base, FormatProfile.model_validate(initial)


def run_system(
    case: dict, folder: Path, base: FormatProfile, target: FormatProfile
) -> tuple[dict, dict, dict]:
    identifier = case["id"]
    attempts: list[dict] = []
    try:
        profile, explicit, defaulted = model_request(
            lambda: parse(case["instruction"], identifier, base, use_llm=True), attempts
        )
        parsed = {
            "id": identifier,
            "status": "response",
            "attempts": attempts,
            "checks": assertions(profile, case["expected_assertions"]),
            "explicit_fields": explicit,
            "defaulted_fields": defaulted,
            "profile": profile.model_dump(),
        }
    except Exception as error:
        reason = f"{type(error).__name__}: {error}"
        failed = {"id": identifier, "error": reason}
        missing = [
            {"field": key, "expected": value, "actual": None, "passed": False}
            for key, value in case["expected_assertions"].items()
        ]
        return (
            {**failed, "status": model_status(error), "attempts": attempts, "checks": missing},
            failed,
            failed,
        )

    try:
        path = render(NOTICE, profile, folder / "system_before.docx")
        own = lint(path, profile)
        before = {
            "id": identifier,
            "lint_report": lint(path, target).model_dump(),
            "own_lint_report": own.model_dump(),
        }
        history = [own.model_dump()]
        for round_number in range(1, 4):
            if own.passed:
                break
            path = repair_docx(
                path, profile, own.violations, folder / f"system_repair_{round_number}.docx"
            )
            own = lint(path, profile)
            history.append(own.model_dump())
        after = {
            "id": identifier,
            "lint_report": lint(path, target).model_dump(),
            "repair_history": history,
        }
    except Exception as error:
        before = after = {"id": identifier, "error": f"{type(error).__name__}: {error}"}
    return parsed, before, after


def execute_baseline(folder: Path) -> None:
    """Run the baseline with filesystem, network and process isolation."""
    run = subprocess.run(
        [
            "unshare",
            "--user",
            "--map-root-user",
            "--net",
            "--pid",
            "--fork",
            "--kill-child",
            sys.executable,
            "-I",
            str(ROOT / "baseline_worker.py"),
        ],
        cwd=folder,
        env={"LANG": "C.UTF-8"},
        capture_output=True,
        text=True,
        timeout=45,
    )
    (folder / "baseline.log").write_text(run.stdout + "\n" + run.stderr)
    if run.returncode:
        raise RuntimeError(f"脚本退出 {run.returncode}，详见 baseline.log")


def baseline_request(target: FormatProfile) -> str:
    prompt = (
        "你是 Word 文档生成器。只输出可执行 Python 代码，使用 python-docx/lxml 生成 output.docx。"
        "按给定目标格式和正文 AST 生成完整 Word。显式写入 eastAsia、ascii、hAnsi、cs 及 sz、szCs。"
        "两端对齐写 both。首行缩进同时设置 firstLineChars（字符×100）和 firstLine（字符×字号磅×20）。"
        "对所有使用的角色设置对齐、段前段后、行距、缩进与字形。红头、红线和 PAGE 页码按配置。"
        "可以为角色使用 gw_title、gw_body、gw_heading_1、gw_doc_number 等样式 ID。"
        "红头机关优先用 AST，红头红线用红色段落下边框。禁止导入项目或调用网络。\n目标格式 "
        + target.model_dump_json()
        + "\n正文 AST "
        + NOTICE.model_dump_json()
    )
    client = OpenAI(
        api_key=os.environ["LLM_API_KEY"],
        base_url=os.getenv("LLM_BASE_URL"),
        timeout=REQUEST_TIMEOUT,
        max_retries=0,
    )
    response = client.chat.completions.create(
        model=os.environ["LLM_MODEL"],
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content or ""


def run_baseline(identifier: str, folder: Path, target: FormatProfile) -> dict:
    folder = folder / "baseline"
    folder.mkdir()
    attempts: list[dict] = []
    row = {"id": identifier, "attempts": attempts}
    try:
        code = model_request(lambda: baseline_request(target), attempts).strip()
    except Exception as error:
        return {**row, "status": model_status(error), "error": f"{type(error).__name__}: {error}"}
    try:
        if code.startswith("```") and "\n" in code:
            code = code.split("\n", 1)[1].rsplit("```", 1)[0]
        (folder / "baseline.py").write_text(code)
        execute_baseline(folder)
        report = lint(folder / "output.docx", target)
    except Exception as error:
        return {**row, "status": "code_error", "error": f"{type(error).__name__}: {error}"}
    return {**row, "status": "response", "lint_report": report.model_dump()}


def store_result(future, group: str, results: dict) -> str:
    if group == "baseline":
        row = future.result()
        results[group].append(row)
        return row["id"]
    parsed, before, after = future.result()
    for key, value in zip(("nl", "system_before", "system_after"), (parsed, before, after)):
        results[key].append(value)
    return parsed["id"]


def run_models(results: dict, cases: list[dict], folder: Path) -> None:
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {}
        for case in cases:
            identifier = case["id"]
            destination = folder / identifier
            destination.mkdir(parents=True)
            base, target = target_profiles(case)
            futures[pool.submit(run_system, case, destination, base, target)] = "nl"
            futures[pool.submit(run_baseline, identifier, destination, target)] = "baseline"
        for future in as_completed(futures):
            group = futures[future]
            identifier = store_result(future, group, results)
            persist(results)
            print(group.upper(), identifier, "finished", flush=True)
    for key in LLM_GROUPS:
        results[key].sort(key=lambda row: row["id"])
        assert len(results[key]) == 30
    results["llm_complete"] = True


def reaudit_completed_run(fixtures: list[dict], cases: list[dict], corpus: list[dict]) -> dict:
    """Recheck artifacts from the completed V2 run with the current independent audit."""
    results = json.loads((ROOT / "results.json").read_text())
    if not results.get("llm_complete") or not results.get("artifacts", "").startswith(
        "artifacts/v2-"
    ):
        raise ValueError("请先完整运行 V2 --with-llm")
    folder = ROOT / results["artifacts"]
    case_by_id = {case["id"]: case for case in cases}
    assert all({row["id"] for row in results[key]} == set(case_by_id) for key in LLM_GROUPS)

    audit_folder = folder / datetime.now(timezone.utc).strftime("reaudit-%Y%m%dT%H%M%S-%fZ")
    for key in ("extraction", "deterministic_render", "real_docs", "fault_injection"):
        results[key] = []
    deterministic(results, fixtures, corpus, audit_folder)
    system_profiles = {row["id"]: row.get("profile") for row in results["nl"]}
    for row in results["baseline"]:
        if row["status"] == "response":
            identifier = row["id"]
            _, target = target_profiles(case_by_id[identifier])
            file = folder / identifier / "baseline/output.docx"
            row["lint_report"] = lint(file, target).model_dump()
    for group in ("system_before", "system_after"):
        for row in results[group]:
            if "lint_report" not in row:
                continue
            identifier = row["id"]
            case_folder = folder / identifier
            _, target = target_profiles(case_by_id[identifier])
            profile = FormatProfile.model_validate(system_profiles[identifier])
            file = case_folder / "system_before.docx"
            if group == "system_before":
                row["own_lint_report"] = lint(file, profile).model_dump()
            else:
                initial = lint(file, profile)
                history = [initial.model_dump()]
                for round_number in range(1, 4):
                    if initial.passed:
                        break
                    destination = audit_folder / identifier / f"system_repair_{round_number}.docx"
                    file = repair_docx(file, profile, initial.violations, destination)
                    initial = lint(file, profile)
                    history.append(initial.model_dump())
                row["repair_history"] = history
            row["lint_report"] = lint(file, target).model_dump()
    results["reaudited_at"] = datetime.now(timezone.utc).isoformat()
    results["auditor_sha256"] = sha256((ROOT.parent / "engine/linter.py").read_bytes()).hexdigest()
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--with-llm", action="store_true")
    parser.add_argument("--verify-inputs", action="store_true")
    parser.add_argument("--reaudit", action="store_true")
    options = parser.parse_args()
    fixtures, cases, corpus = fixture_gate()
    if options.verify_inputs:
        return
    if options.reaudit:
        results = reaudit_completed_run(fixtures, cases, corpus)
        persist(results)
        print(json.dumps(results["summary"], ensure_ascii=False), flush=True)
        return

    load_env()
    if options.with_llm and not (os.getenv("LLM_API_KEY") and os.getenv("LLM_MODEL")):
        parser.error("--with-llm 需要配置 LLM_API_KEY 和 LLM_MODEL")
    now = datetime.now(timezone.utc)
    folder = ROOT / "artifacts" / now.strftime("v2-%Y%m%dT%H%M%S-%fZ")
    folder.mkdir(parents=True)
    results = {
        "timestamp": now.isoformat(),
        "artifacts": str(folder.relative_to(ROOT)),
        "model": os.getenv("LLM_MODEL") if options.with_llm else None,
        "auditor_sha256": sha256((ROOT.parent / "engine/linter.py").read_bytes()).hexdigest(),
        "llm_complete": False,
        **{
            key: []
            for key in (
                "extraction",
                "deterministic_render",
                "real_docs",
                "fault_injection",
                *LLM_GROUPS,
            )
        },
    }
    if options.with_llm:
        check_folder = folder / "sandbox-check"
        check_folder.mkdir()
        (check_folder / "baseline.py").write_text(
            "from pathlib import Path\nfrom docx import Document\n"
            "assert len(list(Path.cwd().iterdir())) == 1\n"
            "try:\n    Path('/etc/passwd').read_bytes()\nexcept PermissionError:\n"
            "    pass\nelse:\n    raise AssertionError('host read allowed')\n"
            "Document().save('check.docx')\n"
        )
        execute_baseline(check_folder)
        assert (check_folder / "check.docx").is_file()
    deterministic(results, fixtures, corpus, folder)
    persist(results)
    if options.with_llm:
        run_models(results, cases, folder)
    persist(results)
    print(json.dumps(results["summary"], ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
