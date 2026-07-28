"""图片净化工作室 —— 双击入口(GUI)。打包 exe 也以此为入口。

PyInstaller --windowed 模式下 sys.stdout/stderr 为 None,任何库启动时写一个字节
(customtkinter 缩放检测、warnings 等)就会静默闪退。这里先兜住:
  1) 给 None 的 stdout/stderr 套一个安全的空写入对象;
  2) try/except 捕获启动异常,写日志文件 + 弹框,绝不再盲崩。
"""
import io
import os
import sys


def _guard_std_streams():
    class _NullWriter(io.TextIOBase):
        def write(self, *_a, **_k):
            return 0
        def flush(self):
            pass
    if sys.stdout is None:
        sys.stdout = _NullWriter()
    if sys.stderr is None:
        sys.stderr = _NullWriter()


def _log_dir() -> str:
    # 打包后用 exe 所在目录,否则用脚本目录
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def _run():
    from gui.app import main
    main()


if __name__ == "__main__":
    _guard_std_streams()
    try:
        _run()
    except Exception:
        import traceback
        tb = traceback.format_exc()
        try:
            log_path = os.path.join(_log_dir(), "错误日志.txt")
            with open(log_path, "w", encoding="utf-8") as f:
                f.write(tb)
        except Exception:
            log_path = "(无法写日志)"
        try:
            from tkinter import Tk, messagebox
            r = Tk(); r.withdraw()
            messagebox.showerror("启动失败", f"出错了,详情已写入:\n{log_path}\n\n{tb[-800:]}")
            r.destroy()
        except Exception:
            pass
        sys.exit(1)
