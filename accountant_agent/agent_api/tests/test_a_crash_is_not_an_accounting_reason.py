# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""A customer must never read a Python error as the reason their document was
refused.

WHAT HAPPENED

	The agent was asked to record a sales invoice that carried no item lines.
	The gateway refused it, and the reason it gave the customer was:

		REJECTED  unsupported operand type(s) for -: 'NoneType' and 'float'

	That sentence is ERPNext's own controller crashing — with no lines there is
	no total, and `set_payment_schedule` subtracts a write-off from `None`. It
	is not an accounting rule, it is a defect in the ERP, and it reached the
	customer as the accounting reason.

WHY

	Every refusal took one path: the exception's `str()` became the customer's
	message and the write-log row's message alike. That is right for the ERP's
	own refusals — "Row #1: Quantity for Item JVC cannot be zero." is a
	sentence a system wrote for a person — and wrong for everything else. The
	traceback was thrown away with it, so the operator could not tell from the
	product's own records where the crash came from either.

WHAT DECIDES

	The exception's CLASS, never its text. The framework's validation family is
	what `frappe.throw` raises, so it is the ERP speaking to a person; so is
	each class this gateway maps to a code of its own. Anything else is the
	system failing on the document rather than judging it: the customer is told
	that in a plain sentence naming the document type, the write-log row keeps
	the class and the message for the operator, and the traceback goes to the
	site Error Log.

No site is needed: the logger is doubled and nothing is written.

RUN THEM FROM THE BENCH ROOT, not from the app directory:

	cd ~/frappe/my-bench && ./env/bin/python -m unittest \
		accountant_agent.agent_api.tests.test_a_crash_is_not_an_accounting_reason
"""

import unittest
from unittest import mock

import frappe

from accountant_agent.agent_api.services import agent_write_service as svc


def _refuse(exc, doctype="Sales Invoice"):
	"""(code, customer sentence, operator note, what was logged)."""
	logged: list[dict] = []
	with mock.patch.object(
		frappe, "log_error", side_effect=lambda **kw: logged.append(kw)
	), mock.patch.object(frappe, "get_traceback", return_value="the whole traceback"):
		code, sentence, operator_note = svc._refusal(exc, doctype)
	return code, sentence, operator_note, logged


class TheErpsOwnRefusalReachesTheCustomer(unittest.TestCase):
	def test_an_accounting_rule_is_passed_through_word_for_word(self):
		"""What ERPNext says when it MEANS to refuse. This is the sentence the
		customer needs and it must not be replaced by a generic one."""
		exc = frappe.ValidationError("Row #1: Quantity for Item JVC cannot be zero.")

		code, sentence, operator_note, logged = _refuse(exc)

		self.assertEqual(sentence, "Row #1: Quantity for Item JVC cannot be zero.")
		self.assertEqual(code, "VALIDATION_FAILED")
		self.assertEqual(operator_note, sentence)
		self.assertEqual(logged, [], "a refusal is not an error to log")

	def test_a_mapped_class_keeps_its_own_code_and_message(self):
		exc = frappe.MandatoryError("Value missing for: Company")

		code, sentence, _note, logged = _refuse(exc)

		self.assertEqual(code, "MANDATORY_MISSING")
		self.assertEqual(sentence, "Value missing for: Company")
		self.assertEqual(logged, [])

	def test_a_permission_denial_still_answers_when_the_erp_says_nothing(self):
		"""`check_permission()` raises bare. A customer-facing message may never
		be empty."""
		code, sentence, _note, _logged = _refuse(frappe.PermissionError(""))

		self.assertEqual(code, "PERMISSION_DENIED")
		self.assertTrue(sentence.strip())
		self.assertNotIn("PermissionError", sentence)


class ACrashReachesTheCustomerAsASentence(unittest.TestCase):
	#: The live failure, verbatim from the ERPNext controller.
	CRASH = TypeError("unsupported operand type(s) for -: 'NoneType' and 'float'")

	def test_the_customer_reads_a_sentence_naming_their_document(self):
		_code, sentence, _note, _logged = _refuse(self.CRASH)

		self.assertIn("Sales Invoice", sentence)
		self.assertNotIn("NoneType", sentence)
		self.assertNotIn("TypeError", sentence)
		self.assertNotIn("operand", sentence)

	def test_the_operator_keeps_the_class_and_the_message(self):
		"""The write-log row is the operator's record, and a refusal they
		cannot diagnose is a support ticket with no evidence attached."""
		_code, _sentence, operator_note, _logged = _refuse(self.CRASH)

		self.assertIn("TypeError", operator_note)
		self.assertIn("unsupported operand", operator_note)

	def test_the_traceback_goes_to_the_site_error_log(self):
		_code, _sentence, _note, logged = _refuse(self.CRASH)

		self.assertEqual(len(logged), 1)
		self.assertEqual(logged[0]["message"], "the whole traceback")
		self.assertIn("TypeError", logged[0]["title"])
		self.assertIn("Sales Invoice", logged[0]["title"])

	def test_a_traceback_taken_earlier_is_the_one_logged(self):
		"""Preflight rolls its savepoint back before reporting, so it captures
		the traceback inside the handler and hands it over. Past the handler
		there is no exception left to read one from."""
		logged: list[dict] = []
		with mock.patch.object(
			frappe, "log_error", side_effect=lambda **kw: logged.append(kw)
		), mock.patch.object(frappe, "get_traceback", return_value="NoneType: None"):
			svc._refusal(self.CRASH, "Sales Invoice", "the traceback from the handler")

		self.assertEqual(logged[0]["message"], "the traceback from the handler")

	def test_a_document_type_of_any_name_is_named(self):
		"""Nothing here knows which document types exist: the type is whatever
		the customer's system calls it."""
		_code, sentence, _note, _logged = _refuse(self.CRASH, "Employee Advance")

		self.assertIn("Employee Advance", sentence)
