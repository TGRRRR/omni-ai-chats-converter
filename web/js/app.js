(function() {
    'use strict';

    var STORAGE_KEY = 'omni-converter-settings';

    var defaultLayout = {
        frontmatter: { title: true, date: true, provider: true, url: true },
        user_heading: '# Me',
        assistant_heading: '# Assistant',
        thinking_heading: '# Thinking',
        include_thinking: false,
        separator: '',
        heading_downscale: true,
        add_title_as_h1: false,
        timestamp_format: '%Y-%m-%d',
        gemini_group_gap_minutes: 30,
        gemini_keep_ungrouped: false,
        viewer_enabled: true,
        user_compact: false,
        assistant_compact: false
    };

    var state = {
        fileLoaded: false,
        fileName: '',
        jsonData: null,
        providerDetected: null,
        detectionConfidence: 0,
        selectedProvider: 'auto',
        conversations: [],
        renderedFiles: [],
        hasThinking: false,
        layout: null,
        loading: false,
        currentViewerFile: null,
        viewerRaw: false
    };

    function loadSettings() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                var parsed = JSON.parse(saved);
                var merged = {};
                for (var key in defaultLayout) {
                    if (parsed[key] !== undefined) merged[key] = parsed[key];
                    else merged[key] = JSON.parse(JSON.stringify(defaultLayout[key]));
                }
                if (parsed.frontmatter) {
                    merged.frontmatter = {};
                    for (var f in defaultLayout.frontmatter) {
                        merged.frontmatter[f] = parsed.frontmatter[f] !== undefined ? parsed.frontmatter[f] : defaultLayout.frontmatter[f];
                    }
                }
                return merged;
            }
        } catch (e) {}
        return JSON.parse(JSON.stringify(defaultLayout));
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.layout));
        } catch (e) {}
    }

    function init() {
        state.layout = loadSettings();
        bindEvents();
        restoreProviderSelection();
        updateThinkingCheckbox();
        renderSettings();
    }

    function bindEvents() {
        var dropZone = document.getElementById('dropZone');
        var fileInput = document.getElementById('fileInput');
        if (dropZone) {
            dropZone.addEventListener('dragover', onDragOver);
            dropZone.addEventListener('dragleave', onDragLeave);
            dropZone.addEventListener('drop', onDrop);
            dropZone.addEventListener('click', function() { if (fileInput) fileInput.click(); });
            dropZone.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (fileInput) fileInput.click();
                }
            });
        }
        if (fileInput) {
            fileInput.addEventListener('change', onFileSelect);
        }

        var providerPills = document.querySelectorAll('.provider-pill');
        providerPills.forEach(function(pill) {
            pill.addEventListener('click', function() {
                selectProvider(pill.dataset.provider);
            });
        });

        var downloadAllBtn = document.getElementById('downloadAllBtn');
        if (downloadAllBtn) downloadAllBtn.addEventListener('click', onDownloadAll);

        var closeViewerBtn = document.getElementById('closeViewerBtn');
        if (closeViewerBtn) closeViewerBtn.addEventListener('click', closeViewer);

        var viewerToggle = document.getElementById('viewerToggle');
        if (viewerToggle) viewerToggle.addEventListener('click', toggleViewerRaw);

        var resizeHandle = document.getElementById('viewerResizeHandle');
        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', onResizeStart);
        }

        document.querySelectorAll('.settings-section input[type="checkbox"]').forEach(function(cb) {
            cb.addEventListener('change', onSettingChange);
        });
        document.querySelectorAll('.settings-section input[type="text"]').forEach(function(inp) {
            inp.addEventListener('change', onSettingChange);
        });
        document.querySelectorAll('.settings-section input[type="range"]').forEach(function(slider) {
            slider.addEventListener('input', onSliderInput);
        });
        var sepSelect = document.getElementById('separatorSelect');
        if (sepSelect) sepSelect.addEventListener('change', onSettingChange);
    }

    function onDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        var dz = document.getElementById('dropZone');
        if (dz) dz.classList.add('drag-over');
    }

    function onDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        var dz = document.getElementById('dropZone');
        if (dz) dz.classList.remove('drag-over');
    }

    function onDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        var dz = document.getElementById('dropZone');
        if (dz) dz.classList.remove('drag-over');
        var files = e.dataTransfer.files;
        if (files.length > 0) loadFile(files[0]);
    }

    function onFileSelect(e) {
        var files = e.target.files;
        if (files.length > 0) loadFile(files[0]);
    }

    function loadFile(file) {
        if (!file.name.toLowerCase().endsWith('.json')) {
            showToast('Please select a JSON file.', 'error');
            return;
        }
        state.fileName = file.name;
        state.fileLoaded = false;
        showLoading(true);
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var json = JSON.parse(e.target.result);
                state.jsonData = json;
                state.fileLoaded = true;
                var detected = Converter.detectProvider(json);
                state.providerDetected = detected.provider;
                state.detectionConfidence = detected.confidence;
                state.selectedProvider = 'auto';
                state.conversations = [];
                state.renderedFiles = [];
                state.hasThinking = false;
                updateProviderPills();
                checkThinkingBlocks();
                updateThinkingCheckbox();
                hideWarningBanner();
                clearResults();
                closeViewer();
                showToast('File loaded: ' + file.name, 'success');
                if (state.providerDetected !== 'unknown') {
                    onConvert();
                }
            } catch (err) {
                showToast('Invalid JSON: ' + err.message, 'error');
                state.fileLoaded = false;
            }
            showLoading(false);
        };
        reader.onerror = function() {
            showToast('Error reading file.', 'error');
            showLoading(false);
        };
        reader.readAsText(file);
    }

    function checkThinkingBlocks() {
        if (!state.jsonData || !state.fileLoaded) {
            state.hasThinking = false;
            return;
        }
        var result = Converter.parseJson(state.jsonData, state.selectedProvider, state.layout);
        state.conversations = result.conversations || [];
        state.hasThinking = false;
        for (var i = 0; i < state.conversations.length; i++) {
            if (state.conversations[i].has_thinking) {
                state.hasThinking = true;
                break;
            }
        }
    }

    function selectProvider(provider) {
        state.selectedProvider = provider;
        if (state.fileLoaded) {
            checkThinkingBlocks();
            updateThinkingCheckbox();
            if (provider !== 'auto' && provider !== Converter.PROVIDER_UNKNOWN) {
                onConvert(true);
            }
        }
        updateProviderPills();
        if (provider !== 'auto' && state.providerDetected === 'unknown') hideWarningBanner();
    }

    function updateProviderPills() {
        document.querySelectorAll('.provider-pill').forEach(function(pill) {
            pill.classList.remove('active');
            var p = pill.dataset.provider;
            if (p === state.selectedProvider) {
                pill.classList.add('active');
            } else if (state.selectedProvider === 'auto' && p === state.providerDetected && state.detectionConfidence > 0) {
                pill.classList.add('active');
            }
        });
    }

    function restoreProviderSelection() {
        updateProviderPills();
    }

    function updateThinkingCheckbox() {
        var cb = document.getElementById('thinkingCb');
        var label = document.getElementById('thinkingLabel');
        if (!cb) return;
        if (state.fileLoaded && state.hasThinking) {
            cb.disabled = false;
            var providerLabel = '';
            if (state.selectedProvider !== 'auto' && state.selectedProvider !== 'unknown') {
                providerLabel = ' (' + capitalize(state.selectedProvider) + ')';
            } else if (state.providerDetected !== 'unknown') {
                providerLabel = ' (' + capitalize(state.providerDetected) + ')';
            }
            if (label) label.textContent = 'Include thinking blocks' + providerLabel;
            cb.checked = state.layout ? state.layout.include_thinking : false;
        } else {
            cb.disabled = true;
            if (label) label.textContent = 'Include thinking blocks (not available for this file)';
            cb.checked = false;
        }
    }

    function capitalize(s) {
        if (!s || typeof s !== 'string') return '';
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function onConvert(silent) {
        if (!state.fileLoaded || !state.jsonData) {
            if (!silent) showToast('Please load a file first.', 'error');
            return;
        }
        showLoading(true);
        setTimeout(function() {
            try {
                var layout = JSON.parse(JSON.stringify(state.layout));
                var thinkingCb = document.getElementById('thinkingCb');
                if (thinkingCb) layout.include_thinking = thinkingCb.checked;

                var result = Converter.parseJson(state.jsonData, state.selectedProvider, layout);
                if (result.provider === 'unknown' && state.selectedProvider === 'auto') {
                    showWarningBanner();
                    showLoading(false);
                    return;
                }
                hideWarningBanner();

                state.conversations = result.conversations || [];
                state.hasThinking = false;
                for (var i = 0; i < state.conversations.length; i++) {
                    if (state.conversations[i].has_thinking) {
                        state.hasThinking = true;
                        break;
                    }
                }
                updateThinkingCheckbox();

                var rendered = Converter.renderConversations(state.conversations, layout);
                state.renderedFiles = rendered;
                renderResults();
                if (!silent) showToast('Converted ' + rendered.length + ' file(s)', 'success');
                refreshViewerIfOpen();
            } catch (err) {
                showToast('Error: ' + err.message, 'error');
            }
            showLoading(false);
        }, 50);
    }

    function onSettingChange(e) {
        var el = e.target;
        var key = el.dataset.setting;

        if (el.id === 'separatorSelect') {
            state.layout.separator = el.value;
        } else if (key) {
            if (el.type === 'checkbox') {
                setNestedValue(state.layout, key, el.checked);
                if (key === 'include_thinking') {
                    updateThinkingCheckbox();
                }
            } else {
                setNestedValue(state.layout, key, el.value);
            }
        }

        if (key === 'gemini_group_gap_minutes') updateSliderDisplay();
        saveSettings();
        if (state.fileLoaded) {
            onConvert(true);
        }
    }

    function onSliderInput(e) {
        var el = e.target;
        var key = el.dataset.setting;
        if (key === 'gemini_group_gap_minutes') updateSliderDisplay();
    }

    function updateSliderDisplay() {
        var slider = document.getElementById('geminiGapSlider');
        var display = document.getElementById('geminiGapDisplay');
        if (slider && display) display.textContent = slider.value + ' min';
    }

    function setNestedValue(obj, path, value) {
        var parts = path.split('.');
        var current = obj;
        for (var i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === undefined) current[parts[i]] = {};
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
    }

    function renderSettings() {
        var layout = state.layout;
        if (!layout) return;
        var fm = layout.frontmatter || defaultLayout.frontmatter;
        setCheckbox('fmTitle', fm.title);
        setCheckbox('fmDate', fm.date);
        setCheckbox('fmProvider', fm.provider);
        setCheckbox('fmUrl', fm.url);
        setInput('userHeading', layout.user_heading || '# Me');
        setInput('assistantHeading', layout.assistant_heading || '# Assistant');
        setInput('thinkingHeading', layout.thinking_heading || '# Thinking');

        var sepValue = layout.separator || '';
        var sepSelect = document.getElementById('separatorSelect');
        if (sepSelect) sepSelect.value = sepValue;

        setInput('timestampFormat', layout.timestamp_format || '%Y-%m-%d');
        setCheckbox('headingDownscale', layout.heading_downscale !== false);
        setCheckbox('addTitleH1', layout.add_title_as_h1 === true);
        setCheckbox('geminiKeepUngrouped', layout.gemini_keep_ungrouped === true);
        setCheckbox('userCompact', layout.user_compact === true);
        setCheckbox('assistantCompact', layout.assistant_compact === true);
        var slider = document.getElementById('geminiGapSlider');
        if (slider) slider.value = layout.gemini_group_gap_minutes || 30;
        updateSliderDisplay();
    }

    function setCheckbox(id, value) {
        var el = document.getElementById(id);
        if (el) el.checked = value;
    }

    function setInput(id, value) {
        var el = document.getElementById(id);
        if (el) el.value = value;
    }

    function toggleViewerRaw() {
        if (!state.currentViewerFile) return;
        state.viewerRaw = !state.viewerRaw;
        updateViewerToggleBtn();
        refreshViewerIfOpen();
    }

    function updateViewerToggleBtn() {
        var btn = document.getElementById('viewerToggle');
        if (!btn) return;
        if (state.viewerRaw) {
            btn.classList.add('active');
            btn.title = 'Show rendered preview';
        } else {
            btn.classList.remove('active');
            btn.title = 'Show raw markdown';
        }
    }

    function renderResults() {
        var container = document.getElementById('resultsContainer');
        var countEl = document.getElementById('resultCount');
        if (!container) return;
        container.innerHTML = '';
        if (state.renderedFiles.length === 0) {
            container.innerHTML = '<p class="no-results">No files generated.</p>';
            if (countEl) countEl.textContent = '';
            var dlAll = document.getElementById('downloadAllBtn');
            if (dlAll) dlAll.style.display = 'none';
            return;
        }
        if (countEl) countEl.textContent = state.renderedFiles.length + ' file(s)';
        var dlAll = document.getElementById('downloadAllBtn');
        if (dlAll) dlAll.style.display = 'block';
        state.renderedFiles.forEach(function(file) {
            var card = document.createElement('div');
            card.className = 'result-card';
            if (file.filename === state.currentViewerFile) {
                card.classList.add('active');
            }
            card.addEventListener('click', function() {
                openViewer(file.filename);
            });

            var btn = document.createElement('button');
            btn.className = 'btn-small';
            btn.setAttribute('aria-label', 'Download ' + file.filename);
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
            btn.title = 'Download';
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                Download.downloadFile(file.filename, file.content);
            });
            card.appendChild(btn);

            var title = document.createElement('span');
            title.className = 'card-title';
            title.textContent = file.filename;
            title.title = file.filename;
            card.appendChild(title);

            container.appendChild(card);
        });
    }

    function parseYamlFrontmatter(lines) {
        var items = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
                var key = line.substring(0, colonIdx).trim();
                var value = line.substring(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
                items.push('<div class="yaml-row"><span class="yaml-key">' + escapeHtml(key) + '</span><span class="yaml-colon">: </span><span class="yaml-value">' + escapeHtml(value) + '</span></div>');
            }
        }
        return '<div class="yaml-frontmatter"><div class="yaml-content">' + items.join('') + '</div></div>';
    }

    function parseBasicMarkdown(md) {
        if (!md) return '';
        var lines = md.split('\n');
        var result = [];
        var i = 0;
        if (lines[0] && lines[0].trim() === '---') {
            var yamlLines = [];
            i = 1;
            while (i < lines.length && lines[i].trim() !== '---') {
                yamlLines.push(lines[i]);
                i++;
            }
            i++;
            if (yamlLines.length > 0) {
                var yamlHtml = parseYamlFrontmatter(yamlLines);
                result.push(yamlHtml);
            }
        }
        while (i < lines.length) {
            var line = lines[i];
            var trimmedLine = line.trim();
            if (trimmedLine === '---') {
                result.push('<hr class="md-separator-solid">');
                i++;
                continue;
            }
            if (trimmedLine === '***') {
                result.push('<hr class="md-separator-dotted">');
                i++;
                continue;
            }
            if (trimmedLine === '') {
                var nextNonEmpty = i + 1;
                while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === '') nextNonEmpty++;
                if (nextNonEmpty < lines.length && !lines[nextNonEmpty].trim().startsWith('#') && !lines[nextNonEmpty].trim().startsWith('```') && !lines[nextNonEmpty].trim().startsWith('|') && !lines[nextNonEmpty].trim().startsWith('>') && !lines[nextNonEmpty].trim().startsWith('-') && !lines[nextNonEmpty].trim().startsWith('*')) {
                    result.push('<div class="para-gap"></div>');
                }
                i = nextNonEmpty;
                continue;
            }
            var headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)$/);
            if (headingMatch) {
                var level = headingMatch[1].length;
                var text = headingMatch[2];
                result.push('<h' + level + '>' + escapeHtml(text) + '</h' + level + '>');
                i++;
                continue;
            }
            if (line.indexOf('```') !== -1) {
                var codeLines = [];
                var codeStart = line.indexOf('```');
                if (codeStart > 0) {
                    result.push('<p>' + escapeHtml(line.substring(0, codeStart)) + '</p>');
                }
                i++;
                var lang = '';
                var firstCodeLine = lines[i];
                if (firstCodeLine && firstCodeLine.match(/^```/)) {
                    lang = firstCodeLine.replace(/^```/, '').trim();
                }
                var codeContent = [];
                while (i < lines.length && lines[i].indexOf('```') === -1) {
                    codeContent.push(lines[i]);
                    i++;
                }
                i++;
                var codeText = codeContent.join('\n').replace(/\n+$/, '');
                result.push('<pre class="code-block"><code' + (lang ? ' class="language-' + escapeHtml(lang) + '"' : '') + '>' + escapeHtml(codeText) + '</code></pre>');
                continue;
            }
            if (line.match(/^\|(.+)\|$/)) {
                var tableLines = [];
                while (i < lines.length && lines[i].match(/^\|(.+)\|$/)) {
                    tableLines.push(lines[i]);
                    i++;
                }
                result.push(parseTable(tableLines));
                continue;
            }
            if (line.match(/^>\s*(.*)$/)) {
                var quoteLines = [];
                while (i < lines.length && lines[i].match(/^>\s*(.*)$/)) {
                    quoteLines.push(lines[i].replace(/^>\s*/, ''));
                    i++;
                }
                result.push('<blockquote>' + escapeHtml(quoteLines.join(' ')) + '</blockquote>');
                continue;
            }
            if (line.match(/^[-*]\s+(.*)$/)) {
                var listLines = [];
                while (i < lines.length && lines[i].match(/^[-*]\s+(.*)$/)) {
                    listLines.push('<li>' + parseInlineMarkdown(lines[i].replace(/^[-*]\s+/, '')) + '</li>');
                    i++;
                }
                result.push('<ul>' + listLines.join('') + '</ul>');
                continue;
            }
            result.push('<p>' + parseInlineMarkdown(line) + '</p>');
            i++;
        }
        return result.join('\n');
    }

    function parseInlineMarkdown(text) {
        text = escapeHtml(text);
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, label, href) {
            var safeHref = href.trim();
            if (!/^(https?:|mailto:|#|\/)/i.test(safeHref)) {
                return '<span class="unsafe-link" title="Links with unsafe protocols are not allowed">' + label + '</span>';
            }
            return '<a href="' + safeHref + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
        });
        return text;
    }

    function parseTable(tableLines) {
        if (tableLines.length === 0) return '';
        var rows = [];
        for (var i = 0; i < tableLines.length; i++) {
            var cells = tableLines[i].split('|').filter(function(c, idx, arr) { return idx !== 0 && idx !== arr.length - 1; });
            var rowClass = i === 0 ? ' class="table-header"' : '';
            var cellsHtml = cells.map(function(c) {
                return '<td>' + parseInlineMarkdown(c.trim()) + '</td>';
            }).join('');
            rows.push('<tr' + rowClass + '>' + cellsHtml + '</tr>');
        }
        return '<table>' + rows.join('') + '</table>';
    }

    function escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function openViewer(filename) {
        var file = state.renderedFiles.find(function(f) { return f.filename === filename; });
        if (!file) return;
        state.currentViewerFile = filename;
        var panel = document.getElementById('viewerPanel');
        if (panel) panel.style.display = 'flex';
        var titleObj = document.getElementById('viewerTitle');
        if (titleObj) titleObj.textContent = file.filename;
        updateViewerToggleBtn();
        showViewerContent(file.content);

        document.querySelectorAll('.result-card').forEach(function(el) {
            var titleEl = el.querySelector('.card-title');
            if (titleEl && titleEl.textContent === filename) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }

    function showViewerContent(content) {
        var contentObj = document.getElementById('viewerContentText');
        if (!contentObj) return;
        if (state.viewerRaw) {
            contentObj.className = 'raw-reader-view';
            contentObj.textContent = content;
        } else {
            contentObj.className = 'markdown-reader-view';
            contentObj.innerHTML = parseBasicMarkdown(content);
        }
    }

    function closeViewer() {
        state.currentViewerFile = null;
        var panel = document.getElementById('viewerPanel');
        if (panel) panel.style.display = 'none';

        document.querySelectorAll('.result-card').forEach(function(el) {
            el.classList.remove('active');
        });
    }

    function refreshViewerIfOpen() {
        if (!state.currentViewerFile) return;
        var file = state.renderedFiles.find(function(f) { return f.filename === state.currentViewerFile; });
        if (file) {
            showViewerContent(file.content);
        } else {
            closeViewer();
        }
    }

    function clearResults() {
        var container = document.getElementById('resultsContainer');
        if (container) container.innerHTML = '';
        var countEl = document.getElementById('resultCount');
        if (countEl) countEl.textContent = '';
        var dlAll = document.getElementById('downloadAllBtn');
        if (dlAll) dlAll.style.display = 'none';
    }

    function onDownloadAll() {
        if (state.renderedFiles.length === 0) {
            showToast('No files to download.', 'error');
            return;
        }
        Download.downloadZip(state.renderedFiles, 'conversations.zip');
    }

    function showLoading(show) {
        state.loading = show;
        var overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = show ? 'flex' : 'none';
    }

    function showWarningBanner() {
        var banner = document.getElementById('unknownFormatBanner');
        if (banner) banner.style.display = 'flex';
    }

    function hideWarningBanner() {
        var banner = document.getElementById('unknownFormatBanner');
        if (banner) banner.style.display = 'none';
    }

    function showToast(message, type) {
        var container = document.getElementById('toastContainer');
        if (!container) return;
        var toast = document.createElement('div');
        toast.className = 'toast toast-' + (type || 'info');
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(function() {
            toast.classList.add('toast-out');
            setTimeout(function() {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 3000);
    }

    var resizeState = { isResizing: false, startX: 0, startWidth: 0 };

    function onResizeStart(e) {
        e.preventDefault();
        e.stopPropagation();
        resizeState.isResizing = true;
        resizeState.startX = e.clientX;
        var viewerPanel = document.getElementById('viewerPanel');
        if (viewerPanel) {
            resizeState.startWidth = viewerPanel.offsetWidth;
        }
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        var handle = document.getElementById('viewerResizeHandle');
        if (handle) handle.classList.add('active');
        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('mouseup', onResizeEnd);
    }

    function onResizeMove(e) {
        if (!resizeState.isResizing) return;
        var viewerPanel = document.getElementById('viewerPanel');
        if (!viewerPanel) return;
        var diff = resizeState.startX - e.clientX;
        var newWidth = resizeState.startWidth + diff;
        var containerWidth = document.querySelector('.app-wrapper') ? document.querySelector('.app-wrapper').offsetWidth : window.innerWidth;
        var minWidth = 300;
        var maxWidth = containerWidth * 0.85;
        if (newWidth < minWidth) newWidth = minWidth;
        if (newWidth > maxWidth) newWidth = maxWidth;
        viewerPanel.style.width = newWidth + 'px';
    }

    function onResizeEnd() {
        resizeState.isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        var handle = document.getElementById('viewerResizeHandle');
        if (handle) handle.classList.remove('active');
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
