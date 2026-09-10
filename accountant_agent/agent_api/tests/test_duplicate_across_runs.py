# -*- coding: utf-8 -*-
# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""The cross-run duplicate gate: refuse once, then honour the decision.

WHAT THE KEY CANNOT CATCH

    The idempotency key contains the run id — correctly, so a batch may hold
    identical lines and a replay resolves inside its own run. But a customer
    whose answer was lost re-sends the request in a NEW turn, with a new run
    id and therefore a new key, and an approved re-write would post the same
    ledger entry twice. The content digest (request_digest) is run-independent
    and catches exactly this.

WHAT THESE TESTS PIN

    * An identical committed create from ANOTHER run, not yet warned about,
      is refused with POSSIBLE_DUPLICATE — and the refusal is itself recorded,
      which is what arms the customer's retry.
    * A retry after the warning passes: the repeat is a decision, not an
      accident, and content-dedup that silently swallowed it would be worse
      than the duplicate.
    * No twin means no queries wasted and no refusal.
    * Inside create_document the gate fires BEFORE anything is reserved or
      inserted.

No site is needed: every collaborator is patched at the service seam.

RUN THEM FROM THE BENCH ROOT, not from the app directory:

    cd ~/frappe/my-bench && ./env/bin/python -m unittest \\
        accountant_agent.agent_api.tests.test_duplicate_across_runs
"""

import unittest
from unittest import mock

from accountant_agent.agent_api.services import agent_write_service as svc
from accountant_agent.agent_api.services.agent_write_service import (
    WriteRejectedError,
    assert_not_an_unconfirmed_duplicate,
)

_TWIN = {
    "name": "AWL-0001",
    "target_doctype": "Journal Entry",
    "target_docname": "ACC-JV-2026-00042",
    "creation": "2026-09-07 10:00:00",
    "run_id": "run_earlier",
}


class TestTheGateItself(unittest.TestCase):

    def test_an_unwarned_twin_is_refused_and_the_refusal_recorded(self):
        with mock.patch.object(svc, "find_committed_twin", return_value=_TWIN), \
             mock.patch.object(svc, "duplicate_was_confirmed", return_value=False), \
             mock.patch.object(svc, "record_failed_attempt") as recorded:
            with self.assertRaises(WriteRejectedError) as caught:
                assert_not_an_unconfirmed_duplicate(
                    digest="d1", run_id="run_new", doctype="Journal Entry",
                    idempotency_key="key1", session_id="s1",
                )

        self.assertEqual(caught.exception.code, "POSSIBLE_DUPLICATE")
        # The message names the earlier document and the way forward.
        self.assertIn("ACC-JV-2026-00042", str(caught.exception))
        self.assertIn("NOT been recorded again", str(caught.exception))
        # Recording the refusal is what arms the customer's confirmed retry.
        recorded.assert_called_once()
        self.assertEqual(
            recorded.call_args.kwargs["error_code"], "POSSIBLE_DUPLICATE",
        )

    def test_a_retry_after_the_warning_is_a_decision_and_passes(self):
        with mock.patch.object(svc, "find_committed_twin", return_value=_TWIN), \
             mock.patch.object(svc, "duplicate_was_confirmed", return_value=True), \
             mock.patch.object(svc, "record_failed_attempt") as recorded:
            assert_not_an_unconfirmed_duplicate(
                digest="d1", run_id="run_new", doctype="Journal Entry",
                idempotency_key="key2", session_id="s1",
            )
        recorded.assert_not_called()

    def test_no_twin_means_no_refusal_and_no_log_noise(self):
        with mock.patch.object(svc, "find_committed_twin", return_value=None), \
             mock.patch.object(svc, "duplicate_was_confirmed") as confirmed, \
             mock.patch.object(svc, "record_failed_attempt") as recorded:
            assert_not_an_unconfirmed_duplicate(
                digest="d2", run_id="run_new", doctype="Journal Entry",
                idempotency_key="key3", session_id="s1",
            )
        confirmed.assert_not_called()
        recorded.assert_not_called()


class TestTheGateIsWiredIntoCreate(unittest.TestCase):

    def test_create_document_refuses_before_reserving_or_inserting(self):
        """The gate must fire before any row exists — a refusal that leaves an
        IN_FLIGHT reservation behind would strand the key."""
        patches = {
            "assert_session_is_agent_user": mock.MagicMock(return_value="agent@x"),
            "load_write_policy": mock.MagicMock(),
            "assert_write_policy_enabled": mock.MagicMock(),
            "assert_not_dry_run": mock.MagicMock(),
            "assert_doctype_allowed": mock.MagicMock(),
            "assert_within_policy_caps": mock.MagicMock(),
            "assert_run_caps_for_run": mock.MagicMock(),
            "find_write_log_by_key": mock.MagicMock(return_value=None),
            "find_committed_twin": mock.MagicMock(return_value=_TWIN),
            "duplicate_was_confirmed": mock.MagicMock(return_value=False),
            "record_failed_attempt": mock.MagicMock(),
            "reserve_write_log": mock.MagicMock(),
            "insert_document": mock.MagicMock(),
        }
        with mock.patch.multiple(svc, **patches):
            with self.assertRaises(WriteRejectedError) as caught:
                svc.create_document(
                    payload={"doctype": "Journal Entry", "accounts": []},
                    idempotency_key="key9",
                    run_id="run_new",
                    session_id="s1",
                )

        self.assertEqual(caught.exception.code, "POSSIBLE_DUPLICATE")
        patches["reserve_write_log"].assert_not_called()
        patches["insert_document"].assert_not_called()


if __name__ == "__main__":
    unittest.main()
