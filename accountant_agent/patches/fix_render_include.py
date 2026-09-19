import re

try:
	import frappe.model.utils
	_orig_render_include = frappe.model.utils.render_include

	def _safe_render_include(content: str) -> str:
		try:
			return _orig_render_include(content)
		except re.error:
			# If unpatched Frappe raises bad escape regex errors, safely evaluate replacements
			orig_re_sub = re.sub
			re.sub = lambda pattern, repl, string, *args, **kwargs: (
				orig_re_sub(pattern, (lambda _: repl) if isinstance(repl, str) else repl, string, *args, **kwargs)
			)
			try:
				return _orig_render_include(content)
			finally:
				re.sub = orig_re_sub

	frappe.model.utils.render_include = _safe_render_include
except Exception:
	pass
