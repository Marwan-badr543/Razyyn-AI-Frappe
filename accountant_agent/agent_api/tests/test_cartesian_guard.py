# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""A FROM list the query never relates is refused before MariaDB sees it.

Measured live before this existed: ``SELECT COUNT(*) FROM `tabGL Entry` a,
`tabGL Entry` b, `tabGL Entry` c`` held the v15 bench's database for sixty
seconds until ``max_statement_time`` killed it, and the guard's own harness
called that a pass. Both directions are pinned here, because a guard that only
gets stricter eventually blocks the product: the comma join WITH a WHERE
clause and every explicit ``JOIN ... ON`` are ordinary accounting SQL.
"""

from unittest import TestCase

from accountant_agent.agent_api.services.agent_api_service import ForbiddenQueryError
from accountant_agent.agent_api.services.query_guard import (
	assert_query_is_not_a_cartesian_product,
)

REFUSED: tuple[str, ...] = (
	"SELECT COUNT(*) FROM `tabGL Entry` a, `tabGL Entry` b, `tabGL Entry` c",
	"SELECT * FROM `tabSales Invoice` a CROSS JOIN `tabSales Invoice` b",
	"SELECT * FROM `tabGL Entry` a, `tabGL Entry` b GROUP BY a.account",
	"SELECT name FROM `tabSales Invoice` WHERE name IN "
	"(SELECT a.voucher_no FROM `tabGL Entry` a, `tabGL Entry` b)",
	"WITH x AS (SELECT name FROM `tabGL Entry`) SELECT COUNT(*) FROM x, x y",
)

PERMITTED: tuple[str, ...] = (
	"SELECT si.name, gl.debit FROM `tabSales Invoice` si, `tabGL Entry` gl "
	"WHERE gl.voucher_no = si.name",
	"SELECT si.name, gl.debit FROM `tabSales Invoice` si "
	"JOIN `tabGL Entry` gl ON gl.voucher_no = si.name "
	"LEFT JOIN `tabCustomer` c ON c.name = si.customer",
	"SELECT EXTRACT(YEAR FROM posting_date), COUNT(*) FROM `tabGL Entry` GROUP BY 1",
	"SELECT * FROM `tabGL Entry` WHERE account IN ('Cash', 'Bank')",
	"SELECT name FROM `tabSales Invoice` WHERE remarks = 'from a, b'",
	"SELECT name FROM `tabSales Invoice` ORDER BY posting_date DESC, name",
)


class TestCartesianGuard(TestCase):
	def test_a_product_is_refused_with_the_reason_to_rewrite_it(self) -> None:
		for query in REFUSED:
			with self.subTest(query=query):
				with self.assertRaises(ForbiddenQueryError) as caught:
					assert_query_is_not_a_cartesian_product(query)
				self.assertIn("JOIN ... ON", caught.exception.reason)

	def test_related_tables_are_allowed(self) -> None:
		for query in PERMITTED:
			with self.subTest(query=query):
				assert_query_is_not_a_cartesian_product(query)
