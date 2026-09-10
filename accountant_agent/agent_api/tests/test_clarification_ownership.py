# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""Regression tests for the session-ownership guard on clarifications/uploads.

Two bugs live here, one in each direction.

CROSS-SESSION IDOR (the original): ``process_clarification_request`` and
``save_generated_file`` only checked that a ``session_id`` existed, not that it
belonged to the caller authenticated by the API key, so any customer's key
could inject questions into — or attach files to — any other customer's chat.

THE GUARD THAT REFUSED EVERYONE (the fix these tests now pin): the caller side
of that comparison was the Agent Settings DOCUMENT NAME (a generated id) while
the chat side was an ERP user, so the two could never be equal and every
generated file came back as "Chat session not found". Both sides resolve to a
user now.
"""

from unittest import TestCase
from unittest.mock import patch

from accountant_agent.agent_api.services.agent_api_service import (
	ResourceNotFoundError,
	_assert_session_owned_by,
	process_clarification_request,
)

SERVICE = "accountant_agent.agent_api.services.agent_api_service"


def _owners(chat_owner, settings_owner):
	"""Patch both sides of the comparison: the chat's owner and the key's."""
	return (
		patch(f"{SERVICE}.get_chat_session_owner", return_value=chat_owner),
		patch(f"{SERVICE}.get_settings_owner", return_value=settings_owner),
	)


class TestSessionOwnershipGuard(TestCase):
	def test_the_key_holder_reaches_their_own_session(self):
		"""The everyday case: same person on both sides. The API key arrives as
		a settings document name — never as an email — so a guard that compares
		it to the chat owner directly rejects the owner of the chat."""
		chat, settings = _owners("alice@example.com", "alice@example.com")
		with chat, settings:
			_assert_session_owned_by("session-1", "3hr0oi1o6q")

	def test_missing_session_is_rejected(self):
		chat, settings = _owners(None, "alice@example.com")
		with chat, settings:
			with self.assertRaises(ResourceNotFoundError):
				_assert_session_owned_by("session-1", "3hr0oi1o6q")

	def test_an_unresolvable_key_is_rejected(self):
		chat, settings = _owners("alice@example.com", None)
		with chat, settings:
			with self.assertRaises(ResourceNotFoundError):
				_assert_session_owned_by("session-1", "3hr0oi1o6q")

	def test_other_customers_session_is_rejected(self):
		"""The IDOR this guard exists for: a valid key for one customer must
		not be able to touch a session owned by a different customer."""
		chat, settings = _owners("bob@example.com", "alice@example.com")
		with chat, settings:
			with self.assertRaises(ResourceNotFoundError):
				_assert_session_owned_by("session-1", "3hr0oi1o6q")

	def test_process_clarification_request_rejects_foreign_session(self):
		chat, settings = _owners("bob@example.com", "alice@example.com")
		with (
			chat,
			settings,
			patch(f"{SERVICE}.insert_chat_history_record") as insert_mock,
		):
			with self.assertRaises(ResourceNotFoundError):
				process_clarification_request("session-1", "[]", "3hr0oi1o6q")
			insert_mock.assert_not_called()
