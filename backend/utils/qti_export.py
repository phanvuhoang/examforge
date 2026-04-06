import uuid
import logging
import html
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom.minidom import parseString

logger = logging.getLogger(__name__)


def _strip_html(text: str) -> str:
    import re
    return re.sub(r"<[^>]+>", "", text or "").strip()


def export_to_qti(questions) -> str:
    root = Element("questestinterop")
    root.set("xmlns", "http://www.imsglobal.org/xsd/ims_qtiasiv1p2")

    assessment = SubElement(root, "assessment")
    assessment.set("ident", f"examforge-{uuid.uuid4().hex[:8]}")
    assessment.set("title", "ExamForge Export")

    section = SubElement(assessment, "section")
    section.set("ident", "main")
    section.set("title", "Main Section")

    for q in questions:
        q_type = q.type if hasattr(q, "type") else q.get("type", "MC")
        q_id = str(q.id if hasattr(q, "id") else q.get("id", uuid.uuid4()))
        body = _strip_html(q.body_html if hasattr(q, "body_html") else q.get("body_html", ""))
        options = q.options if hasattr(q, "options") else q.get("options", [])
        points = q.points_default if hasattr(q, "points_default") else q.get("points_default", 1.0)

        item = SubElement(section, "item")
        item.set("ident", q_id)
        item.set("title", body[:100])

        itemmetadata = SubElement(item, "itemmetadata")
        qtimetadata = SubElement(itemmetadata, "qtimetadata")
        field = SubElement(qtimetadata, "qtimetadatafield")
        SubElement(field, "fieldlabel").text = "question_type"
        SubElement(field, "fieldentry").text = q_type

        presentation = SubElement(item, "presentation")
        material = SubElement(presentation, "material")
        mattext = SubElement(material, "mattext")
        mattext.set("texttype", "text/html")
        mattext.text = body

        if q_type in ("MC", "TF"):
            response_lid = SubElement(presentation, "response_lid")
            response_lid.set("ident", f"response_{q_id}")
            response_lid.set("rcardinality", "Single")

            render_choice = SubElement(response_lid, "render_choice")
            render_choice.set("shuffle", "Yes")

            for opt in sorted(options, key=lambda o: o.display_order if hasattr(o, "display_order") else o.get("display_order", 0)):
                opt_id = str(opt.id if hasattr(opt, "id") else opt.get("id", uuid.uuid4()))
                opt_text = _strip_html(opt.body_html if hasattr(opt, "body_html") else opt.get("body_html", ""))

                response_label = SubElement(render_choice, "response_label")
                response_label.set("ident", opt_id)
                mat = SubElement(response_label, "material")
                mt = SubElement(mat, "mattext")
                mt.text = opt_text

            resprocessing = SubElement(item, "resprocessing")
            outcomes = SubElement(resprocessing, "outcomes")
            decvar = SubElement(outcomes, "decvar")
            decvar.set("maxvalue", str(points))
            decvar.set("minvalue", "0")
            decvar.set("varname", "SCORE")
            decvar.set("vartype", "Decimal")

            for opt in options:
                is_correct = opt.is_correct if hasattr(opt, "is_correct") else opt.get("is_correct", False)
                if is_correct:
                    opt_id = str(opt.id if hasattr(opt, "id") else opt.get("id", ""))
                    respcondition = SubElement(resprocessing, "respcondition")
                    respcondition.set("continue", "No")
                    conditionvar = SubElement(respcondition, "conditionvar")
                    varequal = SubElement(conditionvar, "varequal")
                    varequal.set("respident", f"response_{q_id}")
                    varequal.text = opt_id
                    setvar = SubElement(respcondition, "setvar")
                    setvar.set("action", "Set")
                    setvar.set("varname", "SCORE")
                    setvar.text = str(points)

        elif q_type == "MR":
            response_lid = SubElement(presentation, "response_lid")
            response_lid.set("ident", f"response_{q_id}")
            response_lid.set("rcardinality", "Multiple")

            render_choice = SubElement(response_lid, "render_choice")
            render_choice.set("shuffle", "Yes")

            for opt in sorted(options, key=lambda o: o.display_order if hasattr(o, "display_order") else o.get("display_order", 0)):
                opt_id = str(opt.id if hasattr(opt, "id") else opt.get("id", uuid.uuid4()))
                opt_text = _strip_html(opt.body_html if hasattr(opt, "body_html") else opt.get("body_html", ""))

                response_label = SubElement(render_choice, "response_label")
                response_label.set("ident", opt_id)
                mat = SubElement(response_label, "material")
                mt = SubElement(mat, "mattext")
                mt.text = opt_text

        elif q_type in ("FITB", "SA"):
            response_str = SubElement(presentation, "response_str")
            response_str.set("ident", f"response_{q_id}")
            response_str.set("rcardinality", "Single")
            render_fib = SubElement(response_str, "render_fib")
            render_fib.set("fibtype", "String")
            render_fib.set("rows", "1")

        elif q_type == "ESSAY":
            response_str = SubElement(presentation, "response_str")
            response_str.set("ident", f"response_{q_id}")
            response_str.set("rcardinality", "Single")
            render_fib = SubElement(response_str, "render_fib")
            render_fib.set("fibtype", "String")
            render_fib.set("rows", "10")

    raw_xml = tostring(root, encoding="unicode", xml_declaration=False)
    dom = parseString(f'<?xml version="1.0" encoding="UTF-8"?>{raw_xml}')
    return dom.toprettyxml(indent="  ")
