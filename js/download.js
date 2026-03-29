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
        if (!files || files.length === 0) {
            return;
        }
        
        // Check if JSZip is available
        if (typeof JSZip === 'undefined') {
            console.error('JSZip is not loaded!');
            return;
        }
        
        var zip = new JSZip();
        for (var i = 0; i < files.length; i++) {
            zip.file(files[i].filename, files[i].content);
        }
        
        var zipFilename = zipname || 'conversations.zip';
        
        zip.generateAsync({ type: 'blob' }).then(function(content) {
            console.log('ZIP created, size:', content.size);
            
            // Create blob URL
            var blob = content;
            var url = URL.createObjectURL(blob);
            
            // Create download link
            var link = document.createElement('a');
            link.href = url;
            link.download = zipFilename;
            link.style.display = 'none';
            document.body.appendChild(link);
            
            // Use timeout to ensure link is in DOM
            setTimeout(function() {
                link.click();
                
                // Cleanup
                setTimeout(function() {
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }, 100);
            }, 0);
            
        }).catch(function(err) {
            console.error('ZIP generation failed:', err);
        });
    }

    var Download = {
        downloadFile: downloadFile,
        downloadZip: downloadZip
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = Download;
    else global.Download = Download;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
