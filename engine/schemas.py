from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, model_validator
from uuid import uuid4


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)


class StyleSpec(StrictModel):
    font_cn: str = "仿宋_GB2312"
    font_en: str = "Times New Roman"
    font_size_pt: float = Field(default=16, gt=0, le=100)
    bold: bool = False
    italic: bool = False
    color_hex: str = Field(default="000000", pattern=r"^[0-9A-Fa-f]{6}$")
    alignment: Literal["left", "center", "right", "justify"] = "justify"
    line_spacing_rule: Literal["exact", "multiple"] = "exact"
    line_spacing_value: float = Field(default=28, gt=0)
    first_line_indent_chars: float = 2
    space_before_pt: float = 0
    space_after_pt: float = 0


class PageSpec(StrictModel):
    size: Literal["A4"] = "A4"
    margin_top_mm: float = Field(default=37, ge=0, lt=140)
    margin_bottom_mm: float = Field(default=35, ge=0, lt=140)
    margin_left_mm: float = Field(default=28, ge=0, lt=100)
    margin_right_mm: float = Field(default=26, ge=0, lt=100)
    show_page_number: bool = True


class RedHeader(StrictModel):
    enabled: bool = False
    org_name: str | None = None
    font_cn: str = "方正小标宋简体"
    font_size_pt: float = Field(default=36, gt=0)
    color_hex: str = Field(default="FF0000", pattern=r"^[0-9A-Fa-f]{6}$")
    has_red_line: bool = True
    doc_number_font_cn: str = "仿宋_GB2312"
    doc_number_size_pt: float = Field(default=16, gt=0)


ROLES = ("title", "heading_1", "heading_2", "heading_3", "body", "recipient", "signature", "date")


def default_styles():
    result = {k: StyleSpec() for k in ROLES}
    result["title"] = StyleSpec(
        font_cn="方正小标宋简体", font_size_pt=22, alignment="center", first_line_indent_chars=0
    )
    result["heading_1"].font_cn = "黑体"
    result["heading_2"].font_cn = "楷体_GB2312"
    for k in ("recipient", "signature", "date"):
        result[k].first_line_indent_chars = 0
        result[k].alignment = "right" if k in ("signature", "date") else "left"
    return result


class FormatProfile(StrictModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    source_type: Literal["builtin", "extracted_doc", "nl_parsed", "inherited"] = "builtin"
    parent_id: str | None = None
    base_template_path: str | None = None
    description: str = ""
    page: PageSpec = Field(default_factory=PageSpec)
    red_header: RedHeader = Field(default_factory=RedHeader)
    styles: dict[str, StyleSpec] = Field(default_factory=default_styles)

    @model_validator(mode="after")
    def roles(self):
        if set(self.styles) != set(ROLES):
            raise ValueError("styles 必须恰好包含八种规定角色")
        return self


class Block(StrictModel):
    type: Literal["heading_1", "heading_2", "heading_3", "body", "table"]
    text: str | None = None
    rows: list[list[str]] | None = None

    @model_validator(mode="after")
    def payload(self):
        if self.type == "table":
            if not self.rows or not self.rows[0] or len({len(r) for r in self.rows}) != 1:
                raise ValueError("表格必须是非空矩形")
        elif self.text is None:
            raise ValueError("文本块需要 text")
        return self


class DocContentAST(StrictModel):
    doc_type: Literal["notice", "request", "minutes", "letter", "general"] = "general"
    red_header_org: str | None = None
    doc_number: str | None = None
    title: str
    recipient: str | None = None
    blocks: list[Block] = Field(default_factory=list)
    attachments: list[str] = Field(default_factory=list)
    signature: str | None = None
    date: str | None = None


class Violation(StrictModel):
    location: str
    field: str
    expected: object
    actual: object


class LintReport(StrictModel):
    passed: bool
    score: float
    checked: int
    violations: list[Violation]
