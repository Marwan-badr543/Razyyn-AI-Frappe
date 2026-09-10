# -*- coding: utf-8 -*-
# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""Documents to test the reader with, built rather than checked in.

Built, because a checked-in photograph proves only that the reader still handles
that one photograph. These are generated from text the test also asserts on, so
the test says what the document contains and then checks the reader agrees.
"""

from __future__ import annotations

import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

#: An English invoice as a supplier would print one.
ENGLISH_INVOICE_LINES = [
	"ACME TRADING LLC",
	"Supplier Invoice",
	"Invoice No: INV-2026-0087",
	"Date: 09/09/2026",
	"Description: Office chairs x 4",
	"Subtotal: 4,000.00 EGP",
	"VAT 14%: 560.00 EGP",
	"Total Due: 4,560.00 EGP",
]

#: The same document as an Arabic-speaking practice receives it.
ARABIC_INVOICE_LINES = [
	"شركة النور للتجارة",
	"فاتورة مشتريات",
	"رقم الفاتورة: 2026-0087",
	"الاجمالي: 4560.00 جنيه",
]

_LATIN_FONTS = (
	"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
	"/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
)
_ARABIC_FONTS = (
	"/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
	"/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
)


def _font(candidates, size: int):
	for path in candidates:
		if os.path.exists(path):
			return ImageFont.truetype(path, size)
	return None


def latin_font_available() -> bool:
	return _font(_LATIN_FONTS, 20) is not None


def arabic_font_available() -> bool:
	return _font(_ARABIC_FONTS, 20) is not None


def document_image(path: str, lines, *, arabic: bool = False, width: int = 1000):
	"""A picture of a printed document, as a scanner or a phone would produce."""
	font = _font(_ARABIC_FONTS if arabic else _LATIN_FONTS, 30)
	height = 80 + 60 * len(lines)
	image = Image.new("RGB", (width, height), "white")
	draw = ImageDraw.Draw(image)

	y = 40
	for line in lines:
		if arabic:
			draw.text((width - 50, y), line, fill="black", font=font, anchor="ra")
		else:
			draw.text((50, y), line, fill="black", font=font)
		y += 60

	image.save(path)
	return path


def picture_with_no_document(path: str):
	"""A photograph that is not a document: colour, shape, and no words at all."""
	image = Image.new("RGB", (900, 600), (200, 215, 235))
	draw = ImageDraw.Draw(image)
	for x in range(0, 900, 40):
		draw.line([(x, 0), (x - 200, 600)], fill=(180, 200, 225), width=6)
	draw.ellipse([300, 180, 600, 420], fill=(150, 180, 220))
	image.save(path)
	return path


def pdf_of_pictures(path: str, image_paths):
	"""A PDF that is nothing but scanned pages — no text layer at all."""
	# Pillow registers its format plugins lazily, and its PDF writer reaches
	# into the registry directly instead of triggering that registration — so on
	# Pillow 12 the first PDF written in a process fails with a bare KeyError for
	# a format the library certainly supports. Asking for registration up front
	# costs nothing and is not version-dependent.
	Image.init()

	pages = [Image.open(p).convert("RGB") for p in image_paths]
	try:
		pages[0].save(path, save_all=True, append_images=pages[1:])
	finally:
		for page in pages:
			page.close()
	return path


def pdf_of_text(path: str, lines):
	"""A PDF that carries its own text, as an accounting system generates one.

	Written by hand rather than with a PDF library: the file is a few hundred
	bytes, the structure is fixed, and it saves the app a dependency it would
	need only for this test.
	"""
	content = "BT /F1 14 Tf 60 760 Td 18 TL\n"
	for line in lines:
		escaped = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
		content += f"({escaped}) Tj T*\n"
	content += "ET"
	stream = content.encode("latin-1")

	objects = [
		b"<< /Type /Catalog /Pages 2 0 R >>",
		b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
		b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
		b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
		b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	]

	out = bytearray(b"%PDF-1.4\n")
	offsets = []
	for number, body in enumerate(objects, start=1):
		offsets.append(len(out))
		out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"

	start_of_xref = len(out)
	out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
	for offset in offsets:
		out += f"{offset:010d} 00000 n \n".encode()
	out += (
		f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
		f"startxref\n{start_of_xref}\n%%EOF\n"
	).encode()

	with open(path, "wb") as handle:
		handle.write(bytes(out))
	return path


def joined_pdf(path: str, sources):
	"""One PDF made of several — how a mixed document actually arises."""
	subprocess.run(["pdfunite", *sources, path], check=True, capture_output=True)
	return path
