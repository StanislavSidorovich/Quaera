"""
Обвязка исполнителя Python-заданий.

Единственный источник этой логики — читается и браузерным воркером
(public/python-worker.js, через fetch), и гейтом сборки (scripts/verify-content.mjs,
через readFileSync). Если поведение конвертации результата или контракта
result= разъедется между тем, что видит ученик, и тем, что проверяет гейт —
гейт будет зелёным на задании, которое ломается в бою. Поэтому один файл,
а не два похожих куска кода в разных языках рантайма.
"""

import ast, io, json, sys, traceback
import pandas as pd

MAX_ROWS = 200000  # см. MAX_ROWS в sql-worker.js — та же защита от нечаянного декартова произведения

# Отказ, о котором обвязка сообщает кодом, а не фразой. Локали здесь нет
# и быть не может: код исполняется внутри Pyodide, куда i18n не доезжает,
# а сообщение уходит на экран как есть. Формат и список кодов — WORKER_CODE
# и WorkerCode в src/engine/types.ts, фразы — в engine/diagnoseText.ts.
WORKER_ARG = chr(31)  # U+001F


def _worker_error(code, *args):
    return "__worker__:" + WORKER_ARG.join([code] + [str(a) for a in args])


def _has_meaningful_index(obj):
    # Критерий — не тип индекса, а есть ли у него имя. После обычной
    # фильтрации (.loc[mask]) индекс тоже перестаёт быть свежим RangeIndex
    # (в нём остаются позиции отфильтрованных строк), но это не данные —
    # это просто позиции, и reset_index() для них добавил бы мусорную
    # колонку "index". А вот после groupby без as_index=False, set_index,
    # MultiIndex — у индекса есть имя (или он составной), и там лежат
    # реальные данные, которые нельзя терять молча: это то, что должен
    # тренировать py-index ("после groupby колонка «пропадает» — она ушла в него").
    idx = obj.index
    if isinstance(idx, pd.MultiIndex):
        return True
    return idx.name is not None


def _to_table(obj):
    if obj is None:
        return {"columns": [], "rows": []}
    if isinstance(obj, pd.Series):
        obj = obj.to_frame(name=obj.name if obj.name is not None else "value")
    if isinstance(obj, pd.DataFrame):
        if _has_meaningful_index(obj):
            obj = obj.reset_index()
        if len(obj) > MAX_ROWS:
            raise ValueError(_worker_error("tooManyRows", MAX_ROWS))
        # to_json на MultiIndex-колонках (после pivot_table с несколькими value-колонками)
        # даёт кортежи — json их не понимает, поэтому колонки всегда приводим к плоским строкам.
        if isinstance(obj.columns, pd.MultiIndex):
            obj = obj.copy()
            obj.columns = [" / ".join(str(p) for p in c if str(p)) for c in obj.columns]
        parsed = json.loads(obj.to_json(orient="split", date_format="iso", force_ascii=False))
        return {"columns": [str(c) for c in parsed["columns"]], "rows": parsed["data"]}
    try:
        val = obj.item() if hasattr(obj, "item") else obj
    except Exception:
        val = obj
    if not isinstance(val, (str, int, float, bool)) and val is not None:
        val = str(val)
    return {"columns": ["result"], "rows": [[val]]}


def _make_ns():
    # pd/np — то, чем задание реально пользуется наравне с таблицами:
    # pd.to_datetime, pd.concat, pd.NA и т.п. вызываются на модуле, а не на DataFrame.
    import numpy as np
    ns = dict(_TABLES)
    ns["pd"] = pd
    ns["np"] = np
    return ns


def _clean_traceback(exc, code):
    # Из полного traceback берём только кадры пользовательского кода (файл "<cell>") —
    # внутренние кадры компиляции/eval из этой же обвязки только шумят.
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == "<cell>"]
    lines = []
    for f in frames:
        src = f.line or ""
        lines.append(_worker_error("frame", f.lineno, src))
    # Отказ, поднятый самой обвязкой, уже показан в теле разбора кодом —
    # повторять его последней строкой traceback незачем, а приписанное имя
    # исключения ("NameError: __worker__:noResult") ещё и сломало бы разбор
    # кода на стороне показа.
    if not str(exc).startswith("__worker__:"):
        lines.append(f"{type(exc).__name__}: {exc}")
    return "\n".join(lines)


def _run_cell(code):
    # Контракт (см. ROADMAP.md §6): ответ — переменная result, а не последнее
    # выражение. Последнее выражение неоднозначно на практике: код, который
    # заканчивается на print(...), — это тоже выражение, и молча вернул бы None
    # вместо понятной ошибки.
    ns = _make_ns()
    stdout = io.StringIO()
    old_stdout = sys.stdout
    sys.stdout = stdout
    try:
        tree = ast.parse(code, mode="exec", filename="<cell>")
        exec(compile(tree, "<cell>", "exec"), ns)
        if "result" not in ns:
            raise NameError(_worker_error("noResult"))
        return {"ok": True, "table": _to_table(ns["result"]), "stdout": stdout.getvalue()}
    except SyntaxError as e:
        return {"ok": False, "message": _worker_error("pythonSyntax", e.msg, e.lineno), "traceback": "", "stdout": stdout.getvalue()}
    except Exception as e:
        # Имя питоновского исключения — часть сообщения (diagnose.ts читает
        # его как заголовок разбора), но только для настоящих ошибок кода.
        # К коду отказа его приписывать нельзя: код перестанет опознаваться.
        text = str(e)
        message = text if text.startswith("__worker__:") else f"{type(e).__name__}: {e}"
        return {"ok": False, "message": message, "traceback": _clean_traceback(e, code), "stdout": stdout.getvalue()}
    finally:
        sys.stdout = old_stdout
