"""
Make fictional sample documents for testing ScholarScope's document checks.

    python samples/make_sample_documents.py

Writes PDFs (with real, selectable text) and one PNG "scan" to samples/documents/.
Every school, exam board, person and number here is made up, and every page carries a
"SAMPLE - FICTIONAL RECORD FOR SOFTWARE TESTING" watermark and footer, so none of these can pass as a
real record. Needs Pillow only for the PNG (pip install pillow); the PDFs need nothing extra.
"""
from __future__ import annotations

import os
import random
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'documents')
W, H = 612, 792  # US Letter, points
# Says plainly that it is fictional, without words like "not valid" that the unofficial-copy check looks for.
NOTICE = 'FICTIONAL SAMPLE MADE FOR SOFTWARE TESTING - ALL NAMES AND INSTITUTIONS ARE INVENTED'


# ---------------------------------------------------------------- drawing model (shared by PDF and PNG)
class Page:
    def __init__(self):
        self.items: list[tuple] = []

    def text(self, x, y, s, size=9.5, bold=False, gray=0.0, align='left'):
        self.items.append(('text', x, y, s, size, bold, gray, align))

    def line(self, x1, y1, x2, y2, width=0.6, gray=0.0):
        self.items.append(('line', x1, y1, x2, y2, width, gray))

    def box(self, x, y, w, h, fill=0.93):
        self.items.append(('box', x, y, w, h, fill))

    def watermark(self, s='SAMPLE'):
        self.items.append(('watermark', s))


def text_width(s: str, size: float, bold: bool) -> float:
    # Helvetica is close to 0.5em per character on average; good enough for right-aligning numbers.
    return len(s) * size * (0.55 if bold else 0.5)


# ---------------------------------------------------------------- tiny PDF writer (Helvetica, text + lines)
def pdf_escape(s: str) -> str:
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def write_pdf(path: str, pages: list[Page], title: str):
    objects: list[bytes] = []

    def add(obj: bytes) -> int:
        objects.append(obj)
        return len(objects)

    font_regular = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    font_bold = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    pages_index = add(b'')  # filled in below
    page_ids = []
    for page in pages:
        ops = []
        for item in page.items:
            kind = item[0]
            if kind == 'box':
                _, x, y, w, h, fill = item
                ops.append(f'q {fill:.2f} g {x:.1f} {y:.1f} {w:.1f} {h:.1f} re f Q')
            elif kind == 'line':
                _, x1, y1, x2, y2, width, gray = item
                ops.append(f'q {gray:.2f} G {width:.2f} w {x1:.1f} {y1:.1f} m {x2:.1f} {y2:.1f} l S Q')
            elif kind == 'watermark':
                _, s = item
                ops.append(f'q 0.90 g BT /F2 64 Tf 0.766 0.643 -0.643 0.766 150 230 Tm ({pdf_escape(s)}) Tj ET Q')
        for item in page.items:
            if item[0] != 'text':
                continue
            _, x, y, s, size, bold, gray, align = item
            if align == 'right':
                x -= text_width(s, size, bold)
            elif align == 'center':
                x -= text_width(s, size, bold) / 2
            ops.append(f'BT /{"F2" if bold else "F1"} {size} Tf {gray:.2f} g 1 0 0 1 {x:.1f} {y:.1f} Tm ({pdf_escape(s)}) Tj ET')
        stream = zlib.compress('\n'.join(ops).encode('cp1252', errors='replace'))
        content = add(b'<< /Length %d /Filter /FlateDecode >>\nstream\n' % len(stream) + stream + b'\nendstream')
        page_ids.append(
            add(
                (
                    f'<< /Type /Page /Parent {pages_index} 0 R /MediaBox [0 0 {W} {H}] '
                    f'/Resources << /Font << /F1 {font_regular} 0 R /F2 {font_bold} 0 R >> >> /Contents {content} 0 R >>'
                ).encode()
            )
        )
    objects[pages_index - 1] = f'<< /Type /Pages /Kids [{" ".join(f"{i} 0 R" for i in page_ids)}] /Count {len(page_ids)} >>'.encode()
    info = add(f'<< /Title ({pdf_escape(title)}) /Subject ({NOTICE}) /Creator (ScholarScope sample generator) >>'.encode())
    catalog = add(f'<< /Type /Catalog /Pages {pages_index} 0 R >>'.encode())

    out = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f'{i} 0 obj\n'.encode() + obj + b'\nendobj\n'
    xref = len(out)
    out += f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode()
    for off in offsets:
        out += f'{off:010d} 00000 n \n'.encode()
    out += f'trailer\n<< /Size {len(objects) + 1} /Root {catalog} 0 R /Info {info} 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    with open(path, 'wb') as f:
        f.write(out)


# ---------------------------------------------------------------- PNG "scan" (Pillow)
def write_scan(path: str, page: Page):
    from PIL import Image, ImageDraw, ImageFilter, ImageFont

    scale = 2.4
    img = Image.new('L', (int(W * scale), int(H * scale)), 250)
    draw = ImageDraw.Draw(img)

    def font(size, bold):
        candidates = (
            ['arialbd.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf', 'LiberationSans-Bold.ttf']
            if bold
            else ['arial.ttf', 'Arial.ttf', 'DejaVuSans.ttf', 'LiberationSans-Regular.ttf']
        )
        for name in candidates:
            for folder in ['C:/Windows/Fonts', '/Library/Fonts', '/System/Library/Fonts/Supplemental', '/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/truetype/liberation', '']:
                try:
                    return ImageFont.truetype(os.path.join(folder, name) if folder else name, int(size * scale))
                except OSError:
                    continue
        return ImageFont.load_default()

    flip = lambda y: (H - y) * scale  # noqa: E731  (PDF y grows upward)
    for item in page.items:
        kind = item[0]
        if kind == 'box':
            _, x, y, w, h, fill = item
            draw.rectangle([x * scale, flip(y + h), (x + w) * scale, flip(y)], fill=int(fill * 255))
        elif kind == 'line':
            _, x1, y1, x2, y2, width, gray = item
            draw.line([x1 * scale, flip(y1), x2 * scale, flip(y2)], fill=int(gray * 255), width=max(1, int(width * scale)))
        elif kind == 'text':
            _, x, y, s, size, bold, gray, align = item
            f = font(size, bold)
            tw = draw.textlength(s, font=f) / scale
            if align == 'right':
                x -= tw
            elif align == 'center':
                x -= tw / 2
            draw.text((x * scale, flip(y) - size * scale * 0.85), s, fill=int(gray * 255), font=f)
        elif kind == 'watermark':
            mark = Image.new('L', img.size, 0)
            ImageDraw.Draw(mark).text((img.size[0] * 0.18, img.size[1] * 0.45), item[1], fill=40, font=font(64, True))
            mark = mark.rotate(40, center=(img.size[0] / 2, img.size[1] / 2))
            img.paste(Image.new('L', img.size, 205), mask=mark)
    # Look like a scan: slight tilt, soft focus, paper noise.
    img = img.rotate(-0.7, resample=Image.BICUBIC, fillcolor=245).filter(ImageFilter.GaussianBlur(0.6))
    rnd = random.Random(7)
    px = img.load()
    for _ in range(int(img.size[0] * img.size[1] * 0.004)):
        x, y = rnd.randrange(img.size[0]), rnd.randrange(img.size[1])
        px[x, y] = max(0, px[x, y] - rnd.randrange(40, 120))
    img.save(path, optimize=True)


# ---------------------------------------------------------------- document builders
def footer(p: Page, n=1, of=1):
    p.line(40, 46, W - 40, 46, 0.4, 0.5)
    p.text(W / 2, 34, NOTICE, 7, True, 0.35, 'center')
    p.text(W - 40, 22, f'Page {n} of {of}', 7, False, 0.4, 'right')
    p.watermark()


def letterhead(p: Page, name: str, lines: list[str], title: str, subtitle: str | None = None):
    p.text(W / 2, H - 52, name, 15, True, 0.1, 'center')
    for i, l in enumerate(lines):
        p.text(W / 2, H - 67 - i * 11, l, 8.5, False, 0.3, 'center')
    y = H - 72 - len(lines) * 11
    p.line(40, y, W - 40, y, 1.2, 0.2)
    p.text(W / 2, y - 22, title, 13, True, 0.0, 'center')
    if subtitle:
        p.text(W / 2, y - 36, subtitle, 8.5, True, 0.25, 'center')
    return y - (50 if subtitle else 38)


def field_block(p: Page, y: float, pairs: list[tuple[str, str]], cols=2):
    col_w = (W - 80) / cols
    for i, (k, v) in enumerate(pairs):
        cx = 40 + (i % cols) * col_w
        cy = y - (i // cols) * 14
        p.text(cx, cy, f'{k}:', 8.5, True, 0.25)
        p.text(cx + 95, cy, v, 8.5)
    return y - ((len(pairs) + cols - 1) // cols) * 14 - 8


def course_table(p: Page, y: float, heading: str, rows: list[tuple[str, str, str, str]], headers=('Course', 'Credits', 'Grade', 'Points')):
    p.box(40, y - 4, W - 80, 14, 0.88)
    p.text(44, y, heading, 8.5, True)
    y -= 15
    xs = [44, 392, 462, 552]
    for i, h in enumerate(headers):
        p.text(xs[i], y, h, 7.5, True, 0.3, 'left' if i == 0 else 'right')
    p.line(40, y - 4, W - 40, y - 4, 0.4, 0.6)
    y -= 13
    for row in rows:
        for i, cell in enumerate(row):
            p.text(xs[i], y, cell, 8.5, False, 0.0, 'left' if i == 0 else 'right')
        y -= 11.5
    return y - 6


def hs_transcript(name='Test Student', gpa='3.62', official=True, low=False):
    p = Page()
    y = letterhead(
        p,
        'Maplewood Ridge High School',
        ['1400 Larkspur Avenue, Brookhaven Falls, Fictional County', 'Office of the Registrar  |  records@maplewood-ridge.example'],
        'OFFICIAL TRANSCRIPT' if official else 'UNOFFICIAL TRANSCRIPT',
        None if official else 'UNOFFICIAL COPY - NOT VALID FOR ADMISSION OR SCHOLARSHIP PURPOSES',
    )
    y = field_block(
        p,
        y,
        [
            ('Student', name),
            ('Date of issue', '2026-06-30'),
            ('Program', 'College Preparatory Diploma'),
            ('Dates attended', 'Aug 2022 - Jun 2026'),
            ('Graduation', 'June 2026'),
            ('Class rank', '41 of 312'),
        ],
    )
    grades = (
        [('Grade 9 - 2022-2023', [('English 9', '1.0', 'B', '3.0'), ('Algebra I', '1.0', 'C+', '2.3'), ('Biology', '1.0', 'B-', '2.7'), ('World History', '1.0', 'B', '3.0'), ('Spanish I', '1.0', 'C', '2.0')]),
         ('Grade 10 - 2023-2024', [('English 10', '1.0', 'C+', '2.3'), ('Geometry', '1.0', 'B-', '2.7'), ('Chemistry', '1.0', 'C', '2.0'), ('US History', '1.0', 'B', '3.0'), ('Spanish II', '1.0', 'C+', '2.3')]),
         ('Grade 11 - 2024-2025', [('English 11', '1.0', 'B-', '2.7'), ('Algebra II', '1.0', 'C', '2.0'), ('Physics', '1.0', 'C+', '2.3'), ('Economics', '0.5', 'B', '3.0'), ('Art Studio', '1.0', 'A-', '3.7')]),
         ('Grade 12 - 2025-2026', [('English 12', '1.0', 'B-', '2.7'), ('Statistics', '1.0', 'C+', '2.3'), ('Environmental Science', '1.0', 'B-', '2.7'), ('Government', '0.5', 'B', '3.0')])]
        if low
        else [('Grade 9 - 2022-2023', [('English 9 Honors', '1.0', 'A-', '3.7'), ('Algebra I', '1.0', 'A', '4.0'), ('Biology', '1.0', 'B+', '3.3'), ('World History', '1.0', 'A-', '3.7'), ('Spanish I', '1.0', 'B+', '3.3')]),
              ('Grade 10 - 2023-2024', [('English 10 Honors', '1.0', 'B+', '3.3'), ('Geometry', '1.0', 'A-', '3.7'), ('Chemistry', '1.0', 'B', '3.0'), ('US History', '1.0', 'A', '4.0'), ('Spanish II', '1.0', 'A-', '3.7')]),
              ('Grade 11 - 2024-2025', [('AP English Language', '1.0', 'B+', '3.3'), ('Algebra II', '1.0', 'A-', '3.7'), ('AP Biology', '1.0', 'B+', '3.3'), ('Economics', '0.5', 'A', '4.0'), ('Spanish III', '1.0', 'A-', '3.7')]),
              ('Grade 12 - 2025-2026', [('AP Literature', '1.0', 'A-', '3.7'), ('AP Calculus AB', '1.0', 'B+', '3.3'), ('AP Environmental Science', '1.0', 'A', '4.0'), ('Government', '0.5', 'A', '4.0')])]
    )
    for heading, rows in grades:
        y = course_table(p, y, heading, rows)
    p.line(40, y + 2, W - 40, y + 2, 0.8, 0.2)
    p.text(44, y - 12, 'Total credits earned: 23.0', 9, True)
    p.text(W - 44, y - 12, f'Cumulative GPA: {gpa} / 4.00 (unweighted)', 9, True, 0.0, 'right')
    p.text(44, y - 28, 'Grading scale: A = 4.0, A- = 3.7, B+ = 3.3, B = 3.0, B- = 2.7, C+ = 2.3, C = 2.0, D = 1.0, F = 0', 7.5, False, 0.3)
    p.line(360, 96, W - 40, 96, 0.6)
    p.text(360, 84, 'Registrar signature', 7.5, False, 0.4)
    p.text(360, 106, 'E. Harrow (fictional)', 9, False, 0.15)
    footer(p)
    return p


def university_transcript():
    p = Page()
    y = letterhead(
        p,
        'Northfield State University',
        ['Office of the University Registrar  |  200 College Green, Northfield, Fictional State'],
        'ACADEMIC TRANSCRIPT',
        'Issued to the student. Valid only with the registrar seal.',
    )
    y = field_block(
        p,
        y,
        [
            ('Name', 'Ana Lucia Perez'),
            ('Date of issue', '2026-07-15'),
            ('Degree program', 'Bachelor of Science, Biology'),
            ('Admitted', 'Fall 2023'),
            ('Minor', 'Data Science'),
            ('Standing', 'Good standing'),
        ],
    )
    terms = [
        ('Fall 2023', [('BIO 110  Principles of Biology', '4', 'A', '16.0'), ('CHM 111  General Chemistry I', '4', 'B+', '13.2'), ('MTH 151  Calculus I', '4', 'A-', '14.8'), ('ENG 101  Academic Writing', '3', 'A', '12.0')]),
        ('Spring 2024', [('BIO 120  Organisms and Ecology', '4', 'B+', '13.2'), ('CHM 112  General Chemistry II', '4', 'B', '12.0'), ('STA 210  Statistics for Scientists', '3', 'A', '12.0'), ('HIS 105  World Civilizations', '3', 'A-', '11.1')]),
        ('Fall 2024', [('BIO 230  Genetics', '4', 'B+', '13.2'), ('CHM 241  Organic Chemistry I', '4', 'B', '12.0'), ('DSC 201  Programming for Data', '3', 'A', '12.0'), ('PHL 140  Ethics', '3', 'A', '12.0')]),
        ('Spring 2025', [('BIO 310  Cell Biology', '4', 'A-', '14.8'), ('CHM 242  Organic Chemistry II', '4', 'B-', '10.8'), ('DSC 260  Machine Learning Basics', '3', 'A-', '11.1'), ('SPA 201  Intermediate Spanish', '3', 'B+', '9.9')]),
    ]
    for term, rows in terms:
        y = course_table(p, y, term, rows, ('Course', 'Credits', 'Grade', 'Quality pts'))
    p.line(40, y + 2, W - 40, y + 2, 0.8, 0.2)
    p.text(44, y - 12, 'Credits attempted: 56   Credits earned: 56', 9, True)
    p.text(W - 44, y - 12, 'Cumulative GPA: 3.48 / 4.00', 9, True, 0.0, 'right')
    p.line(360, 96, W - 40, 96, 0.6)
    p.text(360, 84, 'University Registrar (signature and seal)', 7.5, False, 0.4)
    p.text(360, 106, 'M. Okonkwo-Hale (fictional)', 9, False, 0.15)
    footer(p)
    return p


def percentage_transcript():
    p = Page()
    y = letterhead(
        p,
        'Lakeshore International College',
        ['Examinations Office  |  12 Harbour Road, Lakeshore, Fictional Province'],
        'STATEMENT OF MARKS AND TRANSCRIPT',
        'Higher Secondary Programme',
    )
    y = field_block(p, y, [('Student', 'Test Student'), ('Issued on', '2026-05-20'), ('Programme', 'Higher Secondary (Science)'), ('Session', '2024-2026')])
    rows = [('Physics', '100', '88', 'A'), ('Chemistry', '100', '82', 'A'), ('Mathematics', '100', '91', 'A+'), ('Biology', '100', '79', 'B+'), ('English', '100', '86', 'A'), ('Computer Science', '100', '86', 'A')]
    y = course_table(p, y, 'Final examination results', rows, ('Subject', 'Max marks', 'Marks', 'Grade'))
    p.line(40, y + 2, W - 40, y + 2, 0.8, 0.2)
    p.text(44, y - 12, 'Total: 512 / 600', 9, True)
    p.text(W - 44, y - 12, 'Overall percentage: 85.4 / 100', 9, True, 0.0, 'right')
    p.text(44, y - 28, 'Marks are percentages. 80-100 = A or A+, 70-79 = B+, 60-69 = B, 50-59 = C, below 40 = fail.', 7.5, False, 0.3)
    p.line(360, 96, W - 40, 96, 0.6)
    p.text(360, 84, 'Controller of Examinations', 7.5, False, 0.4)
    footer(p)
    return p


def exam_certificate():
    p = Page()
    y = letterhead(
        p,
        'Northern Examinations Council',
        ['International Secondary Certificate  |  Fictional exam board'],
        'CERTIFICATE AND STATEMENT OF RESULTS',
        'International Secondary Certificate (ISC) - June 2024 series',
    )
    y = field_block(p, y, [('Candidate', 'Test Student'), ('Centre', 'Maplewood Ridge High School'), ('Series', 'June 2024'), ('Date of issue', '2024-08-22')])
    rows = [('Mathematics', '', 'A*', ''), ('English Language', '', 'A', ''), ('Physics', '', 'A', ''), ('Chemistry', '', 'B', ''), ('Geography', '', 'A', '')]
    y = course_table(p, y, 'Subjects awarded', rows, ('Subject', '', 'Grade', ''))
    p.text(44, y - 8, 'This certifies that the candidate named above was awarded the International Secondary Certificate.', 9)
    p.line(360, 96, W - 40, 96, 0.6)
    p.text(360, 84, 'Chief Executive, Northern Examinations Council', 7.5, False, 0.4)
    footer(p)
    return p


def ml_results_table():
    p = Page()
    p.text(40, H - 60, 'Experiment 4: Model comparison on the held-out test set', 14, True)
    p.text(40, H - 78, 'Project: sentiment classifier for product reviews  |  Run date: 2026-03-02  |  Seed: 1234', 8.5, False, 0.3)
    headers = ('Model', 'Accuracy', 'F1 score', 'AUC')
    rows = [
        ('Logistic regression (TF-IDF)', '0.842', '0.836', '0.912'),
        ('Linear SVM (TF-IDF)', '0.857', '0.851', '0.921'),
        ('Random forest (500 trees)', '0.811', '0.802', '0.889'),
        ('Gradient boosting (XGBoost)', '0.866', '0.861', '0.934'),
        ('BiLSTM (GloVe 300d)', '0.881', '0.878', '0.947'),
        ('DistilBERT fine-tuned', '0.923', '0.921', '0.975'),
        ('RoBERTa-base fine-tuned', '0.931', '0.929', '0.981'),
    ]
    y = course_table(p, H - 110, 'Results (mean of 5 runs)', rows, headers)
    p.text(40, y - 6, 'Best model: RoBERTa-base (A/B test grade: A). Training time and parameter counts in appendix B.', 9)
    p.text(40, y - 22, 'Grades for the course project are not shown here; see the course page.', 9)
    footer(p)
    return p


def timetable():
    p = Page()
    y = letterhead(p, 'Maplewood Ridge High School', ['Student services  |  Fictional'], 'CLASS TIMETABLE - FALL 2025', 'Grade 12, Homeroom 12C')
    y = field_block(p, y, [('Student', 'Test Student'), ('Printed', '2025-08-20')])
    rows = [('AP Literature  -  Room 214', 'Mon/Wed', '08:10', '09:30'), ('AP Calculus AB  -  Room 108', 'Mon/Wed', '09:40', '11:00'), ('AP Environmental Science  -  Lab 3', 'Tue/Thu', '08:10', '09:30'), ('Government  -  Room 121', 'Tue/Thu', '09:40', '11:00'), ('Physical Education  -  Gym', 'Fri', '08:10', '09:30')]
    course_table(p, y, 'Weekly schedule', rows, ('Course and room', 'Days', 'Starts', 'Ends'))
    footer(p)
    return p


DOCUMENTS = [
    ('transcript-high-school-test-student.pdf', lambda: hs_transcript(), 'Maplewood Ridge transcript'),
    ('transcript-university-ana-lucia-perez.pdf', university_transcript, 'Northfield State transcript'),
    ('transcript-unofficial-test-student.pdf', lambda: hs_transcript(gpa='3.10', official=False), 'Unofficial transcript'),
    ('transcript-percentage-scale-test-student.pdf', percentage_transcript, 'Lakeshore statement of marks'),
    ('transcript-low-gpa-test-student.pdf', lambda: hs_transcript(gpa='2.40', low=True), 'Maplewood Ridge transcript (low GPA)'),
    ('not-a-transcript-ml-results-table.pdf', ml_results_table, 'Model comparison'),
    ('not-a-transcript-exam-certificate.pdf', exam_certificate, 'Exam certificate'),
    ('not-a-transcript-class-timetable.pdf', timetable, 'Class timetable'),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, build, title in DOCUMENTS:
        write_pdf(os.path.join(OUT, name), [build()], f'{title} ({NOTICE})')
        print('wrote', name)
    try:
        write_scan(os.path.join(OUT, 'transcript-scanned-test-student.png'), hs_transcript())
        print('wrote transcript-scanned-test-student.png')
    except ImportError:
        print('skipped the PNG scan (pip install pillow to make it)')


if __name__ == '__main__':
    main()
