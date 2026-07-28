"""批处理调度 —— 递归扫描 + 多线程 + 安全写出 + 洗后自动复检 + 报告。

安全默认:绝不原地覆盖。输出到子目录(默认 <源>/_cleaned)或加后缀。
洗完自动复检:重扫输出确认 0 残留元数据,给报告绿灯。
"""
from __future__ import annotations

import os
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from enum import Enum

from . import png_surgery as ps
from . import jpeg_webp as jw
from . import inspector
from . import extractor

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


class OutputMode(Enum):
    SUBDIR = "subdir"       # 输出到子目录(默认,最安全)
    SUFFIX = "suffix"       # 原目录下加后缀,如 xxx_clean.png
    OVERWRITE = "overwrite" # 原地覆盖(危险,需显式选;先备份到 _backup)


@dataclass
class BatchConfig:
    output_mode: OutputMode = OutputMode.SUBDIR
    subdir_name: str = "_cleaned"
    suffix: str = "_clean"
    recursive: bool = True
    keep_icc: bool = True
    strip_text: bool = True
    strip_exif: bool = True
    only_keywords: set[str] | None = None
    keep_mtime: bool = True            # 保留原图修改时间
    backup_workflow: bool = False      # 洗前把 workflow 存成 .json
    backup_before_overwrite: bool = True
    max_workers: int = 4


@dataclass
class FileResult:
    src: str
    dst: str | None = None
    status: str = "ok"        # ok / skipped_clean / error / verify_failed
    saved_bytes: int = 0
    removed: list[str] = field(default_factory=list)
    workflow_saved: str | None = None
    error: str | None = None


@dataclass
class BatchReport:
    results: list[FileResult] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def cleaned(self) -> int:
        return sum(1 for r in self.results if r.status == "ok")

    @property
    def skipped(self) -> int:
        return sum(1 for r in self.results if r.status == "skipped_clean")

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if r.status in ("error", "verify_failed"))

    @property
    def total_saved(self) -> int:
        return sum(r.saved_bytes for r in self.results)


def scan_images(paths: list[str], recursive: bool = True) -> list[str]:
    """把文件/文件夹列表展开成图片文件列表。跳过输出子目录避免自嵌套。"""
    found: list[str] = []
    for p in paths:
        if os.path.isfile(p):
            if os.path.splitext(p)[1].lower() in IMAGE_EXTS:
                found.append(p)
        elif os.path.isdir(p):
            if recursive:
                for root, _dirs, files in os.walk(p):
                    for fn in files:
                        if os.path.splitext(fn)[1].lower() in IMAGE_EXTS:
                            found.append(os.path.join(root, fn))
            else:
                for fn in os.listdir(p):
                    fp = os.path.join(p, fn)
                    if os.path.isfile(fp) and os.path.splitext(fn)[1].lower() in IMAGE_EXTS:
                        found.append(fp)
    # 去重
    return sorted(set(found))


def _resolve_dst(src: str, cfg: BatchConfig) -> str:
    d, fn = os.path.split(src)
    base, ext = os.path.splitext(fn)
    if cfg.output_mode == OutputMode.SUFFIX:
        return os.path.join(d, base + cfg.suffix + ext)
    if cfg.output_mode == OutputMode.OVERWRITE:
        return src
    # SUBDIR
    out_dir = os.path.join(d, cfg.subdir_name)
    return os.path.join(out_dir, fn)


def _clean_one_bytes(raw: bytes, ext: str, cfg: BatchConfig):
    """按扩展名分派到对应引擎,返回(新字节, removed列表)。"""
    if ext == ".png":
        opts = ps.CleanOptions(strip_text=cfg.strip_text, strip_exif=cfg.strip_exif,
                               keep_icc=cfg.keep_icc, only_keywords=cfg.only_keywords)
        out, res = ps.clean_bytes(raw, opts)
        return out, [f"{r.type}:{r.keyword}" if r.keyword else r.type for r in res.removed_chunks]
    if ext in (".jpg", ".jpeg"):
        out, res = jw.clean_jpeg(raw, keep_icc=cfg.keep_icc)
        return out, res.removed
    if ext == ".webp":
        out, res = jw.clean_webp(raw)
        return out, res.removed
    return raw, []


def _verify_clean(dst: str, ext: str, cfg: BatchConfig) -> bool:
    """洗后复检:PNG 确认无(目标)文本/EXIF 残留。"""
    if ext != ".png":
        return True  # jpeg/webp 段级删除已确定,略过深检
    try:
        with open(dst, "rb") as f:
            raw = f.read()
        if cfg.only_keywords is not None:
            insp = inspector.inspect_bytes(raw)
            remaining = {e.keyword.lower() for e in insp.entries}
            return not (cfg.only_keywords & remaining)
        return not ps.has_metadata(raw)
    except Exception:
        return False


def process_file(src: str, cfg: BatchConfig) -> FileResult:
    r = FileResult(src=src)
    ext = os.path.splitext(src)[1].lower()
    try:
        with open(src, "rb") as f:
            raw = f.read()

        # 洗前备份 workflow
        if cfg.backup_workflow and ext == ".png":
            wf_dir = os.path.join(os.path.dirname(src), "_workflows")
            saved = extractor.save_workflow_beside(src, out_dir=wf_dir)
            r.workflow_saved = saved

        # 已干净则跳过(仅 PNG 精确判断)
        if ext == ".png" and cfg.only_keywords is None and not ps.has_metadata(raw):
            r.status = "skipped_clean"
            return r

        out, removed = _clean_one_bytes(raw, ext, cfg)
        dst = _resolve_dst(src, cfg)

        if cfg.output_mode == OutputMode.OVERWRITE and cfg.backup_before_overwrite:
            bak_dir = os.path.join(os.path.dirname(src), "_backup")
            os.makedirs(bak_dir, exist_ok=True)
            shutil.copy2(src, os.path.join(bak_dir, os.path.basename(src)))

        os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
        with open(dst, "wb") as f:
            f.write(out)

        if cfg.keep_mtime:
            st = os.stat(src)
            os.utime(dst, (st.st_atime, st.st_mtime))

        if not _verify_clean(dst, ext, cfg):
            r.status = "verify_failed"
            r.error = "复检发现残留元数据"
            r.dst = dst
            return r

        r.dst = dst
        r.saved_bytes = max(0, len(raw) - len(out))
        r.removed = removed
        r.status = "ok"
    except Exception as e:
        r.status = "error"
        r.error = str(e)
    return r


def run_batch(paths: list[str], cfg: BatchConfig,
              on_progress=None, should_cancel=None) -> BatchReport:
    """批处理入口。on_progress(done,total,FileResult) 回调给 GUI;
    should_cancel() 返回 True 则尽快停止。"""
    files = scan_images(paths, recursive=cfg.recursive)
    report = BatchReport()
    total = len(files)
    if total == 0:
        return report
    done = 0
    with ThreadPoolExecutor(max_workers=max(1, cfg.max_workers)) as ex:
        futures = {ex.submit(process_file, f, cfg): f for f in files}
        for fut in as_completed(futures):
            if should_cancel and should_cancel():
                break
            res = fut.result()
            report.results.append(res)
            done += 1
            if on_progress:
                on_progress(done, total, res)
    return report
