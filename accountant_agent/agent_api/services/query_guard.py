# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""The availability half of the SQL guard: a query that multiplies tables.

``assert_query_is_read_only`` in ``agent_api_service.py`` refuses what a
statement could DO — write, stack a second statement, read a credential
table. This refuses what a legitimate read can COST. A FROM list the query
never relates pairs every row of each table with every row of the others,
and nothing about it is a write, so the read-only guard waved it through.

THE QUERY THIS REFUSES
	``SELECT COUNT(*) FROM `tabGL Entry` a, `tabGL Entry` b, `tabGL Entry` c``
	— three copies of the ledger, paired every way. Measured live: Odoo 18 ran
	the equivalent for ten seconds and answered 304,821,217; the Frappe benches
	pinned MariaDB for sixty seconds until ``max_statement_time`` killed it.
	Nothing in any guard had refused it, and a handful in parallel is an
	outage on the customer's own server, caused from inside the product.

THE THREE GUARDS AGREE
	``_unfiltered_comma_join`` is repeated, line for line, in the platform's
	``agent/tools/sql_guard.py`` and the Odoo module's
	``services/query_guard.py``, so a query refused here is refused there and
	a query allowed there is allowed here — the local guard must never
	outrank the site.
"""

from __future__ import annotations

import re

from accountant_agent.agent_api.services.agent_api_service import (
	ForbiddenQueryError,
	_mask_string_literals,
)

#: ``CROSS JOIN`` spelled out. It is what a comma-joined FROM list with no
#: WHERE clause means, written explicitly, and it is refused for the same reason.
_CROSS_JOIN_PATTERN: re.Pattern = re.compile(r"\bcross\s+join\b", re.IGNORECASE)

_FROM_PATTERN: re.Pattern = re.compile(r"\bfrom\b", re.IGNORECASE)

#: What can end a FROM list at its own nesting depth: a parenthesis (a
#: subquery or a function argument list), a comma (another table), or the
#: clause that follows the list. Only WHERE among those filters the product.
_FROM_LIST_TOKEN_PATTERN: re.Pattern = re.compile(
	r"[(),]|\b(?:where|group|having|order|limit|offset|union|intersect|except"
	r"|window|fetch|for)\b",
	re.IGNORECASE,
)

#: The refusal, worded for the model that has one job left: write the query
#: again. Identical in the three guards.
CARTESIAN_PRODUCT_REASON = (
	"Query multiplies tables together: a comma-separated FROM list with no "
	"WHERE clause, or a CROSS JOIN, pairs every row of each table with every "
	"row of the others and can take the database down. Write the join as "
	"JOIN ... ON <condition>, or add a WHERE clause that relates the tables."
)


def _unfiltered_comma_join(scannable: str) -> bool:
	"""Whether any FROM list names two or more tables and never filters them.

	WHAT IT LEAVES ALONE
		A comma list WITH a WHERE clause (``FROM a, b WHERE a.id = b.a_id``) is
		the old spelling of an inner join and the desks write it; so is every
		explicit ``JOIN ... ON``. Neither is a product. Only a list the query
		never relates is refused — and ``CROSS JOIN``, which says so by name.

	HOW IT READS THE STATEMENT
		Not a parser. From each ``FROM``, walk forward counting commas at the
		list's own depth until the list ends: at a closing parenthesis (this
		FROM was inside a subquery, or a function such as ``EXTRACT(YEAR FROM
		d)``), at the next clause keyword, or at the end of the text. Commas
		inside parentheses belong to whatever the parentheses hold — an IN
		list, a subquery's own select list, ``USING (a, b)`` — and are never
		counted. A list ended by WHERE is filtered; one ended any other way,
		with a comma counted, is a product.
	"""
	for opener in _FROM_PATTERN.finditer(scannable):
		depth = 0
		commas = 0
		ended_by_where = False
		for token in _FROM_LIST_TOKEN_PATTERN.finditer(scannable, opener.end()):
			text = token.group(0)
			if text == "(":
				depth += 1
			elif text == ")":
				if depth == 0:
					break
				depth -= 1
			elif depth:
				continue
			elif text == ",":
				commas += 1
			else:
				ended_by_where = text.lower() == "where"
				break
		if commas and not ended_by_where:
			return True
	return False


def assert_query_is_not_a_cartesian_product(query: str) -> None:
	"""Refuse a read that pairs every row with every other row.

	Judged on the query with its string literals masked, exactly as the
	read-only guard judges it: ``WHERE remarks = 'from a, b'`` is the
	customer's text, not a FROM list.

	Raises:
		ForbiddenQueryError: with the reason the model needs to rewrite it.
	"""
	scannable = _mask_string_literals(query or "")
	if _CROSS_JOIN_PATTERN.search(scannable) or _unfiltered_comma_join(scannable):
		raise ForbiddenQueryError(CARTESIAN_PRODUCT_REASON)
