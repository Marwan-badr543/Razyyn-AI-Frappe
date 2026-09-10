/**
 * File Upload Handler Module (Refactored)
 * ----------------------------------------
 * Manages file/image selection UI, client-side image compression,
 * file uploading to the Frappe server, and agent-specific file size/type validation.
 *
 * Rules:
 *   - Whitelisted safe file extensions only (accountant safe types).
 *   - File count and size budgets mirror ROUTER_SETTINGS on the agent server —
 *     the loosest gate any desk allows, because the manager assigns the desk
 *     after upload. The assigned desk re-validates server-side.
 */

class FileUploadHandler {
	constructor(chat_instance) {
		this.chat = chat_instance;
		this.$container = null;
		this.$textarea = null;
		this.$preview_area = null;
		this.$attach_btn = null;

		// Pending attachments array: [{ id, name, url, size, is_image, is_excel, file }]
		this.pending_attachments = [];

		// Files chosen but not finished uploading, as { size, is_excel }.
		//
		// They count towards the limits from the moment they are chosen. Without
		// this, dropping ten files and then ten more while the first ten were
		// still uploading measured the second batch against an almost empty
		// basket, and the whole lot sailed past a limit the server would then
		// apply for real.
		this.in_flight = [];

		// Resolves when nothing is uploading, so sending a message can wait for
		// the attachments instead of leaving half of them behind.
		this.upload_run = Promise.resolve();

		// How many uploads run at once. Twenty files one after another is a long
		// wait for no reason; twenty at once is a burst the site does not need.
		this.UPLOAD_CONCURRENCY = 4;

		// The most files one message may carry, until the server says otherwise.
		this.MAX_FILES = 20;

		// Object URLs handed to preview thumbnails, released when the preview is.
		this.thumbnail_urls = [];

		// SCAN & EXTRACT DATA — the customer's own decision, remembered.
		//
		// Reading the words out of a picture is right for a photographed
		// invoice and wrong for a photograph the agent is meant to look at, and
		// only the person attaching the file knows which one this is.
		//
		// IT STARTS ON. The overwhelming majority of pictures sent to an
		// accounting agent are documents, and a switch that starts off means
		// the first thing a new customer does — photograph an invoice, send it,
		// watch nothing be read — is the exact failure this feature exists to
		// prevent. Turning it off is one click and is remembered from then on,
		// which is the right way round: the rare case pays the click.
		this.scan_enabled = localStorage.getItem('agent_chat_scan_enabled') !== '0';

		// THE RULES COME FROM THE SERVER, NOT FROM HERE.
		//
		// This file used to carry its own list of accepted file types, and it
		// had drifted from the one the server enforces: the picker offered
		// legacy Office documents, mail files and .zip archives that the upload
		// then refused. A customer chose a file, watched it upload, and was told
		// afterwards that it was not allowed — which is the one moment a file
		// picker exists to prevent.
		//
		// `get_upload_rules` on the server publishes the real lists and limits,
		// and `init` fetches them once when the page opens. What is written
		// below is only what the page uses before that answer arrives, and if
		// the call ever fails: a conservative set that is certain to be
		// accepted, so a stale copy can refuse a file but never promise one.
		this.ALLOWED_EXTENSIONS = new Set([
			'.pdf', '.docx', '.odt', '.xlsx', '.ods', '.pptx', '.odp',
			'.txt', '.md', '.csv', '.tsv', '.json', '.xml',
			'.png', '.jpg', '.jpeg', '.gif', '.webp'
		]);

		this.EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls', '.ods']);
		this.IMAGE_EXTENSIONS = new Set([
			'.png', '.jpg', '.jpeg', '.gif', '.webp'
		]);
	}

	/** Replace the built-in fallbacks with what the server actually enforces. */
	_load_rules_from_server() {
		return frappe.call({
			method: 'accountant_agent.accountant_agent.page.agent_chat.agent_chat.get_upload_rules'
		}).then((response) => {
			let rules = response && response.message;
			if (!rules || !rules.extensions || !rules.extensions.length) return;

			this.ALLOWED_EXTENSIONS = new Set(rules.extensions);
			this.IMAGE_EXTENSIONS = new Set(rules.image_extensions || []);
			this.EXCEL_EXTENSIONS = new Set(rules.excel_extensions || []);
			if (rules.max_files) this.MAX_FILES = rules.max_files;
			if (this.$attach_btn) {
				this.$attach_btn.attr('title',
					__('Attach files or images (up to {0})', [this.MAX_FILES]));
			}
		}).catch(() => {
			// The fallbacks above stay in force; nothing else to do.
		});
	}

	// ─── Initialization ────────────────────────────────────────────────────
	init($input_container, $textarea) {
		this.$container = $input_container;
		this.$textarea = $textarea;

		this._render_attach_button();
		this._render_scan_button();
		this._render_preview_area();
		this._bind_events();
		this._load_rules_from_server();
	}

	// ─── UI Rendering ──────────────────────────────────────────────────────
	_render_attach_button() {
		this.$attach_btn = $(`
			<button class="agent-attach-btn" type="button" title="${__('Attach files or images (up to {0})', [this.MAX_FILES])}">
				<svg viewBox="0 0 24 24" width="20" height="20">
					<path d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6h-1v9.5a2 2 0 0 0 4 0V5a3.5 3.5 0 0 0-7 0v12.5a5 5 0 0 0 10 0V6h-1z" fill="currentColor"/>
				</svg>
			</button>
		`);

		let $flex_row = this.$container.find('.agent-input-footer-left').first();
		if (!$flex_row.length) {
			$flex_row = this.$container.find('div[style*="display: flex"]').first();
		}
		if ($flex_row.length) {
			$flex_row.prepend(this.$attach_btn);
		}
	}

	_render_scan_button() {
		this.$scan_btn = $(`
			<button class="agent-scan-btn" type="button">
				<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
					<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M3 12h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
				</svg>
				<span class="agent-scan-label">${__('Scan & Extract Data')}</span>
			</button>
		`);

		this.$scan_btn.on('click', () => this._toggle_scan());

		// Beside the paperclip, because it is about the files that button
		// attaches: a switch kept anywhere else is a switch nobody connects to
		// what it changes.
		let $flex_row = this.$container.find('.agent-input-footer-left').first();
		if (this.$attach_btn && this.$attach_btn.parent().length) {
			this.$attach_btn.after(this.$scan_btn);
		} else if ($flex_row.length) {
			$flex_row.append(this.$scan_btn);
		}
		this._paint_scan_button();
	}

	_paint_scan_button() {
		if (!this.$scan_btn) return;
		this.$scan_btn.toggleClass('active', !!this.scan_enabled);
		this.$scan_btn.attr('aria-pressed', this.scan_enabled ? 'true' : 'false');
		// One short line each way, in the words of somebody who has never heard
		// of scanning software: what it will do to the file I just attached.
		this.$scan_btn.attr('title', this.scan_enabled
			? __('On: reads the words in your photos and scans. Click to turn off.')
			: __('Off: photos are sent as pictures. Click to read their words.'));
	}

	/** Turn reading on or off. It is remembered, and it is read at send. */
	_toggle_scan() {
		this.scan_enabled = !this.scan_enabled;
		localStorage.setItem('agent_chat_scan_enabled', this.scan_enabled ? '1' : '0');
		this._paint_scan_button();
	}

	_render_preview_area() {
		this.$preview_area = $(`
			<div class="agent-upload-preview-area" style="display: none;">
				<div class="agent-upload-preview-items"></div>
			</div>
		`);

		let $flex_row = this.$container.find('.agent-input-footer').first();
		if (!$flex_row.length) {
			$flex_row = this.$container.find('div[style*="display: flex"]').first();
		}
		if ($flex_row.length) {
			$flex_row.before(this.$preview_area);
		}
	}

	// ─── Event Bindings ────────────────────────────────────────────────────
	_bind_events() {
		this.$attach_btn.on('click', () => {
			this._open_file_picker();
		});

		this.$textarea.on('dragover', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.$textarea.addClass('agent-drag-over');
		});

		this.$textarea.on('dragleave drop', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.$textarea.removeClass('agent-drag-over');

			if (e.type === 'drop') {
				let files = e.originalEvent.dataTransfer.files;
				if (files && files.length > 0) {
					this._handle_files(files);
				}
			}
		});
	}

	// The manager decides which desk handles the work, so the picker accepts
	// everything the practice accepts; the desk actually assigned re-validates
	// against its own (possibly tighter) limits on the server, before any work
	// is spent.
	_desk_extensions() {
		return this.ALLOWED_EXTENSIONS;
	}

	_open_file_picker() {
		let accept_pattern = Array.from(this._desk_extensions()).join(',');
		let $input = $(`<input type="file" multiple accept="${accept_pattern}" />`);
		$input.on('change', (e) => {
			let files = e.target.files;
			if (files && files.length > 0) {
				this._handle_files(files);
			}
		});
		$input.trigger('click');
	}

	// ─── Validation Helpers ─────────────────────────────────────────────────

	_get_file_ext(filename) {
		return filename.substring(filename.lastIndexOf('.')).toLowerCase();
	}

	_is_allowed_type(filename) {
		let ext = this._get_file_ext(filename);
		// The practice-wide allowlist AND this desk's narrower one, when it has
		// one. The picker already filters, but a drag-and-drop bypasses it.
		return this.ALLOWED_EXTENSIONS.has(ext) && this._desk_extensions().has(ext);
	}

	_is_excel(filename) {
		let ext = this._get_file_ext(filename);
		return this.EXCEL_EXTENSIONS.has(ext);
	}

	_is_image(filename) {
		let ext = this._get_file_ext(filename);
		return this.IMAGE_EXTENSIONS.has(ext);
	}

	/**
	 * Validates candidate file batch against the gate the server applies.
	 *
	 * These numbers MUST mirror ROUTER_SETTINGS on the agent server
	 * (agent/agent_services/router_service/router.py) — the loosest ceiling any
	 * desk allows, because the manager has not assigned a desk yet. The desk
	 * actually assigned re-validates against its own settings server-side, so a
	 * mismatch here only costs politeness, never safety.
	 */
	_validate_batch(incoming_files) {
		let rules = {
			max_files: this.MAX_FILES,
			max_per_file_mb: 40,
			max_non_excel_total_mb: 40,
			max_excel_total_mb: 40,
			is_aggregate: true
		};
		let agent_name = __('Razyyn AI');

		// 1. Total file count
		let attached = this.pending_attachments.length + this.in_flight.length;
		if ((attached + incoming_files.length) > rules.max_files) {
			frappe.show_alert({
				message: __('Maximum {0} files allowed for {1}. You currently have {2} attached and tried to add {3}.',
					[rules.max_files, agent_name, attached, incoming_files.length]),
				indicator: 'orange'
			}, 7);
			return false;
		}

		// 2. Extension check
		for (let file of incoming_files) {
			if (!this._is_allowed_type(file.name)) {
				let ext = this._get_file_ext(file.name);
				// Name what the desk DOES take: the customer's next action is to
				// send a different file, so telling them only what failed wastes
				// a round trip.
				let desk_exts = this._desk_extensions();
				let message = (desk_exts !== this.ALLOWED_EXTENSIONS)
					? __('"{0}" is not a spreadsheet. {1} works with {2} files only.',
						[file.name, agent_name, Array.from(desk_exts).join(', ')])
					: __('File "{0}" has unpermitted type ({1}). Only standard accounting document types are allowed.',
						[file.name, ext]);
				frappe.show_alert({ message: message, indicator: 'red' }, 7);
				return false;
			}
		}

		// 3. Size validation
		if (!rules.is_aggregate) {
			// Per-file budget (Auto agent).
			let max_bytes = rules.max_per_file_mb * 1024 * 1024;
			for (let file of incoming_files) {
				if (file.size > max_bytes) {
					frappe.show_alert({
						message: __('"{0}" is {1} MB. For {2}, each file must not exceed {3} MB.',
							[file.name, (file.size / (1024 * 1024)).toFixed(2), agent_name, rules.max_per_file_mb]),
						indicator: 'orange'
					}, 7);
					return false;
				}
			}
			return true;
		}

		// Aggregate budgets, tracked separately for Excel and non-Excel.
		let current_non_excel = 0;
		let current_excel = 0;
		this.pending_attachments.concat(this.in_flight).forEach(att => {
			if (att.is_excel) current_excel += att.size;
			else current_non_excel += att.size;
		});

		let new_non_excel = 0;
		let new_excel = 0;
		for (let file of incoming_files) {
			if (this._is_excel(file.name)) new_excel += file.size;
			else new_non_excel += file.size;
		}

		let max_non_excel_bytes = rules.max_non_excel_total_mb * 1024 * 1024;
		let max_excel_bytes = rules.max_excel_total_mb * 1024 * 1024;

		if ((current_non_excel + new_non_excel) > max_non_excel_bytes) {
			let total_mb = ((current_non_excel + new_non_excel) / (1024 * 1024)).toFixed(2);
			frappe.show_alert({
				message: __('Total non-Excel files ({0} MB) exceed the {1} MB aggregate limit for {2}.',
					[total_mb, rules.max_non_excel_total_mb, agent_name]),
				indicator: 'orange'
			}, 7);
			return false;
		}

		if ((current_excel + new_excel) > max_excel_bytes) {
			let total_mb = ((current_excel + new_excel) / (1024 * 1024)).toFixed(2);
			frappe.show_alert({
				message: __('Total Excel files ({0} MB) exceed the {1} MB aggregate limit for {2}.',
					[total_mb, rules.max_excel_total_mb, agent_name]),
				indicator: 'orange'
			}, 7);
			return false;
		}

		return true;
	}

	// ─── File Handling Pipeline ────────────────────────────────────────────

	/**
	 * Take a batch of chosen files, upload them, and keep the basket honest.
	 *
	 * A batch that arrives while another is still uploading is ADDED, not
	 * discarded. The previous version returned silently in that case, so a
	 * customer dropping a second handful of receipts watched them vanish with
	 * no message at all — and the more files there are, the longer the window
	 * in which that happens.
	 */
	async _handle_files(file_list) {
		let files_array = Array.from(file_list);
		if (!files_array.length) return;

		if (!this._validate_batch(files_array)) {
			return;
		}

		let reservations = files_array.map(file => ({
			size: file.size,
			is_excel: this._is_excel(file.name)
		}));
		this.in_flight.push(...reservations);

		let batch = this._upload_all(files_array).finally(() => {
			reservations.forEach(reservation => {
				let at = this.in_flight.indexOf(reservation);
				if (at > -1) this.in_flight.splice(at, 1);
			});
		});

		// Chained so `wait_for_uploads` covers every batch still running.
		this.upload_run = this.upload_run.then(() => batch).catch(() => {});
		await batch;
	}

	/** Upload a batch a few at a time rather than one after another. */
	_upload_all(files_array) {
		let next = 0;
		let worker = async () => {
			while (next < files_array.length) {
				await this._process_and_upload(files_array[next++]);
			}
		};
		let lanes = Math.min(this.UPLOAD_CONCURRENCY, files_array.length);
		return Promise.all(Array.from({ length: lanes }, worker));
	}

	/** Resolves once every chosen file has finished uploading. */
	async wait_for_uploads() {
		await this.upload_run;
	}

	async _process_and_upload(file) {
		let is_img = this._is_image(file.name);
		let is_exc = this._is_excel(file.name);
		let preview_id = this._add_preview_item(file.name, is_img ? 'image' : 'file', 'uploading', file);

		try {
			let upload_file = file;

			// If image, compress client-side first.
			//
			// NOT WHEN THE WORDS ARE GOING TO BE READ. Shrinking a photograph
			// to 1920 pixels and re-encoding it as a JPEG throws away exactly
			// the detail a reader needs: the difference between an 8 and a 3 in
			// a total is a few pixels, and they are the first thing to go.
			if (is_img && !this.scan_enabled) {
				try {
					let compressed_blob = await this._compress_image_client(file);
					upload_file = new File([compressed_blob], file.name, { type: 'image/jpeg' });
				} catch (img_err) {
					console.warn("Client image compression fallback to raw file:", img_err);
				}
			}

			// Upload file directly to Frappe endpoint
			let upload_result = await this._upload_to_server(upload_file);

			// Store in pending attachments
			let item = {
				id: preview_id,
				name: file.name,
				url: upload_result.file_url,
				size: upload_file.size,
				is_image: is_img,
				is_excel: is_exc
			};

			this.pending_attachments.push(item);
			this._update_preview_item(preview_id, 'success');

		} catch (err) {
			console.error('File upload failed:', err);
			this._update_preview_item(preview_id, 'error');
			frappe.show_alert({
				message: __(`Failed to upload "${file.name}": ${err.message || 'Unknown error'}`),
				indicator: 'red'
			}, 7);
		}
	}

	// ─── Server Upload ─────────────────────────────────────────────────────
	_upload_to_server(file) {
		return new Promise((resolve, reject) => {
			let form_data = new FormData();
			form_data.append('file', file, file.name);

			$.ajax({
				url: '/api/method/accountant_agent.accountant_agent.page.agent_chat.agent_chat.upload_agent_file',
				type: 'POST',
				data: form_data,
				processData: false,
				contentType: false,
				headers: {
					'X-Frappe-CSRF-Token': frappe.csrf_token
				},
				success: (response) => {
					if (response.message) {
						resolve(response.message);
					} else {
						reject(new Error('Upload returned empty response.'));
					}
				},
				error: (xhr) => {
					let msg = 'Upload failed.';
					try {
						let resp = JSON.parse(xhr.responseText);
						msg = resp._server_messages
							? JSON.parse(resp._server_messages)[0]
							: resp.exc_type || msg;
					} catch (e) { /* ignore parse errors */ }
					reject(new Error(msg));
				}
			});
		});
	}

	// ─── Client-Side Image Compression ─────────────────────────────────────
	_compress_image_client(file) {
		return new Promise((resolve, reject) => {
			let reader = new FileReader();
			reader.onload = (e) => {
				let img = new Image();
				img.onload = () => {
					try {
						let canvas = document.createElement('canvas');
						let ctx = canvas.getContext('2d');

						let max_dim = 1920;
						let width = img.width;
						let height = img.height;

						if (width > max_dim || height > max_dim) {
							let ratio = Math.min(max_dim / width, max_dim / height);
							width = Math.round(width * ratio);
							height = Math.round(height * ratio);
						}

						canvas.width = width;
						canvas.height = height;
						ctx.drawImage(img, 0, 0, width, height);

						canvas.toBlob(
							(blob) => {
								if (blob) {
									resolve(blob);
								} else {
									reject(new Error('Canvas compression produced empty blob.'));
								}
							},
							'image/jpeg',
							0.82
						);
					} catch (err) {
						reject(err);
					}
				};
				img.onerror = () => reject(new Error('Failed to load image for compression.'));
				img.src = e.target.result;
			};
			reader.onerror = () => reject(new Error('Failed to read image file.'));
			reader.readAsDataURL(file);
		});
	}

	// ─── Preview Area Management ───────────────────────────────────────────
	_add_preview_item(filename, type, status, file = null) {
		let preview_id = `preview-${Math.random().toString(36).substr(2, 9)}`;

		let icon_html;
		if (type === 'image' && file) {
			// Released in _release_thumbnails: the browser holds the whole image
			// alive behind this URL, and twenty photographs of invoices is tens
			// of megabytes kept for a preview the size of a stamp.
			let thumb_url = URL.createObjectURL(file);
			this.thumbnail_urls.push(thumb_url);
			icon_html = `<img src="${thumb_url}" class="agent-preview-thumb" alt="${filename}" />`;
		} else {
			icon_html = `<span class="agent-preview-icon">${this._get_file_icon(filename)}</span>`;
		}

		let status_html = status === 'uploading'
			? '<span class="agent-preview-status uploading"><i class="fa fa-spinner fa-spin"></i></span>'
			: '';

		let $item = $(`
			<div class="agent-preview-item ${status}" id="${preview_id}" data-type="${type}" data-name="${filename}">
				${icon_html}
				<span class="agent-preview-name" title="${filename}">${this._truncate_name(filename, 20)}</span>
				${status_html}
				<button class="agent-preview-remove" title="${__('Remove')}">
					<i class="fa fa-times"></i>
				</button>
			</div>
		`);

		$item.find('.agent-preview-remove').on('click', (e) => {
			e.stopPropagation();
			this._remove_attachment(preview_id);
		});

		this.$preview_area.find('.agent-upload-preview-items').append($item);
		this.$preview_area.show();

		return preview_id;
	}

	_update_preview_item(preview_id, status) {
		let $item = $(`#${preview_id}`);
		$item.removeClass('uploading error success').addClass(status);
		$item.find('.agent-preview-status').remove();

		if (status === 'error') {
			$item.append('<span class="agent-preview-status error"><i class="fa fa-exclamation-circle"></i></span>');
		} else if (status === 'success') {
			$item.append('<span class="agent-preview-status success"><i class="fa fa-check-circle"></i></span>');
			setTimeout(() => {
				$item.find('.agent-preview-status.success').fadeOut(300);
			}, 2000);
		}
	}

	_remove_attachment(preview_id) {
		$(`#${preview_id}`).fadeOut(200, function () {
			$(this).remove();
		});

		this.pending_attachments = this.pending_attachments.filter(a => a.id !== preview_id);

		setTimeout(() => {
			if (this.pending_attachments.length === 0) {
				this.$preview_area.hide();
			}
		}, 250);
	}

	// ─── Public API ────────────────────────────────────────────────────────

	get_file_urls() {
		return this.pending_attachments.map(a => a.url);
	}

	build_attachment_markers() {
		let markers = [];
		this.pending_attachments.forEach(att => {
			let type = att.is_image ? 'IMAGE' : 'FILE';
			markers.push(`[${type}:${att.name}:${att.url}]`);
		});
		return markers.length > 0 ? markers.join('\n') + '\n' : '';
	}

	has_attachments() {
		return this.pending_attachments.length > 0;
	}

	clear_attachments() {
		this.pending_attachments = [];
		this._release_thumbnails();
		this.$preview_area.find('.agent-upload-preview-items').empty();
		this.$preview_area.hide();
	}

	_release_thumbnails() {
		this.thumbnail_urls.forEach(url => {
			try { URL.revokeObjectURL(url); } catch (e) { /* already released */ }
		});
		this.thumbnail_urls = [];
	}

	/** True while any chosen file is still uploading. */
	has_pending_uploads() {
		return this.in_flight.length > 0;
	}

	_get_file_icon(filename) {
		let ext = filename.split('.').pop().toLowerCase();
		let icon_map = {
			'pdf': '📄', 'docx': '📝', 'doc': '📝',
			'xlsx': '📊', 'xls': '📊', 'pptx': '📑',
			'ppt': '📑', 'txt': '📃', 'csv': '📊',
		};
		return icon_map[ext] || '📎';
	}

	_truncate_name(name, max_length) {
		if (name.length <= max_length) return name;
		let ext = name.split('.').pop();
		let base = name.substring(0, max_length - ext.length - 4);
		return `${base}...${ext}`;
	}
}
