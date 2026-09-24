# Copyright (c) 2026, Marwan Badr and contributors
# For license information, please see license.txt

"""
Service Layer — Agent API
--------------------------
Pure business logic for the agent API endpoints.
Fully protocol-agnostic — zero awareness of HTTP/REST/gRPC.

Prohibitions (per three-layer rules):
  ❌ NO HTTP framework imports (HttpRequest, Response, status)
  ❌ NO direct HTTP exceptions (e.g., HTTPException)
"""

import difflib
import json
import re
from datetime import timedelta
from typing import Any, Optional

import frappe
from frappe import _
from frappe.utils.file_manager import save_file

from accountant_agent.agent_api.db.agent_api_repository import (
	doctype_exists,
	execute_select_query,
	find_settings_name_by_api_key,
	get_chat_session_owner,
	get_doctype_metadata,
	get_settings_owner,
	get_table_columns,
	insert_chat_history_record,
	update_chat_last_timestamp,
)
from accountant_agent.agent_api.services.live_rows import exclude_dead_rows

# ─── Domain Exceptions (protocol-agnostic) ──────────────────────────────────


class AuthenticationRequiredError(Exception):
	"""Raised when no API key is provided."""

	pass


class InvalidApiKeyError(Exception):
	"""Raised when the API key does not match any Agent Settings record."""

	pass


class MissingParameterError(Exception):
	"""Raised when a required parameter is missing."""

	def __init__(self, parameter_name: str) -> None:
		self.parameter_name = parameter_name
		super().__init__(f"Missing required parameter: {parameter_name}")


class ForbiddenQueryError(Exception):
	"""Raised when a SQL query contains forbidden keywords or is not a SELECT."""

	def __init__(self, reason: str) -> None:
		self.reason = reason
		super().__init__(reason)


class ResourceNotFoundError(Exception):
	"""Raised when a requested resource does not exist."""

	def __init__(self, resource_type: str, identifier: str) -> None:
		self.resource_type = resource_type
		self.identifier = identifier
		super().__init__(f"{resource_type} '{identifier}' not found.")


class QueryExecutionError(Exception):
	"""Raised when a SQL query fails during execution."""

	def __init__(self, detail: str) -> None:
		self.detail = detail
		super().__init__(f"SQL Execution Error: {detail}")


# ─── Query Safety Policy ────────────────────────────────────────────────────
#
# Everything this endpoint executes was written by a language model, and that
# model's context can contain text supplied by whoever sent the customer a
# document. The guards below therefore assume a hostile query author, not a
# careless one.

#: Statements that modify data or schema. Matched against a query whose string
#: literals have been masked first — otherwise an invoice whose description
#: contains the word "update" is refused, and the agent, told only that its
#: query was forbidden, retries the same thing forever.
_FORBIDDEN_SQL_PATTERNS: list[re.Pattern] = [
	re.compile(pattern, re.IGNORECASE)
	for pattern in [
		r"\binsert\b",
		r"\bupdate\b",
		r"\bdelete\b",
		r"\bdrop\b",
		r"\balter\b",
		r"\bcreate\b",
		r"\btruncate\b",
		r"\breplace\s+into\b",
		r"\brename\b",
		r"\bgrant\b",
		r"\brevoke\b",
		r"\bexecute\b",
		r"\bload_file\b",
		r"\boutfile\b",
		r"\bdumpfile\b",
		r"\binto\s+outfile\b",
		r"\bset\s+session\b",
		r"\bset\s+global\b",
	]
]

_SELECT_START_PATTERN: re.Pattern = re.compile(r"^\s*(select|with)\b", re.IGNORECASE)

#: Tables that hold credentials, sessions or engine internals. None of them is
#: an accounting record, so refusing them costs the product nothing — while
#: allowing them would turn one prompt injection in an uploaded PDF into the
#: exfiltration of every stored secret on the customer's site. `__Auth` alone
#: holds the encrypted password of every ERP user.
_DENIED_IDENTIFIER_PATTERNS: list[re.Pattern] = [
	re.compile(pattern, re.IGNORECASE)
	for pattern in [
		# Frappe's own internal tables, all of which are `__`-prefixed.
		r"__auth",
		r"__global_search",
		r"__user_settings",
		r"__usersettings",
		# Database engine catalogues. information_schema is handled separately
		# below — the audit agent legitimately enumerates tables and columns
		# through it, so a blanket refusal here would break schema discovery.
		r"\bperformance_schema\b",
		r"\bmysql\s*\.",
		r"\bpg_catalog\b",
		r"\bpg_shadow\b",
		r"\bpg_authid\b",
		# DocTypes that exist to store secrets and integration credentials.
		r"tabAgent\s+Settings",
		r"tabOAuth\s+Bearer\s+Token",
		r"tabOAuth\s+Authorization\s+Code",
		r"tabToken\s+Cache",
		r"tabSocial\s+Login\s+Key",
		r"tabConnected\s+App",
		r"tabWebhook",
		r"tabIntegration\s+Request",
	]
]

#: Column names that carry secrets wherever they appear. `tabUser` is otherwise
#: a legitimate read — an accountant asks who posted a journal entry — so the
#: block is on the sensitive columns rather than on the table.
_DENIED_COLUMN_PATTERNS: list[re.Pattern] = [
	re.compile(pattern, re.IGNORECASE)
	for pattern in [
		r"\bapi_secret\b",
		r"\bencryption_key\b",
		r"\breset_password_key\b",
		r"\bsocial_login_userid\b",
		r"\bapi_key\b",
	]
]

#: Rows returned to the agent. Matches the contract the agent already publishes
#: to the model in `agent/tools/tools.py` and `agent/agent_ask/prompts.py`
#: ("max 500 rows"); before this, that promise was made by the caller and kept
#: by nobody.
DEFAULT_MAX_RESULT_ROWS: int = 500

#: Seconds of server-side execution a single agent query may consume. Closes
#: companion issue E-2 (z_plan/analyse_plan.md §8.2): the agent's HTTP timeout
#: releases the *caller*, but the database keeps running the abandoned query and
#: keeps contending with the customer's own postings. Only the database can stop
#: it, so the limit has to be set here.
#:
#: THIS IS THE CLOCK THAT MUST EXPIRE FIRST, AND IT PAIRS WITH THE AGENT.
#:     `ERP_STATEMENT_TIMEOUT_SECONDS` in the agent's agent/erp/transport.py
#:     restates this figure, and the agent's own HTTP budget is set to this plus
#:     headroom. Both used to be 30, which made the race a coin flip: half the
#:     time the agent gave up first and told the customer it could not reach
#:     their system, for a query this limit was about to refuse properly.
#:
#:     Sixty rather than thirty because a year of ledger aggregated across a
#:     large table legitimately takes more than thirty seconds, and refusing
#:     that is refusing ordinary accounting work. Raising it further for a site
#:     means raising the agent's ceiling with it — see that file.
DEFAULT_QUERY_TIMEOUT_SECONDS: int = 60

#: The only two information_schema views the agent has a reason to read. The
#: audit agent discovers the customer's ledger tables and their columns through
#: them (agent/agent_audit/audit_nodes.py), and both are schema shape rather
#: than data — no credentials, no privileges, no live session list. Everything
#: else in that schema, notably the *_privileges views and processlist, stays
#: refused.
_ALLOWED_INFORMATION_SCHEMA_VIEWS: frozenset[str] = frozenset({"tables", "columns"})

_INFORMATION_SCHEMA_PATTERN: re.Pattern = re.compile(
	r"\binformation_schema\b(?:\s*\.\s*([a-zA-Z0-9_]+))?", re.IGNORECASE
)

_STRING_LITERAL_PATTERN: re.Pattern = re.compile(r"'(?:[^'\\]|\\.|'')*'|\"(?:[^\"\\]|\\.|\"\")*\"", re.DOTALL)


def _mask_string_literals(query: str) -> str:
	"""Blank out quoted literals so keyword scanning reads code, not data.

	`WHERE customer_name LIKE '%Drop Shipping%'` is an ordinary accounting
	query. Scanning it raw refuses it for containing "drop".
	"""
	return _STRING_LITERAL_PATTERN.sub("''", query)


def _max_result_rows() -> int:
	return int(frappe.conf.get("accountant_agent_max_query_rows") or DEFAULT_MAX_RESULT_ROWS)


def _query_timeout_seconds() -> int:
	return int(frappe.conf.get("accountant_agent_query_timeout_seconds") or DEFAULT_QUERY_TIMEOUT_SECONDS)


def assert_query_is_read_only(clean_query: str) -> None:
	"""Refuse anything that is not a single, self-contained, read-only SELECT.

	Raises:
		ForbiddenQueryError: with a reason the agent can act on.
	"""
	if not _SELECT_START_PATTERN.match(clean_query):
		raise ForbiddenQueryError("Only SELECT queries are allowed for security reasons.")

	# A BACKSLASH IS REFUSED BEFORE THE LITERALS ARE MASKED.
	#
	#     ``_mask_string_literals`` treats ``\\'`` as an escaped quote that keeps a
	#     string open. MariaDB reads it that way by default, so the mask and the
	#     engine agree here today; a site running with ``NO_BACKSLASH_ESCAPES``,
	#     or a Postgres-backed site, reads ``'a\\'`` as a closed two-char string
	#     and runs whatever follows as live SQL — the divergence that let a
	#     single-statement ``SELECT 'x\\' AS a, secret FROM ...`` mask its own
	#     FROM clause out of the scan on the platform and Odoo guards. No
	#     accounting SELECT needs a literal backslash (a quote inside a string is
	#     ``''``), so it is refused outright, keeping this guard byte-for-byte in
	#     step with ``agent/tools/sql_guard.py`` and the Odoo app's guard.
	if "\\" in clean_query:
		raise ForbiddenQueryError(
			"Query must not contain a backslash (\\). Database engines disagree "
			"on whether it escapes a quote, which can hide a second statement or "
			"a forbidden table from this check. Write a literal quote inside a "
			"string as '' (two single quotes) and remove the backslash."
		)

	scannable = _mask_string_literals(clean_query)

	# Stacked statements. pymysql does not enable MULTI_STATEMENTS, but psycopg2
	# executes every statement in the string, so on a Postgres site the
	# SELECT-must-come-first guard alone would wave through `SELECT 1; ...`.
	if ";" in scannable.rstrip().rstrip(";"):
		raise ForbiddenQueryError("Only a single statement may be executed per request.")

	for pattern in _FORBIDDEN_SQL_PATTERNS:
		match = pattern.search(scannable)
		if match:
			raise ForbiddenQueryError(f"Query contains forbidden keyword: {match.group(0)}")

	for pattern in _DENIED_IDENTIFIER_PATTERNS:
		if pattern.search(scannable):
			raise ForbiddenQueryError(
				"This query reads a system or credential table, which is not "
				"permitted. Only business records are available."
			)

	for pattern in _DENIED_COLUMN_PATTERNS:
		if pattern.search(scannable):
			raise ForbiddenQueryError("This query reads a credential column, which is not permitted.")

	for match in _INFORMATION_SCHEMA_PATTERN.finditer(scannable):
		view = (match.group(1) or "").lower()
		if view not in _ALLOWED_INFORMATION_SCHEMA_VIEWS:
			raise ForbiddenQueryError(
				"Only information_schema.tables and information_schema.columns " "may be read."
			)


# ─── Authentication Service ─────────────────────────────────────────────────


def authenticate_by_api_key(api_key: str | None) -> str:
	"""
	Validate the given API key against stored Agent Settings records.

	Args:
		api_key: The API key string to validate.

	Returns:
		The matching settings document name (agent account email).

	Raises:
		AuthenticationRequiredError: If api_key is empty/None.
		InvalidApiKeyError: If no matching record is found.
	"""
	if not api_key:
		raise AuthenticationRequiredError()

	settings_user = find_settings_name_by_api_key(api_key)
	if not settings_user:
		raise InvalidApiKeyError()

	return settings_user


# ─── SQL Query Execution Service ─────────────────────────────────────────────


#: `FROM Sales Invoice WHERE ...` — the identifier run swallows the trailing
#: clause, so the rewrite has to try progressively shorter word prefixes.
_TABLE_REFERENCE_PATTERN: re.Pattern = re.compile(
	r'\b(from|join)\s+([`"]?)(tab)?([a-zA-Z0-9_\-\s]+)\2',
	re.IGNORECASE,
)


def _rewrite_query(query: str) -> str:
	"""Prefix bare DocType names with `tab` so the agent can write `FROM User`.

	Multi-word DocTypes are why this is not a one-line substitution. The
	identifier character class has to include spaces to match `Sales Invoice`,
	which means in `FROM Sales Invoice WHERE posting_date > ...` it also
	swallows `WHERE posting_date`. Testing only the full run therefore fails to
	resolve every multi-word DocType that is followed by a clause — which is
	almost all of them in real queries — and the agent gets a raw SQL error for
	a query that was correct.

	So: try the longest word prefix first and shorten until a DocType matches,
	leaving whatever follows untouched. Lookups are memoised per call because
	the same table is typically referenced several times in one query.
	"""
	resolved: dict[str, bool] = {}

	def is_doctype(candidate: str) -> bool:
		if candidate not in resolved:
			resolved[candidate] = doctype_exists(candidate)
		return resolved[candidate]

	def replace_match(match: re.Match) -> str:
		keyword, quote, has_tab, candidate = match.groups()
		if has_tab:
			return match.group(0)

		words = candidate.split()
		if not words:
			return match.group(0)

		for length in range(len(words), 0, -1):
			name = " ".join(words[:length])
			if not is_doctype(name):
				continue
			remainder = candidate[candidate.index(name) + len(name) :]
			# A multi-word DocType written bare — `FROM GL Entry` — has to come
			# out quoted: `FROM tabGL Entry` reads to the database as a table
			# called `tabGL` with an alias, and fails on a query that was
			# correct. A name the agent quoted keeps the quote it used.
			quote = quote or ("`" if " " in name else "")
			# The identifier run is greedy enough to have swallowed any
			# following JOIN — `FROM Sales Invoice a JOIN Account b` is one
			# match — so the tail is rewritten too. re.sub does not rescan its
			# own replacement, and without this the second table stays bare.
			return f"{keyword} {quote}tab{name}{quote}" + _TABLE_REFERENCE_PATTERN.sub(
				replace_match, remainder
			)

		return match.group(0)

	return _TABLE_REFERENCE_PATTERN.sub(replace_match, query)


# ─── What a failed query is told ────────────────────────────────────────────

_ERRNO_SYNTAX: int = 1064
_ERRNO_NO_SUCH_TABLE: int = 1146
_ERRNO_NO_SUCH_COLUMN: int = 1054

_ERROR_NUMBER_PATTERN: re.Pattern = re.compile(r"\((\d{4}),")
_SYNTAX_NEAR_PATTERN: re.Pattern = re.compile(r"near ['\"]([^'\"]{1,80})", re.IGNORECASE)
_MISSING_TABLE_PATTERN: re.Pattern = re.compile(r"Table ['\"`]([^'\"`]+)['\"`]", re.IGNORECASE)
_MISSING_COLUMN_PATTERN: re.Pattern = re.compile(r"Unknown column ['\"`]([^'\"`]+)['\"`]", re.IGNORECASE)


#: How much of this message the agent will actually read. Its HTTP client caps
#: an upstream error body at `_MAX_UPSTREAM_ERROR_CHARS` (300) in
#: `agent/tools/tools.py` — a deliberate bound on untrusted text from a host
#: this platform was merely pointed at, and not something to raise from here.
#:
#: WHICH IS WHY THE CORRECTION COMES FIRST.
#:     Every explanation below used to read "<driver sentence> — <what to do>".
#:     The driver's sentence for a 1064 is 180 characters of boilerplate about
#:     consulting the manual, so the clip fell exactly on the part that was
#:     added and kept the part that was already useless. The correction leads
#:     now and the raw text trails it: a clip costs the driver's wording, which
#:     is in this site's own error log either way.
_AGENT_ERROR_BUDGET_CHARS: int = 300


def _correction_first(correction: str, detail: str) -> str:
	"""The actionable sentence, then the database's own words behind it."""
	return f"{correction} Database said: {detail}"


def _error_number(exc: Exception) -> int:
	"""The database's own error number, or 0 if this driver did not give one."""
	for arg in getattr(exc, "args", ()):
		if isinstance(arg, int):
			return arg
	match = _ERROR_NUMBER_PATTERN.search(str(exc))
	return int(match.group(1)) if match else 0


def _explain_syntax_error(detail: str) -> str:
	"""Name the token MariaDB stopped at, and the likeliest reason it did.

	The driver reports `check the manual ... near 'lines, SUM(debit) ...'`, which
	names the token but never says that `lines` is a reserved word — so the agent
	read it as a malformed expression and rewrote the expression, keeping the
	alias, forever. The word itself is not decided here: whether a given token is
	reserved depends on the server version, and guessing wrong in either
	direction would be worse than saying what is true of every 1064.
	"""
	match = _SYNTAX_NEAR_PATTERN.search(detail)
	words = match.group(1).split() if match else []
	token = words[0].strip(",`'\"") if words else ""
	if not token:
		return detail
	return _correction_first(
		f"Refused at '{token}'. If that is a column or an alias you chose, it is a "
		f"word this database reserves: rename it to something plain like "
		f"'{token}_count' everywhere it appears, or backtick it. Otherwise the "
		f"expression just before it is incomplete.",
		detail,
	)


def _explain_missing_table(detail: str) -> str:
	"""Say where the values of a Single actually live.

	A Single DocType — Global Defaults, System Settings, Accounts Settings — has
	no table of its own in Frappe, so `tabGlobal Defaults` has never existed on
	any site. The raw error reads as if the customer's ERP were missing something,
	which is the opposite of the truth.
	"""
	match = _MISSING_TABLE_PATTERN.search(detail)
	if not match:
		return detail

	table = match.group(1).split(".")[-1]
	if not table.startswith("tab"):
		return detail

	doctype = table[3:]
	if not doctype_exists(doctype):
		return _correction_first(
			f"There is no '{doctype}' on this site. Check the name against "
			f"information_schema.tables, or call get_schema for the one you meant.",
			detail,
		)

	if bool(getattr(get_doctype_metadata(doctype), "issingle", 0)):
		return _correction_first(
			f"'{doctype}' is a Single: it holds one set of values and has NO table "
			f"of its own, so `{table}` does not exist on any site. Read it with "
			f"SELECT field, value FROM `{_SINGLES_TABLE}` WHERE doctype = "
			f"'{doctype}'.",
			detail,
		)

	return _correction_first(
		f"'{doctype}' exists but `{table}` does not, so its rows are kept "
		f"elsewhere. Call get_schema on '{doctype}' and use the table_name it "
		f"returns.",
		detail,
	)


#: The tables a query names. `tab` DocType names contain spaces, so the
#: backticked form is matched first and the bare form only where there is no
#: whitespace to lose.
_QUERIED_TABLE_PATTERN: re.Pattern = re.compile(r"(?:FROM|JOIN)\s+(?:`(tab[^`]+)`|(tab\S+))", re.IGNORECASE)

#: How many tables of one query are resolved before giving up. A query naming
#: more than this is not one an explanation is going to rescue, and each name
#: costs a metadata read inside an error handler.
_MAX_TABLES_EXPLAINED: int = 6


def _queried_doctypes(sql: str) -> list[str]:
	"""The DocTypes a query reads from, in the order it names them."""
	found: list[str] = []
	for backticked, bare in _QUERIED_TABLE_PATTERN.findall(sql or ""):
		table = (backticked or bare).strip().strip("`,;")
		doctype = table[3:]
		if doctype and doctype not in found:
			found.append(doctype)
	return found[:_MAX_TABLES_EXPLAINED]


def _columns_of(doctype: str) -> set[str]:
	"""Every column a SELECT may name on this DocType's own table.

	ASKED OF THE DATABASE, the same way the schema reply asks it. A DocType
	declares more fields than it stores — a Button has no column at all and an
	`is_virtual` field is computed in Python — so naming one of those as the
	column's real home would send the agent to write a second query that fails
	exactly like the first. The declaration is the fallback for a type whose
	table cannot be read, where the field list still beats saying nothing.
	"""
	try:
		columns = set(get_table_columns(doctype))
	except Exception:
		columns = set()

	if not columns:
		meta = get_doctype_metadata(doctype)
		columns = {
			df.fieldname
			for df in meta.fields
			if df.fieldname and df.fieldtype not in _CHILD_TABLE_FIELD_TYPES
		}
		if bool(getattr(meta, "istable", 0)):
			columns.update({"parent", "parenttype", "parentfield"})

	columns.update({"name", "owner", "creation", "modified", "modified_by", "docstatus", "idx"})
	return columns


def _child_doctypes_of(doctype: str) -> list[str]:
	"""The DocTypes whose rows belong to this one."""
	meta = get_doctype_metadata(doctype)
	return [df.options for df in meta.fields if df.fieldtype in _CHILD_TABLE_FIELD_TYPES and df.options]


def _documents_holding(child: str) -> list[str]:
	"""The DocTypes whose documents own rows of this child table.

	Frappe records the relationship one way only — a parent lists its child
	tables as fields — so the way back is a lookup on DocField. One indexed
	read, and an empty list if anything about it goes wrong: a child table
	whose parent cannot be named still gets the generic parent/child sentence,
	which is worth more than an error.
	"""
	try:
		return [
			row.parent
			for row in frappe.get_all(
				"DocField",
				filters={"options": child, "fieldtype": ["in", list(_CHILD_TABLE_FIELD_TYPES)]},
				fields=["parent"],
				limit=3,
			)
		]
	except Exception:
		return []


def _where_the_column_lives(column: str, sql: str) -> str:
	"""Name the table that HAS this column, out of the ones the query touched.

	WHY THE QUERY IS READ AND NOT JUST THE ERROR
		MariaDB says `Unknown column 'account' in 'SELECT'`. It names the column
		and it never names the table — so on a query that joins three tables the
		agent is told something is wrong and given no way to work out which of
		the three it is. It rewrote the same guess, and the same 1054 came back,
		until the customer cancelled the run.

		The query itself is in hand at the point this runs. Reading which tables
		it named turns "call get_schema" — advice the agent had already been
		given and could not act on — into the actual answer.

	Returns "" when nothing better than the generic explanation can be said, so
	the caller keeps its existing wording rather than printing a guess.
	"""
	doctypes = [name for name in _queried_doctypes(sql) if doctype_exists(name)]
	if not doctypes:
		return ""

	own: dict[str, set[str]] = {name: _columns_of(name) for name in doctypes}

	# It IS on one of them: the SELECT did not qualify it, or qualified it with
	# the wrong alias. Qualifying it is the whole fix.
	holders = [name for name, columns in own.items() if column in columns]
	if holders:
		return (
			f"'{column}' is not on `tab{doctypes[0]}` but IS on "
			f"`tab{holders[0]}` — qualify it as `tab{holders[0]}`.`{column}`."
		)

	# It is on the rows of one of them. This is the parent/child inversion, and
	# naming the child table and the join is the difference between one more
	# attempt and five.
	for parent in doctypes:
		for child in _child_doctypes_of(parent):
			if doctype_exists(child) and column in _columns_of(child):
				return (
					f"'{column}' is not on `tab{parent}`; it is on its rows, in "
					f"`tab{child}`. Join `tab{child}`.parent = `tab{parent}`.name."
				)

	# The query reads a child table and wants something off the document the
	# rows belong to. This is the inversion the other way round, and it is the
	# one the raw error is most misleading about: the column is perfectly real,
	# it is simply one join away.
	for child in doctypes:
		if not bool(getattr(get_doctype_metadata(child), "istable", 0)):
			continue
		for parent in _documents_holding(child):
			if doctype_exists(parent) and column in _columns_of(parent):
				return (
					f"`tab{child}` holds rows, not documents. '{column}' is on the "
					f"document — join `tab{parent}`.name = `tab{child}`.parent."
				)

	# Neither. The commonest cause by far is a name from another system, and a
	# near miss among the columns that DO exist is worth more than any advice.
	everything = sorted({name for columns in own.values() for name in columns})
	close = difflib.get_close_matches(column, everything, n=2, cutoff=0.7)
	if close:
		return (
			f"There is no '{column}' on {', '.join(f'`tab{d}`' for d in doctypes[:3])}. "
			f"Did you mean {' or '.join(close)}?"
		)
	return (
		f"There is no '{column}' on {', '.join(f'`tab{d}`' for d in doctypes[:3])}. "
		f"Call get_schema on the one you meant and use a name it lists."
	)


def _explain_missing_column(detail: str, sql: str = "") -> str:
	"""Say WHERE the column actually is, and only then what it might be instead.

	Either the column was never there — a name carried over from another system,
	or invented — or it is real but on the other end of a parent/child join: a
	row of Journal Entry Account has no posting_date, because the date belongs to
	the Journal Entry it sits in. Which of the two it is can be settled by
	reading the query, so it is settled rather than described.
	"""
	match = _MISSING_COLUMN_PATTERN.search(detail)
	if not match:
		return detail

	column = match.group(1).split(".")[-1]
	located = _where_the_column_lives(column, sql) if sql else ""
	if located:
		return _correction_first(located, detail)

	return _correction_first(
		f"'{column}' is not a column of that table. Either it does not exist, or "
		f"it is on the other side of a parent/child pair: a child row carries only "
		f"its own fields plus parent, parenttype, parentfield and idx, while the "
		f"date, party, company and status are on the parent. Call get_schema.",
		detail,
	)


def _explain_execution_error(exc: Exception, sql: str = "") -> str:
	"""Turn a driver error into something the agent can act on in one try.

	The agent is this endpoint's only caller and it is the thing that has to fix
	the query, so the reply has to carry the fix and not just the symptom.

	NOTHING IN HERE MAY RAISE. This runs inside an `except` block whose only job
	is to turn a failed query into a clean 500, and `execute_query` has no
	catch-all above it. An explainer that threw would replace a handled error
	with an unhandled traceback and the agent would be told nothing at all — the
	same shape as the log_error title that raised inside the error handler.
	"""
	# INSIDE THE GUARD, INCLUDING THIS. `str()` on an exception runs that
	# exception's own `__str__`, which is the driver's code and not ours; one
	# that raises would escape an error handler whose whole promise is that it
	# cannot, and the agent would be told nothing at all.
	detail = ""
	try:
		detail = str(exc)
		number = _error_number(exc)
		if number == _ERRNO_SYNTAX:
			return _explain_syntax_error(detail)
		if number == _ERRNO_NO_SUCH_TABLE:
			return _explain_missing_table(detail)
		if number == _ERRNO_NO_SUCH_COLUMN:
			return _explain_missing_column(detail, sql)
	except Exception:
		return detail or "The query failed and the database gave no readable reason."
	return detail


def validate_and_execute_query(sql_query: str, settings_user: str, include_cancelled: bool = False) -> dict:
	"""Validate a SQL query for read-only safety, then execute it under limits.

	Args:
		sql_query: The raw SQL query string.
		settings_user: The authenticated user identifier.
		include_cancelled: Leave draft and cancelled rows IN the tables this
			statement reads. Off by default — see `live_rows` — and switched on
			only by a caller whose question is about the cancelled documents
			themselves. The reply records that it was.

	Returns:
		dict with keys: success, user, columns, data, row_count, truncated,
		max_rows, live_filters, live_rows_enforced, cancelled_included.

		`truncated` exists so the agent can tell the user the truth. A silently
		capped result set is worse than no result at all here: the model would
		compute a total over 500 of 40,000 ledger rows and present it as the
		balance, which is precisely the fabricated-figure failure that
		project_rules.md §6 forbids.

		`live_filters` says which tables were replaced by their live rows and
		with what predicate, so the caller can state the exclusion rather than
		leave it silent; `live_rows_enforced` is False when the statement could
		not be parsed and ran as written, so the caller knows to filter itself.

	Raises:
		MissingParameterError: If sql_query is empty.
		ForbiddenQueryError: If the query is not a read-only single SELECT.
		QueryExecutionError: If the query fails during execution.
	"""
	if not sql_query:
		raise MissingParameterError("sql_query")

	clean_query = _rewrite_query(sql_query.strip())
	# AFTER the table names are canonical and BEFORE the guard, so what the
	# guard inspects is exactly what runs. The rewrite adds a SELECT * and a
	# predicate in a table's own columns; it adds no statement and no table.
	live_filters: dict[str, str] = {}
	enforced = False
	if not include_cancelled:
		clean_query, live_filters, enforced = exclude_dead_rows(clean_query, "mysql", _live_filter_for_table)
	assert_query_is_read_only(clean_query)

	max_rows = _max_result_rows()

	try:
		result = execute_select_query(
			clean_query,
			max_rows=max_rows,
			timeout_seconds=_query_timeout_seconds(),
		)
	except Exception as exc:
		# THE QUERY IS PASSED IN, and it is the whole reason this reply is
		# actionable: MariaDB's 1054 names the column and never the table it
		# was looking on, so only the failing statement can say which of the
		# tables it joined was the wrong one.
		raise QueryExecutionError(_explain_execution_error(exc, clean_query)) from exc

	columns = list(result[0].keys()) if result else []
	return {
		"success": True,
		"user": settings_user,
		"columns": columns,
		"data": result,
		"row_count": len(result),
		"truncated": len(result) >= max_rows,
		# The cap itself, not just the fact that it bound. A caller that knows
		# the page size can walk a wide GROUP BY in cursor-sized pages and
		# report the whole population; a caller that only knows "truncated"
		# has to guess the page size, and a guess that is wrong either stops
		# early (a partial figure presented as a total) or asks for pages that
		# do not exist. The site owns this number — `accountant_agent_max_query_rows`
		# — so the site is what publishes it.
		"max_rows": max_rows,
		# WHAT WAS EXCLUDED, BY NAME. A silent exclusion is as bad as none: the
		# caller has to be able to tell the reader "cancelled entries were left
		# out of this", and it can only say so if it is told.
		"live_filters": live_filters,
		"live_rows_enforced": enforced,
		"cancelled_included": bool(include_cancelled),
	}


def _live_filter_for_table(table_name: str) -> str | None:
	"""Which rows of one physical table are live, for `exclude_dead_rows`.

	Read off the DocType's definition through `_live_rows_filter` — the same
	answer `get_doctype_schema` publishes as `posted_filter`, so what the
	schema reply says and what a read actually excludes can never differ. A
	name that is not a DocType's table (a CTE alias, a catalogue view, a
	subquery name) answers None: every row of it counts.

	CHILD ROWS FOLLOW THEIR DOCUMENT. `tabSales Invoice Item` is not
	submittable and carries no `is_cancelled`, but Frappe stamps every child
	row with its parent's `docstatus` on submit and on cancel — so the items of
	a cancelled invoice sit in that table at docstatus 2, and a total over it
	that ignores them is wrong in exactly the way the ledger total was. When
	every document that owns the child table is submittable, its live rows are
	`docstatus = 1`; when some are and some are not, only the cancelled rows
	are certainly dead; when none are, every row counts.
	"""
	if not table_name.startswith("tab"):
		return None
	doctype = table_name[3:]
	if not doctype or not doctype_exists(doctype):
		return None
	meta = get_doctype_metadata(doctype)
	if bool(getattr(meta, "issingle", 0)):
		return None
	real_columns = set(get_table_columns(doctype))
	own = _live_rows_filter(meta, real_columns).get("posted_filter")
	if own or not bool(getattr(meta, "istable", 0)) or "docstatus" not in real_columns:
		return own
	parents = _documents_holding(doctype)
	if not parents:
		return None
	submittable = [bool(getattr(get_doctype_metadata(parent), "is_submittable", 0)) for parent in parents]
	if all(submittable):
		return "docstatus = 1"
	if any(submittable):
		return "docstatus != 2"
	return None


# ─── DocType Schema Service ─────────────────────────────────────────────────

# Layout field types that carry no data and should be excluded from schema summaries
#
# `Table` is here because a table field is not a column on this DocType's own
# table — its rows live somewhere else entirely. Listing it among the columns
# would be a lie. It is reported separately, under `child_tables`, because NOT
# reporting it at all was worse: a caller asking about a Journal Entry was
# never told that Journal Entry Account existed, so it had to guess both the
# table name and what a row of it holds, and it guessed that the header's
# posting_date was on the row.
_IGNORED_FIELD_TYPES: set[str] = {
	"Section Break",
	"Column Break",
	"Tab Break",
	"HTML",
	"Fold",
	"Table",
	"Table MultiSelect",
	"Heading",
}

# Field types whose rows live in their own table.
_CHILD_TABLE_FIELD_TYPES: tuple[str, ...] = ("Table", "Table MultiSelect")

#: The columns Frappe puts on every child row, whatever the DocType. They are
#: how a row is joined back to the document it belongs to, and none of them is
#: in `meta.fields`, so a caller that only sees the field list does not know a
#: row can be joined at all.
_CHILD_ROW_COLUMNS: tuple[str, ...] = (
	"parent (Data) - the `name` of the document this row belongs to",
	"parenttype (Data) - the DocType of that document",
	"parentfield (Data) - which table field of it this row sits in",
	"idx (Int) - the row's position in that table, starting at 1",
)

#: Where a Single DocType actually keeps its values. Frappe gives a Single no
#: table of its own: `tabGlobal Defaults` does not exist and never did, and a
#: caller told its table was `tab<DocType>` got "Table ... doesn't exist" for a
#: perfectly ordinary question.
_SINGLES_TABLE: str = "tabSingles"


def _child_table_entry(df) -> dict:
	"""One row of the `child_tables` list, for a table field."""
	child = df.options or ""
	return {
		"fieldname": df.fieldname,
		"label": df.label or df.fieldname,
		"doctype": child,
		"table_name": f"tab{child}" if child else "",
	}


def _how_to_read(doctype: str, is_single: bool, is_child: bool, child_tables: list[dict]) -> str:
	"""One sentence telling the caller where this DocType's rows actually are.

	Written because the two commonest failed queries against this endpoint were
	both the caller believing something the reply had implied. A Single was said
	to live in `tab<DocType>`, which does not exist. A parent never mentioned its
	rows, so their columns were guessed onto the parent and the parent's columns
	were guessed onto them.
	"""
	if is_single:
		return (
			f"'{doctype}' is a Single: it has ONE set of values and NO table of its "
			f"own. `tab{doctype}` does not exist. Read it from `{_SINGLES_TABLE}`, "
			f"which stores one row per setting: "
			f"SELECT field, value FROM `{_SINGLES_TABLE}` WHERE doctype = '{doctype}'. "
			f"The `fields` below are the values the `field` column can take."
		)

	if is_child:
		return (
			f"'{doctype}' is a child table: every row belongs to a parent document "
			f"and carries only the columns listed below. The posting date, the party, "
			f"the company and the status are on the PARENT, not here — join "
			f"`tab{doctype}`.parent to the parent table's `name` to reach them."
		)

	if child_tables:
		named = ", ".join(f"`{row['table_name']}`" for row in child_tables if row["table_name"])
		return (
			f"The rows of '{doctype}' are NOT columns of `tab{doctype}`; they live in "
			f"their own tables ({named}), joined by parent = `tab{doctype}`.name. Call "
			f"get_schema on one of those to see what a row holds."
		)

	return ""


def build_doctype_schema_summary(doctype: str) -> dict:
	"""
	Build a filtered schema summary for a DocType, optimized for LLM consumption.

	Args:
		doctype: The DocType name to summarize.

	Returns:
		dict with keys: success, doctype, table_name, is_single, is_child_table,
		is_submittable, child_tables, how_to_read, fields.

	Raises:
		MissingParameterError: If doctype is empty.
		ResourceNotFoundError: If the DocType does not exist.
	"""
	if not doctype:
		raise MissingParameterError("doctype")

	if not doctype_exists(doctype):
		raise ResourceNotFoundError("DocType", doctype)

	meta = get_doctype_metadata(doctype)

	is_single = bool(getattr(meta, "issingle", 0))
	is_child = bool(getattr(meta, "istable", 0))

	# THE COLUMNS THIS TABLE REALLY HAS, asked of the database itself.
	#
	# A DocType declares more fields than it stores. Buttons are fields with no
	# column at all; a field marked `is_virtual` is computed in Python and
	# never written. On a stock Sales Invoice that is three names — including
	# `last_scanned_warehouse` — advertised to the agent as columns it can
	# select, and it cannot tell which of the names it was GIVEN are real. It
	# looks the schema up first, exactly as instructed, writes a query, and
	# gets "Unknown column"; its only recourse is to try another name and be
	# refused again.
	#
	# Filtering on fieldtype alone was the previous approach and it is the
	# reason this went unnoticed: it removed the layout breaks and left the
	# Buttons. Asking the database removes the whole class of mistake rather
	# than the instances of it somebody thought to list.
	#
	# A SINGLE IS THE ONE TYPE THIS QUESTION CANNOT BE ASKED OF. It has no
	# table, so the database answers by raising — and its fields are still
	# perfectly real: they are the values the `field` column of `tabSingles`
	# can take. Asked of a Single, this whole filter is skipped rather than
	# publishing an empty document type.
	real_columns = set() if is_single else set(get_table_columns(doctype))

	fields_summary: list[str] = [
		"name (Data/Primary Key)",
		"docstatus (Int: 0=Draft, 1=Submitted, 2=Cancelled)",
	]

	# A child row's link back to its document. Frappe puts these on every child
	# table and on none of them does it appear in `meta.fields`, so a caller
	# working from the field list alone cannot see that the row can be joined at
	# all — and writes the parent's date into the child's SELECT instead.
	if is_child:
		fields_summary.extend(_CHILD_ROW_COLUMNS)

	child_tables: list[dict] = []

	for df in meta.fields:
		# The rows of this document. Not a column here and never selectable
		# from this table, so it is reported as the separate table it is.
		if df.fieldtype in _CHILD_TABLE_FIELD_TYPES:
			child_tables.append(_child_table_entry(df))
			continue

		if df.fieldtype in _IGNORED_FIELD_TYPES:
			continue
		if not is_single and df.fieldname not in real_columns:
			continue

		info = f"{df.fieldname} ({df.fieldtype})"

		if df.label:
			info += f" - {df.label}"
		if df.reqd:
			info += " [Mandatory]"

		if df.fieldtype == "Link" and df.options:
			info += f" -> Link to {df.options}"
		elif df.fieldtype == "Select" and df.options:
			opts = [o.strip() for o in df.options.split("\n") if o.strip()]
			if len(opts) <= 10:
				info += f" [Options: {', '.join(opts)}]"

		fields_summary.append(info)

	return {
		"success": True,
		"doctype": doctype,
		# The table a SELECT should name. For a Single that is not `tab<DocType>`
		# — Frappe never creates one — and saying otherwise sent the caller to a
		# table that does not exist, which came back as a raw "Table ... doesn't
		# exist" that read like the customer's ERP was broken.
		"table_name": _SINGLES_TABLE if is_single else f"tab{doctype}",
		"is_single": is_single,
		"is_child_table": is_child,
		# The tables this document's rows live in. Empty for a document that has
		# none. Never omitted, so a caller can tell "no child tables" from "this
		# reply predates the field".
		"child_tables": child_tables,
		"how_to_read": _how_to_read(doctype, is_single, is_child, child_tables),
		# Whether `docstatus` means anything on this table. A submittable
		# DocType stores drafts (0), submitted (1) and cancelled (2) records
		# side by side, so an analysis of it that does not constrain docstatus
		# totals invoices that were never issued and invoices that were
		# withdrawn. A master such as Customer or Item is never submitted and
		# every row sits at 0, so the same constraint would return nothing.
		# The caller cannot tell the two apart from the field list alone.
		"is_submittable": bool(getattr(meta, "is_submittable", 0)),
		# THE FILTER ITSELF, not only the flag it is derived from.
		#
		# `is_submittable` is a fact about this DocType; `posted_filter` is an
		# instruction the agent can put straight into a WHERE clause, and it is
		# the SITE that owns the spelling. That matters because this app is no
		# longer the only implementation of this endpoint: the Odoo module
		# answers the same call, and there "posted" is `state = 'posted'` on one
		# model and `state = 'sale'` on another. An agent that has to infer the
		# predicate from a boolean has to know which ERP it is talking to in
		# order to guess the column — which is exactly the knowledge the ERP
		# port exists to keep out of the agent.
		#
		# Absent, not empty, when every row of the DocType is real: a Customer
		# or an Item is never submitted and never cancelled, and constraining
		# either on one returns nothing at all.
		**_live_rows_filter(meta, real_columns),
		"fields": fields_summary,
	}


def _live_rows_filter(meta, real_columns: set[str]) -> dict[str, str]:
	"""The WHERE clause that keeps only the rows that count, or nothing.

	TWO FACTS DECIDE IT, BOTH READ OFF THE DEFINITION AND NEVER OFF THE NAME.

	A submittable DocType stores drafts (0), submitted (1) and cancelled (2)
	side by side, so only `docstatus = 1` rows are real.

	A DocType that carries an `is_cancelled` flag marks a withdrawn row with
	that flag and with NOTHING ELSE. The general ledger is the case that
	matters: `tabGL Entry` is not submittable — every row sits at docstatus 1,
	the cancelled ones included — so a reader told "no posted filter, every
	row counts" totalled 229 cancelled rows (5.5M EGP on one bench) as live
	and raised a High audit finding about duplicated cash that did not exist.
	The stock and payment ledgers are built the same way, and any DocType a
	customer's own apps build that way is caught by the same reading.

	Both facts can hold at once, and then both predicates apply.
	"""
	predicates: list[str] = []
	if getattr(meta, "is_submittable", 0):
		predicates.append("docstatus = 1")
	if "is_cancelled" in real_columns and any(
		df.fieldname == "is_cancelled" and df.fieldtype == "Check" for df in meta.fields
	):
		predicates.append("is_cancelled = 0")
	if not predicates:
		return {}
	return {"posted_filter": " AND ".join(predicates)}


def _assert_session_owned_by(session_id: str, settings_name: str) -> None:
	"""Raise ResourceNotFoundError unless the caller's key owns that chat session.

	Without this, any holder of a valid Agent Settings API key could pass any
	other customer's session_id and attach
	generated files to that customer's chat (cross-session IDOR). The response
	says "not found" rather than "forbidden" for a session that exists but
	belongs to someone else, so this endpoint cannot be used to enumerate other
	customers' session ids by their response code alone.

	BOTH SIDES ARE RESOLVED TO AN ERP USER. ``settings_name`` is what
	``authenticate_by_api_key`` returns — the Agent Settings DOCUMENT NAME, a
	generated id like "3hr0oi1o6q", not a person. Comparing that id against the
	chat's owner ("Administrator") could never match, so every generated file
	came back to the customer as "Chat session not found" and no report, sheet
	or PDF could be delivered at all.
	"""
	chat_owner = get_chat_session_owner(session_id)
	caller = get_settings_owner(settings_name)
	if not chat_owner or not caller or chat_owner != caller:
		raise ResourceNotFoundError("Chat session", session_id)


#: Ceiling on a generated report the agent may push back into the ERP. Reports
#: are spreadsheets and PDFs, not datasets; anything larger is a bug in the
#: generator, and without a cap that bug becomes an unbounded write into the
#: customer's file store.
MAX_GENERATED_FILE_BYTES: int = 25 * 1024 * 1024

#: How long a generated report stays available for download before the hourly
#: sweep removes it. Long enough to open from the chat, short enough that the
#: customer's private file store does not accumulate financial extracts.
GENERATED_FILE_RETENTION_HOURS: int = 3

#: Deletions per sweep. Bounds one job's runtime and memory on a site whose
#: cleanup has not run for a while, rather than loading every stale row at once.
_CLEANUP_BATCH_SIZE: int = 500


class FileTooLargeError(Exception):
	"""Raised when an uploaded file exceeds the permitted size."""

	def __init__(self, size_bytes: int, limit_bytes: int) -> None:
		self.size_bytes = size_bytes
		self.limit_bytes = limit_bytes
		super().__init__(f"File of {size_bytes} bytes exceeds the {limit_bytes} byte limit.")


def save_generated_file(session_id: str, uploaded_file: Any, settings_user: str) -> dict:
	"""Store an agent-generated report as a private file linked to the session.

	Private, always. These are trial balances, ageing schedules and audit
	working papers; a public file in Frappe is served to anonymous callers by
	URL alone.

	Raises:
		MissingParameterError: If session_id is missing.
		ResourceNotFoundError: If the chat session does not exist.
		FileTooLargeError: If the payload exceeds MAX_GENERATED_FILE_BYTES.
	"""
	if not session_id:
		raise MissingParameterError("session_id")

	_assert_session_owned_by(session_id, settings_user)

	content = uploaded_file.read()
	if len(content) > MAX_GENERATED_FILE_BYTES:
		raise FileTooLargeError(len(content), MAX_GENERATED_FILE_BYTES)

	file_doc = save_file(
		fname=uploaded_file.filename,
		content=content,
		dt="Agent Chats",
		dn=session_id,
		is_private=1,
		df=None,
	)

	return {
		"success": True,
		"file_url": file_doc.file_url,
		"filename": file_doc.file_name,
	}


def cleanup_old_files() -> None:
	"""Hourly sweep of expired agent-generated reports.

	Scoped to files this app attached to an Agent Chats session, which is only
	ever a report the agent produced — user uploads never become File documents
	(see `upload_agent_file`). Nothing a customer uploaded is at risk here.

	The cutoff uses `frappe.utils.now_datetime`, not `datetime.now`. Frappe
	stores `creation` in the site's configured timezone; comparing it against
	the container's local clock silently shifts the window by the UTC offset,
	which either spares files forever or deletes them while they are still on
	screen.
	"""
	cutoff = frappe.utils.now_datetime() - timedelta(hours=GENERATED_FILE_RETENTION_HOURS)

	expired = frappe.get_all(
		"File",
		filters={
			"attached_to_doctype": "Agent Chats",
			"is_private": 1,
			"creation": ["<", cutoff],
		},
		pluck="name",
		limit=_CLEANUP_BATCH_SIZE,
	)

	for file_name in expired:
		try:
			frappe.delete_doc("File", file_name, ignore_permissions=True, delete_permanently=True)
			frappe.db.commit()
		except Exception as exc:
			# Commit per file, and roll back only the one that failed: a single
			# undeletable file must not discard the deletions that succeeded
			# before it, or the sweep can never make progress past it.
			frappe.db.rollback()
			frappe.log_error(
				title="Agent file cleanup",
				message=f"Could not delete expired file {file_name}: {exc}",
			)
