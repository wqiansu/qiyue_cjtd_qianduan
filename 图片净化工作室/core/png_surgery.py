"""PNG 块级手术 —— 方案的技术命根子。

不走 PIL 重存(会整张重新编码、且是否删文本块不可靠),而是直接解析 PNG 的
chunk 流:像素数据(IDAT)原样搬运,只丢弃承载 ComfyUI workflow/prompt 的文本块。
真正零质量损失、极快、100% 干净。

PNG 结构:8 字节签名 + 若干 chunk。每个 chunk = 长度[4 BE] + 类型[4] + 数据 + CRC[4]。
关键块:IHDR/PLTE/IDAT/IEND;像素只在 IDAT 里。
元数据块:tEXt/zTXt/iTXt(workflow、prompt、A1111 参数都在这)、eXIf。
"""
from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass, field

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

# 必须保留的关键块(结构+像素),删了图就废了
CRITICAL_CHUNKS = {b"IHDR", b"PLTE", b"IDAT", b"IEND"}

# 安全的色彩/渲染辅助块,默认保留(删了不影响能否打开,但可能偏色)
SAFE_ANCILLARY = {
    b"gAMA", b"cHRM", b"sRGB", b"pHYs", b"tRNS",
    b"bKGD", b"sBIT", b"hIST", b"sPLT",
}

# ICC 色彩配置:单独一档。默认保留(专业坑:一把删全,广色域屏会偏色)
ICC_CHUNK = b"iCCP"

# 元数据块 —— 清理目标。ComfyUI 的 workflow/prompt 就在 tEXt 里。
TEXT_CHUNKS = {b"tEXt", b"zTXt", b"iTXt"}
EXIF_CHUNK = b"eXIf"


@dataclass
class Chunk:
    type: bytes
    data: bytes

    @property
    def type_str(self) -> str:
        return self.type.decode("latin1", "replace")

    def to_bytes(self) -> bytes:
        crc = zlib.crc32(self.type + self.data) & 0xFFFFFFFF
        return struct.pack(">I", len(self.data)) + self.type + self.data + struct.pack(">I", crc)


@dataclass
class CleanOptions:
    """清理选项。默认 = 删掉 ComfyUI workflow/prompt/参数,保留一切色彩块。"""
    strip_text: bool = True      # 删 tEXt/zTXt/iTXt(workflow/prompt/A1111 参数)
    strip_exif: bool = True      # 删 eXIf
    keep_icc: bool = True        # 保留 iCCP 色彩配置(默认保留,防偏色)
    # 选择性清理:仅删这些 keyword 的文本块;None=删全部文本块
    only_keywords: set[str] | None = None


@dataclass
class ChunkReport:
    type: str
    keyword: str | None
    length: int
    removed: bool = False


@dataclass
class CleanResult:
    ok: bool
    original_size: int
    cleaned_size: int
    removed_chunks: list[ChunkReport] = field(default_factory=list)
    error: str | None = None

    @property
    def saved_bytes(self) -> int:
        return max(0, self.original_size - self.cleaned_size)


def _read_keyword(chunk_type: bytes, data: bytes) -> str | None:
    """从文本块里取 keyword(null 之前那段)。iTXt/zTXt/tEXt 都以 keyword\\0 开头。"""
    if chunk_type not in TEXT_CHUNKS:
        return None
    kw = data.split(b"\x00", 1)[0]
    return kw.decode("latin1", "replace")


def parse_chunks(raw: bytes) -> list[Chunk]:
    """把 PNG 字节流解析成 chunk 列表。非 PNG 抛 ValueError。"""
    if raw[:8] != PNG_SIGNATURE:
        raise ValueError("不是有效的 PNG 文件(签名不匹配)")
    chunks: list[Chunk] = []
    i = 8
    n = len(raw)
    while i + 8 <= n:
        length = struct.unpack(">I", raw[i:i + 4])[0]
        ctype = raw[i + 4:i + 8]
        start = i + 8
        end = start + length
        if end + 4 > n:
            raise ValueError(f"PNG 块 {ctype!r} 越界,文件可能损坏")
        data = raw[start:end]
        chunks.append(Chunk(ctype, data))
        i = end + 4  # 跳过 4 字节 CRC
        if ctype == b"IEND":
            break
    return chunks


def _should_remove(chunk: Chunk, opts: CleanOptions) -> bool:
    ctype = chunk.type
    if ctype in CRITICAL_CHUNKS or ctype in SAFE_ANCILLARY:
        return False
    if ctype == ICC_CHUNK:
        return not opts.keep_icc
    if ctype == EXIF_CHUNK:
        return opts.strip_exif
    if ctype in TEXT_CHUNKS:
        if not opts.strip_text:
            return False
        if opts.only_keywords is not None:
            kw = _read_keyword(ctype, chunk.data)
            return kw in opts.only_keywords
        return True
    # 未知的其它辅助块:保守起见保留(不主动删非目标数据)
    return False


def clean_bytes(raw: bytes, opts: CleanOptions | None = None) -> tuple[bytes, CleanResult]:
    """核心:清理 PNG 字节流,返回(新字节, 报告)。IDAT 原样保留,零重编码。"""
    opts = opts or CleanOptions()
    chunks = parse_chunks(raw)
    kept: list[Chunk] = []
    report: list[ChunkReport] = []
    for c in chunks:
        remove = _should_remove(c, opts)
        if c.type in TEXT_CHUNKS or c.type in (EXIF_CHUNK, ICC_CHUNK):
            report.append(ChunkReport(c.type_str, _read_keyword(c.type, c.data), len(c.data), remove))
        if not remove:
            kept.append(c)
    out = PNG_SIGNATURE + b"".join(c.to_bytes() for c in kept)
    result = CleanResult(
        ok=True,
        original_size=len(raw),
        cleaned_size=len(out),
        removed_chunks=[r for r in report if r.removed],
    )
    return out, result


def has_metadata(raw: bytes) -> bool:
    """快速判断:这张 PNG 里是否嵌了文本/EXIF 元数据(用于跳过已干净文件)。"""
    try:
        for c in parse_chunks(raw):
            if c.type in TEXT_CHUNKS or c.type == EXIF_CHUNK:
                return True
            if c.type == b"IEND":
                break
    except ValueError:
        return False
    return False
