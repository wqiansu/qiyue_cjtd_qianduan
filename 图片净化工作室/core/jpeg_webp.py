"""JPEG / WebP 元数据剥离。

JPEG:删 APP1(EXIF/XMP)/APP13(IPTC)/COM 段,可选保留 APP2(ICC)。段级操作,不重编码。
WebP:RIFF 容器,删 EXIF/XMP 块,保留 VP8/VP8L/VP8X/ALPH/ICCP。
"""
from __future__ import annotations

import struct
from dataclasses import dataclass


@dataclass
class SimpleResult:
    ok: bool
    original_size: int
    cleaned_size: int
    removed: list[str]
    error: str | None = None

    @property
    def saved_bytes(self) -> int:
        return max(0, self.original_size - self.cleaned_size)


# ---------------- JPEG ----------------
_JPEG_SOI = b"\xff\xd8"


def clean_jpeg(raw: bytes, keep_icc: bool = True) -> tuple[bytes, SimpleResult]:
    if raw[:2] != _JPEG_SOI:
        return raw, SimpleResult(False, len(raw), len(raw), [], "不是有效的 JPEG")
    out = bytearray(_JPEG_SOI)
    removed: list[str] = []
    i = 2
    n = len(raw)
    while i + 1 < n:
        if raw[i] != 0xFF:
            out.extend(raw[i:])
            break
        marker = raw[i + 1]
        # SOS(0xDA):之后是压缩图像数据,直接搬运剩余全部
        if marker == 0xDA:
            out.extend(raw[i:])
            break
        # 无长度的标记(RSTn / SOI / EOI / TEM)
        if 0xD0 <= marker <= 0xD9 or marker == 0x01:
            out.extend(raw[i:i + 2])
            i += 2
            continue
        seg_len = struct.unpack(">H", raw[i + 2:i + 4])[0]
        seg_end = i + 2 + seg_len
        seg = raw[i:seg_end]
        drop = False
        name = None
        if marker == 0xE1:          # APP1 = EXIF / XMP
            name, drop = "APP1(EXIF/XMP)", True
        elif marker == 0xED:        # APP13 = IPTC/Photoshop
            name, drop = "APP13(IPTC)", True
        elif marker == 0xFE:        # COM 注释
            name, drop = "COM(注释)", True
        elif marker == 0xE2:        # APP2 = ICC
            name, drop = "APP2(ICC)", (not keep_icc)
        if drop:
            removed.append(name)
        else:
            out.extend(seg)
        i = seg_end
    return bytes(out), SimpleResult(True, len(raw), len(out), removed)


# ---------------- WebP ----------------
def clean_webp(raw: bytes) -> tuple[bytes, SimpleResult]:
    if raw[:4] != b"RIFF" or raw[8:12] != b"WEBP":
        return raw, SimpleResult(False, len(raw), len(raw), [], "不是有效的 WebP")
    body = raw[12:]
    kept = bytearray()
    removed: list[str] = []
    i = 0
    n = len(body)
    while i + 8 <= n:
        fourcc = body[i:i + 4]
        size = struct.unpack("<I", body[i + 4:i + 8])[0]
        padded = size + (size & 1)          # 块按偶数字节对齐
        chunk = body[i:i + 8 + padded]
        if fourcc in (b"EXIF", b"XMP "):
            removed.append(fourcc.decode("latin1").strip())
        else:
            kept.extend(chunk)
        i += 8 + padded
    # 重建 RIFF 头(更新总长度)
    new_body = bytes(kept)
    out = b"RIFF" + struct.pack("<I", len(new_body) + 4) + b"WEBP" + new_body
    return out, SimpleResult(True, len(raw), len(out), removed)
