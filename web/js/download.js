(function(global) {
    'use strict';

    function downloadFile(filename, content) {
        var blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function downloadZip(files, zipname) {
        if (!files || files.length === 0) return;
        var archive;
        if (typeof global.Archive !== 'undefined') {
            archive = new global.Archive(files.length);
        } else {
            try { archive = new Archive(files.length); }
            catch (e) {
                downloadFallback(files, zipname);
                return;
            }
        }
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            var blob = new Blob([file.content], { type: 'text/markdown;charset=utf-8' });
            archive.addFile(file.filename, blob);
        }
        var archiveBlob;
        try {
            archiveBlob = archive.generate();
        } catch (e) {
            downloadFallback(files, zipname);
            return;
        }
        var url = URL.createObjectURL(archiveBlob);
        var a = document.createElement('a');
        a.href = url;
        a.download = zipname || 'conversations.zip';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function downloadFallback(files, zipname) {
        for (var i = 0; i < files.length; i++) {
            downloadFile(files[i].filename, files[i].content);
        }
    }

    var Download = {
        downloadFile: downloadFile,
        downloadZip: downloadZip
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = Download;
    else global.Download = Download;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));