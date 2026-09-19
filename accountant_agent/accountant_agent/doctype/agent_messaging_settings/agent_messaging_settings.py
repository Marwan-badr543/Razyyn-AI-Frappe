# Copyright (c) 2026, Razyyn and contributors
# For license information, please see license.txt

from frappe.model.document import Document

#: The three lists of destinations, one per channel tab. Each is its own book:
#: Telegram and Slack hold the whole set of places a bot can reach, email holds
#: the people it is worth saving an address for.
_DESTINATION_TABLES = ("email_destinations", "telegram_destinations", "slack_destinations")


class AgentMessagingSettings(Document):
	def validate(self):
		self._settle_the_defaults()

	def _settle_the_defaults(self):
		"""One default per channel, settled whenever this is saved.

		Two defaults is not an error anyone would notice on the form; it is a
		message going to the wrong colleague weeks later. The send path resolves
		a default by taking the first one it finds, so THE LAST ONE TICKED WINS
		and there is only ever one to find — ticking a new default is how a
		person says "this one now", and leaving the older tick in place would
		make that say nothing at all.

		The Odoo module settles it the same way, deliberately: a rule two
		products apply differently is a rule neither of them really has.
		"""
		for table in _DESTINATION_TABLES:
			rows = [row for row in (self.get(table) or []) if row.is_default]
			for row in rows[:-1]:
				row.is_default = 0
