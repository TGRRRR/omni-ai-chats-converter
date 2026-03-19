/**
 * HTML to Markdown converter.
 * Primary approach: DOMParser. Regex is post-processing only.
 */
(function(global) {
    'use strict';

    function htmlToMarkdown(html) {
        if (!html) return '';

        if (typeof html === 'object') {
            if (Array.isArray(html)) {
                if (html.length > 0 && typeof html[0] === 'object' && html[0].html) {
                    html = html[0].html;
                } else {
                    return '';
                }
            } else if (html.html) {
                html = html.html;
            } else {
                return '';
            }
        }

        html = String(html);
        if (html.trim().length < 3) return '';

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        doc.querySelectorAll('script, style').forEach(el => el.remove());

        let md = domToMarkdown(doc.body);
        md = cleanupRegex(md);

        return md;
    }

    function domToMarkdown(node) {
        if (!node) return '';
        let result = '';
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
        const nodes = [];
        let currentNode;
        while (currentNode = walker.nextNode()) {
            nodes.push(currentNode);
        }
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (n.nodeType === Node.TEXT_NODE) {
                let text = n.textContent;
                const parent = n.parentElement;
                if (parent && (parent.tagName === 'PRE' || parent.tagName === 'CODE' || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                    continue;
                }
                text = text.replace(/\xa0/g, ' ');
                result += text;
            } else if (n.nodeType === Node.ELEMENT_NODE) {
                result += elementToMarkdown(n);
            }
        }
        return result;
    }

    function elementToMarkdown(el) {
        const tag = el.tagName.toUpperCase();
        switch (tag) {
            case 'P': return '\n\n' + domToMarkdown(el) + '\n';
            case 'DIV': return '\n\n' + domToMarkdown(el) + '\n';
            case 'BR': return '\n';
            case 'H1': return '\n\n# ' + domToMarkdown(el) + '\n';
            case 'H2': return '\n\n## ' + domToMarkdown(el) + '\n';
            case 'H3': return '\n\n### ' + domToMarkdown(el) + '\n';
            case 'H4': return '\n\n#### ' + domToMarkdown(el) + '\n';
            case 'H5': return '\n\n##### ' + domToMarkdown(el) + '\n';
            case 'H6': return '\n\n###### ' + domToMarkdown(el) + '\n';
            case 'STRONG': case 'B': return '**' + domToMarkdown(el) + '**';
            case 'EM': case 'I': return '*' + domToMarkdown(el) + '*';
            case 'CODE':
                if (el.parentElement && el.parentElement.tagName.toUpperCase() === 'PRE') return domToMarkdown(el);
                return '`' + domToMarkdown(el) + '`';
            case 'PRE': {
                let lang = '';
                const code = el.querySelector('code');
                if (code && code.className) {
                    const match = code.className.match(/language-(\S+)/);
                    if (match) lang = match[1];
                }
                const codeText = el.textContent;
                return '\n\n```' + lang + '\n' + codeText + '\n```\n';
            }
            case 'A': {
                const href = el.getAttribute('href') || '';
                const text = domToMarkdown(el);
                if (href === text || !href) return text;
                return '[' + text + '](' + href + ')';
            }
            case 'IMG': {
                const src = el.getAttribute('src') || '';
                const alt = el.getAttribute('alt') || '';
                return '![' + alt + '](' + src + ')';
            }
            case 'UL': return '\n\n' + listToMarkdown(el, false);
            case 'OL': return '\n\n' + listToMarkdown(el, true);
            case 'TABLE': return '\n\n' + tableToMarkdown(el) + '\n';
            case 'BLOCKQUOTE': return '\n\n> ' + domToMarkdown(el).replace(/\n+/g, '\n> ') + '\n';
            case 'HR': return '\n\n---\n\n';
            case 'SCRIPT': case 'STYLE': return '';
            default: return domToMarkdown(el);
        }
    }

    function listToMarkdown(list, ordered) {
        let md = '';
        const items = list.querySelectorAll(':scope > li');
        items.forEach((li, idx) => {
            const prefix = ordered ? (idx + 1) + '. ' : '* ';
            let text = li.textContent.replace(/\n/g, ' ').replace(/^\s+/, '').replace(/\s+$/, '');
            md += prefix + text + '\n';
        });
        return md;
    }

    function tableToMarkdown(table) {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length === 0) return '';
        const colCount = Math.max(...rows.map(r => r.querySelectorAll('th, td').length));
        let md = '';
        rows.forEach((row, i) => {
            const cells = row.querySelectorAll('th, td');
            const cellTexts = [];
            cells.forEach(c => {
                let txt = c.textContent.trim().replace(/\n/g, ' ').replace(/\|/g, '\|');
                if (c.colSpan > 1) {
                    for (let s = 1; s < c.colSpan; s++) cellTexts.push(txt);
                }
                cellTexts.push(txt);
            });
            while (cellTexts.length < colCount) cellTexts.push('');
            md += '| ' + cellTexts.join(' | ') + ' |\n';
            if (i === 0) {
                md += '| ' + Array(colCount).fill('---').join(' | ') + ' |\n';
            }
        });
        return md;
    }

    function cleanupRegex(md) {
        md = md.replace(/\xa0/g, ' ');
        md = md.replace(/&nbsp;/gi, ' ');
        md = md.replace(/&lt;/g, '<');
        md = md.replace(/&gt;/g, '>');
        md = md.replace(/&amp;/g, '&');
        md = md.replace(/&quot;/g, '"');
        md = md.replace(/&#39;/g, "'");
        md = md.replace(/&#x27;/g, "'");
        md = md.replace(/&#x2F;/g, '/');
        md = md.replace(/&mdash;/g, '---');
        md = md.replace(/&ndash;/g, '--');
        md = md.replace(/&hellip;/g, '...');
        md = md.replace(/&copy;/g, '(C)');
        md = md.replace(/&reg;/g, '(R)');
        md = md.replace(/&trade;/g, '(TM)');
        md = md.replace(/<\/span>/gi, '');
        md = md.replace(/<span[^>]*>/gi, '');
        md = md.replace(/<\/div>/gi, '');
        md = md.replace(/<div[^>]*>/gi, '');
        md = md.replace(/<\/p>/gi, '');
        md = md.replace(/<p[^>]*>/gi, '');
        md = md.replace(/\n{4,}/g, '\n\n\n');
        md = md.replace(/[ \t]+\n/g, '\n');
        md = md.replace(/\n[ \t]+/g, '\n');
        md = md.replace(/^\s*\n+/, '');
        md = md.replace(/\n\s*$/, '');
        md = md.replace(/\n{3,}/g, '\n\n');
        return md.trim();
    }

    global.htmlToMarkdown = htmlToMarkdown;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
