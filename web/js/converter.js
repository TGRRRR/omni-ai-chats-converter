(function(global) {
    'use strict';

    var PROVIDER_CLAUDE = 'claude';
    var PROVIDER_DEEPSEEK = 'deepseek';
    var PROVIDER_GEMINI = 'gemini';
    var PROVIDER_CHATGPT = 'chatgpt';
    var PROVIDER_UNKNOWN = 'unknown';

    function Message(role, content, timestamp) {
        this.role = role || 'assistant';
        this.content = content || '';
        this.timestamp = timestamp || null;
    }

    function Conversation(id, title, createdAt, provider, messages, url) {
        this.id = id || '';
        this.title = title || 'Untitled';
        this.created_at = createdAt || null;
        this.provider = provider || 'unknown';
        this.messages = messages || [];
        this.url = url || null;
        this.has_thinking = false;
        for (var i = 0; i < this.messages.length; i++) {
            if (this.messages[i].role === 'thinking') {
                this.has_thinking = true;
                break;
            }
        }
    }

    function detectProvider(jsonData) {
        var data = unwrapWrapper(jsonData);
        if (!data) return { provider: PROVIDER_UNKNOWN, confidence: 0 };
        if (Array.isArray(data)) {
            if (data.length > 0) return detectFromItem(data[0]);
            return { provider: PROVIDER_UNKNOWN, confidence: 0 };
        }
        if (typeof data === 'object') {
            if (data.mapping && typeof data.mapping === 'object') {
                if (hasFragmentsInMapping(data)) return { provider: PROVIDER_DEEPSEEK, confidence: 0.95 };
                return { provider: PROVIDER_CHATGPT, confidence: 0.7 };
            }
            if (data.chat_messages && Array.isArray(data.chat_messages)) return { provider: PROVIDER_CLAUDE, confidence: 0.9 };
            if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
                if (data.messages[0].sender !== undefined) return { provider: PROVIDER_CLAUDE, confidence: 0.9 };
                if (data.messages[0].role !== undefined) return { provider: PROVIDER_CHATGPT, confidence: 0.7 };
            }
            if (looksLikeGemini(data)) return { provider: PROVIDER_GEMINI, confidence: 0.95 };
        }
        return { provider: PROVIDER_UNKNOWN, confidence: 0 };
    }

    function hasFragmentsInMapping(data) {
        var mapping = data.mapping;
        for (var key in mapping) {
            if (key === 'root') continue;
            var msg = mapping[key];
            if (msg && msg.message && msg.message.fragments && Array.isArray(msg.message.fragments)) return true;
        }
        return false;
    }

    function detectFromItem(item) {
        if (!item || typeof item !== 'object') return { provider: PROVIDER_UNKNOWN, confidence: 0 };
        if (item.mapping && typeof item.mapping === 'object') {
            if (hasFragmentsInMapping(item)) return { provider: PROVIDER_DEEPSEEK, confidence: 0.95 };
            return { provider: PROVIDER_CHATGPT, confidence: 0.7 };
        }
        if (item.chat_messages && Array.isArray(item.chat_messages)) return { provider: PROVIDER_CLAUDE, confidence: 0.9 };
        if (item.messages && Array.isArray(item.messages) && item.messages.length > 0) {
            if (item.messages[0].sender !== undefined) return { provider: PROVIDER_CLAUDE, confidence: 0.9 };
            if (item.messages[0].role !== undefined) return { provider: PROVIDER_CHATGPT, confidence: 0.7 };
        }
        if (looksLikeGemini(item)) return { provider: PROVIDER_GEMINI, confidence: 0.95 };
        return { provider: PROVIDER_UNKNOWN, confidence: 0 };
    }

    function looksLikeGemini(data) {
        if (!data || typeof data !== 'object') return false;
        var header = data.header || '';
        var products = data.products || [];
        var titleUrl = data.titleUrl || '';
        if (header.indexOf('Gemini') !== -1 || header.indexOf('Bard') !== -1) return true;
        if (Array.isArray(products)) {
            for (var i = 0; i < products.length; i++) {
                var p = String(products[i]);
                if (p.indexOf('Gemini') !== -1 || p.indexOf('Bard') !== -1) return true;
            }
        }
        if (titleUrl.indexOf('gemini.google.com') !== -1) return true;
        if (data.safeHtmlItem !== undefined) return true;
        return false;
    }

    function unwrapWrapper(data) {
        if (!data || typeof data !== 'object') return data;
        var wrappers = ['conversations', 'chats', 'data', 'items'];
        for (var i = 0; i < wrappers.length; i++) {
            var key = wrappers[i];
            if (data[key] && typeof data[key] === 'object' && Array.isArray(data[key])) return data[key];
        }
        return data;
    }

    function parseDeepSeekConversation(data, index) {
        if (!data || typeof data !== 'object') return null;
        var title = data.title || ('Untitled ' + (index + 1));
        var createdAt = parseTimestamp(data.create_time || data.inserted_at);
        var messages = extractDeepSeekMessages(data.mapping);
        if (messages.length === 0) return null;
        var id = PROVIDER_DEEPSEEK + '_' + index + '_' + (Math.abs(hashCode(title)) >>> 0);
        return new Conversation(id, title, createdAt, PROVIDER_DEEPSEEK, messages);
    }

    function extractDeepSeekMessages(mapping) {
        if (!mapping || typeof mapping !== 'object') return [];
        var items = [];
        for (var key in mapping) items.push([key, mapping[key]]);
        items.sort(function(a, b) {
            var ma = a[1] && a[1].message ? a[1].message : {};
            var mb = b[1] && b[1].message ? b[1].message : {};
            return (ma.create_time || 0) - (mb.create_time || 0);
        });
        var messages = [];
        for (var i = 0; i < items.length; i++) {
            var msgId = items[i][0];
            var msgData = items[i][1];
            if (msgId === 'root' || !msgData || !msgData.message) continue;
            var message = msgData.message;
            var fragments = message.fragments || [];
            if ((!fragments || fragments.length === 0) && message.content) {
                var role = message.author && message.author.role ? message.author.role : 'unknown';
                var ftype = role === 'user' ? 'REQUEST' : 'RESPONSE';
                fragments = [{ type: ftype, content: message.content }];
            }
            for (var j = 0; j < fragments.length; j++) {
                var frag = fragments[j];
                if (!frag || typeof frag !== 'object') continue;
                var ftype = (frag.type || 'TEXT').toUpperCase();
                var content = frag.content;
                if (!content || !String(content).trim()) continue;
                var role;
                if (ftype === 'REQUEST') role = 'user';
                else if (ftype === 'RESPONSE') role = 'assistant';
                else if (['THINK', 'THOUGHT', 'REASONING', 'CHAIN_OF_THOUGHT'].indexOf(ftype) !== -1) role = 'thinking';
                else role = 'assistant';
                var ts = parseTimestamp(message.create_time);
                messages.push(new Message(role, String(content), ts));
            }
        }
        return messages;
    }

    function parseClaudeConversation(data, index) {
        if (!data || typeof data !== 'object') return null;
        var title = extractClaudeTitle(data);
        var createdAt = parseTimestamp(data.updated_at || data.created_at);
        var rawMessages = data.chat_messages || data.messages || data.conversation || data.history || [];
        if (!Array.isArray(rawMessages)) rawMessages = [];
        var messages = [];
        for (var i = 0; i < rawMessages.length; i++) {
            var raw = rawMessages[i];
            if (!raw || typeof raw !== 'object') continue;
            var role = extractRole(raw);
            var content = extractText(raw);
            if (!content) continue;
            var ts = parseTimestamp(raw.create_time || raw.timestamp);
            messages.push(new Message(role, content, ts));
        }
        if (messages.length === 0) return null;
        var id = PROVIDER_CLAUDE + '_' + index + '_' + (Math.abs(hashCode(title)) >>> 0);
        return new Conversation(id, title, createdAt, PROVIDER_CLAUDE, messages);
    }

    function extractClaudeTitle(data) {
        var fields = ['name', 'title', 'conversation_title', 'subject'];
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            if (data[f]) return String(data[f]);
        }
        return 'Untitled Conversation';
    }

    function extractRole(msg) {
        var fields = ['sender', 'role', 'author', 'from'];
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            if (msg[f] !== undefined) {
                var v = String(msg[f]).toLowerCase();
                if (v === 'human' || v === 'user') return 'user';
                if (v === 'assistant' || v === 'ai' || v === 'assistant_message' || v === 'ai_message') return 'assistant';
                if (v === 'system') return 'system';
            }
        }
        return 'assistant';
    }

    function extractText(msg) {
        var fields = ['text', 'content', 'message', 'body'];
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            if (msg[f] === undefined) continue;
            var text = msg[f];
            if (typeof text === 'object') {
                if (text.text) text = text.text;
                else if (Array.isArray(text)) {
                    var parts = [];
                    for (var j = 0; j < text.length; j++) {
                        if (typeof text[j] === 'object' && text[j].text) parts.push(text[j].text);
                        else if (typeof text[j] === 'string') parts.push(text[j]);
                    }
                    text = parts.join('\n');
                } else continue;
            }
            if (text) return String(text);
        }
        return '';
    }

    function parseChatGPTConversation(data, index) {
        if (!data || typeof data !== 'object') return null;
        var title = data.title || ('Untitled ' + (index + 1));
        var createdAt = parseTimestamp(data.create_time || data.update_time);
        var messages = extractChatGPTMessages(data.mapping);
        if (messages.length === 0) return null;
        var id = PROVIDER_CHATGPT + '_' + index + '_' + (Math.abs(hashCode(title)) >>> 0);
        return new Conversation(id, title, createdAt, PROVIDER_CHATGPT, messages);
    }

    function extractChatGPTMessages(mapping) {
        if (!mapping || typeof mapping !== 'object') return [];
        var items = [];
        for (var key in mapping) items.push([key, mapping[key]]);
        items.sort(function(a, b) {
            var ma = a[1] && a[1].message ? a[1].message : {};
            var mb = b[1] && b[1].message ? b[1].message : {};
            return (ma.create_time || 0) - (mb.create_time || 0);
        });
        var messages = [];
        for (var i = 0; i < items.length; i++) {
            var msgId = items[i][0];
            var msgData = items[i][1];
            if (msgId === 'root' || !msgData || !msgData.message) continue;
            var message = msgData.message;
            var role = (message.author && message.author.role) ? message.author.role : 'unknown';
            if (role === 'system') continue;
            var contentObj = message.content || {};
            var parts = [];
            if (contentObj.parts && Array.isArray(contentObj.parts)) {
                for (var j = 0; j < contentObj.parts.length; j++) {
                    var part = contentObj.parts[j];
                    if (typeof part === 'string') parts.push(part);
                    else if (typeof part === 'object' && part.text) parts.push(part.text);
                }
            } else if (typeof contentObj === 'string') parts.push(contentObj);
            var text = parts.join('\n').trim();
            if (!text) continue;
            var ts = parseTimestamp(message.create_time);
            messages.push(new Message(role, text, ts));
        }
        return messages;
    }

    function parseGeminiRecords(records, layout) {
        var allMessages = [];
        var h2m = typeof htmlToMarkdown !== 'undefined' ? htmlToMarkdown : null;
        if (typeof global !== 'undefined' && global.htmlToMarkdown) h2m = global.htmlToMarkdown;
        for (var i = 0; i < records.length; i++) {
            var rec = records[i];
            var title = rec.title || '';
            title = title.replace(/^Prompted\s+/i, '').replace(/^Asked\s+/i, '').replace(/^Search\s+/i, '').trim();
            var ts = parseTimestamp(rec.time);
            if (title) allMessages.push(new Message('user', title, ts));
            var html = rec.safeHtmlItem;
            var md = '';
            if (h2m) md = h2m(html);
            if (md) allMessages.push(new Message('assistant', md, ts));
        }
        allMessages.sort(function(a, b) {
            var ta = a.timestamp ? a.timestamp.getTime() : 0;
            var tb = b.timestamp ? b.timestamp.getTime() : 0;
            return ta - tb;
        });
        var gapMinutes = layout && layout.gemini_group_gap_minutes ? layout.gemini_group_gap_minutes : 30;
        var keepUngrouped = layout && layout.gemini_keep_ungrouped ? layout.gemini_keep_ungrouped : false;
        var groups = [];
        if (keepUngrouped) {
            for (var k = 0; k < allMessages.length; k++) groups.push([allMessages[k]]);
        } else {
            var current = [];
            for (var l = 0; l < allMessages.length; l++) {
                var prev = allMessages[l - 1];
                var curr = allMessages[l];
                if (prev && curr && prev.timestamp && curr.timestamp) {
                    var diff = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 60000;
                    if (diff > gapMinutes) {
                        if (current.length > 0) groups.push(current);
                        current = [curr];
                    } else current.push(curr);
                } else current.push(curr);
            }
            if (current.length > 0) groups.push(current);
        }
        var result = [];
        for (var m = 0; m < groups.length; m++) {
            var group = groups[m];
            if (group.length === 0) continue;
            var convTitle = 'Untitled Conversation';
            for (var n = 0; n < group.length; n++) {
                if (group[n].role === 'user') {
                    convTitle = group[n].content;
                    if (convTitle.length > 60) convTitle = convTitle.substring(0, 57) + '...';
                    break;
                }
            }
            var createdAt = group[0].timestamp;
            var convId = PROVIDER_GEMINI + '_' + m + '_' + (Math.abs(hashCode(convTitle)) >>> 0);
            result.push(new Conversation(convId, convTitle, createdAt, PROVIDER_GEMINI, group));
        }
        return result;
    }

    function parseTimestamp(value) {
        if (!value) return null;
        if (typeof value === 'number') {
            try { return new Date(value * 1000); } catch (e) { return null; }
        }
        var str = String(value).trim();
        var iso = str.replace('Z', '+00:00');
        try {
            if (iso.indexOf('+') !== -1 || iso.indexOf('-') > 4) return new Date(iso);
        } catch (e) {}
        try {
            if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str.substring(0, 10));
        } catch (e) {}
        try {
            var ts = parseFloat(str);
            if (!isNaN(ts) && ts > 0) return new Date(ts);
        } catch (e) {}
        try { return new Date(str); } catch (e) { return null; }
    }

    function hashCode(str) {
        var h = 0;
        for (var i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h = h & h;
        }
        return h;
    }

    var allParsers = [
        { name: PROVIDER_DEEPSEEK, confidence: 0.95, canParse: function(json) {
            var d = unwrapWrapper(json);
            if (Array.isArray(d)) return d.length > 0 && d[0].mapping && typeof d[0].mapping === 'object';
            return typeof d === 'object' && d.mapping && typeof d.mapping === 'object';
        }, parse: function(json) {
            var d = unwrapWrapper(json);
            if (!Array.isArray(d)) d = [d];
            var r = [];
            for (var i = 0; i < d.length; i++) { var c = parseDeepSeekConversation(d[i], i); if (c) r.push(c); }
            return r;
        }},
        { name: PROVIDER_CLAUDE, confidence: 0.9, canParse: function(json) {
            var d = unwrapWrapper(json);
            if (Array.isArray(d)) {
                for (var i = 0; i < d.length; i++) {
                    if (typeof d[i] === 'object' && (d[i].chat_messages || (d[i].messages && d[i].messages[0] && d[i].messages[0].sender !== undefined))) return true;
                }
                return false;
            }
            if (typeof d === 'object') {
                if (d.chat_messages) return true;
                if (d.messages && Array.isArray(d.messages) && d.messages[0] && d.messages[0].sender !== undefined) return true;
            }
            return false;
        }, parse: function(json) {
            var d = unwrapWrapper(json);
            if (!Array.isArray(d)) d = [d];
            var r = [];
            for (var i = 0; i < d.length; i++) { var c = parseClaudeConversation(d[i], i); if (c) r.push(c); }
            return r;
        }},
        { name: PROVIDER_GEMINI, confidence: 0.95, canParse: function(json) {
            if (Array.isArray(json)) { for (var i = 0; i < json.length; i++) { if (looksLikeGemini(json[i])) return true; } return false; }
            if (typeof json === 'object') return looksLikeGemini(json);
            return false;
        }, parse: function(json, layout) {
            var d = Array.isArray(json) ? json : [json];
            var records = [];
            for (var i = 0; i < d.length; i++) { if (looksLikeGemini(d[i])) records.push(d[i]); }
            return parseGeminiRecords(records, layout);
        }},
        { name: PROVIDER_CHATGPT, confidence: 0.7, canParse: function(json) {
            var d = unwrapWrapper(json);
            if (Array.isArray(d)) {
                if (d.length > 0 && d[0].mapping && typeof d[0].mapping === 'object' && !hasFragmentsInMapping(d[0])) return true;
                if (d[0].messages && Array.isArray(d[0].messages) && d[0].messages[0] && d[0].messages[0].role !== undefined) return true;
                return false;
            }
            if (typeof d === 'object' && d.mapping && typeof d.mapping === 'object' && !hasFragmentsInMapping(d)) return true;
            return false;
        }, parse: function(json) {
            var d = unwrapWrapper(json);
            if (!Array.isArray(d)) d = [d];
            var r = [];
            for (var i = 0; i < d.length; i++) { var c = parseChatGPTConversation(d[i], i); if (c) r.push(c); }
            return r;
        }}
    ];

    function parseJson(jsonData, providerHint, layout) {
        if (providerHint && providerHint !== 'auto') {
            for (var i = 0; i < allParsers.length; i++) {
                if (allParsers[i].name === providerHint && allParsers[i].canParse(jsonData)) {
                    return { provider: providerHint, conversations: allParsers[i].parse(jsonData, layout) };
                }
            }
        }
        var sorted = allParsers.slice().sort(function(a, b) { return b.confidence - a.confidence; });
        for (var j = 0; j < sorted.length; j++) {
            var p = sorted[j];
            if (p.canParse(jsonData)) return { provider: p.name, conversations: p.parse(jsonData, layout) };
        }
        return { provider: PROVIDER_UNKNOWN, conversations: [] };
    }

    function downscaleHeadings(text) { return text.replace(/^#(?=\s)/gm, '#'); }
    function hasH1(text) { return /^#(?=\s)/m.test(text); }

    function renderMessage(message, layout) {
        var heading;
        if (message.role === 'user') heading = layout.user_heading || '# Me';
        else if (message.role === 'thinking') heading = layout.thinking_heading || '# Thinking';
        else heading = layout.assistant_heading || '# Assistant';
        var content = message.content;
        if (message.role === 'assistant' && layout.heading_downscale !== false && hasH1(content)) content = downscaleHeadings(content);
        return heading + '\n' + content;
    }

    function formatDate(date, fmt) {
        if (!date) return '';
        var d = date;
        var pad = function(n) { return (n < 10 ? '0' : '') + n; };
        var result = fmt || '%Y-%m-%d';
        result = result.replace('%Y', d.getFullYear()).replace('%m', pad(d.getMonth() + 1)).replace('%d', pad(d.getDate()));
        result = result.replace('%H', pad(d.getHours())).replace('%M', pad(d.getMinutes())).replace('%S', pad(d.getSeconds()));
        return result;
    }

    function renderConversation(conversation, layout) {
        var lines = [];
        var frontmatter = layout.frontmatter || {};
        if (Object.values(frontmatter).some(function(v) { return v; })) {
            lines.push('---\n');
            if (frontmatter.title) lines.push('title: "' + conversation.title.replace(/"/g, '""') + '"\n');
            if (frontmatter.date && conversation.created_at) lines.push('date: ' + formatDate(conversation.created_at, layout.timestamp_format || '%Y-%m-%d') + '\n');
            if (frontmatter.provider) lines.push('provider: ' + conversation.provider + '\n');
            if (frontmatter.url && conversation.url) lines.push('url: ' + conversation.url + '\n');
            lines.push('---\n\n');
        }
        if (layout.add_title_as_h1) lines.push('# ' + conversation.title + '\n');
        var includeThinking = layout.include_thinking !== false;
        var separator = layout.separator || '';
        var msgList = conversation.messages;
        for (var i = 0; i < msgList.length; i++) {
            var msg = msgList[i];
            if (msg.role === 'thinking' && !includeThinking) continue;
            lines.push(renderMessage(msg, layout));
            if (i < msgList.length - 1) {
                var nextMsg = msgList[i + 1];
                if (nextMsg.role === 'thinking' && !includeThinking) continue;
                if (separator) lines.push('\n' + separator + '\n');
                else lines.push('\n');
            }
        }
        return lines.join('');
    }

    function sanitizeFilename(name) {
        if (!name) return 'Untitled';
        name = name.replace(/[<>:"/\\|?*]/g, '');
        name = name.replace(/[\x00-\x1f\x7f]/g, '');
        name = name.replace(/\s+/g, ' ').trim();
        if (name.length > 150) name = name.substring(0, 147) + '...';
        return name || 'Untitled';
    }

    function getUniqueFilename(base, used) {
        if (!used[base]) return base;
        var idx = base.lastIndexOf('.');
        var name = idx !== -1 ? base.substring(0, idx) : base;
        var ext = idx !== -1 ? base.substring(idx) : '';
        var counter = 1;
        while (used[name + ' ' + counter + ext]) counter++;
        return name + ' ' + counter + ext;
    }

    function renderConversations(conversations, layout) {
        var results = [];
        var usedTitles = {};
        for (var i = 0; i < conversations.length; i++) {
            var conv = conversations[i];
            var content = renderConversation(conv, layout);
            var baseFilename = sanitizeFilename(conv.title) + '.md';
            var filename = getUniqueFilename(baseFilename, usedTitles);
            usedTitles[filename] = true;
            results.push({ filename: filename, content: content });
        }
        return results;
    }

    var Converter = {
        detectProvider: detectProvider,
        parseJson: parseJson,
        renderConversations: renderConversations,
        renderConversation: renderConversation,
        sanitizeFilename: sanitizeFilename,
        PROVIDER_CLAUDE: PROVIDER_CLAUDE,
        PROVIDER_DEEPSEEK: PROVIDER_DEEPSEEK,
        PROVIDER_GEMINI: PROVIDER_GEMINI,
        PROVIDER_CHATGPT: PROVIDER_CHATGPT,
        PROVIDER_UNKNOWN: PROVIDER_UNKNOWN
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = Converter;
    else global.Converter = Converter;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));