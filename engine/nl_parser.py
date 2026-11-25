"""Convert natural-language requests into validated, inheritable profile patches."""

import json
import os
import re
from pathlib import Path
from typing import Any
from uuid import uuid4

from .defaults import FONT_SIZES, national_profile
from .schemas import FormatProfile
from .store import merge

ROLES = {
    "标题": "title",
    "大标题": "title",
    "正文": "body",
    "主送": "recipient",
    "落款": "signature",
    "日期": "date",
}
for index, chinese in enumerate("一二三", 1):
    ROLES[f"第{chinese}层"] = f"heading_{index}"
    ROLES[f"第{chinese}层小标题"] = f"heading_{index}"
    ROLES[f"{chinese}级标题"] = f"heading_{index}"
ROLE_PATTERN = "(" + "|".join(sorted(ROLES, key=len, reverse=True)) + ")"
CHINESE_FONTS = (
    "方正小标宋简体",
    "方正公文小标宋",
    "方正小标宋_GBK",
    "方正大标宋_GBK",
    "方正仿宋_GBK",
    "方正黑体_GBK",
    "方正楷体_GBK",
    "华文中宋",
    "思源宋体",
    "仿宋_GB2312",
    "楷体_GB2312",
    "微软雅黑",
    "仿宋",
    "楷体",
    "黑体",
    "宋体",
)
WESTERN_FONTS = ("Times New Roman", "Liberation Serif", "Arial", "Calibri", "Cambria")
ALIGNMENTS = {
    "居中": "center",
    "放中间": "center",
    "居右": "right",
    "靠右": "right",
    "右对齐": "right",
    "居左": "left",
    "靠左": "left",
    "左对齐": "left",
    "两端对齐": "justify",
}
CHINESE_DIGITS = dict(zip("零一二三四五六七八九十两", (*range(11), 2)))
NUMBER = r"(\d+(?:\.\d+)?)"
NEGATION = r"(?:不要|不用|不使用|不采用|别|取消|关闭|去掉|去除|取消使用|非|不)"
UP = r"(?:增加|增大|增宽|加大|加宽|加|提高|调大|上调|放大|多)"
DOWN = r"(?:减少|减小|减窄|缩小|缩窄|缩减|减|降低|调小|下调|少)"


def load_env() -> None:
    path = Path(__file__).resolve().parents[1] / ".env"
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                name, value = line.split("=", 1)
                os.environ.setdefault(name.strip(), value.strip().strip("\"'"))


def flatten(value: dict, prefix: str = "") -> dict:
    fields = {}
    for name, child in value.items():
        key = f"{prefix}.{name}" if prefix else name
        if isinstance(child, dict):
            fields.update(flatten(child, key))
        else:
            fields[key] = child
    return fields


def negated(text: str, start: int) -> bool:
    """Scope a negation to the local clause and stop at an explicit replacement."""
    preceding = re.split(r"[，,。；;、] |[，,。；;、]|改(?:为|用|成)|换(?:成|用|为)", text[:start])[
        -1
    ]
    return bool(
        re.search(NEGATION + r"\s*(?:(?:使用|采用|用|设成|设为|是|显示|保留|\s))*$", preceding)
    )


def affirmative_terms(text: str, terms: tuple[str, ...] | list[str]) -> list[str]:
    candidates = "|".join(re.escape(term) for term in sorted(terms, key=len, reverse=True))
    return [
        match.group()
        for match in re.finditer(candidates, text, flags=re.IGNORECASE)
        if not negated(text, match.start())
    ]


def toggle(text: str, term: str) -> bool | None:
    matches = list(re.finditer(term, text))
    return not negated(text, matches[-1].start()) if matches else None


def delta(text: str, subject: str, units: str) -> tuple[float, str] | None:
    expression = subject + r"\s*(?:在原基础上\s*|比原来\s*|再\s*)?(" + UP + "|" + DOWN + ")"
    match = re.search(expression + r"\s*" + NUMBER + r"\s*(" + units + ")", text, re.IGNORECASE)
    if match and not negated(text, match.start()):
        direction = 1 if re.fullmatch(UP, match[1]) else -1
        return direction * float(match[2]), match[3].lower()
    return None


def style_patch(text: str, original) -> dict:
    result: dict[str, Any] = {}
    sizes = affirmative_terms(text, list(FONT_SIZES))
    if sizes:
        result["font_size_pt"] = FONT_SIZES[sizes[-1]]
    for field, font_list in (("font_cn", CHINESE_FONTS), ("font_en", WESTERN_FONTS)):
        fonts = affirmative_terms(text, font_list)
        if fonts:
            result[field] = next(
                font for font in font_list if font.casefold() == fonts[-1].casefold()
            )

    point_units = r"磅|pt"
    size_delta = delta(text, r"(?:字号|字体大小)", point_units)
    size = re.search(
        r"(?:字号|字体大小)\s*(?:为|设为|调到)?\s*" + NUMBER + r"\s*(?:磅|pt)", text, re.I
    )
    if size_delta:
        result["font_size_pt"] = original.font_size_pt + size_delta[0]
    elif size and not negated(text, size.start()):
        result["font_size_pt"] = float(size[1])

    line_delta = delta(text, r"行距", point_units + "|倍")
    line = re.search(
        r"(?:行距|固定值)\s*(?:为|设为|固定|固定值|为固定值)?\s*" + NUMBER + r"\s*(?:磅|pt)",
        text,
        re.I,
    )
    multiple = re.search(NUMBER + r"\s*倍行距", text)
    if line_delta:
        mode = "multiple" if line_delta[1] == "倍" else "exact"
        current = original.line_spacing_value
        if mode == original.line_spacing_rule:
            result.update(line_spacing_rule=mode, line_spacing_value=current + line_delta[0])
    elif line and not negated(text, line.start()):
        result.update(line_spacing_rule="exact", line_spacing_value=float(line[1]))
    elif multiple and not negated(text, multiple.start()):
        result.update(line_spacing_rule="multiple", line_spacing_value=float(multiple[1]))

    indent = re.search(
        r"(?:首行)?缩进\s*([零一二两三四五六七八九十\d.]+)\s*(?:个)?(?:字|字符)", text
    )
    indent_enabled = toggle(text, r"(?:首行)?缩进")
    if indent_enabled is False or re.search(r"(?:首行)?无缩进|(?:首行)?顶格", text):
        result["first_line_indent_chars"] = 0
    elif indent:
        amount = indent[1]
        result["first_line_indent_chars"] = (
            CHINESE_DIGITS[amount] if amount in CHINESE_DIGITS else float(amount)
        )

    alignments = affirmative_terms(text, list(ALIGNMENTS))
    if alignments:
        result["alignment"] = ALIGNMENTS[alignments[-1]]
    for field, terms in (("bold", r"加粗|粗体"), ("italic", r"斜体|倾斜")):
        state = toggle(text, terms)
        if state is not None:
            result[field] = state
    color = re.search(r"(?:颜色|色号)\s*#?([0-9A-Fa-f]{6})", text)
    if color and not negated(text, color.start()):
        result["color_hex"] = color[1].upper()
    return result


def rule_patch(instruction: str, base: FormatProfile | None = None) -> dict:
    """Extract literal values and simple relative changes in offline mode."""
    base = base or national_profile()
    patch: dict[str, Any] = {}
    styles: dict[str, dict] = {}
    segments = re.split(ROLE_PATTERN, instruction)
    for role_label, text in zip(segments[1::2], segments[2::2]):
        role = ROLES[role_label]
        updates = style_patch(text, base.styles[role])
        if updates:
            styles.setdefault(role, {}).update(updates)
    if styles:
        patch["styles"] = styles

    page = {}
    for chinese, side in (("上", "top"), ("下", "bottom"), ("左", "left"), ("右", "right")):
        subject = chinese + r"(?:页边距|边距)"
        units = r"毫米|mm|厘米|cm"
        field = f"margin_{side}_mm"
        change = delta(instruction, subject, units)
        absolute = re.search(
            subject + r"\s*(?:为|设为)?\s*" + NUMBER + r"\s*(" + units + ")", instruction, re.I
        )
        if change:
            amount, unit = change
            page[field] = getattr(base.page, field) + amount * (10 if unit in ("cm", "厘米") else 1)
        elif absolute and not negated(instruction, absolute.start()):
            page[field] = float(absolute[1]) * (10 if absolute[2].lower() in ("cm", "厘米") else 1)
    if re.search(r"(?:不显示|不要|取消|关闭|隐藏|不加)页码", instruction):
        page["show_page_number"] = False
    elif re.search(r"(?:显示|添加|保留|开启)页码", instruction):
        page["show_page_number"] = True
    if page:
        patch["page"] = page
    if re.search(r"(?:不要|关闭|取消|无|不使用|不加)红头", instruction):
        patch["red_header"] = {"enabled": False}
    elif re.search(r"(?:开启|启用|使用|要|加|保留)红头", instruction):
        patch["red_header"] = {"enabled": True}
    return patch


def request_llm_patch(instruction: str, base: FormatProfile, key: str) -> dict:
    from openai import OpenAI

    model = os.getenv("LLM_MODEL", "").strip()
    if not model:
        raise ValueError("已启用 LLM 格式解析，请配置 LLM_MODEL")
    client = OpenAI(api_key=key, base_url=os.getenv("LLM_BASE_URL"), timeout=180, max_retries=0)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    '你是公文格式解析器。只返回 JSON 对象，形如 {"patch":{...}}。'
                    "patch 仅包含用户明确要求修改的 page/red_header/styles 字段。"
                    "先解析否定和替换，再按父预设求出相对变化后的绝对值。"
                    "分清中西文字体和各级标题，保留未指定的格式。字段及基准："
                    + base.model_dump_json()
                ),
            },
            {"role": "user", "content": instruction},
        ],
        response_format={"type": "json_object"},
    )
    payload = json.loads(response.choices[0].message.content or "{}")
    patch = payload.get("patch") if isinstance(payload, dict) else None
    if not isinstance(patch, dict) or set(patch) - {"styles", "page", "red_header"}:
        raise ValueError("LLM 返回非法格式补丁")
    return patch


def parse(
    instruction: str,
    name: str,
    base: FormatProfile | None = None,
    use_llm: bool | None = None,
) -> tuple[FormatProfile, list[str], list[str]]:
    load_env()
    base = base or national_profile()
    key = os.getenv("LLM_API_KEY")
    if use_llm is True and not key:
        raise ValueError("请配置 LLM_API_KEY")
    rules = rule_patch(instruction, base)
    if key and use_llm is not False:
        # The literal fallback fills omitted fields. It does not replace model decisions.
        patch = merge(rules, request_llm_patch(instruction, base, key))
    else:
        patch = rules
    data = merge(base.model_dump(), patch)
    data.update(
        id=str(uuid4()),
        name=name,
        source_type="nl_parsed",
        parent_id=base.id,
        description=instruction,
    )
    profile = FormatProfile.model_validate(data)
    explicit = sorted(flatten(patch))
    all_fields = flatten(profile.model_dump(include={"page", "red_header", "styles"}))
    return profile, explicit, sorted(set(all_fields) - set(explicit))
