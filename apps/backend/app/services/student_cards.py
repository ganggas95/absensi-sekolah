import base64
import logging
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

import qrcode
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import simpleSplit
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Frame, Paragraph

from app.models import Student
from app.photo_storage import photo_path_from_url

LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "logo.png"
LOGO_DATA_URL = "data:image/png;base64," + base64.b64encode(
    LOGO_PATH.read_bytes()
).decode("ascii")
CARD_WIDTH = 85.6 * mm
CARD_HEIGHT = 53.98 * mm
NAVY = HexColor("#16213b")
BLUE = HexColor("#315efb")
INK = HexColor("#172033")
MUTED = HexColor("#697386")
CANVAS = HexColor("#f7f9fc")
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ExamCardDetails:
    exam_name: str
    academic_year_name: str


def create_qr_data_url(student_id: str) -> str:
    qr_code = qrcode.QRCode(
        box_size=1,
        border=4,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
    )
    qr_code.add_data(student_id)
    qr_code.make(fit=True)
    modules = qr_code.get_matrix()
    module_count = len(modules)
    path = "".join(
        f"M{x},{y}h1v1h-1z"
        for y, row in enumerate(modules)
        for x, is_dark in enumerate(row)
        if is_dark
    )
    logo_box = module_count * 0.26
    logo_size = module_count * 0.21
    logo_box_offset = (module_count - logo_box) / 2
    logo_offset = (module_count - logo_size) / 2
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {module_count} {module_count}">'
        f'<rect width="{module_count}" height="{module_count}" fill="#fff"/>'
        f'<path d="{path}" fill="#000"/>'
        f'<rect x="{logo_box_offset}" y="{logo_box_offset}" '
        f'width="{logo_box}" height="{logo_box}" rx="{logo_box * 0.15}" fill="#fff"/>'
        f'<image x="{logo_offset}" y="{logo_offset}" width="{logo_size}" '
        f'height="{logo_size}" preserveAspectRatio="xMidYMid meet" '
        f'xlink:href="{LOGO_DATA_URL}"/>'
        f"</svg>"
    )
    encoded_svg = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded_svg}"


def create_cards_pdf(
    students: list[Student], exam: ExamCardDetails | None = None
) -> bytes:
    output = BytesIO()
    document = canvas.Canvas(
        output, pagesize=(CARD_WIDTH, CARD_HEIGHT), pageCompression=1
    )

    for student in students:
        _draw_front(document, student, exam)
        document.showPage()
        _draw_back(document, student, exam)
        document.showPage()

    document.save()
    return output.getvalue()


def _draw_front(
    document: canvas.Canvas, student: Student, exam: ExamCardDetails | None = None
) -> None:
    document.setFillColor(CANVAS)
    document.rect(0, 0, CARD_WIDTH, CARD_HEIGHT, fill=1, stroke=0)
    document.setFillColor(NAVY)
    document.rect(0, CARD_HEIGHT - 17 * mm, CARD_WIDTH, 17 * mm, fill=1, stroke=0)
    document.drawImage(
        ImageReader(LOGO_PATH),
        5 * mm,
        CARD_HEIGHT - 14 * mm,
        width=11 * mm,
        height=11 * mm,
        preserveAspectRatio=True,
        anchor="c",
        mask="auto",
    )

    document.setFillColor(white)
    document.setFont("Helvetica-Bold", 8)
    document.drawString(19 * mm, CARD_HEIGHT - 8 * mm, "SMPI BINA CENDEKIA AQWAM")
    document.setFont("Helvetica", 6 if exam is None else 5.5)
    document.drawString(
        19 * mm,
        CARD_HEIGHT - 13 * mm,
        "KARTU PELAJAR" if exam is None else "KARTU PESERTA UJIAN",
    )
    if exam:
        document.setFont("Helvetica", 4.5)
        document.drawString(
            19 * mm,
            CARD_HEIGHT - 16 * mm,
            f"{exam.exam_name.upper()} · {exam.academic_year_name}",
        )

    photo_x, photo_y = 7 * mm, 8 * mm
    document.setFillColor(HexColor("#e7edff"))
    document.roundRect(photo_x, photo_y, 24 * mm, 24 * mm, 2 * mm, fill=1, stroke=0)
    photo_path = photo_path_from_url(student.photo_url)
    photo_image = None
    if photo_path and photo_path.is_file():
        try:
            photo_image = ImageReader(photo_path)
            image_width, image_height = photo_image.getSize()
        except (OSError, ValueError):
            logger.warning(
                "Could not read student photo %s; using initials instead", photo_path
            )
            photo_image = None
    if photo_image:
        scale = max(24 * mm / image_width, 24 * mm / image_height)
        document.saveState()
        clip = document.beginPath()
        clip.roundRect(photo_x, photo_y, 24 * mm, 24 * mm, 2 * mm)
        document.clipPath(clip, stroke=0)
        document.drawImage(
            photo_image,
            photo_x + (24 * mm - image_width * scale) / 2,
            photo_y + (24 * mm - image_height * scale) / 2,
            width=image_width * scale,
            height=image_height * scale,
        )
        document.restoreState()
    else:
        document.setFillColor(BLUE)
        document.setFont("Helvetica-Bold", 18)
        initials = "".join(part[0] for part in student.full_name.split()[:2]).upper()
        document.drawCentredString(photo_x + 12 * mm, photo_y + 10 * mm, initials)

    text_x = 39 * mm
    name_width = CARD_WIDTH - text_x - 5 * mm
    document.setFillColor(MUTED)
    document.setFont("Helvetica-Bold", 5)
    document.drawString(text_x, 31 * mm, "NAMA")
    document.setFillColor(INK)
    document.setFont("Helvetica-Bold", 7)
    name_lines = simpleSplit(student.full_name, "Helvetica-Bold", 7, name_width)
    for line_number, line in enumerate(name_lines[:2]):
        document.drawString(text_x, (27 - line_number * 3.5) * mm, line)

    document.setFillColor(MUTED)
    document.setFont("Helvetica-Bold", 5)
    document.drawString(text_x, 16 * mm, "NISN")
    document.setFillColor(INK)
    document.setFont("Helvetica", 7)
    document.drawString(text_x, 12 * mm, student.nisn or "-")
    document.setFillColor(MUTED)
    document.setFont("Helvetica-Bold", 5)
    document.drawString(text_x, 7 * mm, "KELAS")
    document.setFillColor(INK)
    document.setFont("Helvetica", 7)
    document.drawString(text_x, 3 * mm, student.rombel.name if student.rombel else "-")

    _draw_qr(document, str(student.id), CARD_WIDTH - 22.5 * mm, 4.5 * mm, 18 * mm)


def _draw_back(
    document: canvas.Canvas, student: Student, exam: ExamCardDetails | None = None
) -> None:
    document.setFillColor(NAVY)
    document.rect(0, 0, CARD_WIDTH, CARD_HEIGHT, fill=1, stroke=0)
    document.setStrokeColor(HexColor("#ffffff55"))
    document.roundRect(
        4 * mm, 4 * mm, CARD_WIDTH - 8 * mm, CARD_HEIGHT - 8 * mm, 3 * mm
    )

    document.setFillColor(white)
    document.setFont("Helvetica-Bold", 9)
    document.drawCentredString(
        CARD_WIDTH / 2,
        CARD_HEIGHT - 15 * mm,
        "KARTU PELAJAR" if exam is None else "KARTU PESERTA UJIAN",
    )
    document.setFont("Helvetica", 6)
    document.drawCentredString(
        CARD_WIDTH / 2, CARD_HEIGHT - 21 * mm, "SMPI BINA CENDEKIA AQWAM"
    )

    if exam:
        note = Paragraph(
            f"Kartu peserta {escape(exam.exam_name)} tahun ajaran {escape(exam.academic_year_name)}.<br/>"
            "Berlaku untuk seluruh mata pelajaran dan sesi pada periode ini.",
            ParagraphStyle(
                "exam-card-note",
                fontName="Helvetica",
                fontSize=7,
                leading=10,
                textColor=white,
                alignment=1,
            ),
        )
        Frame(
            10 * mm, 15 * mm, CARD_WIDTH - 20 * mm, 19 * mm, showBoundary=0
        ).addFromList([note], document)
    else:
        note = Paragraph(
            "Kartu ini adalah identitas siswa yang berlaku selama terdaftar di sekolah. "
            "Jika ditemukan, mohon dikembalikan ke sekolah.",
            ParagraphStyle(
                "card-note",
                fontName="Helvetica",
                fontSize=7,
                leading=10,
                textColor=white,
                alignment=1,
            ),
        )
        Frame(
            13 * mm, 15 * mm, CARD_WIDTH - 26 * mm, 19 * mm, showBoundary=0
        ).addFromList([note], document)
    document.setFillColor(HexColor("#c8d4f0"))
    document.setFont("Helvetica", 5)
    document.drawCentredString(CARD_WIDTH / 2, 8 * mm, f"ID: {student.id}")


def _draw_qr(
    document: canvas.Canvas, value: str, x: float, y: float, size: float
) -> None:
    qr = QrCodeWidget(value, barLevel="H")
    bounds = qr.getBounds()
    qr_width = bounds[2] - bounds[0]
    qr_height = bounds[3] - bounds[1]
    drawing = Drawing(
        size, size, transform=[size / qr_width, 0, 0, size / qr_height, 0, 0]
    )
    drawing.add(qr)
    document.saveState()
    renderPDF.draw(drawing, document, x, y)
    logo_box = size * 0.26
    logo_size = size * 0.21
    document.setFillColor(white)
    document.roundRect(
        x + (size - logo_box) / 2,
        y + (size - logo_box) / 2,
        logo_box,
        logo_box,
        logo_box * 0.15,
        fill=1,
        stroke=0,
    )
    document.drawImage(
        ImageReader(LOGO_PATH),
        x + (size - logo_size) / 2,
        y + (size - logo_size) / 2,
        width=logo_size,
        height=logo_size,
        preserveAspectRatio=True,
        anchor="c",
        mask="auto",
    )
    document.restoreState()
