__version__ = "0.0.1"

# Automatically ensure Frappe template render_include handles JS escape sequences safely
try:
	import accountant_agent.patches.fix_render_include  # noqa: F401
except Exception:
	pass

