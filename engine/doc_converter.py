from pathlib import Path
import shutil
import subprocess
import tempfile
from zipfile import BadZipFile, ZipFile


def convert(source: Path | str, outdir: Path | str, extension: str) -> Path:
    source, outdir = Path(source).resolve(), Path(outdir).resolve()
    outdir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="gongwen-lo-") as temp:
        subprocess.run(
            [
                "soffice",
                f"-env:UserInstallation={Path(temp).as_uri()}",
                "--headless",
                "--convert-to",
                extension,
                "--outdir",
                str(outdir),
                str(source),
            ],
            check=True,
            capture_output=True,
            timeout=90,
        )
    result = outdir / (source.stem + "." + extension.split(":")[0])
    if not result.is_file():
        raise RuntimeError("LibreOffice 未输出转换文件")
    return result


def to_docx(source: Path | str, outdir: Path | str) -> Path:
    """Recognize Word containers by signature, including misnamed legacy files."""
    source = Path(source)
    with source.open("rb") as stream:
        signature = stream.read(8)
    if signature == bytes.fromhex("D0CF11E0A1B11AE1"):
        with tempfile.TemporaryDirectory(prefix="gongwen-doc-") as staging:
            legacy = Path(staging) / f"{source.stem}.doc"
            shutil.copyfile(source, legacy)
            return convert(legacy, outdir, "docx")
    if signature.startswith(b"PK\x03\x04"):
        try:
            with ZipFile(source) as archive:
                if "word/document.xml" in archive.namelist():
                    return source
        except BadZipFile as exc:
            raise ValueError("损坏的 Word ZIP 容器") from exc
    raise ValueError("需要 Word DOC 或包含 word/document.xml 的 DOCX 文件")


def preview(source: Path | str, outdir: Path | str) -> list[Path]:
    outdir = Path(outdir)
    pdf = convert(source, outdir, "pdf")
    subprocess.run(
        ["pdftoppm", "-scale-to", "1200", "-png", str(pdf), str(outdir / "page")],
        check=True,
        capture_output=True,
        timeout=90,
    )
    return sorted(outdir.glob("page-*.png"))
