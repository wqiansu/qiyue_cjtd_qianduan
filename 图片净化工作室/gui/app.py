"""图片净化工作室 —— GUI。

customtkinter 现代外观 + tkinterdnd2 拖拽。设计目标:便捷、可视化、简洁流畅。
布局:左=文件区(拖拽/列表/缩略图),右=选项+操作+进度+报告。
所有批处理在后台线程跑,UI 通过 after() 回主线程刷新,绝不卡界面。
"""
from __future__ import annotations

import os
import sys
import threading

import customtkinter as ctk
from tkinter import filedialog, messagebox

try:
    from tkinterdnd2 import TkinterDnD, DND_FILES
    _HAS_DND = True
except Exception:
    _HAS_DND = False

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core import pipeline, inspector, extractor          # noqa: E402
from core.pipeline import BatchConfig, OutputMode         # noqa: E402

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

ACCENT = "#3b82f6"
OK_GREEN = "#22c55e"
WARN = "#f59e0b"
ERR = "#ef4444"


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


# DnD 需要多继承 CTk + DnDWrapper 的已知写法;无 DnD 时退化为纯 CTk。
if _HAS_DND:
    class _Base(ctk.CTk, TkinterDnD.DnDWrapper):
        def __init__(self):
            super().__init__()
            self.TkdndVersion = TkinterDnD._require(self)
else:
    class _Base(ctk.CTk):
        pass


class App(_Base):
    def __init__(self):
        super().__init__()
        self.title("图片净化工作室 · ComfyUI 元数据批量清理")
        self.geometry("980x660")
        self.minsize(860, 560)

        self.files: list[str] = []       # 已加入的文件/文件夹路径
        self._cancel = False
        self._running = False

        self.grid_columnconfigure(0, weight=3)
        self.grid_columnconfigure(1, weight=2)
        self.grid_rowconfigure(0, weight=1)

        self._build_left()
        self._build_right()
        self._refresh_filelist()

    # ---------------- 左侧:文件区 ----------------
    def _build_left(self):
        left = ctk.CTkFrame(self, corner_radius=12)
        left.grid(row=0, column=0, padx=(14, 7), pady=14, sticky="nsew")
        left.grid_rowconfigure(1, weight=1)
        left.grid_columnconfigure(0, weight=1)

        title = ctk.CTkLabel(left, text="文件", font=ctk.CTkFont(size=15, weight="bold"))
        title.grid(row=0, column=0, padx=16, pady=(14, 6), sticky="w")

        # 拖拽/列表区
        self.filelist = ctk.CTkScrollableFrame(left, corner_radius=8,
                                               label_text="拖拽图片或文件夹到这里")
        self.filelist.grid(row=1, column=0, padx=12, pady=6, sticky="nsew")
        self.filelist.grid_columnconfigure(0, weight=1)
        if _HAS_DND:
            self.drop_target_register(DND_FILES)
            self.dnd_bind("<<Drop>>", self._on_drop)

        # 按钮排
        btns = ctk.CTkFrame(left, fg_color="transparent")
        btns.grid(row=2, column=0, padx=12, pady=(4, 12), sticky="ew")
        btns.grid_columnconfigure((0, 1, 2), weight=1)
        ctk.CTkButton(btns, text="添加图片", command=self._add_files).grid(row=0, column=0, padx=4, sticky="ew")
        ctk.CTkButton(btns, text="添加文件夹", command=self._add_folder).grid(row=0, column=1, padx=4, sticky="ew")
        ctk.CTkButton(btns, text="清空", fg_color="gray30", hover_color="gray25",
                      command=self._clear).grid(row=0, column=2, padx=4, sticky="ew")

        self.count_lbl = ctk.CTkLabel(left, text="", text_color="gray60",
                                     font=ctk.CTkFont(size=12))
        self.count_lbl.grid(row=3, column=0, padx=16, pady=(0, 10), sticky="w")

    # ---------------- 右侧:选项 + 操作 + 进度 + 报告 ----------------
    def _build_right(self):
        right = ctk.CTkFrame(self, corner_radius=12)
        right.grid(row=0, column=1, padx=(7, 14), pady=14, sticky="nsew")
        right.grid_columnconfigure(0, weight=1)
        right.grid_rowconfigure(6, weight=1)

        ctk.CTkLabel(right, text="选项", font=ctk.CTkFont(size=15, weight="bold")
                     ).grid(row=0, column=0, padx=16, pady=(14, 4), sticky="w")

        opt = ctk.CTkFrame(right, fg_color="transparent")
        opt.grid(row=1, column=0, padx=14, pady=2, sticky="ew")
        opt.grid_columnconfigure(0, weight=1)

        # 输出方式
        ctk.CTkLabel(opt, text="输出方式").grid(row=0, column=0, sticky="w", pady=(2, 0))
        self.out_mode = ctk.CTkSegmentedButton(
            opt, values=["子目录", "加后缀", "原地覆盖"])
        self.out_mode.set("子目录")
        self.out_mode.grid(row=1, column=0, sticky="ew", pady=(0, 8))

        # 复选项
        self.cb_recursive = ctk.CTkCheckBox(opt, text="递归子文件夹")
        self.cb_recursive.select()
        self.cb_recursive.grid(row=2, column=0, sticky="w", pady=3)

        self.cb_keepicc = ctk.CTkCheckBox(opt, text="保留 ICC 色彩配置(防偏色,推荐)")
        self.cb_keepicc.select()
        self.cb_keepicc.grid(row=3, column=0, sticky="w", pady=3)

        self.cb_mtime = ctk.CTkCheckBox(opt, text="保留原图修改时间")
        self.cb_mtime.select()
        self.cb_mtime.grid(row=4, column=0, sticky="w", pady=3)

        self.cb_backup_wf = ctk.CTkCheckBox(opt, text="洗前把 workflow 备份成 .json")
        self.cb_backup_wf.grid(row=5, column=0, sticky="w", pady=3)

        # 操作按钮
        act = ctk.CTkFrame(right, fg_color="transparent")
        act.grid(row=2, column=0, padx=14, pady=(10, 4), sticky="ew")
        act.grid_columnconfigure((0, 1), weight=1)
        self.btn_clean = ctk.CTkButton(act, text="开始清理", height=40,
                                      font=ctk.CTkFont(size=14, weight="bold"),
                                      command=self._start_clean)
        self.btn_clean.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 6))
        ctk.CTkButton(act, text="查看元数据", fg_color="gray30", hover_color="gray25",
                      command=self._inspect_selected).grid(row=1, column=0, padx=(0, 3), sticky="ew")
        ctk.CTkButton(act, text="导出Prompt表", fg_color="gray30", hover_color="gray25",
                      command=self._export_csv).grid(row=1, column=1, padx=(3, 0), sticky="ew")

        # 进度
        self.progress = ctk.CTkProgressBar(right)
        self.progress.set(0)
        self.progress.grid(row=3, column=0, padx=16, pady=(12, 2), sticky="ew")
        self.prog_lbl = ctk.CTkLabel(right, text="就绪", text_color="gray60",
                                    font=ctk.CTkFont(size=12))
        self.prog_lbl.grid(row=4, column=0, padx=16, pady=(0, 6), sticky="w")

        # 报告区
        ctk.CTkLabel(right, text="报告", font=ctk.CTkFont(size=15, weight="bold")
                     ).grid(row=5, column=0, padx=16, pady=(6, 2), sticky="w")
        self.report_box = ctk.CTkTextbox(right, corner_radius=8, wrap="word",
                                        font=ctk.CTkFont(size=12))
        self.report_box.grid(row=6, column=0, padx=14, pady=(0, 14), sticky="nsew")
        self.report_box.insert("1.0", "把图片或文件夹拖进左侧,选好选项,点『开始清理』。\n")
        self.report_box.configure(state="disabled")

    # ---------------- 文件管理 ----------------
    def _on_drop(self, event):
        paths = self._parse_dnd(event.data)
        self._add_paths(paths)

    @staticmethod
    def _parse_dnd(data: str) -> list[str]:
        # tkdnd 用 {} 包裹含空格的路径
        out, buf, in_brace = [], "", False
        for ch in data:
            if ch == "{":
                in_brace = True; buf = ""
            elif ch == "}":
                in_brace = False; out.append(buf); buf = ""
            elif ch == " " and not in_brace:
                if buf: out.append(buf); buf = ""
            else:
                buf += ch
        if buf: out.append(buf)
        return [p for p in out if p]

    def _add_paths(self, paths: list[str]):
        added = 0
        for p in paths:
            if p and p not in self.files and os.path.exists(p):
                self.files.append(p)
                added += 1
        if added:
            self._refresh_filelist()

    def _add_files(self):
        paths = filedialog.askopenfilenames(
            title="选择图片",
            filetypes=[("图片", "*.png *.jpg *.jpeg *.webp"), ("所有文件", "*.*")])
        self._add_paths(list(paths))

    def _add_folder(self):
        d = filedialog.askdirectory(title="选择文件夹")
        if d:
            self._add_paths([d])

    def _clear(self):
        self.files.clear()
        self._refresh_filelist()

    def _remove(self, path: str):
        if path in self.files:
            self.files.remove(path)
            self._refresh_filelist()

    def _refresh_filelist(self):
        for w in self.filelist.winfo_children():
            w.destroy()
        if not self.files:
            ctk.CTkLabel(self.filelist, text="（空）拖拽或点下方按钮添加",
                         text_color="gray50").grid(row=0, column=0, pady=20)
            self.count_lbl.configure(text="")
            return
        for i, p in enumerate(self.files):
            row = ctk.CTkFrame(self.filelist, fg_color=("gray85", "gray20"), corner_radius=6)
            row.grid(row=i, column=0, sticky="ew", pady=3, padx=2)
            row.grid_columnconfigure(0, weight=1)
            icon = "📁" if os.path.isdir(p) else "🖼"
            ctk.CTkLabel(row, text=f"{icon}  {os.path.basename(p) or p}",
                         anchor="w").grid(row=0, column=0, sticky="ew", padx=10, pady=6)
            ctk.CTkButton(row, text="✕", width=28, fg_color="transparent",
                          hover_color=ERR, text_color="gray60",
                          command=lambda pp=p: self._remove(pp)).grid(row=0, column=1, padx=4)
        # 统计待处理图片数
        try:
            imgs = pipeline.scan_images(self.files, recursive=bool(self.cb_recursive.get()))
            self.count_lbl.configure(text=f"共 {len(self.files)} 项 · 待处理 {len(imgs)} 张图片")
        except Exception:
            self.count_lbl.configure(text=f"共 {len(self.files)} 项")

    # ---------------- 配置 ----------------
    def _build_config(self) -> BatchConfig:
        mode_map = {"子目录": OutputMode.SUBDIR, "加后缀": OutputMode.SUFFIX,
                    "原地覆盖": OutputMode.OVERWRITE}
        return BatchConfig(
            output_mode=mode_map[self.out_mode.get()],
            recursive=bool(self.cb_recursive.get()),
            keep_icc=bool(self.cb_keepicc.get()),
            keep_mtime=bool(self.cb_mtime.get()),
            backup_workflow=bool(self.cb_backup_wf.get()),
        )

    def _log(self, text: str, clear=False):
        self.report_box.configure(state="normal")
        if clear:
            self.report_box.delete("1.0", "end")
        self.report_box.insert("end", text + "\n")
        self.report_box.see("end")
        self.report_box.configure(state="disabled")

    # ---------------- 清理(后台线程) ----------------
    def _start_clean(self):
        if self._running:
            # 运行中点击 = 取消
            self._cancel = True
            self.prog_lbl.configure(text="正在取消…")
            return
        if not self.files:
            messagebox.showinfo("提示", "请先添加图片或文件夹")
            return
        cfg = self._build_config()
        if cfg.output_mode == OutputMode.OVERWRITE:
            if not messagebox.askyesno("确认原地覆盖",
                    "原地覆盖会替换原图(已自动先备份到各目录的 _backup 文件夹)。\n确定继续?"):
                return
        self._cancel = False
        self._running = True
        self.btn_clean.configure(text="取消")
        self._log("开始清理…", clear=True)
        threading.Thread(target=self._run_clean, args=(cfg,), daemon=True).start()

    def _run_clean(self, cfg: BatchConfig):
        def on_prog(done, total, res):
            self.after(0, self._on_prog, done, total, res)
        report = pipeline.run_batch(self.files, cfg,
                                    on_progress=on_prog,
                                    should_cancel=lambda: self._cancel)
        self.after(0, self._on_done, report)

    def _on_prog(self, done, total, res):
        self.progress.set(done / total if total else 0)
        self.prog_lbl.configure(text=f"处理中 {done}/{total} · {os.path.basename(res.src)}")
        if res.status == "ok" and res.saved_bytes:
            self._log(f"  ✓ {os.path.basename(res.src)}  省 {human(res.saved_bytes)}")
        elif res.status == "skipped_clean":
            self._log(f"  · {os.path.basename(res.src)}  已干净，跳过")
        elif res.status == "verify_failed":
            self._log(f"  ! {os.path.basename(res.src)}  复检未通过：{res.error}")
        elif res.status == "error":
            self._log(f"  ✗ {os.path.basename(res.src)}  出错：{res.error}")

    def _on_done(self, report):
        self._running = False
        self.btn_clean.configure(text="开始清理")
        self.prog_lbl.configure(text="完成" if not self._cancel else "已取消")
        self.progress.set(1.0 if not self._cancel else self.progress.get())
        self._log("\n=== 报告 ===")
        self._log(f"总计 {report.total} · 清理 {report.cleaned} · "
                  f"跳过 {report.skipped} · 失败 {report.failed}")
        self._log(f"共节省空间 {human(report.total_saved)}")
        if report.failed == 0 and report.cleaned > 0:
            self._log("✅ 全部通过洗后复检，0 元数据残留")
        wf = [r for r in report.results if r.workflow_saved]
        if wf:
            self._log(f"📦 已备份 {len(wf)} 个 workflow 到各目录的 _workflows 文件夹")

    # ---------------- 查看元数据 ----------------
    def _inspect_selected(self):
        imgs = pipeline.scan_images(self.files, recursive=False)
        pngs = [p for p in imgs if p.lower().endswith(".png")]
        target = pngs[0] if pngs else (imgs[0] if imgs else None)
        if not target:
            messagebox.showinfo("提示", "请先添加至少一张图片")
            return
        insp = inspector.inspect_file(target)
        self._log(f"\n=== 查看 {os.path.basename(target)} ===", )
        if not insp.is_png:
            self._log(f"非 PNG 或无法解析：{insp.error}")
            return
        self._log(f"总大小 {human(insp.total_size)} · 元数据 {human(insp.metadata_size)} "
                  f"({insp.metadata_ratio:.1%})")
        self._log(f"workflow={insp.has_workflow} · prompt={insp.has_prompt} · A1111={insp.has_a1111}")
        for e in insp.entries:
            self._log(f"  - {e.keyword}: {human(e.byte_len)}")
        if not insp.entries:
            self._log("  (无文本元数据，已是纯净图)")

    # ---------------- 导出 Prompt CSV ----------------
    def _export_csv(self):
        imgs = pipeline.scan_images(self.files, recursive=bool(self.cb_recursive.get()))
        if not imgs:
            messagebox.showinfo("提示", "请先添加图片或文件夹")
            return
        path = filedialog.asksaveasfilename(
            title="导出 Prompt 表", defaultextension=".csv",
            initialfile="prompts.csv", filetypes=[("CSV 表格", "*.csv")])
        if not path:
            return
        n = extractor.export_prompts_csv(imgs, path)
        self._log(f"\n📄 已导出 {n} 行 Prompt 表 → {path}")
        messagebox.showinfo("完成", f"已导出 {n} 行到\n{path}")


def main():
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
