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
        viewer_enabled: true
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
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
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

    function parseBasicMarkdown(md) {
        if (!md) return '';
        var html = md;

        html = html.replace(/^---\n([\s\S]*?)\n---/g, '<div class="yaml-frontmatter">$1</div>');

        html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
        html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
        html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
        html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

        html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

        html = html.replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>');
        html = html.replace(/<\/ul>\n<ul>/g, '\n');

        html = html.replace(/```[\s\S]*?```/g, function(m) {
            return '<pre><code>' + m.slice(3, -3).replace(/```\w*\n?/g, '') + '</code></pre>';
        });
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        html = html.replace(/^\|(.+)\|/gim, function(match) {
            var cells = match.split('|').filter(function(c) { return c.trim(); });
            var row = '<tr>' + cells.map(function(c) { return '<td>' + c.trim() + '</td>'; }).join('') + '</tr>';
            return row;
        });
        html = html.replace(/(<tr>[\s\S]*?<\/tr>(\n<tr>[\s\S]*?<\/tr>)*)/gi, '<table>$1</table>');
        html = html.replace(/<td>(-+)<\/td>/g, '');

        var lines = html.split('\n');
        var inBlock = false;
        var newLines = [];
        for (var i = 0; i < lines.length; i++) {
            var l = lines[i].trim();
            var isBlockTag = /^(<h[1-6]|<p>|<ul>|<ol>|<pre|<blockquote|<table|<div)/.test(l) || /^(<\/|<ul><li)/.test(l) || l === '<li></li>' || l === '';
            if (!isBlockTag && l !== '' && !l.startsWith('<')) {
                newLines.push('<p>' + lines[i] + '</p>');
            } else {
                newLines.push(lines[i]);
            }
        }
        return newLines.join('\n');
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
