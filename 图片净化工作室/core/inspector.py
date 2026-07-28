"""元数据查看器 —— 洗图前先看图里嵌了什么。

解析 PNG 文本块,识别 ComfyUI(prompt/workflow)、A1111(parameters)等常见格式,
给出人类可读的摘要 + 原始 JSON。不修改文件。
"""
from __future__ import annotations

import json
import zlib
from dataclasses import dataclass, field

from . import png_surgery as ps


@dataclass
class TextEntry:
    keyword: str
    value: str
    byte_len: int


@dataclass
class Inspection:
    is_png: bool
    total_size: int
    metadata_size: int              # 所有文本/EXIF 块合计字节
    entries: list[TextEntry] = field(default_factory=list)
    has_workflow: bool = False
    has_prompt: bool = False
    has_a1111: bool = False         # A1111 风格 parameters
    error: str | None = None

    @property
    def metadata_ratio(self) -> float:
        return self.metadata_size / self.total_size if self.total_size else 0.0


def _decode_text_chunk(ctype: bytes, data: bytes) -> tuple[str, str]:
    """返回(keyword, value)。处理 tEXt/zTXt(zlib 压缩)/iTXt(可能压缩+UTF8)。"""
    if ctype == b"tEXt":
        kw, _, val = data.partition(b"\x00")
        return kw.decode("latin1", "replace"), val.decode("latin1", "replace")
    if ctype == b"zTXt":
        kw, _, rest = data.partition(b"\x00")
        # rest[0] = 压缩方法, 之后是 zlib 数据
        comp = rest[1:] if rest else b""
        try:
            val = zlib.decompress(comp).decode("latin1", "replace")
        except Exception:
            val = "<zTXt 解压失败>"
        return kw.decode("latin1", "replace"), val
    if ctype == b"iTXt":
        # keyword\0 compflag[1] compmethod[1] lang\0 transkw\0 text
        kw, _, rest = data.partition(b"\x00")
        if len(rest) < 2:
            return kw.decode("latin1", "replace"), ""
        comp_flag = rest[0]
        rest = rest[2:]  # 跳过 compflag + compmethod
        _, _, rest = rest.partition(b"\x00")   # lang
        _, _, text = rest.partition(b"\x00")   # translated keyword
        if comp_flag == 1:
            try:
                text = zlib.decompress(text)
            except Exception:
                return kw.decode("latin1", "replace"), "<iTXt 解压失败>"
        return kw.decode("latin1", "replace"), text.decode("utf-8", "replace")
    return ctype.decode("latin1", "replace"), ""


def inspect_bytes(raw: bytes) -> Inspection:
    try:
        chunks = ps.parse_chunks(raw)
    except ValueError as e:
        return Inspection(is_png=False, total_size=len(raw), metadata_size=0, error=str(e))

    entries: list[TextEntry] = []
    meta_size = 0
    has_wf = has_pr = has_a1 = False
    for c in chunks:
        if c.type in ps.TEXT_CHUNKS:
            kw, val = _decode_text_chunk(c.type, c.data)
            entries.append(TextEntry(kw, val, len(c.data)))
            meta_size += len(c.data)
            low = kw.lower()
            if low == "workflow":
                has_wf = True
            elif low == "prompt":
                has_pr = True
            elif low == "parameters":
                has_a1 = True
        elif c.type == ps.EXIF_CHUNK:
            meta_size += len(c.data)

    return Inspection(
        is_png=True,
        total_size=len(raw),
        metadata_size=meta_size,
        entries=entries,
        has_workflow=has_wf,
        has_prompt=has_pr,
        has_a1111=has_a1,
    )


def inspect_file(path: str) -> Inspection:
    with open(path, "rb") as f:
        return inspect_bytes(f.read())


def pretty_json(value: str) -> str:
    """能解析成 JSON 就美化,否则原样返回。给查看器 UI 用。"""
    try:
        return json.dumps(json.loads(value), ensure_ascii=False, indent=2)
    except Exception:
        return value
