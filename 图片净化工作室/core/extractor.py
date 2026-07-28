"""抽取器 —— 洗图前先留资产。

1) 抽取 workflow → 同名 .json(永不丢辛苦调的工作流)
2) 批量导出 prompt 表 → CSV(文件名→正/负提示词→seed/model/采样器,prompt 考古存档)

CSV 用标准库 csv,带 UTF-8 BOM 让 Excel 直接正常打开中文。
"""
from __future__ import annotations

import csv
import io
import json
import os

from .inspector import Inspection, inspect_file


def extract_workflow_json(insp: Inspection) -> str | None:
    """返回美化后的 workflow JSON 文本;没有则 None。"""
    for e in insp.entries:
        if e.keyword.lower() == "workflow":
            try:
                return json.dumps(json.loads(e.value), ensure_ascii=False, indent=2)
            except Exception:
                return e.value
    return None


def _get_entry(insp: Inspection, keyword: str) -> str | None:
    for e in insp.entries:
        if e.keyword.lower() == keyword.lower():
            return e.value
    return None


def save_workflow_beside(path: str, out_dir: str | None = None) -> str | None:
    """把某图的 workflow 存成同名 .json。返回写出的路径;无 workflow 返回 None。"""
    insp = inspect_file(path)
    wf = extract_workflow_json(insp)
    if wf is None:
        return None
    base = os.path.splitext(os.path.basename(path))[0]
    target_dir = out_dir or os.path.dirname(path)
    os.makedirs(target_dir, exist_ok=True)
    dst = os.path.join(target_dir, base + ".workflow.json")
    with open(dst, "w", encoding="utf-8") as f:
        f.write(wf)
    return dst


# ---- 从 ComfyUI prompt 图里粗提关键参数(尽力而为,失败不影响清理) ----
def _is_link(v) -> bool:
    """ComfyUI 连线表示为 [节点id, 输出序号]。"""
    return isinstance(v, list) and len(v) == 2 and isinstance(v[0], (str, int))


def _scalar(v):
    """只接受标量字面值;连线/对象一律视为无(不泄露 ['474',0] 这种原始数组)。"""
    if _is_link(v) or isinstance(v, (list, dict)):
        return None
    return v


def _resolve(v, data: dict, _depth: int = 0):
    """把值解析成标量:字面量直接用;连线则跟一跳,在目标节点 inputs 里找同类标量。
    重度自定义图(rgthree KSampler Config 等)参数走连线,尽量顺藤摸到真实数值。"""
    s = _scalar(v)
    if s is not None:
        return s
    if _is_link(v) and _depth < 3:
        target = data.get(str(v[0]))
        if isinstance(target, dict):
            inp = target.get("inputs", {}) or {}
            # 优先常见数值键
            for key in ("value", "steps_total", "steps", "int", "float",
                        "number", "seed", "sampler_name", "scheduler", "text"):
                if key in inp:
                    r = _resolve(inp[key], data, _depth + 1)
                    if r is not None:
                        return r
            # 退而求其次:任意一个标量输入
            for val in inp.values():
                r = _scalar(val)
                if r is not None:
                    return r
    return None


def _fmt(v) -> str:
    return "" if v is None else str(v)


def _summarize_comfy_prompt(prompt_json: str) -> dict:
    """从 ComfyUI API prompt 里尽量抽 正/负提示词、seed、模型、采样器、步数、cfg。
    ComfyUI 图是节点字典,靠 class_type 猜。抽不到就留空,绝不报错、绝不输出连线数组。"""
    out = {"positive": "", "negative": "", "seed": "", "steps": "",
           "cfg": "", "sampler": "", "model": ""}
    try:
        data = json.loads(prompt_json)
    except Exception:
        return out
    if not isinstance(data, dict):
        return out
    texts: list[str] = []
    for node in data.values():
        if not isinstance(node, dict):
            continue
        ct = node.get("class_type", "")
        inp = node.get("inputs", {}) or {}
        if ct == "CLIPTextEncode":
            t = _scalar(inp.get("text"))          # 只收字面文本
            if isinstance(t, str) and t.strip():
                texts.append(t)
        if "KSampler" in ct:                      # 兼容 KSampler / KSamplerAdvanced 等
            out["seed"] = out["seed"] or _fmt(_resolve(inp.get("seed") or inp.get("noise_seed"), data))
            out["steps"] = out["steps"] or _fmt(_resolve(inp.get("steps") or inp.get("steps_total"), data))
            out["cfg"] = out["cfg"] or _fmt(_resolve(inp.get("cfg"), data))
            out["sampler"] = out["sampler"] or _fmt(_resolve(inp.get("sampler_name"), data))
        if "CheckpointLoader" in ct or ct == "UNETLoader":
            out["model"] = out["model"] or _fmt(_resolve(inp.get("ckpt_name") or inp.get("unet_name"), data))
    if texts:
        out["positive"] = texts[0]
        if len(texts) > 1:
            out["negative"] = texts[1]
    return out


def build_prompt_row(path: str) -> dict:
    insp = inspect_file(path)
    row = {"file": os.path.basename(path), "has_workflow": "是" if insp.has_workflow else "",
           "positive": "", "negative": "", "seed": "", "steps": "",
           "cfg": "", "sampler": "", "model": ""}
    prompt_val = _get_entry(insp, "prompt")
    if prompt_val:
        row.update(_summarize_comfy_prompt(prompt_val))
    # A1111 parameters 兜底
    if not row["positive"]:
        params = _get_entry(insp, "parameters")
        if params:
            row["positive"] = params.splitlines()[0] if params else ""
    return row


_CSV_FIELDS = ["file", "has_workflow", "positive", "negative",
               "seed", "steps", "cfg", "sampler", "model"]
_CSV_HEADER = {"file": "文件名", "has_workflow": "含工作流", "positive": "正向提示词",
               "negative": "负向提示词", "seed": "种子", "steps": "步数",
               "cfg": "CFG", "sampler": "采样器", "model": "模型"}


def export_prompts_csv(paths: list[str], csv_path: str) -> int:
    """把多张图的 prompt 摘要导出成 CSV(UTF-8-BOM,Excel 友好)。返回写入行数。"""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_CSV_FIELDS)
    writer.writerow(_CSV_HEADER)              # 中文表头
    count = 0
    for p in paths:
        try:
            writer.writerow(build_prompt_row(p))
            count += 1
        except Exception:
            continue
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        f.write(buf.getvalue())
    return count
