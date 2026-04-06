import io
import logging

from openpyxl import Workbook
from openpyxl.styles import Font

logger = logging.getLogger(__name__)


def _strip_html(html: str) -> str:
    import re
    text = re.sub(r"<[^>]+>", "", html or "")
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return text.strip()


def export_to_excel(questions) -> io.BytesIO:
    wb = Workbook()
    ws = wb.active
    ws.title = "Questions"

    header_font = Font(bold=True)
    ws.append(["Col A", "Col B", "Col C", "Col D", "Col E"])
    for cell in ws[1]:
        cell.font = header_font

    ws.column_dimensions["A"].width = 50
    ws.column_dimensions["B"].width = 20
    ws.column_dimensions["C"].width = 15
    ws.column_dimensions["D"].width = 30
    ws.column_dimensions["E"].width = 20

    for q in questions:
        q_type = q.type.upper() if hasattr(q, "type") else q.get("type", "MC")
        body = _strip_html(q.body_html if hasattr(q, "body_html") else q.get("body_html", ""))
        points = q.points_default if hasattr(q, "points_default") else q.get("points_default", 1.0)
        explanation = _strip_html(q.explanation_html if hasattr(q, "explanation_html") else q.get("explanation_html", ""))
        options = q.options if hasattr(q, "options") else q.get("options", [])
        correct_answer = q.correct_answer_json if hasattr(q, "correct_answer_json") else q.get("correct_answer_json", {})
        shuffle = q.shuffle_options if hasattr(q, "shuffle_options") else q.get("shuffle_options", True)

        col_c = ""
        if q_type == "ESSAY":
            col_c = "long"
        elif q_type == "SA":
            col_c = "short"
        elif not shuffle:
            col_c = "norightshuffle"
        else:
            col_c = "shuffle"

        ws.append([body, points, col_c, explanation, ""])

        if q_type in ("MC", "MR", "TF"):
            for opt in sorted(options, key=lambda o: o.display_order if hasattr(o, "display_order") else o.get("display_order", 0)):
                opt_text = _strip_html(opt.body_html if hasattr(opt, "body_html") else opt.get("body_html", ""))
                is_correct = opt.is_correct if hasattr(opt, "is_correct") else opt.get("is_correct", False)
                partial = opt.partial_credit_pct if hasattr(opt, "partial_credit_pct") else opt.get("partial_credit_pct", 0)

                if is_correct:
                    ws.append(["*", opt_text, f"~{partial}" if partial else "", "", ""])
                else:
                    ws.append([opt_text, "", "", "", ""])

        elif q_type == "FITB":
            accepted = (correct_answer or {}).get("accepted", [])
            for ans in accepted:
                ws.append(["*", ans, "", "", ""])

        elif q_type == "MATCH":
            pairs = (correct_answer or {}).get("pairs", [])
            for pair in pairs:
                left = pair.get("left", "")
                right = pair.get("right", "")
                ws.append(["", f"~{left}", right, "", ""])

        elif q_type == "TEXT":
            pass

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
