# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""The schema reply must say which rows of a table are real, however the
DocType marks the ones that are not.

WHAT HAPPENED

	The audit desk, reading an ERPNext ledger, ranked as its #2 finding — High,
	fourteen-day deadline, two suppliers to telephone — 148,500 EGP of supplier
	payments "recorded twice, both posted". Every ledger row behind that figure
	was cancelled. The live total was 0.00. On one bench 229 such rows, worth
	5.5M EGP, were being read as live in every GL total.

WHY

	`tabGL Entry` is not submittable. Every one of its rows sits at docstatus 1,
	the cancelled ones included; only `is_cancelled = 1` marks a row dead. The
	schema reply derived `posted_filter` from `is_submittable` alone, so for the
	general ledger it published no filter at all — and the agent, honestly,
	reads no filter as "every row counts".

WHY THE DEFINITION DECIDES, NOT THE NAME

	A DocType that carries an `is_cancelled` flag marks a withdrawn row with it
	and with nothing else. Reading the flag off the definition covers the stock
	and payment ledgers that are built the same way, and any DocType a
	customer's own apps build that way, without anybody keeping a list.

No site is needed: the three reads the summary makes are doubled.

RUN THEM FROM THE BENCH ROOT, not from the app directory:

	cd ~/frappe/my-bench && ./env/bin/python -m unittest \
		accountant_agent.agent_api.tests.test_a_cancelled_row_is_not_live
"""

import unittest
from unittest import mock

from accountant_agent.agent_api.services import agent_api_service as svc


class _Field:
	def __init__(self, fieldname, fieldtype="Data", label="", reqd=0, options=""):
		self.fieldname = fieldname
		self.fieldtype = fieldtype
		self.label = label
		self.reqd = reqd
		self.options = options


class _Meta:
	def __init__(self, fields, submittable=0):
		self.fields = fields
		self.is_submittable = submittable


def _summary(meta):
	"""The schema reply for one doubled DocType; every declared field is a real column."""
	columns = {df.fieldname for df in meta.fields} | {"name", "docstatus"}
	with mock.patch.object(svc, "doctype_exists", return_value=True), \
			mock.patch.object(svc, "get_doctype_metadata", return_value=meta), \
			mock.patch.object(svc, "get_table_columns", return_value=list(columns)):
		return svc.build_doctype_schema_summary("Any Ledger")


class ACancelledRowIsNotLive(unittest.TestCase):
	def test_a_ledger_that_is_never_submitted_still_says_which_rows_are_dead(self):
		"""The live failure: the general ledger, not submittable, marks its
		cancelled rows with a flag."""
		meta = _Meta([_Field("account", "Link"), _Field("debit", "Currency"),
		              _Field("is_cancelled", "Check")])

		summary = _summary(meta)

		self.assertFalse(summary["is_submittable"])
		self.assertEqual(summary["posted_filter"], "is_cancelled = 0")

	def test_a_submittable_document_keeps_its_docstatus_filter(self):
		meta = _Meta([_Field("posting_date", "Date")], submittable=1)

		self.assertEqual(_summary(meta)["posted_filter"], "docstatus = 1")

	def test_a_document_marked_both_ways_is_filtered_both_ways(self):
		meta = _Meta([_Field("is_cancelled", "Check")], submittable=1)

		self.assertEqual(
			_summary(meta)["posted_filter"], "docstatus = 1 AND is_cancelled = 0"
		)

	def test_a_master_whose_every_row_is_real_publishes_no_filter(self):
		"""Absent, not empty: constraining a Customer on either would return
		nothing."""
		meta = _Meta([_Field("customer_name")])

		self.assertNotIn("posted_filter", _summary(meta))

	def test_a_flag_that_is_not_a_flag_is_not_read_as_one(self):
		"""`is_cancelled` as free text is somebody's column, not the system's
		liveness mark, and `= 0` against it would be a guess."""
		meta = _Meta([_Field("is_cancelled", "Data")])

		self.assertNotIn("posted_filter", _summary(meta))

	def test_a_flag_the_table_does_not_store_is_not_filtered_on(self):
		"""Declared but never written — a virtual field — is not a column the
		WHERE clause can name."""
		meta = _Meta([_Field("is_cancelled", "Check")])
		with mock.patch.object(svc, "doctype_exists", return_value=True), \
				mock.patch.object(svc, "get_doctype_metadata", return_value=meta), \
				mock.patch.object(svc, "get_table_columns", return_value=["name", "docstatus"]):
			summary = svc.build_doctype_schema_summary("Any Ledger")

		self.assertNotIn("posted_filter", summary)
