import csv, io, os
from zoneinfo import ZoneInfo
from fastapi import Response
from openpyxl import Workbook
from .models import now, utc

TZ = ZoneInfo(os.getenv("EVENT_TZ", "Asia/Kolkata"))
def loc(x): return utc(x).astimezone(TZ).strftime("%Y-%m-%d %H:%M") if x else ""
def safe(v):
    """Neutralise spreadsheet formula injection: cells starting with = + - @ or control characters are prefixed with an apostrophe."""
    return "'" + v if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r") else v

def build(kind: str, fmt: str, head: list, rows: list) -> Response:
    rows = [[safe(c) for c in r] for r in rows]; name = f"{kind}-{now().strftime('%Y%m%d-%H%M')}.{fmt}"
    if fmt == "csv":
        buf = io.StringIO(); w = csv.writer(buf); w.writerow(head); w.writerows(rows)
        body, mt = ("\ufeff" + buf.getvalue()).encode("utf-8"), "text/csv; charset=utf-8"  # BOM so Excel reads UTF-8
    else:
        wb = Workbook(); ws = wb.active; ws.title = kind.capitalize(); ws.append(head); [ws.append(r) for r in rows]; ws.freeze_panes = "A2"
        for i, h in enumerate(head, 1): ws.column_dimensions[ws.cell(1, i).column_letter].width = min(max(len(str(h)) + 4, 14), 40)
        out = io.BytesIO(); wb.save(out); body, mt = out.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return Response(body, media_type=mt, headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})
