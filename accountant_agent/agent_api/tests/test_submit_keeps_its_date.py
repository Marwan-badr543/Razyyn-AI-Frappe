# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""Submitting a document must not change the date it is posted on.

WHAT HAPPENED

    A client asked the agent to post a purchase invoice raised five days
    earlier. Their system refused it: *"Due Date cannot be before Posting /
    Supplier Invoice Date"*. It refused every dated document the same way, and
    never refused a Journal Entry — so from the outside the agent "could only
    submit journal entries".

WHY

    `submit()` is `save()` with a docstatus, so it re-runs `validate()`. This
    ERP's `validate_posting_time()` resets `posting_date` and `posting_time` to
    NOW whenever `set_posting_time` is clear. A draft raised on the 25th and
    submitted on the 30th therefore acquires a posting date of the 30th, while
    every date derived from the original one stays where it was — and the
    document refuses itself. A Journal Entry has no `set_posting_time` field,
    which is the whole of why it was the one thing that worked.

WHY PINNING IT IS THE FIX AND NOT A WORKAROUND

    A posting date is an accounting fact. Moving one into a different period on
    the way through a submit is a real error, not a formatting one — and the
    client approved a card showing the date the document already had, so
    writing a different one posts something nobody agreed to.

No site is needed: `frappe.get_doc` and `frappe.logger` are stubbed, and the
stub document reproduces the re-dating behaviour described above.

RUN THEM FROM THE BENCH ROOT, not from the app directory:

    cd ~/frappe/my-bench && ./env/bin/python -m unittest \
        accountant_agent.agent_api.tests.test_submit_keeps_its_date
"""

import unittest
from unittest import mock

import frappe

from accountant_agent.agent_api.db import agent_write_repository
from accountant_agent.agent_api.db.agent_write_repository import (
	_KEEP_THE_DOCUMENTS_OWN_DATE,
	submit_document,
)

RAISED_ON = "2026-08-25"
TODAY = "2026-08-30"


class _Meta:
	def __init__(self, fieldnames):
		self._fieldnames = set(fieldnames)

	def has_field(self, fieldname):
		return fieldname in self._fieldnames


class _Doc:
	"""A document that re-dates itself on submit, exactly as this ERP does."""

	def __init__(self, fieldnames):
		self.meta = _Meta(fieldnames)
		self.posting_date = RAISED_ON
		self.due_date = RAISED_ON
		self.set_posting_time = 0
		self.submitted = False

	def get(self, fieldname, default=None):
		return getattr(self, fieldname, default)

	def set(self, fieldname, value):
		setattr(self, fieldname, value)

	def submit(self):
		# validate_posting_time(), in one line.
		if self.meta.has_field("set_posting_time") and not self.set_posting_time:
			self.posting_date = TODAY
		if self.due_date < self.posting_date:
			raise AssertionError("Due Date cannot be before Posting / Supplier Invoice Date")
		self.submitted = True


class SubmitKeepsItsDate(unittest.TestCase):
	def _submit(self, doc):
		with mock.patch.object(frappe, "get_doc", return_value=doc), mock.patch.object(
			frappe, "logger", return_value=mock.MagicMock()
		):
			return submit_document("Purchase Invoice", "ACC-PINV-2026-00030")

	def test_a_dated_document_is_posted_on_its_own_date(self):
		doc = _Doc(["set_posting_time", "posting_date", "due_date"])
		self._submit(doc)

		self.assertTrue(doc.submitted)
		self.assertEqual(doc.posting_date, RAISED_ON, "the submit moved the posting date")

	def test_without_the_pin_that_same_document_refuses_itself(self):
		"""The bug, reproduced. This is what the client actually saw."""
		doc = _Doc(["set_posting_time", "posting_date", "due_date"])
		with self.assertRaises(AssertionError):
			doc.submit()

	def test_a_document_type_without_the_field_is_left_alone(self):
		"""Journal Entry has no such field. Nothing is invented for it."""
		doc = _Doc(["posting_date"])
		self._submit(doc)

		self.assertTrue(doc.submitted)
		self.assertEqual(doc.posting_date, RAISED_ON)
		self.assertEqual(
			doc.set_posting_time, 0, "a field the document type does not have was set"
		)

	def test_a_document_that_already_pins_its_date_is_not_touched(self):
		doc = _Doc(["set_posting_time", "posting_date"])
		doc.set_posting_time = 1
		self._submit(doc)

		self.assertEqual(doc.set_posting_time, 1)
		self.assertEqual(doc.posting_date, RAISED_ON)

	def test_the_flag_is_named_once(self):
		"""Read from the module rather than retyped: a second spelling of a
		field name is a fix that silently stops applying."""
		self.assertEqual(_KEEP_THE_DOCUMENTS_OWN_DATE, "set_posting_time")
		self.assertIn(
			"_KEEP_THE_DOCUMENTS_OWN_DATE",
			agent_write_repository.submit_document.__doc__ or "",
			"submit_document should point a reader at the note explaining this",
		)


if __name__ == "__main__":
	unittest.main()
