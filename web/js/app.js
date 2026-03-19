(function() {
    'use strict';

    var STORAGE_KEY = 'omni-converter-settings';

    var defaultLayout = {
        frontmatter: { title: true, date: true, provider: true, url: true },
        user_heading: '# Me',
        assistant_heading: '# Assistant',
        thinking_heading: '# Thinking',
        include_thinking: true,
        separator: '',
        heading_downscale: true,
        add_title_as_h1: false,
        timestamp_format: '%Y-%m-%d',
        gemini_group_gap_minutes: 30,
        gemini_keep_ungrouped: false
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
        currentViewerFile: null
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

        document.querySelectorAll('.settings-section input[type="checkbox"]').forEach(function(cb) {
            cb.addEventListener('change', onSettingChange);
        });
        document.querySelectorAll('.settings-section input[type="text"]').forEach(function(inp) {
            inp.addEventListener('change', onSettingChange);
        });
        document.querySelectorAll('.settings-section input[type="range"]').forEach(function(slider) {
            slider.addEventListener('input', onSliderInput);
        });
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
            if (provider !== 'unknown') {
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
            cb.checked = state.layout ? state.layout.include_thinking !== false : true;
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
        if (!key) return;
        if (el.type === 'checkbox') {
            setNestedValue(state.layout, key, el.checked);
        } else {
            setNestedValue(state.layout, key, el.value);
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
        setInput('separatorInput', layout.separator || '');
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
            
            var title = document.createElement('span');
            title.className = 'card-title';
            title.textContent = file.filename;
            title.title = file.filename;
            card.appendChild(title);
            
            var btn = document.createElement('button');
            btn.className = 'btn-small';
            btn.textContent = 'DL';
            btn.title = 'Download snippet';
            btn.addEventListener('click', (function(f) {
                return function(e) { 
                    e.stopPropagation();
                    Download.downloadFile(f.filename, f.content); 
                };
            })(file));
            card.appendChild(btn);
            container.appendChild(card);
        });
    }

    function openViewer(filename) {
        var file = state.renderedFiles.find(function(f) { return f.filename === filename; });
        if (!file) return;
        state.currentViewerFile = filename;
        var panel = document.getElementById('viewerPanel');
        if (panel) panel.style.display = 'flex';
        var titleObj = document.getElementById('viewerTitle');
        if (titleObj) titleObj.textContent = file.filename;
        var contentObj = document.getElementById('viewerContentText');
        if (contentObj) contentObj.textContent = file.content;
        
        document.querySelectorAll('.result-card').forEach(function(el) {
            var titleEl = el.querySelector('.card-title');
            if (titleEl && titleEl.textContent === filename) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }

    function closeViewer() {
        state.currentViewerFile = null;
        var panel = document.getElementById('viewerPanel');
        if (panel) panel.style.display = 'none';
        var contentObj = document.getElementById('viewerContentText');
        if (contentObj) contentObj.textContent = '';
        
        document.querySelectorAll('.result-card').forEach(function(el) {
            el.classList.remove('active');
        });
    }

    function refreshViewerIfOpen() {
        if (!state.currentViewerFile) return;
        var file = state.renderedFiles.find(function(f) { return f.filename === state.currentViewerFile; });
        if (file) {
            var contentObj = document.getElementById('viewerContentText');
            if (contentObj) contentObj.textContent = file.content;
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
