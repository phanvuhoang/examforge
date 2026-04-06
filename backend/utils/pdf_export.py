import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)

HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    @page {{
        size: A4;
        margin: 2cm;
    }}
    body {{
        font-family: 'DejaVu Sans', Arial, sans-serif;
        font-size: 11pt;
        line-height: 1.5;
        color: #333;
    }}
    h1 {{
        font-size: 18pt;
        text-align: center;
        margin-bottom: 20px;
        color: #1a1a2e;
    }}
    h2 {{
        font-size: 13pt;
        margin-top: 15px;
        color: #16213e;
        border-bottom: 1px solid #ccc;
        padding-bottom: 3px;
    }}
    .question {{
        margin-bottom: 15px;
        page-break-inside: avoid;
    }}
    .question-number {{
        font-weight: bold;
        color: #0f3460;
    }}
    .question-type {{
        font-size: 9pt;
        color: #888;
        margin-left: 5px;
    }}
    .question-points {{
        font-size: 9pt;
        color: #666;
        float: right;
    }}
    .options {{
        margin-left: 20px;
        margin-top: 5px;
    }}
    .option {{
        margin-bottom: 3px;
    }}
    .option-correct {{
        font-weight: bold;
        color: #27ae60;
    }}
    .explanation {{
        margin-top: 5px;
        padding: 5px 10px;
        background: #f8f9fa;
        border-left: 3px solid #3498db;
        font-size: 10pt;
        color: #555;
    }}
    .answer-line {{
        border-bottom: 1px dotted #999;
        height: 30px;
        margin: 5px 20px;
    }}
    .watermark {{
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 72pt;
        color: rgba(0,0,0,0.05);
        z-index: -1;
    }}
</style>
</head>
<body>
{watermark}
<h1>{title}</h1>
{content}
</body>
</html>
"""


def _strip_html(html: str) -> str:
    import re
    text = re.sub(r"<[^>]+>", "", html or "")
    return text.strip()


def generate_exam_pdf(
    title: str,
    questions: list,
    show_answers: bool = False,
    show_explanations: bool = False,
    watermark_text: str = "",
) -> bytes:
    content_parts = []
    current_section = None

    for i, eq in enumerate(questions):
        q = eq.get("question") or eq
        section = eq.get("section_name", "")
        if section and section != current_section:
            content_parts.append(f"<h2>{section}</h2>")
            current_section = section

        q_type = q.get("type", q.type if hasattr(q, "type") else "MC")
        body = q.get("body_html", q.body_html if hasattr(q, "body_html") else "")
        points = eq.get("points_override") or q.get("points_default", getattr(q, "points_default", 1.0))
        explanation = q.get("explanation_html", getattr(q, "explanation_html", ""))
        options = q.get("options", getattr(q, "options", []))

        q_html = f'<div class="question">'
        q_html += f'<span class="question-number">Câu {i + 1}.</span>'
        q_html += f'<span class="question-type">[{q_type}]</span>'
        q_html += f'<span class="question-points">{points} điểm</span>'
        q_html += f'<div>{body}</div>'

        if q_type in ("MC", "MR", "TF") and options:
            q_html += '<div class="options">'
            labels = "ABCDEFGHIJKLMNOP"
            for j, opt in enumerate(sorted(
                options,
                key=lambda o: o.display_order if hasattr(o, "display_order") else o.get("display_order", 0),
            )):
                opt_body = opt.body_html if hasattr(opt, "body_html") else opt.get("body_html", "")
                is_correct = opt.is_correct if hasattr(opt, "is_correct") else opt.get("is_correct", False)
                label = labels[j] if j < len(labels) else str(j + 1)
                cls = "option-correct" if (show_answers and is_correct) else "option"
                marker = " ✓" if (show_answers and is_correct) else ""
                q_html += f'<div class="{cls}">{label}. {_strip_html(opt_body)}{marker}</div>'
            q_html += '</div>'

        elif q_type in ("SA", "FITB"):
            q_html += '<div class="answer-line"></div>'

        elif q_type == "ESSAY":
            for _ in range(5):
                q_html += '<div class="answer-line"></div>'

        if show_explanations and explanation:
            q_html += f'<div class="explanation">{explanation}</div>'

        q_html += '</div>'
        content_parts.append(q_html)

    watermark = f'<div class="watermark">{watermark_text}</div>' if watermark_text else ""
    html = HTML_TEMPLATE.format(
        title=title,
        content="\n".join(content_parts),
        watermark=watermark,
    )

    from weasyprint import HTML
    pdf_bytes = HTML(string=html).write_pdf()
    return pdf_bytes
