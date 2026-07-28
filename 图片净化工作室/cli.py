"""命令行入口 —— 引擎可脱离 GUI 单跑,便于脚本化/自动化。

用法:
  python cli.py 清理 <文件或文件夹> [--suffix|--overwrite] [--no-icc] [--backup-workflow]
  python cli.py 查看 <文件>
  python cli.py 导出 <文件夹> [-o prompts.csv]
"""
from __future__ import annotations

import argparse
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

from core import pipeline, inspector, extractor  # noqa: E402
from core.pipeline import BatchConfig, OutputMode  # noqa: E402


def _human(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


def cmd_clean(args):
    cfg = BatchConfig(
        output_mode=OutputMode.OVERWRITE if args.overwrite else
                    (OutputMode.SUFFIX if args.suffix else OutputMode.SUBDIR),
        keep_icc=not args.no_icc,
        backup_workflow=args.backup_workflow,
        recursive=not args.no_recursive,
    )

    def on_prog(done, total, res):
        tag = {"ok": "✓", "skipped_clean": "·", "error": "✗", "verify_failed": "!"}.get(res.status, "?")
        print(f"[{done}/{total}] {tag} {os.path.basename(res.src)}"
              + (f"  省{_human(res.saved_bytes)}" if res.saved_bytes else ""))

    report = pipeline.run_batch(args.paths, cfg, on_progress=on_prog)
    print("\n=== 报告 ===")
    print(f"总计 {report.total} | 清理 {report.cleaned} | 跳过(已干净) {report.skipped} | 失败 {report.failed}")
    print(f"共节省 {_human(report.total_saved)}")
    for r in report.results:
        if r.status in ("error", "verify_failed"):
            print(f"  ✗ {r.src}: {r.error}")


def cmd_inspect(args):
    insp = inspector.inspect_file(args.path)
    if not insp.is_png:
        print(f"非 PNG 或无法解析: {insp.error}"); return
    print(f"总大小 {_human(insp.total_size)} | 元数据 {_human(insp.metadata_size)} ({insp.metadata_ratio:.1%})")
    print(f"workflow={insp.has_workflow}  prompt={insp.has_prompt}  A1111参数={insp.has_a1111}")
    for e in insp.entries:
        print(f"  - {e.keyword}: {_human(e.byte_len)}")


def cmd_export(args):
    files = pipeline.scan_images(args.paths, recursive=True)
    n = extractor.export_prompts_csv(files, args.output)
    print(f"已导出 {n} 行 → {args.output}")


def main():
    p = argparse.ArgumentParser(prog="图片净化工作室", description="ComfyUI 图片元数据批量清理")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("清理", help="批量清理元数据")
    c.add_argument("paths", nargs="+")
    c.add_argument("--suffix", action="store_true", help="原目录加后缀输出")
    c.add_argument("--overwrite", action="store_true", help="原地覆盖(先备份到 _backup)")
    c.add_argument("--no-icc", action="store_true", help="连 ICC 色彩配置一起删")
    c.add_argument("--backup-workflow", action="store_true", help="洗前把 workflow 存成 .json")
    c.add_argument("--no-recursive", action="store_true", help="不递归子文件夹")
    c.set_defaults(func=cmd_clean)

    i = sub.add_parser("查看", help="查看图片内嵌元数据")
    i.add_argument("path")
    i.set_defaults(func=cmd_inspect)

    e = sub.add_parser("导出", help="批量导出 prompt 表到 CSV")
    e.add_argument("paths", nargs="+")
    e.add_argument("-o", "--output", default="prompts.csv")
    e.set_defaults(func=cmd_export)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
