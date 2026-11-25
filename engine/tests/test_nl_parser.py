import pytest
from engine.nl_parser import parse
from engine.defaults import FONT_SIZES, national_profile


def test_rules_and_defaults():
    p, explicit, defaulted = parse(
        "标题二号黑体居中；正文三号仿宋_GB2312，行距28磅，首行缩进两字符；上边距3.7厘米，左边距28毫米，开启红头",
        "rule",
        use_llm=False,
    )
    assert p.styles["title"].font_size_pt == 22
    assert p.styles["body"].first_line_indent_chars == 2
    assert p.page.margin_top_mm == 37 and p.red_header.enabled
    assert "styles.title.font_cn" in explicit and "page.margin_bottom_mm" in defaulted
    assert set(explicit).isdisjoint(defaulted)


@pytest.mark.parametrize("name,value", FONT_SIZES.items())
def test_every_size(name, value):
    p, _, _ = parse("正文" + name + "仿宋", "s", use_llm=False)
    assert p.styles["body"].font_size_pt == value


def test_parent_patch():
    base = national_profile()
    base.styles["title"].font_cn = "宋体"
    p, _, _ = parse("正文小四号，行距20磅；关闭红头", "child", base, use_llm=False)
    assert p.styles["body"].font_size_pt == 12 and p.styles["body"].line_spacing_value == 20
    assert p.styles["title"] == base.styles["title"]


def test_model_values_win_and_literal_fallback_fills_missing_fields(monkeypatch):
    import openai
    from types import SimpleNamespace

    class Client:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=self)

        def create(self, **kwargs):
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(
                            content=(
                                '{"patch":{"styles":{"body":{"font_size_pt":19,"italic":false,'
                                '"font_cn":"黑体"}}}}'
                            )
                        )
                    )
                ]
            )

    monkeypatch.setenv("LLM_API_KEY", "test-only-not-a-real-key")
    monkeypatch.setenv("LLM_MODEL", "test-model")
    monkeypatch.setattr(openai, "OpenAI", Client)
    profile, explicit, _ = parse(
        "正文不要用仿宋，改用黑体，字号增加3磅，非斜体，英文用 Times New Roman；标题居右",
        "merged",
        use_llm=True,
    )
    body = profile.styles["body"]
    assert body.font_size_pt == 19 and body.italic is False and body.font_cn == "黑体"
    assert "styles.body.font_en" in explicit and body.font_en == "Times New Roman"
    assert "styles.title.alignment" in explicit and profile.styles["title"].alignment == "right"


def test_llm_invalid_fields_rejected(monkeypatch):
    import openai
    from types import SimpleNamespace

    class Client:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=self)

        def create(self, **kwargs):
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(
                            content='{"patch":{"styles":{"body":{"made_up":true}}}}'
                        )
                    )
                ]
            )

    monkeypatch.setenv("LLM_API_KEY", "test-only-not-a-real-key")
    monkeypatch.setenv("LLM_MODEL", "test-model")
    monkeypatch.setattr(openai, "OpenAI", Client)
    with pytest.raises(ValueError):
        parse("正文使用特殊设置", "invalid", use_llm=True)


def test_colloquial_role_boundaries_and_negation():
    p, _, _ = parse(
        "大标题用黑体二号放中间；第一层小标题用黑体三号，第二层用楷体_GB2312三号，第三层用仿宋_GB2312三号。",
        "casual",
        use_llm=False,
    )
    assert p.styles["title"].font_cn == "黑体" and p.styles["title"].font_size_pt == 22
    p, _, _ = parse("正文别加粗，标题加粗，标题靠右。", "negation", use_llm=False)
    assert not p.styles["body"].bold and p.styles["title"].bold


def test_offline_negation_replacement_and_two_fonts():
    profile, explicit, _ = parse(
        "标题不要用仿宋，改用黑体，取消加粗，非斜体；正文英文用 Times New Roman，中文用楷体_GB2312，"
        "不要首行缩进；落款禁止更换字体；关闭红头，保留页码。",
        "adversarial",
        use_llm=False,
    )
    title, body = profile.styles["title"], profile.styles["body"]
    assert (title.font_cn, title.bold, title.italic) == ("黑体", False, False)
    assert (body.font_en, body.font_cn, body.first_line_indent_chars) == (
        "Times New Roman",
        "楷体_GB2312",
        0,
    )
    assert "styles.signature.font_cn" not in explicit
    assert not profile.red_header.enabled and profile.page.show_page_number


@pytest.mark.parametrize(
    "font",
    ["方正小标宋_GBK", "方正仿宋_GBK", "方正黑体_GBK", "方正公文小标宋", "华文中宋", "思源宋体"],
)
def test_nonstandard_chinese_font_names(font):
    profile, _, _ = parse(f"标题改用{font}", "custom font", use_llm=False)
    assert profile.styles["title"].font_cn == font


def test_offline_relative_deltas_keep_parent():
    parent = national_profile()
    profile, _, _ = parse(
        "正文的字号增加2磅，行距减少3磅；左边距增加0.2厘米，右边距减少2毫米。",
        "changes",
        base=parent,
        use_llm=False,
    )
    assert profile.styles["body"].font_size_pt == 18
    assert profile.styles["body"].line_spacing_value == 25
    assert (profile.page.margin_left_mm, profile.page.margin_right_mm) == (30, 24)
    assert parent.styles["body"].font_size_pt == 16


def test_missing_llm_model_is_actionable(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test-only-not-a-real-key")
    monkeypatch.setenv("LLM_MODEL", "")
    with pytest.raises(ValueError, match="LLM_MODEL"):
        parse("正文小四号", "missing model", use_llm=True)
