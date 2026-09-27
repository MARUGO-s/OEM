"""Create the printable Japanese user manual from its maintained Markdown source.

Run with the Codex bundled Python (reportlab and pypdf).
Only the named output PDF is written; application data and settings are untouched.
"""
from pathlib import Path
import re
from html import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/kotonoha-操作説明書.md"
OUTPUT = ROOT / "output/pdf/kotonoha-操作説明書.pdf"
FONT = Path("/Users/yoshito/Library/Fonts/ipaexg.ttf")
pdfmetrics.registerFont(TTFont("IPA", str(FONT)))
pdfmetrics.registerFontFamily("IPA", normal="IPA", bold="IPA", italic="IPA", boldItalic="IPA")
INK = colors.HexColor("#252934")
MUTED = colors.HexColor("#697082")
PURPLE = colors.HexColor("#6559b7")
PALE = colors.HexColor("#f2effa")
W, H = A4
LEFT = 19 * mm
WIDTH = W - 2 * LEFT

styles = {
    "body": ParagraphStyle("body", fontName="IPA", fontSize=10.1, leading=15.8, textColor=INK, wordWrap="CJK", spaceAfter=5),
    "title": ParagraphStyle("title", fontName="IPA", fontSize=23, leading=33, textColor=colors.black, wordWrap="CJK", spaceAfter=16, keepWithNext=True),
    "section": ParagraphStyle("section", fontName="IPA", fontSize=18.3, leading=28, textColor=colors.black, wordWrap="CJK", spaceAfter=11, keepWithNext=True),
    "heading": ParagraphStyle("heading", fontName="IPA", fontSize=12.4, leading=20, textColor=colors.black, wordWrap="CJK", spaceBefore=8, spaceAfter=4, keepWithNext=True),
    "bullet": ParagraphStyle("bullet", fontName="IPA", fontSize=10.1, leading=15.8, textColor=INK, wordWrap="CJK", leftIndent=11, firstLineIndent=-11, spaceAfter=5),
    "table": ParagraphStyle("table", fontName="IPA", fontSize=9.6, leading=14.8, textColor=INK, wordWrap="CJK"),
    "thead": ParagraphStyle("thead", fontName="IPA", fontSize=9.6, leading=15, textColor=colors.white, wordWrap="CJK"),
    "note": ParagraphStyle("note", fontName="IPA", fontSize=9.7, leading=16.3, textColor=INK, wordWrap="CJK"),
    "meta": ParagraphStyle("meta", fontName="IPA", fontSize=8.5, leading=14, textColor=MUTED, wordWrap="CJK", spaceAfter=9),
}

def inline(text):
    text=escape(text)
    return re.sub(r"\[([^\]]+)\]\((https://[^)]+)\)", lambda m:f'<link href="{m[2]}" color="#6559b7">{m[1]}</link>', text)

def paragraph(text, style="body"):
    return Paragraph(inline(text), styles[style])

def make_table(lines, page_index):
    rows=[[part.strip() for part in line.strip().strip("|").split("|")] for line in lines]
    rows=[row for row in rows if not all(re.fullmatch(r"[: -]+", c) for c in row)]
    first_width = 20*mm if page_index==0 else (51*mm if page_index==7 else 45*mm)
    data=[[paragraph(cell,"thead" if i==0 else "table") for cell in row] for i,row in enumerate(rows)]
    if page_index==0:
        for i,row in enumerate(rows[1:],1):
            data[i][0]=Paragraph(f'<link href="#p{row[0]}" color="#6559b7">{row[0]}</link>',styles["table"])
    table=Table(data,colWidths=[first_width,WIDTH-first_width],repeatRows=1,hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),colors.HexColor("#343b4b")),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#f7f8fb")]),
        ("GRID",(0,0),(-1,-1),.4,colors.HexColor("#d9dce4")),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("LEFTPADDING",(0,0),(-1,-1),9), ("RIGHTPADDING",(0,0),(-1,-1),9),
        ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5),
    ]))
    return [table,Spacer(1,6)]

def note(text):
    table=Table([[paragraph(text,"note")]],colWidths=[WIDTH])
    table.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1),PALE),
        ("BOX",(0,0),(-1,-1),.4,colors.HexColor("#e1dcf0")),
        ("LEFTPADDING",(0,0),(-1,-1),12), ("RIGHTPADDING",(0,0),(-1,-1),12),
        ("TOPPADDING",(0,0),(-1,-1),10), ("BOTTOMPADDING",(0,0),(-1,-1),10),
    ]))
    return [table,Spacer(1,6)]

def frame(canvas,doc):
    canvas.saveState()
    canvas.setFont("IPA",8)
    canvas.setFillColor(MUTED)
    canvas.drawString(LEFT,H-14*mm,"kotonoha  /  利用者向け操作説明書")
    canvas.drawRightString(W-LEFT,H-14*mm,"2026.09.24  第2版")
    canvas.setFont("IPA",8)
    canvas.drawString(LEFT,13*mm,"公開クラウド版  |  marugo-s.github.io/OEM/")
    canvas.drawRightString(W-LEFT,13*mm,f"{doc.page} / 8")
    canvas.restoreState()

blocks=SOURCE.read_text(encoding="utf-8").split("<!-- page -->")
story=[]
for page_index,block in enumerate(blocks):
    if page_index:story.append(PageBreak())
    lines=block.strip().splitlines();i=0
    while i<len(lines):
        line=lines[i].strip()
        if not line:i+=1;continue
        if line.startswith("|"):
            table_lines=[]
            while i<len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i]);i+=1
            story.extend(make_table(table_lines,page_index));continue
        if line.startswith("# "):
            story.append(paragraph(line[2:],"title" if page_index==0 else "section"))
        elif line.startswith("## "):
            story.append(paragraph(line[3:],"heading"))
        elif line.startswith("> "):
            story.extend(note(line[2:]))
        elif line.startswith("- "):
            story.append(paragraph("・"+line[2:],"bullet"))
        elif re.match(r"^\d+\. ",line):
            story.append(paragraph(line,"bullet"))
        elif line.startswith("第1版") or line.startswith("この説明書は"):
            story.append(paragraph(line,"meta"))
        else:story.append(paragraph(line))
        i+=1

OUTPUT.parent.mkdir(parents=True,exist_ok=True)
class ManualDoc(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable,Paragraph) and flowable.style.name in ('title','section'):
            key=f'p{self.page}'
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(flowable.getPlainText(),key,level=0)

doc=ManualDoc(str(OUTPUT),pagesize=A4,leftMargin=LEFT,rightMargin=LEFT,topMargin=23*mm,bottomMargin=23*mm,title="kotonoha 操作説明書",author="kotonoha",subject="録音と資料の取り込み 議事録編集 共有カレンダー",pageCompression=1)
doc.build(story,onFirstPage=frame,onLaterPages=frame)
reader=PdfReader(str(OUTPUT))
expected=["kotonoha 操作説明書","1 ログインと画面の見方","2 録音や会話を取り込む","3 会議資料を保存する","4 議事録を確認して編集する","5 カレンダーと予定の手動変更","6 共有と書き出しとデータの管理","7 困ったときと確認チェック"]
assert len(reader.pages)==len(expected),f"Expected 8 pages, got {len(reader.pages)}"
for index,(page,title) in enumerate(zip(reader.pages,expected),1):
    text=page.extract_text()
    assert title in text,f"Wrong heading on page {index}"
    assert '\ufffd' not in text,f"Replacement glyph on page {index}"
    print(f"Page {index}: {len(text)} characters - {title}")
print(f"Created {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")
