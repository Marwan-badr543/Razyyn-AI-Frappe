# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""Editing or recording a document must not change the date it is posted on.

WHAT HAPPENED

	A client asked the agent to swap the line item on a draft invoice raised the
	day before. Their system refused it: *"Due Date cannot be before Posting /
	Supplier Invoice Date"* — about an edit to a line item, naming two dates
	nobody had touched.

WHY

	The same defect `test_submit_keeps_its_date` documents, one path over.
	`save()` re-runs `validate()`, and this ERP's `validate_posting_time()`
	resets `posting_date` and `posting_time` to NOW whenever `set_posting_time`
	is clear. So a draft raised yesterday and edited today silently acquires
	today's date, while every date derived from the original stays where it was,
	and the document refuses itself.

	`insert()` runs the same validate, so a document RECORDED with a date the
	client named quietly lands on today's date instead — in a period that may
	already be closed. The pin was applied to submitting alone; it belongs on
	every write that validates.

No site is needed: `frappe.get_doc` and `frappe.logger` are stubbed, and the
stub document reproduces the re-dating behaviour described above.

RUN THEM FROM THE BENCH ROOT, not from the app directory:

	cd ~/frappe/my-bench && ./env/bin/python -m unittest \
		accountant_agent.agent_api.tests.test_a_change_keeps_its_date
"""

import unittest
from unittest import mock

import frappe

from accountant_agent.agent_api.db import agent_write_repository
from accountant_agent.agent_api.db.agent_write_repository import (
	insert_document,
	keep_the_documents_own_date,
	update_document,
)

RAISED_ON = "2026-09-16"
TODAY = "2026-09-17"


class _Meta:
	def __init__(self, fieldnames):
		self._fieldnames = set(fieldnames)

	def has_field(self, fieldname):
		return fieldname in self._fieldnames


class _Doc:
	"""A document that re-dates itself on save, exactly as this ERP does."""

	def __init__(self, fieldnames, posting_date=RAISED_ON, posting_time="09:00:00"):
		self.doctype = "Sales Invoice"
		self.name = "ACC-SINV-2026-00099"
		self.meta = _Meta(fieldnames)
		self.posting_date = posting_date
		self.posting_time = posting_time
		self.due_date = RAISED_ON
		self.set_posting_time = 0
		self.saved = False
		self.inserted = False

	def get(self, fieldname, default=None):
		return getattr(self, fieldname, default)

	def set(self, fieldname, value):
		setattr(self, fieldname, value)

	def update(self, values):
		for key, value in (values or {}).items():
			setattr(self, key, value)

	def _validate(self):
		# validate_posting_time(), in one line.
		if self.meta.has_field("set_posting_time") and not self.set_posting_time:
			self.posting_date = TODAY
		if self.due_date and self.due_date < self.posting_date:
			raise AssertionError(
				"Due Date cannot be before Posting / Supplier Invoice Date"
			)

	def save(self):
		self._validate()
		self.saved = True

	def insert(self):
		self._validate()
		self.inserted = True


ALL_FIELDS = ["set_posting_time", "posting_date", "posting_time", "due_date"]


class AChangeKeepsItsDate(unittest.TestCase):
	def _update(self, doc, payload):
		with mock.patch.object(frappe, "get_doc", return_value=doc), mock.patch.object(
			frappe, "logger", return_value=mock.MagicMock()
		):
			return update_document("Sales Invoice", doc.name, payload)

	def test_editing_a_draft_leaves_its_posting_date_where_it_was(self):
		doc = _Doc(ALL_FIELDS)
		self._update(doc, {"items": [{"item_code": "SKU002"}]})

		self.assertTrue(doc.saved)
		self.assertEqual(doc.posting_date, RAISED_ON, "the edit moved the posting date")

	def test_without_the_pin_that_same_edit_refuses_itself(self):
		"""The bug, reproduced. This is what the client actually saw."""
		doc = _Doc(ALL_FIELDS)
		doc.items = []
		with self.assertRaises(AssertionError):
			doc.save()

	def test_a_posting_date_the_change_itself_sets_is_the_one_that_is_kept(self):
		"""The pin holds whatever the document is LEFT carrying, so a change
		that deliberately moves the date still moves it."""
		doc = _Doc(ALL_FIELDS)
		doc.due_date = "2026-12-31"
		self._update(doc, {"posting_date": "2026-10-01"})

		self.assertEqual(doc.posting_date, "2026-10-01")

	def test_a_document_type_without_the_field_is_left_alone(self):
		"""A Journal Entry has no such field. Nothing is invented for it."""
		doc = _Doc(["posting_date", "due_date"])
		self._update(doc, {"user_remark": "corrected"})

		self.assertTrue(doc.saved)
		self.assertEqual(doc.set_posting_time, 0, "a field this type lacks was set")

	def test_recording_a_back_dated_document_keeps_the_date_it_was_given(self):
		"""`insert()` validates too, so a date the client named was silently
		replaced with today's — landing an entry in the wrong period."""
		doc = _Doc(ALL_FIELDS, posting_date="2026-08-01")
		doc.due_date = ""
		with mock.patch.object(frappe, "get_doc", return_value=doc), mock.patch.object(
			frappe, "logger", return_value=mock.MagicMock()
		):
			insert_document({"doctype": "Sales Invoice", "posting_date": "2026-08-01"})

		self.assertTrue(doc.inserted)
		self.assertEqual(doc.posting_date, "2026-08-01")

	def test_a_date_with_no_time_against_it_is_given_one(self):
		"""Pinning holds the time as well as the date, and a caller who named a
		date named no time — left empty, the document orders wrongly against
		everything posted the same day."""
		doc = _Doc(ALL_FIELDS, posting_time="")
		with mock.patch.object(
			frappe, "logger", return_value=mock.MagicMock()
		), mock.patch.object(agent_write_repository, "nowtime", return_value="11:22:33"):
			keep_the_documents_own_date(doc, "changing")

		self.assertEqual(doc.set_posting_time, 1)
		self.assertTrue(doc.posting_time, "the pinned date carries no time")

	def test_a_document_with_no_date_yet_is_not_pinned_to_an_empty_one(self):
		"""Nothing to keep. Pinning here would freeze a blank date rather than
		let the system supply the one it is about to."""
		doc = _Doc(ALL_FIELDS, posting_date="")
		with mock.patch.object(frappe, "logger", return_value=mock.MagicMock()):
			keep_the_documents_own_date(doc, "recording")

		self.assertEqual(doc.set_posting_time, 0)

	def test_a_document_that_already_pins_its_date_is_not_touched(self):
		doc = _Doc(ALL_FIELDS)
		doc.set_posting_time = 1
		doc.posting_time = "07:30:00"
		with mock.patch.object(frappe, "logger", return_value=mock.MagicMock()):
			keep_the_documents_own_date(doc, "changing")

		self.assertEqual(doc.posting_time, "07:30:00")
