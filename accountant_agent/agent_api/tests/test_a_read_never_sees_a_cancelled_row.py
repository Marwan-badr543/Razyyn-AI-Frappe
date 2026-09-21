# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""A statement the agent sends cannot reach a cancelled row, whatever it says.

WHAT HAPPENED

	The schema reply said which rows of the ledger were live, and said it as
	advice. An audit then reported 148,500 EGP of supplier payments "recorded
	twice, both posted" from a query with no such filter on it. Every row
	behind the figure was cancelled; the live total was 0.00.

WHAT HOLDS NOW

	Every table the statement reads is replaced, before it runs, by a view of
	its live rows aliased to the same name. The model's WHERE, JOIN, GROUP BY,
	CTE and UNION all still work; none of them can reach a dead row. A table
	whose every row is real is left exactly as written. A statement the parser
	cannot read runs as written and the reply SAYS so. A caller whose question
	is about the cancelled documents themselves switches the exclusion off, and
	the reply says that too.

No site is needed: the metadata reads are doubled, and the rewrite is pure.

RUN THEM FROM THE BENCH ROOT, not from the app directory:

	cd ~/frappe/my-bench && ./env/bin/python -m unittest \
		accountant_agent.agent_api.tests.test_a_read_never_sees_a_cancelled_row
"""

import unittest
from unittest import mock

from accountant_agent.agent_api.services import agent_api_service as svc
from accountant_agent.agent_api.services import live_rows


def _filter(table: str):
	"""The doubled site: the ledger marks dead rows, invoices are submittable,
	masters are all real, and everything else is not a DocType."""
	return {
		"tabGL Entry": "is_cancelled = 0",
		"tabSales Invoice": "docstatus = 1",
		"tabPayment Entry": "docstatus = 1 AND is_cancelled = 0",
	}.get(table)


def _rewrite(sql: str):
	return live_rows.exclude_dead_rows(sql, "mysql", _filter)


class ACancelledRowIsUnreachable(unittest.TestCase):
	def test_the_ledger_is_read_through_its_live_rows(self):
		"""The live failure, made impossible: the total is over live rows only."""
		sql, applied, enforced = _rewrite(
			"SELECT account, SUM(debit) AS d FROM `tabGL Entry` "
			"WHERE posting_date >= '2026-01-01' GROUP BY account"
		)
		self.assertTrue(enforced)
		self.assertEqual(applied, {"tabGL Entry": "is_cancelled = 0"})
		self.assertIn("(SELECT * FROM `tabGL Entry` WHERE is_cancelled = 0) AS `tabGL Entry`", sql)
		# The statement around the table is untouched.
		self.assertIn("posting_date >= '2026-01-01'", sql)
		self.assertIn("GROUP BY account", sql)

	def test_a_table_the_agent_aliased_keeps_its_alias(self):
		sql, applied, _ = _rewrite(
			"SELECT g.account FROM `tabGL Entry` g JOIN `tabAccount` a ON a.name = g.account"
		)
		self.assertIn("(SELECT * FROM `tabGL Entry` WHERE is_cancelled = 0) AS `g`", sql)
		self.assertIn("g.account", sql)
		# `tabAccount` is a master: every row is real, so it is left alone.
		self.assertNotIn("tabAccount` WHERE", sql)
		self.assertEqual(list(applied), ["tabGL Entry"])

	def test_every_reference_is_filtered_not_only_the_first(self):
		"""A UNION, a subquery and a JOIN each name the table again."""
		sql, applied, _ = _rewrite(
			"SELECT name FROM `tabSales Invoice` WHERE grand_total > 1000 "
			"UNION ALL "
			"SELECT name FROM `tabSales Invoice` WHERE customer IN "
			"(SELECT customer FROM `tabSales Invoice` WHERE outstanding_amount > 0)"
		)
		self.assertEqual(sql.count("WHERE docstatus = 1"), 3)
		self.assertEqual(applied, {"tabSales Invoice": "docstatus = 1"})

	def test_a_cte_is_read_through_live_rows_and_its_own_name_is_not_a_table(self):
		sql, applied, enforced = _rewrite(
			"WITH paid AS (SELECT party, SUM(paid_amount) AS p FROM `tabPayment Entry` GROUP BY party) "
			"SELECT * FROM paid WHERE p > 0"
		)
		self.assertTrue(enforced)
		self.assertIn("WHERE docstatus = 1 AND is_cancelled = 0", sql)
		self.assertEqual(list(applied), ["tabPayment Entry"])
		self.assertNotIn("(SELECT * FROM `paid`", sql)

	def test_an_or_cannot_bring_a_dead_row_back(self):
		"""The old failure mode: a predicate the model wrote defeated by an OR.
		Now the OR is evaluated over live rows only, so it cannot."""
		sql, _, _ = _rewrite(
			"SELECT * FROM `tabGL Entry` WHERE is_cancelled = 0 OR voucher_no = 'JV-1'"
		)
		self.assertIn("(SELECT * FROM `tabGL Entry` WHERE is_cancelled = 0) AS `tabGL Entry`", sql)
		self.assertIn("OR voucher_no = 'JV-1'", sql)

	def test_a_table_whose_every_row_is_real_is_left_exactly_as_written(self):
		original = "SELECT name, customer_name FROM `tabCustomer` WHERE disabled = 0"
		sql, applied, enforced = _rewrite(original)
		self.assertTrue(enforced)
		self.assertEqual(applied, {})
		self.assertEqual(sql, original)

	def test_information_schema_is_not_a_doctype_and_is_untouched(self):
		original = "SELECT column_name FROM information_schema.columns WHERE table_name = 'tabGL Entry'"
		sql, applied, _ = _rewrite(original)
		self.assertEqual(applied, {})
		self.assertEqual(sql, original)

	def test_a_statement_the_parser_cannot_read_runs_as_written_and_says_so(self):
		"""Fails open, never closed — and never silently."""
		original = "SELECT )( FROM `tabGL Entry`"
		sql, applied, enforced = _rewrite(original)
		self.assertEqual(sql, original)
		self.assertEqual(applied, {})
		self.assertFalse(enforced)

	def test_a_site_without_the_parser_runs_as_written_and_says_so(self):
		with mock.patch.object(live_rows, "sqlglot", None):
			sql, applied, enforced = _rewrite("SELECT 1 FROM `tabGL Entry`")
		self.assertEqual(sql, "SELECT 1 FROM `tabGL Entry`")
		self.assertFalse(enforced)

	def test_a_callback_that_raises_is_no_filter_not_a_failed_read(self):
		def broken(table):
			raise RuntimeError("metadata unavailable")

		sql, applied, enforced = live_rows.exclude_dead_rows("SELECT 1 FROM `tabGL Entry`", "mysql", broken)
		self.assertTrue(enforced)
		self.assertEqual(applied, {})
		self.assertEqual(sql, "SELECT 1 FROM `tabGL Entry`")

	def test_the_flag_is_read_however_the_transport_spelled_it(self):
		for spelled in (True, "true", "1", "yes", "True"):
			self.assertTrue(live_rows.read_flag(spelled), spelled)
		for spelled in (False, None, "", "false", "0", "no"):
			self.assertFalse(live_rows.read_flag(spelled), spelled)


class _Field:
	def __init__(self, fieldname, fieldtype="Data"):
		self.fieldname = fieldname
		self.fieldtype = fieldtype
		self.label = ""
		self.reqd = 0
		self.options = ""


class _Meta:
	def __init__(self, fields=(), submittable=0, istable=0, issingle=0):
		self.fields = list(fields)
		self.is_submittable = submittable
		self.istable = istable
		self.issingle = issingle


def _site(doctypes: dict, columns: dict, parents: dict | None = None):
	"""The doubled site for `_live_filter_for_table`: metadata and columns per DocType."""
	return (
		mock.patch.object(svc, "doctype_exists", side_effect=lambda name: name in doctypes),
		mock.patch.object(svc, "get_doctype_metadata", side_effect=lambda name: doctypes[name]),
		mock.patch.object(svc, "get_table_columns", side_effect=lambda name: list(columns.get(name, []))),
		mock.patch.object(svc, "_documents_holding", side_effect=lambda child: list((parents or {}).get(child, []))),
	)


class TheFilterIsReadOffTheDefinition(unittest.TestCase):
	def _filter(self, table, doctypes, columns, parents=None):
		patches = _site(doctypes, columns, parents)
		for patch in patches:
			patch.start()
		try:
			return svc._live_filter_for_table(table)
		finally:
			for patch in patches:
				patch.stop()

	def test_the_ledger_is_filtered_by_its_flag_and_an_invoice_by_its_docstatus(self):
		doctypes = {
			"GL Entry": _Meta([_Field("is_cancelled", "Check")]),
			"Sales Invoice": _Meta([_Field("posting_date", "Date")], submittable=1),
		}
		columns = {"GL Entry": ["name", "docstatus", "is_cancelled"], "Sales Invoice": ["name", "docstatus"]}
		self.assertEqual(self._filter("tabGL Entry", doctypes, columns), "is_cancelled = 0")
		self.assertEqual(self._filter("tabSales Invoice", doctypes, columns), "docstatus = 1")

	def test_a_master_a_single_and_a_name_that_is_no_doctype_answer_nothing(self):
		doctypes = {"Customer": _Meta([_Field("customer_name")]), "System Settings": _Meta(issingle=1)}
		columns = {"Customer": ["name", "docstatus", "customer_name"]}
		self.assertIsNone(self._filter("tabCustomer", doctypes, columns))
		self.assertIsNone(self._filter("tabSystem Settings", doctypes, columns))
		self.assertIsNone(self._filter("tabNothing", doctypes, columns))
		self.assertIsNone(self._filter("some_cte", doctypes, columns))

	def test_child_rows_of_a_submittable_document_follow_it(self):
		"""The items of a cancelled invoice sit at docstatus 2 in their own
		table; a total over them is wrong in exactly the way the ledger was."""
		doctypes = {"Sales Invoice Item": _Meta([_Field("amount", "Currency")], istable=1)}
		columns = {"Sales Invoice Item": ["name", "docstatus", "parent", "amount"]}
		doctypes["Sales Invoice"] = _Meta(submittable=1)
		self.assertEqual(
			self._filter("tabSales Invoice Item", doctypes, columns, {"Sales Invoice Item": ["Sales Invoice"]}),
			"docstatus = 1",
		)

	def test_a_child_shared_between_a_submittable_and_a_plain_parent_drops_only_the_cancelled(self):
		doctypes = {
			"Address Link": _Meta([_Field("link_name")], istable=1),
			"Sales Invoice": _Meta(submittable=1),
			"Customer": _Meta(),
		}
		columns = {"Address Link": ["name", "docstatus", "parent"]}
		self.assertEqual(
			self._filter("tabAddress Link", doctypes, columns, {"Address Link": ["Sales Invoice", "Customer"]}),
			"docstatus != 2",
		)

	def test_a_child_of_plain_documents_only_is_left_alone(self):
		doctypes = {"Address Link": _Meta([_Field("link_name")], istable=1), "Customer": _Meta()}
		columns = {"Address Link": ["name", "docstatus", "parent"]}
		self.assertIsNone(self._filter("tabAddress Link", doctypes, columns, {"Address Link": ["Customer"]}))


class TheReplySaysWhatWasExcluded(unittest.TestCase):
	def _execute(self, sql, include_cancelled=False):
		doctypes = {"GL Entry": _Meta([_Field("is_cancelled", "Check")])}
		columns = {"GL Entry": ["name", "docstatus", "is_cancelled", "debit"]}
		ran: list = []

		def run(query, max_rows, timeout_seconds):
			ran.append(query)
			return [{"d": 1}]

		patches = _site(doctypes, columns) + (
			mock.patch.object(svc, "execute_select_query", side_effect=run),
			# The caps are read off the site's config; there is no site here.
			mock.patch.object(svc, "_max_result_rows", return_value=500),
			mock.patch.object(svc, "_query_timeout_seconds", return_value=60),
		)
		for patch in patches:
			patch.start()
		try:
			return svc.validate_and_execute_query(sql, "user@example.com", include_cancelled=include_cancelled), ran
		finally:
			for patch in patches:
				patch.stop()

	def test_the_statement_that_runs_is_the_filtered_one_and_the_reply_names_it(self):
		reply, ran = self._execute("SELECT SUM(debit) AS d FROM `tabGL Entry`")
		self.assertIn("WHERE is_cancelled = 0", ran[0])
		self.assertEqual(reply["live_filters"], {"tabGL Entry": "is_cancelled = 0"})
		self.assertTrue(reply["live_rows_enforced"])
		self.assertFalse(reply["cancelled_included"])

	def test_a_bare_doctype_name_is_resolved_before_it_is_filtered(self):
		"""`FROM GL Entry` becomes `tabGL Entry` first, so the filter finds it."""
		_reply, ran = self._execute("SELECT SUM(debit) AS d FROM GL Entry")
		self.assertIn("(SELECT * FROM `tabGL Entry` WHERE is_cancelled = 0) AS `tabGL Entry`", ran[0])

	def test_a_caller_asking_about_cancelled_documents_gets_them_and_is_told_so(self):
		reply, ran = self._execute(
			"SELECT voucher_no FROM `tabGL Entry` WHERE is_cancelled = 1", include_cancelled=True
		)
		self.assertNotIn("(SELECT * FROM", ran[0])
		self.assertEqual(reply["live_filters"], {})
		self.assertFalse(reply["live_rows_enforced"])
		self.assertTrue(reply["cancelled_included"])

	def test_the_guard_inspects_the_statement_that_actually_runs(self):
		"""The rewrite happens before the read-only check, never after it."""
		with self.assertRaises(svc.ForbiddenQueryError):
			self._execute("SELECT debit FROM `tabGL Entry`; DROP TABLE x")


if __name__ == "__main__":
	unittest.main()
