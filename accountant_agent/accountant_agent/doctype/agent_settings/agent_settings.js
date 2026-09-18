// Copyright (c) 2026, Marwan Badr and contributors
// For license information, please see license.txt

frappe.ui.form.on("Agent Settings", {
	refresh(frm) {
		trigger_usage_load(frm);
		if (frm.fields_dict.custom_instructions && frm.fields_dict.custom_instructions.input) {
			$(frm.fields_dict.custom_instructions.input).attr('maxlength', 20000);
		}
	},
	onload(frm) {
		trigger_usage_load(frm);
	},
	validate(frm) {
		if (frm.doc.custom_instructions && frm.doc.custom_instructions.length > 20000) {
			frappe.msgprint({
				title: __('Validation Error'),
				indicator: 'red',
				message: __('Custom Instructions cannot exceed 2000 characters.')
			});
			frappe.validated = false;
		}
	}
});

function trigger_usage_load(frm) {
	let email = frm.doc.email || (frm.doc.name && frm.doc.name.includes("@") ? frm.doc.name : null);
	if (email && !frm.is_new()) {
		load_usage_stats(frm, email);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Company accounting knowledge
//
// The company's own policy PDF, and the jurisdiction whose law the agent
// applies. Both are read by the agent's helpers when it is asked what the
// company's rules or the local requirements say, so what is on this card is
// what the agent believes about this business.
//
// WHAT WAS WRONG WITH THE PREVIOUS CARD
//   * The country was a 75-pixel box asking for two letters. A mistyped code is
//     not a cosmetic slip: it selects which country's accounting law is
//     retrieved, so "AE" typed for Egypt answers under the wrong jurisdiction
//     and nothing anywhere reports an error. It is a list now, fetched from the
//     platform so this file holds no copy of it, searchable by name.
//   * A bare file input with no filename, no size check and no progress. The
//     customer pressed Upload and watched nothing happen for thirty seconds.
//   * Every failure read the same. `if (!response.ok) throw new Error(generic)`
//     discarded the server's reason, so "this PDF has no searchable text",
//     "larger than 40 MB" and "your session expired" were one sentence that
//     helped with none of them.
//   * Nothing said what had been indexed. A policy that uploaded but extracted
//     two pages out of sixty looked identical to one that worked.
//   * Delete had no confirmation, on a document that has to be re-uploaded to
//     come back.
// ─────────────────────────────────────────────────────────────────────────────

frappe.ui.form.on("Agent Settings", {
	refresh(frm) {
		if (!frm.is_new() && agent_email_of(frm)) render_company_knowledge(frm);
	},
});

//: Injected from here rather than registered as an app stylesheet, so this card
//: needs no asset build to look right on a site that already has the app.
//: Idempotent: the element is identified, and a second call finds it.
const _KNOWLEDGE_STYLE_ID = "agent-knowledge-card-styles";

function ensure_knowledge_styles() {
	if (document.getElementById(_KNOWLEDGE_STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = _KNOWLEDGE_STYLE_ID;
	style.textContent = `
/* ─────────────────────────────────────────────────────────────────────────────
   Company accounting knowledge card (Agent Settings)

   Styled here rather than in inline attributes so it inherits the site's own
   light/dark variables instead of hard-coding a palette that inverts badly.
   ───────────────────────────────────────────────────────────────────────── */

.agent-company-knowledge { margin: 18px 0; width: 100%; }

.agent-knowledge-card {
	border: 1px solid var(--border-color, #e5e7eb);
	border-radius: 12px;
	background: var(--card-bg, #ffffff);
	padding: 20px;
	box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
}

.agent-knowledge-loading { color: var(--text-muted, #6b7280); font-size: 13px; }

.agent-knowledge-head h4 { margin: 0 0 6px; font-size: 16px; font-weight: 700; }
.agent-knowledge-head p {
	margin: 0;
	font-size: 13px;
	line-height: 1.55;
	color: var(--text-muted, #6b7280);
}

.agent-knowledge-row {
	margin-top: 18px;
	padding-top: 16px;
	border-top: 1px solid var(--border-color, #eceff3);
}
.agent-knowledge-row > label {
	display: block;
	font-size: 13px;
	font-weight: 600;
	margin-bottom: 8px;
	color: var(--text-color, #374151);
}
.agent-knowledge-row > small {
	display: block;
	margin-top: 8px;
	font-size: 12px;
	line-height: 1.5;
	color: var(--text-muted, #6b7280);
}

.agent-knowledge-control {
	display: flex;
	gap: 10px;
	align-items: center;
	flex-wrap: wrap;
}
.agent-knowledge-control .company-country { max-width: 340px; }
.agent-knowledge-progress { font-size: 12.5px; }

.agent-knowledge-doc {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 14px;
	padding: 14px 16px;
	border: 1px solid var(--border-color, #e5e7eb);
	border-radius: 10px;
	background: var(--bg-color, #f9fafb);
}
.agent-knowledge-doc-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
.agent-knowledge-doc.is-empty { display: flex; align-items: center; gap: 12px; }
.agent-knowledge-doc-title {
	font-size: 13.5px;
	font-weight: 600;
	color: var(--text-color, #111827);
	overflow-wrap: anywhere;
}
.agent-knowledge-doc-meta { font-size: 12px; color: var(--text-muted, #6b7280); margin-top: 2px; }

.agent-knowledge-dot {
	width: 9px;
	height: 9px;
	border-radius: 50%;
	flex-shrink: 0;
	display: inline-block;
}
.agent-knowledge-dot.is-good { background: #10a37f; }
.agent-knowledge-dot.is-idle { background: #d1d5db; }

.agent-knowledge-drop {
	border: 1.5px dashed var(--border-color, #d1d5db);
	border-radius: 10px;
	padding: 18px;
	text-align: center;
	transition: border-color 0.15s ease, background-color 0.15s ease;
}
.agent-knowledge-drop.is-over {
	border-color: #10a37f;
	background: rgba(16, 163, 127, 0.06);
}
.agent-knowledge-drop-inner { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.agent-knowledge-drop-inner .fa { font-size: 22px; color: var(--text-muted, #9ca3af); }
.agent-knowledge-drop-inner > div { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }
.agent-knowledge-drop-inner small { font-size: 12px; line-height: 1.5; color: var(--text-muted, #6b7280); max-width: 460px; }
.agent-knowledge-filename { font-size: 12.5px; overflow-wrap: anywhere; }

.agent-knowledge-alert {
	margin-top: 16px;
	padding: 11px 14px;
	border-radius: 8px;
	font-size: 13px;
	line-height: 1.5;
}
.agent-knowledge-alert.is-bad { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
.agent-knowledge-alert.is-good { background: #d1fae5; color: #047857; border: 1px solid #a7f3d0; }

@media (max-width: 640px) {
	.agent-knowledge-doc { flex-direction: column; align-items: flex-start; }
	.agent-knowledge-control .company-country { max-width: 100%; width: 100%; }
}
`;
	document.head.appendChild(style);
}

//: Fetched once per page load. 249 countries is a big enough list to be worth
//: not re-requesting on every redraw, and small enough to keep in memory.
let _country_cache = null;

function company_knowledge_container(frm) {
	let $found = $(frm.wrapper).find(".agent-company-knowledge");
	if ($found.length) return $found;
	let $container = $('<div class="agent-company-knowledge"></div>');
	const anchor = frm.fields_dict.write_setup_html || frm.fields_dict.custom_instructions;
	if (anchor && anchor.wrapper) $container.insertAfter($(anchor.wrapper));
	else $container.appendTo($(frm.wrapper).find(".form-page").last());
	return $container;
}

function knowledge_error(error) {
	// Frappe wraps a thrown server message in `_server_messages`; a FastAPI
	// refusal relayed by our own method comes back as `exception`/`message`.
	// Whichever shape it is, the customer gets the actual reason.
	const data = (error && error.responseJSON) || {};
	let messages = [];
	try {
		messages = JSON.parse(data._server_messages || "[]").map((entry) => {
			try { return JSON.parse(entry).message; } catch (e) { return entry; }
		});
	} catch (e) { messages = []; }
	const text = messages.filter(Boolean).join(" ")
		|| data.message
		|| (data.exception || "").split(":").slice(1).join(":").trim()
		|| (error && error.message)
		|| __("The request was refused.");
	return frappe.utils.escape_html(String(text)).replace(/<[^>]*>/g, "");
}

function render_company_knowledge(frm) {
	ensure_knowledge_styles();
	const email = agent_email_of(frm);
	const $box = company_knowledge_container(frm);
	$box.html(`<div class="agent-knowledge-card agent-knowledge-loading">
		<i class="fa fa-spinner fa-spin"></i> ${__("Loading your company knowledge...")}</div>`);

	frappe.call({
		method: "accountant_agent.knowledge.get_company_knowledge",
		args: { email },
		callback(r) {
			const data = r.message || {};
			if (Array.isArray(data.countries) && data.countries.length) _country_cache = data.countries;
			draw_company_knowledge(frm, $box, email, data);
		},
		error(err) {
			$box.html(`<div class="agent-knowledge-card">
				<h4>${__("Company accounting knowledge")}</h4>
				<div class="agent-knowledge-alert is-bad">${knowledge_error(err)}</div>
				<button class="btn btn-default btn-sm retry-knowledge">${__("Try again")}</button>
			</div>`);
			$box.find(".retry-knowledge").on("click", () => render_company_knowledge(frm));
		},
	});
}

function country_options(selected) {
	const list = _country_cache || [{ code: selected || "EG", name: selected || "EG" }];
	return list
		.map((c) => {
			const chosen = c.code === selected ? " selected" : "";
			return `<option value="${frappe.utils.escape_html(c.code)}"${chosen}>` +
				`${frappe.utils.escape_html(c.name)} (${frappe.utils.escape_html(c.code)})</option>`;
		})
		.join("");
}

function draw_company_knowledge(frm, $box, email, data) {
	const policy = (data.documents || []).find((item) => item.scope === "company");
	const country = data.country_code || "EG";
	const esc = (value) => frappe.utils.escape_html(String(value == null ? "" : value));

	const status = policy
		? `<div class="agent-knowledge-doc">
				<div class="agent-knowledge-doc-main">
					<span class="agent-knowledge-dot is-good"></span>
					<div>
						<div class="agent-knowledge-doc-title">${esc(policy.title)}</div>
						<div class="agent-knowledge-doc-meta">${__("In use by the agent")} ·
							${esc(policy.page_count)} ${__("pages")} ·
							${esc(policy.chunk_count)} ${__("searchable sections")}</div>
					</div>
				</div>
				<button class="btn btn-default btn-sm delete-company-policy"
						data-id="${esc(policy.document_id)}"
						data-title="${esc(policy.title)}">${__("Remove")}</button>
			</div>`
		: `<div class="agent-knowledge-doc is-empty">
				<span class="agent-knowledge-dot is-idle"></span>
				<div>
					<div class="agent-knowledge-doc-title">${__("No policy uploaded yet")}</div>
					<div class="agent-knowledge-doc-meta">${__("The agent will work from your ledger and general accounting practice until you add one.")}</div>
				</div>
			</div>`;

	$box.html(`
		<div class="agent-knowledge-card">
			<div class="agent-knowledge-head">
				<h4>${__("Company accounting knowledge")}</h4>
				<p>${__("What the agent should know about how YOUR business keeps its books — your accounting policy, your approval rules, your chart conventions. It reads this before answering questions about your own rules.")}</p>
			</div>

			<div class="agent-knowledge-row">
				<label for="agent-knowledge-country">${__("Country whose accounting rules apply")}</label>
				<div class="agent-knowledge-control">
					<select id="agent-knowledge-country" class="form-control company-country">
						${country_options(country)}
					</select>
					<button class="btn btn-default save-company-country" disabled>${__("Save")}</button>
				</div>
				<small>${__("Chosen from the countries the platform supports. The agent applies this country's requirements over general accounting guidance.")}</small>
			</div>

			<div class="agent-knowledge-row">
				<label>${__("Your accounting policy")}</label>
				${status}
			</div>

			<div class="agent-knowledge-row">
				<div class="agent-knowledge-drop">
					<input type="file" class="company-policy-file" accept=".pdf,application/pdf" hidden>
					<div class="agent-knowledge-drop-inner">
						<i class="fa fa-file-pdf-o"></i>
						<div>
							<button class="btn btn-default btn-sm choose-company-policy">${__("Choose a PDF")}</button>
							<span class="agent-knowledge-filename text-muted">${__("or drop one here")}</span>
						</div>
						<small>${__("Searchable text PDF, up to 40 MB. Scans and photographs of pages are not accepted — the agent reads the text, it does not look at the picture.")}</small>
					</div>
				</div>
				<div class="agent-knowledge-control">
					<button class="btn btn-primary upload-company-policy" disabled>
						${policy ? __("Replace policy") : __("Upload policy")}</button>
					<span class="agent-knowledge-progress text-muted"></span>
				</div>
				${policy ? `<small>${__("Uploading a new PDF replaces the current one. The old policy stops being used immediately.")}</small>` : ""}
			</div>

			<div class="agent-knowledge-alert" hidden></div>
		</div>`);

	bind_company_knowledge_actions(frm, $box, email, country);
}

function bind_company_knowledge_actions(frm, $box, email, saved_country) {
	const $alert = $box.find(".agent-knowledge-alert");
	const $file = $box.find(".company-policy-file");
	const $upload = $box.find(".upload-company-policy");
	const $filename = $box.find(".agent-knowledge-filename");
	const $progress = $box.find(".agent-knowledge-progress");
	const $country = $box.find(".company-country");
	const $saveCountry = $box.find(".save-company-country");

	const say = (message, kind) => {
		$alert.removeClass("is-bad is-good").addClass(kind === "error" ? "is-bad" : "is-good");
		$alert.text(message).prop("hidden", false);
	};
	const quiet = () => $alert.prop("hidden", true).text("");

	// ── country ──────────────────────────────────────────────────────────────
	// Saved on a button, not on change: the platform rate-limits this route
	// because it is the same one that changes a password, and a dropdown that
	// wrote on every keystroke-scroll would spend that budget on nothing.
	$country.on("change", function () {
		$saveCountry.prop("disabled", this.value === saved_country);
		quiet();
	});
	$saveCountry.on("click", function () {
		const code = $country.val();
		const $button = $(this);
		$button.prop("disabled", true).text(__("Saving..."));
		frappe.call({
			method: "accountant_agent.knowledge.set_company_country",
			args: { email, country_code: code },
			callback: () => {
				saved_country = code;
				$button.text(__("Save"));
				say(__("Country saved. The agent now applies {0}.", [$country.find("option:selected").text()]), "ok");
			},
			error: (err) => {
				$button.prop("disabled", false).text(__("Save"));
				say(knowledge_error(err), "error");
			},
		});
	});

	// ── choosing the file ────────────────────────────────────────────────────
	const MAX_BYTES = 40 * 1024 * 1024;
	const accept = (file) => {
		if (!file) return;
		if (!/\.pdf$/i.test(file.name)) {
			say(__("That is not a PDF. Export your policy as a PDF and try again."), "error");
			return;
		}
		if (file.size > MAX_BYTES) {
			say(__("That PDF is {0} MB. The limit is 40 MB.", [(file.size / 1048576).toFixed(1)]), "error");
			return;
		}
		quiet();
		$filename.text(`${file.name} (${(file.size / 1048576).toFixed(1)} MB)`);
		$upload.prop("disabled", false);
	};

	$box.find(".choose-company-policy").on("click", (e) => { e.preventDefault(); $file.trigger("click"); });
	$file.on("change", function () { accept(this.files[0]); });

	const $drop = $box.find(".agent-knowledge-drop");
	$drop.on("dragover", (e) => { e.preventDefault(); $drop.addClass("is-over"); });
	$drop.on("dragleave drop", () => $drop.removeClass("is-over"));
	$drop.on("drop", (e) => {
		e.preventDefault();
		const dropped = e.originalEvent.dataTransfer.files[0];
		if (dropped) { $file[0].files = e.originalEvent.dataTransfer.files; accept(dropped); }
	});

	// ── uploading ────────────────────────────────────────────────────────────
	$upload.on("click", function () {
		const file = $file[0].files[0];
		if (!file) return;
		const $button = $(this);
		const form = new FormData();
		form.append("email", email);
		form.append("title", "Company accounting policy");
		form.append("file", file, file.name);

		$button.prop("disabled", true);
		$saveCountry.prop("disabled", true);
		quiet();
		// Reading a PDF and indexing it takes real seconds. Say so, and keep
		// saying it, rather than leaving a disabled button and a still page.
		$progress.text(__("Reading the PDF and indexing it — this can take up to a minute..."));

		// XHR rather than fetch, for the one thing fetch cannot report: upload
		// progress. A 40 MB policy over a slow office link is a minute of
		// silence otherwise.
		const request = new XMLHttpRequest();
		request.open("POST", "/api/method/accountant_agent.knowledge.upload_company_knowledge");
		request.setRequestHeader("X-Frappe-CSRF-Token", frappe.csrf_token);
		request.upload.onprogress = (event) => {
			if (!event.lengthComputable) return;
			const percent = Math.round((event.loaded / event.total) * 100);
			$progress.text(percent < 100
				? __("Sending... {0}%", [percent])
				: __("Reading the PDF and indexing it..."));
		};
		request.onload = () => {
			$progress.text("");
			$button.prop("disabled", false);
			let body = {};
			try { body = JSON.parse(request.responseText || "{}"); } catch (e) { body = {}; }
			if (request.status >= 200 && request.status < 300) {
				const indexed = body.message || {};
				frappe.show_alert({
					message: __("Policy indexed: {0} pages, {1} searchable sections.",
						[indexed.page_count || "?", indexed.chunk_count || "?"]),
					indicator: "green",
				}, 7);
				render_company_knowledge(frm);
				return;
			}
			say(knowledge_error({ responseJSON: body }), "error");
		};
		request.onerror = () => {
			$progress.text("");
			$button.prop("disabled", false);
			say(__("The upload did not reach the server. Check your connection and try again."), "error");
		};
		request.send(form);
	});

	// ── removing ─────────────────────────────────────────────────────────────
	$box.find(".delete-company-policy").on("click", function () {
		const id = $(this).data("id");
		const title = $(this).data("title");
		frappe.confirm(
			__("Remove \"{0}\"? The agent will stop applying your policy, and you would have to upload the PDF again to restore it.", [title]),
			() => frappe.call({
				method: "accountant_agent.knowledge.delete_company_knowledge",
				args: { email, document_id: id },
				callback: () => {
					frappe.show_alert({ message: __("Policy removed"), indicator: "orange" });
					render_company_knowledge(frm);
				},
				error: (err) => say(knowledge_error(err), "error"),
			})
		);
	});
}

function get_usage_container(frm) {
	if (frm.fields_dict.usage_html && frm.fields_dict.usage_html.wrapper) {
		return $(frm.fields_dict.usage_html.wrapper);
	}
	
	let $existing = $(frm.wrapper).find('.agent-usage-dynamic-container');
	if ($existing.length) return $existing;

	let $container = $('<div class="agent-usage-dynamic-container" style="margin-top: 20px; width: 100%;"></div>');
	
	if (frm.fields_dict.custom_instructions && frm.fields_dict.custom_instructions.wrapper) {
		$container.insertAfter($(frm.fields_dict.custom_instructions.wrapper));
	} else if (frm.fields_dict.access_token && frm.fields_dict.access_token.wrapper) {
		$container.insertAfter($(frm.fields_dict.access_token.wrapper));
	} else {
		let $target = $(frm.wrapper).find('.form-page, .form-section, .frappe-control').last();
		if ($target.length) {
			$container.insertAfter($target);
		} else {
			$container.appendTo($(frm.wrapper));
		}
	}
	return $container;
}

function load_usage_stats(frm, email) {
	let $wrapper = get_usage_container(frm);
	if (!$wrapper || !$wrapper.length) return;

	$wrapper.html(`
		<div style="padding: 15px; text-align: center; color: var(--text-muted, #6b7280);">
			<i class="fa fa-spinner fa-spin"></i> ${__('Loading usage statistics...')}
		</div>
	`);

	frappe.call({
		method: "accountant_agent.accountant_agent.doctype.agent_settings.agent_settings.get_user_usage",
		args: { email: email },
		callback: function(r) {
			if (r.message) {
				render_usage_dashboard(frm, r.message, email);
			} else {
				$wrapper.html(`
					<div class="alert alert-warning" style="margin: 10px 0; border-radius: 8px;">
						${__('Unable to retrieve usage data for this account.')}
					</div>
				`);
			}
		}
	});
}

function render_usage_dashboard(frm, data, email) {
	let total = data.total_usage_percentage || 0.0;

	function get_status_theme(val) {
		if (val >= 90) return { bg: '#fee2e2', text: '#dc2626', bar: 'linear-gradient(90deg, #ef4444, #f87171)' };
		if (val >= 70) return { bg: '#fef3c7', text: '#d97706', bar: 'linear-gradient(90deg, #f59e0b, #fbbf24)' };
		return { bg: '#d1fae5', text: '#059669', bar: 'linear-gradient(90deg, #10a37f, #34d399)' };
	}

	let total_theme = get_status_theme(total);

	// Every plan's badge colours, in one place.
	//
	// These used to be three parallel nested ternaries over `data.plan`, one
	// per CSS property, each ending in the Free styling — so a tier none of
	// them named (as `custom` was) silently showed the customer a Free badge.
	// A tier added to the platform is one row here now, and a tier that is
	// missing falls back in one visible place instead of three quiet ones.
	const PLAN_COLOURS = {
		free:   { background: '#f3f4f6', text: '#4b5563', border: '#e5e7eb' },
		plus:   { background: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
		pro:    { background: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
		ultra:  { background: '#f5f3ff', text: '#7c3aed', border: '#ddd6fe' },
		custom: { background: '#faf5ff', text: '#a855f7', border: '#e9d5ff' },
	};
	const plan_colours = PLAN_COLOURS[data.plan] || PLAN_COLOURS.free;

	let html = `
		<div class="agent-usage-card" style="
			background: var(--card-bg, #ffffff);
			border: 1px solid var(--border-color, #e5e7eb);
			border-radius: 12px;
			padding: 20px;
			margin-top: 15px;
			margin-bottom: 20px;
			box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		">
			<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
				<div style="display: flex; align-items: center; gap: 8px;">
					<i class="fa fa-pie-chart" style="color: #10a37f; font-size: 18px;"></i>
					<h4 style="margin: 0; font-weight: 700; font-size: 16px; color: var(--text-color, #111827); display: flex; align-items: center; gap: 8px;">
						${__('API Resource Usage')}
						<span class="plan-badge" style="
							font-size: 11px;
							font-weight: 700;
							text-transform: uppercase;
							padding: 2px 8px;
							border-radius: 12px;
							background-color: ${plan_colours.background};
							color: ${plan_colours.text};
							border: 1px solid ${plan_colours.border};
						">
							${__(data.plan || 'free')}
						</span>
					</h4>
				</div>
				<button class="btn btn-default btn-xs btn-refresh-usage" style="border-radius: 6px; font-weight: 500;">
					<i class="fa fa-refresh"></i> ${__('Refresh Stats')}
				</button>
			</div>

			<div style="display: grid; grid-template-columns: minmax(280px, 1fr); gap: 20px;">
				<!-- Total Plan Usage Progress Bar -->
				<div style="
					background: var(--bg-color, #f9fafb);
					padding: 16px;
					border-radius: 10px;
					border: 1px solid var(--border-color, #f3f4f6);
				">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
						<span style="font-size: 13px; font-weight: 600; color: var(--text-color, #374151);">
							${__('Billing Cycle Usage')}
						</span>
						<span style="
							background-color: ${total_theme.bg};
							color: ${total_theme.text};
							font-size: 12px;
							font-weight: 700;
							padding: 2px 10px;
							border-radius: 12px;
						">
							${total}%
						</span>
					</div>
					<div style="
						height: 10px;
						background-color: #e5e7eb;
						border-radius: 10px;
						overflow: hidden;
					">
						<div style="
							height: 100%;
							width: ${Math.min(total, 100)}%;
							background: ${total_theme.bar};
							border-radius: 10px;
							transition: width 0.6s ease-in-out;
						"></div>
					</div>
					<p style="font-size: 11.5px; color: var(--text-muted, #6b7280); margin-top: 8px; margin-bottom: 0;">
						${__('30-day billing cycle usage')}
					</p>
				</div>
			</div>
		</div>
	`;

	let $wrapper = get_usage_container(frm);
	$wrapper.html(html);

	$wrapper.find('.btn-refresh-usage').on('click', function(e) {
		e.preventDefault();
		load_usage_stats(frm, email);
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Creator Agent — connection and recording
//
// A SECOND form handler rather than an edit to the one above. Frappe runs every
// registered handler for a DocType, so the usage dashboard and this card stay
// independent: neither can break the other, and they can be changed by
// different people without conflicting.
//
// Every figure rendered here comes from get_write_connection_status, which reads
// THIS site only and makes no network call. A status screen that asked the
// platform would report "not connected" whenever the platform was briefly
// unreachable, and the customer would press Connect on a connection that was
// already healthy.
//
// WHAT CHANGED, AND WHY, 2026-08-21
//
//   * "Apply recommended setup" is gone, along with its endpoint. It granted
//     the agent read on eight hand-picked DocTypes and Create/Write on Journal
//     Entry. The read half is obsolete — recognising an account or an item no
//     longer needs a permission grant. The write half was actively harmful: it
//     wrote a single row, "Journal Entry", into the customer's Agent Write
//     Policy, and that row then refused every supplier bill and sales invoice
//     the agent prepared, on sites whose owners had granted its user far more.
//     A button that silently narrows what a product can do is worse than no
//     button.
//
//   * Connect and Disconnect are ONE control that changes with the state, so
//     the card never offers an action that does not apply. Four buttons in a
//     row, two of them disabled, is a settings screen asking the customer to
//     work out which one is theirs.
//
//   * Every button says what it does, underneath it. A control whose effect you
//     have to press it to discover is not a control, it is a dare.
// ─────────────────────────────────────────────────────────────────────────────

frappe.ui.form.on("Agent Settings", {
	refresh(frm) {
		if (frm.is_new()) return;
		render_write_setup(frm);
	},
});

const CONNECT_METHOD = "accountant_agent.connect";

function agent_email_of(frm) {
	return frm.doc.email || (frm.doc.name && frm.doc.name.includes("@") ? frm.doc.name : null);
}

function get_write_setup_container(frm) {
	// Prefer the declared HTML field. The fallback exists because returning
	// early would make the whole card vanish silently — no card, no error, and
	// no way for anyone to tell whether setup is broken or simply absent. A
	// setup screen that can disappear without saying so is worse than an ugly
	// one.
	if (frm.fields_dict.write_setup_html && frm.fields_dict.write_setup_html.wrapper) {
		return $(frm.fields_dict.write_setup_html.wrapper);
	}

	const existing = $(frm.wrapper).find(".agent-write-setup-container");
	if (existing.length) return existing;

	const $container = $('<div class="agent-write-setup-container" style="margin-top:20px;width:100%;"></div>');
	const $page = $(frm.wrapper).find(".form-page").first();
	$container.appendTo($page.length ? $page : $(frm.wrapper));
	return $container;
}

function render_write_setup(frm) {
	const $wrapper = get_write_setup_container(frm);
	if (!$wrapper || !$wrapper.length) return;

	$wrapper.html(`<div style="padding:12px;color:var(--text-muted,#6b7280);">
		<i class="fa fa-spinner fa-spin"></i> ${__("Checking your connection...")}</div>`);

	frappe.call({
		method: `${CONNECT_METHOD}.get_write_connection_status`,
		args: { agent_email: agent_email_of(frm) },
		callback(r) {
			if (r.message) draw_write_card(frm, r.message);
		},
		error() {
			// only_for("System Manager") refuses non-admins. That is not an
			// error worth a red box on their own settings page.
			$wrapper.html(`<div class="text-muted" style="padding:12px;">
				${__("Only a System Manager can connect this ERP to the Accountant Agent.")}</div>`);
		},
	});
}

// ── The actions, in the order a customer meets them ──────────────────────────
//
// Connect first because nothing else can be done until it is done; recording
// second because it is the one people change often; credentials last because
// it is rare and consequential. Disconnect is not a fourth entry — it is what
// Connect becomes.

function actions_for(s) {
	const connected = !!s.connected_to_platform;

	const connect = connected
		? {
			act: "disconnect",
			label: __("Disconnect"),
			style: "btn-danger",
			help: __(
				"Unlinks this ERP and deletes the address and credentials held for it. " +
				"The agent can no longer read or record anything here. Your Agent Write " +
				"Log is kept, so the record of what it already did survives."
			),
		}
		: {
			act: "connect",
			label: __("Connect"),
			style: "btn-primary",
			help: __(
				"Creates the agent's own ERP user, issues its credentials and registers " +
				"this site. Nothing is granted and nothing is recorded by connecting — " +
				"the agent can do only what you allow below and what your own ERP " +
				"permissions let its user do."
			),
		};

	// Named separately so the help text can say "this switch is not your
	// problem right now" instead of letting the customer press it twice.
	const policy_blocks = connected && !s.policy_enabled;
	const recording_help = s.recording_enabled
		? __(
			"Recording is ON. The agent may save documents in this ERP, within your " +
			"Agent Write Policy and the permissions its ERP user holds. Switch it " +
			"off and it will still read, answer and prepare entries — it simply " +
			"will not save them."
		)
		: __(
			"Recording is OFF. The agent reads your ledger, answers questions and " +
			"prepares entries for you to check, but saves nothing. Turn it on when " +
			"you are ready for it to write. This is a separate switch from the ERP " +
			"roles you grant its user; both must say yes."
		);

	const recording = {
		act: "recording",
		label: s.recording_enabled ? __("Stop recording") : __("Allow recording"),
		style: s.recording_enabled ? "btn-default" : "btn-primary",
		disabled: !connected,
		help: policy_blocks
			? recording_help + " <b>" + __(
				"This switch is not what is stopping the agent right now: Agent Write " +
				"Policy is switched off in this ERP, so every write is refused whatever " +
				"you set here. Open Agent Write Policy and tick Enable Agent Writes."
			) + "</b>"
			: recording_help,
	};

	const rotate = {
		act: "rotate",
		label: __("Issue new credentials"),
		style: "btn-default",
		disabled: !connected,
		help: __(
			"Replaces the agent's API key and secret with a fresh pair. Use it if you " +
			"think the old ones leaked. Any OTHER Accountant Agent account connected to " +
			"this same site keeps the old secret and must press Connect again."
		),
	};

	return [connect, recording, rotate];
}

function draw_write_card(frm, s) {
	const $wrapper = get_write_setup_container(frm);
	if (!$wrapper || !$wrapper.length) return;

	// THE BADGE MUST NAME THE SWITCH THAT IS ACTUALLY STOPPING THE AGENT.
	//
	// It used to collapse every connected-but-not-ready state into "Connected —
	// not recording". A customer whose recording was ON and whose Agent Write
	// Policy was off therefore read a badge saying recording was the problem,
	// switched it off and on again, and was refused a second time. Two switches
	// is the right design; showing one of them the other's status is not.
	const ready = s.connected_to_platform && s.recording_enabled && s.policy_enabled;
	const pill = ready
		? { bg: "#e8f5e9", fg: "#2e7d32", text: __("Ready to record") }
		: !s.connected_to_platform
			? { bg: "#fee2e2", fg: "#dc2626", text: __("Not connected") }
			: !s.policy_enabled
				? { bg: "#fee2e2", fg: "#dc2626", text: __("Blocked by Agent Write Policy") }
				: { bg: "#fef3c7", fg: "#d97706", text: __("Connected — not recording") };

	const esc = (v) => frappe.utils.escape_html(String(v == null ? "" : v));

	const buttons = actions_for(s).map((a) => `
		<div style="display:flex;gap:14px;align-items:flex-start;padding:14px 0;
					border-top:1px solid var(--border-color,#eceff3);">
			<button class="btn ${a.style} btn-sm" data-act="${a.act}"
					${a.disabled ? "disabled" : ""}
					style="min-width:170px;border-radius:6px;font-weight:600;flex-shrink:0;">
				${a.label}</button>
			<div style="font-size:12.5px;line-height:1.55;color:var(--text-muted,#6b7280);
						padding-top:3px;">${a.help}</div>
		</div>`).join("");

	const steps = (s.missing || []).map(
		(m) => `<li style="margin-bottom:6px;">${esc(m)}</li>`
	).join("");

	const problem = s.last_error
		? `<div class="alert alert-warning" style="margin-top:14px;border-radius:8px;">
			 <b>${__("Last problem")}:</b> ${esc(s.last_error)}</div>`
		: "";

	$wrapper.html(`
		<div style="border:1px solid var(--border-color,#e5e7eb);border-radius:12px;
					background:var(--card-bg,#fff);overflow:hidden;
					box-shadow:0 4px 15px rgba(0,0,0,0.03);margin-top:15px;">

			<div style="padding:20px 20px 16px;">
				<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
					<h4 style="margin:0;font-size:16px;font-weight:700;">
						${__("Your ERP and the Accountant Agent")}</h4>
					<span style="background:${pill.bg};color:${pill.fg};font-size:12px;
								 font-weight:700;padding:3px 12px;border-radius:12px;
								 white-space:nowrap;">${pill.text}</span>
				</div>

				<p style="color:var(--text-muted,#6b7280);font-size:13px;margin:10px 0 0;">
					${__("The agent works as its own ERP user")}
					(<code>${esc(s.agent_user)}</code>).
					${__("It can read your ledger so it can recognise your accounts, items and suppliers. What it may CREATE, SUBMIT or CHANGE is exactly what you grant that user in your own ERP permissions — nothing on this page widens it.")}
				</p>

				${steps ? `<div style="margin-top:14px;">
					<div style="font-weight:600;font-size:13px;margin-bottom:6px;">
						${__("Still to do")}</div>
					<ul style="font-size:13px;color:var(--text-color,#374151);padding-left:18px;margin:0;">
						${steps}</ul></div>` : ""}

				${problem}
			</div>

			<div style="padding:0 20px 6px;">${buttons}</div>
		</div>
	`);

	$wrapper.find("[data-act]").on("click", function (e) {
		e.preventDefault();
		if ($(this).is(":disabled")) return;
		handle_write_action(frm, $(this).data("act"), s);
	});
}

function handle_write_action(frm, action, s) {
	const email = agent_email_of(frm);
	const done = (r) => {
		if (r && r.message && r.message.message) {
			frappe.show_alert({ message: r.message.message, indicator: "green" }, 7);
		}
		render_write_setup(frm);
	};

	if (action === "connect") {
		frappe.call({
			method: `${CONNECT_METHOD}.connect_write_access`,
			args: { agent_email: email, enable_recording: 0 },
			freeze: true,
			freeze_message: __("Connecting your ERP..."),
			callback: done,
		});
		return;
	}

	if (action === "recording") {
		const turning_on = !s.recording_enabled;
		const go = () => frappe.call({
			method: `${CONNECT_METHOD}.set_recording_enabled`,
			args: { agent_email: email, enabled: turning_on ? 1 : 0 },
			freeze: true,
			callback: done,
		});
		// Switching recording OFF is the safe direction and needs no ceremony.
		if (!turning_on) return go();
		frappe.confirm(
			__("The agent will be able to save documents in this ERP, within your Agent Write Policy and the permissions you granted its user. Continue?"),
			go
		);
		return;
	}

	if (action === "rotate") {
		frappe.confirm(
			__("New credentials will be issued for the agent's ERP user. Any other Accountant Agent account connected to this same site will stop working until it reconnects. Continue?"),
			() => frappe.call({
				method: `${CONNECT_METHOD}.rotate_and_reconnect`,
				args: { agent_email: email },
				freeze: true,
				callback: done,
			})
		);
		return;
	}

	if (action === "disconnect") {
		frappe.confirm(
			__("This unlinks your ERP and deletes the address and credentials held for it. The agent will not be able to read or record anything here until you connect again. Its history in Agent Write Log is kept. Continue?"),
			() => frappe.call({
				method: `${CONNECT_METHOD}.disconnect_write_access`,
				args: { agent_email: email },
				freeze: true,
				freeze_message: __("Disconnecting..."),
				callback: done,
			})
		);
	}
}
