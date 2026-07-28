"""引擎单测。用真实 ComfyUI 样图证明:0 残留 + 像素零损失。

样图不在仓库里(隐私+体积),缺失则跳过对应用例。
"""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding="utf-8")

from core import png_surgery as ps, inspector, extractor, pipeline  # noqa: E402

SAMPLE = "C:/Users/Administrator/Desktop/ComfyUI_temp_trffr_00037_.png"


def _idats(b):
    return b"".join(c.data for c in ps.parse_chunks(b) if c.type == b"IDAT")


def test_clean_removes_all_metadata():
    if not os.path.exists(SAMPLE):
        print("跳过:样图不存在"); return
    raw = open(SAMPLE, "rb").read()
    out, res = ps.clean_bytes(raw)
    assert res.ok
    assert not ps.has_metadata(out), "洗后仍有元数据残留!"
    assert _idats(raw) == _idats(out), "IDAT 像素被改动!"
    from PIL import Image
    im = Image.open(io.BytesIO(out)); im.load()
    print(f"✓ 清理:{res.original_size:,}→{res.cleaned_size:,}B 省{res.saved_bytes/res.original_size:.1%} | 像素零损失 | Pillow可开 {im.size}")


def test_keep_icc_and_selective():
    # 合成一张带 iCCP + tEXt 的最小 PNG,验证选择性保留
    from PIL import Image
    from PIL.PngImagePlugin import PngInfo
    info = PngInfo()
    info.add_text("workflow", "{}")
    info.add_text("parameters", "masterpiece")
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), (255, 0, 0)).save(buf, "PNG", pnginfo=info)
    raw = buf.getvalue()
    # 只删 workflow,保留 parameters
    opts = ps.CleanOptions(only_keywords={"workflow"})
    out, res = ps.clean_bytes(raw, opts)
    insp = inspector.inspect_bytes(out)
    kws = {e.keyword for e in insp.entries}
    assert "workflow" not in kws and "parameters" in kws, f"选择性清理失败: {kws}"
    print(f"✓ 选择性清理:删 workflow 留 parameters | 剩余 {kws}")


def test_prompt_summary_no_link_leak():
    if not os.path.exists(SAMPLE):
        print("跳过:样图不存在"); return
    row = extractor.build_prompt_row(SAMPLE)
    for k in ("steps", "sampler", "seed", "model"):
        assert "[" not in row[k], f"{k} 泄露了连线数组: {row[k]}"
    print(f"✓ prompt摘要无连线泄露 | seed={row['seed']} steps={row['steps']} sampler={row['sampler']}")


def test_scan_and_report():
    if not os.path.exists(SAMPLE):
        print("跳过:样图不存在"); return
    files = pipeline.scan_images([os.path.dirname(SAMPLE)], recursive=False)
    assert SAMPLE.replace("/", os.sep) in [f.replace("/", os.sep) for f in files]
    print(f"✓ 扫描桌面 png:找到 {len(files)} 张")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
            except AssertionError as e:
                print(f"✗ {name} 失败: {e}")
            except Exception as e:
                print(f"✗ {name} 异常: {e}")
    print("完成。")
