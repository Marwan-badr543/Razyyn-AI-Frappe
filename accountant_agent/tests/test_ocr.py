# -*- coding: utf-8 -*-
# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""Reading photographed and scanned documents, and what then travels to the agent.

Every test is named after the thing that must keep working, and the documents it
reads are built here from text the test also asserts on — so the test states what
the invoice says and then checks the reader agrees.

    cd ~/frappe/frappe-bench-v14 && bench --site v14.local run-tests \\
        --module accountant_agent.tests.test_ocr
"""

from __future__ import annotations

import os
import shutil
import types
import tempfile
import unittest
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from accountant_agent import ocr
from accountant_agent.tests import fixtures


class TestReadingDocuments(FrappeTestCase):
	"""The reader itself: what it recovers, and what it refuses to invent."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.workspace = tempfile.mkdtemp(prefix="accountant-agent-ocr-")

	@classmethod
	def tearDownClass(cls):
		shutil.rmtree(cls.workspace, ignore_errors=True)
		super().tearDownClass()

	def _path(self, name: str) -> str:
		return os.path.join(self.workspace, name)

	# ── Pictures ─────────────────────────────────────────────────────────────

	def test_a_photographed_invoice_gives_up_its_figures(self):
		"""The whole point: an accountant photographs an invoice and asks for it
		to be entered. If the figures do not survive the reading, nothing else
		in this feature is worth having.
		"""
		if not fixtures.latin_font_available():
			self.skipTest("no Latin font on this machine to print a test invoice with")

		path = fixtures.document_image(
			self._path("invoice_en.png"), fixtures.ENGLISH_INVOICE_LINES,
		)

		text = ocr._read_image_file(path)

		self.assertIn("INV-2026-0087", text)
		self.assertIn("4,560.00", text)
		self.assertIn("ACME", text.upper())

	def test_a_picture_with_no_document_in_it_yields_nothing(self):
		"""A photograph of a wall must not become a page of invented words.

		The reader always returns SOMETHING for any picture — a few stray marks
		read as punctuation and the odd letter. Passing that on as a document
		would be worse than passing nothing: the agent would try to book it. The
		test that separates the two is how sure the reader is, not how much it
		produced, because a small receipt is short too.
		"""
		path = fixtures.picture_with_no_document(self._path("wall.png"))

		self.assertEqual(ocr._read_image_file(path), "")

	def test_an_arabic_invoice_is_read(self):
		"""Half this product's documents are in Arabic.

		Tesseract is given both alphabets rather than asked to guess, which is
		what `eng+ara` in the app's configuration means.
		"""
		if not fixtures.arabic_font_available():
			self.skipTest("no Arabic font on this machine to print a test invoice with")

		path = fixtures.document_image(
			self._path("invoice_ar.png"), fixtures.ARABIC_INVOICE_LINES, arabic=True,
		)

		text = ocr._read_image_file(path)

		self.assertTrue(text, "an Arabic invoice was read as having no words in it")
		self.assertIn("4560", text.replace(",", "").replace(" ", ""))

	def test_a_small_picture_is_still_read(self):
		"""A receipt photographed small has letters a few pixels tall.

		The reader needs about ten pixels of height per letter, so a small
		picture is enlarged before it is read. Without that step this document
		comes back as noise, which the confidence test then correctly discards —
		and the customer is told their receipt has no words in it.
		"""
		if not fixtures.latin_font_available():
			self.skipTest("no Latin font on this machine to print a test receipt with")

		path = fixtures.document_image(
			self._path("small_receipt.png"),
			["Total Due: 4,560.00 EGP", "Invoice No: INV-2026-0087"],
			width=520,
		)

		self.assertIn("4,560.00", ocr._read_image_file(path))

	# ── PDFs ─────────────────────────────────────────────────────────────────

	def test_a_pdf_of_scanned_pages_is_read_page_by_page(self):
		"""A scan arrives as a PDF wrapped around photographs, with no text in it."""
		if not fixtures.latin_font_available():
			self.skipTest("no Latin font on this machine to print a test invoice with")

		first = fixtures.document_image(
			self._path("page1.png"), fixtures.ENGLISH_INVOICE_LINES,
		)
		second = fixtures.document_image(
			self._path("page2.png"),
			["Delivery Note DN-2026-0044", "Received by: M. Badr", "Quantity: 4 chairs"],
		)
		pdf = fixtures.pdf_of_pictures(self._path("scanned.pdf"), [first, second])

		text = ocr.read_pdf_text(pdf)

		# Each page under its own heading, and told how many there are: a stack
		# of invoices scanned into one file is a stack of separate documents,
		# and a wall of text with no divisions invites two of them to be read
		# as one.
		self.assertIn("--- Page 1 of 2 ---", text)
		self.assertIn("--- Page 2 of 2 ---", text)
		self.assertIn("INV-2026-0087", text)
		self.assertIn("DN-2026-0044", text)

	def test_a_pdf_that_already_carries_its_text_is_sent_as_it_is(self):
		"""Reading a typed PDF as a picture would lose its layout and gain nothing.

		An empty result here means "send the original file", which keeps the
		document's own columns and tables intact for the desk that reads it.
		"""
		pdf = fixtures.pdf_of_text(
			self._path("typed.pdf"),
			[
				"ACME TRADING LLC - Statement of Account",
				"Invoice INV-2026-0087 dated 09/09/2026",
				"Total due 4,560.00 EGP including VAT at 14 percent",
			],
		)

		self.assertEqual(ocr.read_pdf_text(pdf), "")

	def test_a_mixed_pdf_reads_only_the_page_that_is_a_picture(self):
		"""Accounting PDFs are routinely part typed and part scanned.

		A generated invoice with a scanned receipt stapled to the back. Judging
		the whole document by its first page either puts forty typed pages
		through a reader they do not need, or skips the one page that was a
		photograph — which is the page the customer sent it for.
		"""
		if not fixtures.latin_font_available():
			self.skipTest("no Latin font on this machine to print a test invoice with")

		typed = fixtures.pdf_of_text(
			self._path("mixed_typed.pdf"),
			[
				"ACME TRADING LLC - Statement of Account",
				"Please find the supporting receipt attached overleaf.",
			],
		)
		scan = fixtures.pdf_of_pictures(
			self._path("mixed_scan.pdf"),
			[fixtures.document_image(
				self._path("mixed_page.png"), fixtures.ENGLISH_INVOICE_LINES,
			)],
		)
		pdf = fixtures.joined_pdf(self._path("mixed.pdf"), [typed, scan])

		with patch.object(ocr, "_render_page", wraps=ocr._render_page) as rendered:
			text = ocr.read_pdf_text(pdf)

		self.assertEqual(
			[call.args[1] for call in rendered.call_args_list], [2],
			"only the scanned page should have been read as a picture",
		)
		self.assertIn("Statement of Account", text)
		self.assertIn("INV-2026-0087", text)




class TestWhatTravelsToTheAgent(FrappeTestCase):
	"""The decision the whole feature exists to make, at the point it is made."""

	def setUp(self):
		from accountant_agent.accountant_agent.page.agent_chat import agent_chat

		self.agent_chat = agent_chat
		self.user = frappe.session.user
		self.upload_dir = agent_chat._upload_root(self.user)
		os.makedirs(self.upload_dir, exist_ok=True)
		self.written: list = []

	def tearDown(self):
		for path in self.written:
			for candidate in (path, ocr.text_path(path), ocr.skip_path(path)):
				try:
					os.remove(candidate)
				except OSError:
					pass

	def _upload(self, stored_name: str, content: bytes = b"x") -> tuple:
		"""Put a file where an upload would have put it, and give back its URL."""
		path = os.path.join(self.upload_dir, stored_name)
		with open(path, "wb") as handle:
			handle.write(content)
		self.written.append(path)
		url = f"{self.agent_chat._DOWNLOAD_ENDPOINT}?file_url=agent_uploads/{stored_name}"
		return path, url

	def _what_travels(self, urls, scan=True) -> list:
		"""(name, bytes) for each attachment, as the agent would receive them."""
		parts, handles = self.agent_chat.build_upload_parts(urls, self.user, scan=scan)
		try:
			return [(part[1][0], part[1][1].read()) for part in parts]
		finally:
			for handle in handles:
				handle.close()

	# ── What is sent ─────────────────────────────────────────────────────────

	def test_a_picture_with_words_travels_as_its_words(self):
		"""The picture stays on the customer's own server.

		What crosses the network is the text, under the document's own name —
		"receipt.txt", not "receipt.jpg.txt", which read as a mistake to
		everyone who saw it, the customer included.
		"""
		path, url = self._upload("aaaaaaaaaaaa_receipt.jpg")
		with open(ocr.text_path(path), "w", encoding="utf-8") as handle:
			handle.write("Total Due: 4,560.00 EGP")

		sent = self._what_travels([url])

		self.assertEqual([name for name, _ in sent], ["receipt.txt"])
		self.assertIn(b"4,560.00", sent[0][1])
		# The picture it was read from is named inside, so a desk can say which
		# document a figure came off.
		self.assertIn(b"receipt.jpg", sent[0][1])

	def test_two_documents_with_one_stem_keep_their_own_names(self):
		"""A photograph and a scan of the same invoice must not become one file."""
		first, first_url = self._upload("aaaaaaaaaaa1_invoice.png")
		second, second_url = self._upload("aaaaaaaaaaa2_invoice.jpg")
		for path in (first, second):
			with open(ocr.text_path(path), "w", encoding="utf-8") as handle:
				handle.write("some words")

		sent = self._what_travels([first_url, second_url])

		self.assertEqual([name for name, _ in sent], ["invoice.txt", "invoice (2).txt"])

	def test_a_picture_with_no_words_travels_as_the_picture(self):
		"""Nothing is ever dropped.

		A photograph the reader found no document in is still the customer's
		upload, and the model can look at it directly — which is exactly what
		happened before this feature existed.
		"""
		path, url = self._upload("bbbbbbbbbbbb_photo.png", b"raw-image-bytes")
		with open(ocr.skip_path(path), "w", encoding="utf-8") as handle:
			handle.write("")

		self.assertEqual(self._what_travels([url]), [("photo.png", b"raw-image-bytes")])

	def test_sending_never_waits_for_a_reading(self):
		"""A message that arrives as a picture beats a message that never arrives.

		By the time this runs the reading is finished — the same worker did it
		a moment ago. If there is no reading then it was never asked for, or it
		failed and said so; either way the file itself is what should be sent,
		and holding the message for it is how one dead worker used to cost a
		customer three minutes and then send the pictures anyway.
		"""
		path, url = self._upload("cccccccccccc_slow.png", b"raw-image-bytes")

		self.assertEqual(self._what_travels([url]), [("slow.png", b"raw-image-bytes")])

	def test_nothing_is_read_unless_the_customer_asked(self):
		""""Scan & Extract Data" off means the file travels exactly as it is.

		Reading a picture is right for a photographed invoice and wrong for a
		photograph the agent is meant to LOOK at — a whiteboard, a chart, a
		screenshot of an error. Only the person attaching it knows which, and
		with the switch off their answer is "look at it", even if a reading from
		an earlier message happens to be sitting beside the file.
		"""
		path, url = self._upload("dddddddddddd_chart.png", b"raw-image-bytes")
		with open(ocr.text_path(path), "w", encoding="utf-8") as handle:
			handle.write("some words the reader thought it saw")

		self.assertEqual(
			self._what_travels([url], scan=False), [("chart.png", b"raw-image-bytes")],
		)

	def test_a_scanner_tiff_arrives_as_something_the_service_can_read(self):
		"""A TIFF with no words in it used to be accepted here and refused there.

		The picker offered it, the upload took it, and the message failed. It is
		converted on the way out now — the customer never sees the format
		question at all.
		"""
		from PIL import Image

		with tempfile.TemporaryDirectory() as staging:
			drawn = fixtures.picture_with_no_document(os.path.join(staging, "scan.png"))
			tiff = os.path.join(staging, "scan.tif")
			with Image.open(drawn) as picture:
				picture.save(tiff, format="TIFF")
			with open(tiff, "rb") as handle:
				raw = handle.read()

		path, url = self._upload("hhhhhhhhhhhh_scan.tif", raw)
		with open(ocr.skip_path(path), "w", encoding="utf-8") as handle:
			handle.write("")

		name, body = self._what_travels([url])[0]

		self.assertEqual(name, "scan.tif.png")
		self.assertTrue(body.startswith(b"\x89PNG"))

	def test_a_spreadsheet_is_never_sent_for_reading(self):
		"""Only pictures and PDFs are read. A workbook already is its own data."""
		self.assertFalse(ocr.is_readable_document("ledger.xlsx"))
		self.assertFalse(ocr.is_readable_document("statement.csv"))
		self.assertTrue(ocr.is_readable_document("receipt.JPG"))
		self.assertTrue(ocr.is_readable_document("invoice.pdf"))

	# ── Who does the reading, and when ───────────────────────────────────────

	def test_uploading_a_file_reads_nothing(self):
		"""An upload is stored, and that is all.

		Reading here would hold an ERP web worker — the ones serving every other
		page of the ERP — for seconds per picture. It also read files that were
		then taken back out of the basket and never sent.
		"""
		class Chosen:
			filename = "receipt.jpg"

			def read(self):
				return b"raw-image-bytes"

		request = types.SimpleNamespace(files={"file": Chosen()})
		with patch.object(frappe, "request", request), \
				patch.object(frappe, "enqueue") as enqueued, \
				patch.object(ocr, "read_upload") as read:
			result = self.agent_chat.upload_agent_file()

		stored = self.agent_chat.resolve_agent_upload_path(result["file_url"], self.user)
		if stored:
			self.written.append(stored)

		enqueued.assert_not_called()
		read.assert_not_called()
		self.assertEqual(result["filename"], "receipt.jpg")

	def test_the_turn_reads_its_documents_before_it_sends_them(self):
		"""The seam the whole redesign rests on.

		One worker owns the turn: it reads the attachments, then sends them. If
		these two ever come apart — the send going first, or the reading landing
		on another queue — the pictures travel and the customer is told their
		invoice could not be read. Nothing about the code's shape proves that;
		only running the turn does.
		"""
		if not fixtures.latin_font_available():
			self.skipTest("no Latin font on this machine to print a test invoice with")

		with tempfile.TemporaryDirectory() as staging:
			drawn = fixtures.document_image(
				os.path.join(staging, "invoice.png"), fixtures.ENGLISH_INVOICE_LINES,
			)
			with open(drawn, "rb") as handle:
				path, url = self._upload("ffffffffffff_invoice.png", handle.read())

		sent: dict = {}

		def the_platform(agent_email, send):
			response = send({"Authorization": "Bearer test"})
			return response

		def capture(url, data=None, files=None, headers=None, **kwargs):
			sent["files"] = [(name, payload.read()) for _, (name, payload) in files or []]
			return types.SimpleNamespace(
				status_code=200, iter_lines=lambda **_: iter(()), close=lambda: None,
			)

		with patch.object(self.agent_chat, "get_agent_settings_doc",
					lambda email: types.SimpleNamespace(custom_instructions="")), \
				patch.object(self.agent_chat, "call_the_platform", the_platform), \
				patch.object(self.agent_chat.requests, "post", capture):
			self.agent_chat.process_agent_message_background(
				message="enter this invoice",
				session_id="reading-seam-session",
				agent_email="robot@example.com",
				agent_type="auto",
				file_urls=[url],
				user=self.user,
				scan=True,
			)

		self.assertEqual([name for name, _ in sent["files"]], ["invoice.txt"])
		self.assertIn(b"4,560.00", sent["files"][0][1])

	def test_a_document_already_read_is_not_read_again(self):
		"""The same attachment in a follow-up message costs nothing.

		A customer sends ten invoices, then asks a question about them. Reading
		them a second time would be a minute of work for an answer that is
		already written down beside the file.
		"""
		path, url = self._upload("nnnnnnnnnnnn_invoice.png")
		with open(ocr.text_path(path), "w", encoding="utf-8") as handle:
			handle.write("Total 100")

		with patch.object(ocr, "_read_image_file") as reader:
			self.agent_chat.read_the_attachments([url], self.user, "s1", self.user)

		reader.assert_not_called()

	# ── What the customer is shown while it happens ──────────────────────────

	def _progress_of(self, urls) -> list:
		"""Every progress line the chat would have been sent."""
		seen: list = []

		def watch(event=None, message=None, user=None, **kwargs):
			if event == self.agent_chat.SCAN_PROGRESS_EVENT:
				seen.append(message)

		with patch.object(frappe, "publish_realtime", watch):
			self.agent_chat.read_the_attachments(urls, self.user, "s1", self.user)
		return seen

	def test_the_chat_is_told_which_page_is_being_read(self):
		"""Because a customer who cannot tell "working" from "broken" waits once.

		A ten-page scan takes half a minute, and half a minute of three bouncing
		dots is indistinguishable from a product that has stopped.
		"""
		if not fixtures.latin_font_available():
			self.skipTest("no Latin font on this machine to print a test invoice with")

		with tempfile.TemporaryDirectory() as staging:
			pdf = fixtures.pdf_of_pictures(
				os.path.join(staging, "scan.pdf"),
				[fixtures.document_image(
					os.path.join(staging, "page.png"), fixtures.ENGLISH_INVOICE_LINES,
				)],
			)
			with open(pdf, "rb") as handle:
				path, url = self._upload("pppppppppppp_scan.pdf", handle.read())

		seen = self._progress_of([url])

		self.assertTrue(seen, "the chat was told nothing at all")
		self.assertEqual(seen[0]["filename"], "scan.pdf")
		self.assertEqual(seen[0]["files"], 1)
		self.assertEqual(seen[-1], {"session_id": "s1", "finished": True})
		self.assertTrue(any(line.get("page") for line in seen[:-1]))

	def test_a_typed_pdf_is_not_announced_at_all(self):
		"""It says nothing about work it is not doing.

		A PDF that already carries its own text needs no reading. Announcing it
		anyway told a customer their typed invoice was being scanned, and then
		that it had no words in it — about a document made entirely of words.
		"""
		if not fixtures.latin_font_available():
			self.skipTest("no Latin font on this machine to print a test invoice with")

		with tempfile.TemporaryDirectory() as staging:
			typed = fixtures.pdf_of_text(
				os.path.join(staging, "typed.pdf"),
				["ACME TRADING LLC - Statement of Account",
				 "Balance carried forward 12,400.00 EGP"],
			)
			with open(typed, "rb") as handle:
				path, url = self._upload("qqqqqqqqqqqq_typed.pdf", handle.read())

		self.assertEqual(self._progress_of([url]), [])
		self.assertEqual(self._what_travels([url]), [("typed.pdf", open(path, "rb").read())])

	def test_a_spreadsheet_is_not_announced_either(self):
		"""Nor anything else that was never going to be read."""
		_path, url = self._upload("rrrrrrrrrrrr_ledger.xlsx", b"not really a workbook")

		self.assertEqual(self._progress_of([url]), [])

	def test_the_bar_always_comes_down(self):
		"""Even when the reading fails.

		A progress bar left in front of a customer for work that has stopped is
		worse than no bar at all: it is a product that looks like it is still
		trying.
		"""
		path, url = self._upload("ssssssssssss_broken.png", b"not a picture at all")

		seen = self._progress_of([url])

		self.assertEqual(seen[-1], {"session_id": "s1", "finished": True})
		self.assertTrue(os.path.exists(ocr.skip_path(path)))
		self.assertEqual(self._what_travels([url]),
						 [("broken.png", b"not a picture at all")])

	# ── stopping ─────────────────────────────────────────────────────────────

	def test_stopping_while_the_documents_are_read_stops_the_turn(self):
		"""Pressing stop used to be accepted and then ignored.

		The platform cancels a run it already knows about. While the documents
		are still being read there is no run yet — so the chat said "Cancelled",
		the reading carried on, the request went out, and an answer arrived for
		a question the customer had withdrawn.
		"""
		path, url = self._upload("tttttttttttt_invoice.png", b"raw-image-bytes")
		sent: dict = {"posted": False}

		def capture(url, data=None, files=None, headers=None, **kwargs):
			sent["posted"] = True
			return types.SimpleNamespace(
				status_code=200, iter_lines=lambda **_: iter(()), close=lambda: None,
			)

		self.agent_chat.remember_the_cancellation("stopped-session")
		self.addCleanup(
			lambda: self.agent_chat.forget_the_cancellation("stopped-session"),
		)
		try:
			with patch.object(self.agent_chat, "get_agent_settings_doc",
						lambda email: types.SimpleNamespace(custom_instructions="")), \
					patch.object(ocr, "read_upload") as read, \
					patch.object(self.agent_chat, "call_the_platform") as platform, \
					patch.object(self.agent_chat.requests, "post", capture):
				self.agent_chat.process_agent_message_background(
					message="enter this invoice",
					session_id="stopped-session",
					agent_email="robot@example.com",
					agent_type="auto",
					file_urls=[url],
					user=self.user,
					scan=True,
				)
		finally:
			pass

		read.assert_not_called()
		platform.assert_not_called()
		self.assertFalse(sent["posted"])

	def test_a_stop_belongs_to_the_turn_it_stopped(self):
		"""The next message must not inherit it.

		This product has had exactly this bug once already, in the run state: a
		flag that outlived its own turn ended the following one.
		"""
		self.agent_chat.remember_the_cancellation("s2")
		self.assertTrue(self.agent_chat.turn_was_cancelled("s2"))

		self.agent_chat.forget_the_cancellation("s2")

		self.assertFalse(self.agent_chat.turn_was_cancelled("s2"))

	def test_one_customer_cannot_have_another_customer_s_files_read(self):
		"""`file_url` arrives from the browser and is not a credential.

		Every attachment lives under a store keyed to the person who uploaded
		it, and the reading resolves through the same helper the download
		endpoint uses — so naming somebody else's upload reads nothing and says
		nothing about it.
		"""
		other_root = self.agent_chat._upload_root("somebody-else@example.com")
		os.makedirs(other_root, exist_ok=True)
		theirs = os.path.join(other_root, "oooooooooooo_private.jpg")
		with open(theirs, "wb") as handle:
			handle.write(b"not mine")
		self.addCleanup(lambda: os.remove(theirs))

		url = (f"{self.agent_chat._DOWNLOAD_ENDPOINT}"
			f"?file_url=agent_uploads/oooooooooooo_private.jpg")

		self.assertEqual(self._progress_of([url]), [])
		self.assertEqual(self._what_travels([url]), [])


if __name__ == "__main__":
	unittest.main()
