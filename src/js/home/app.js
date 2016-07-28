/* global ko JSZip $ */

var templates = require('../../../res/vendor/skins/main/templates/templates.json');

/**
 * Extract Zip, read content and call 'importEdit'
 *
 * @param {File} f
 */
function handleFile(f) {
    var editId = getEditIdFromFilename(f.name);
    if (editId !== false) {

        var deferred = {
            metadata: $.Deferred(),
            template: $.Deferred()
        };

        $.when(deferred.metadata, deferred.template).then(function(file1, file2) {
            if (arguments.length !== 2) {
                alert('Invalid file');
                return;
            }
            if (importEdit(editId, file1, file2)) {
                var editsData = readEdits();
                viewModel.edits.removeAll();
                viewModel.edits.push.apply(viewModel.edits, editsData);
            }
        });

        JSZip.loadAsync(f)
            .then(function(zip) {
                zip.forEach(function(relativePath, zipEntry) {
                    var def;

                    if (zipEntry.name.indexOf('metadata') === 0){
                        def = deferred.metadata;
                    } else if (zipEntry.name.indexOf('template') === 0) {
                        def = deferred.template;
                    } else {
                        console.error('Invalid Zip content')
                    }

                    zipEntry.async("string").then(function success(content) {
                        def.resolve(content);
                    }, function error(e) {
                        def.reject(e);
                    });
                });
            }, function(e) {
                console.error(f.name, e.message);
            });

        return;
    }

    alert('Invalid file');
}

/**
 * Check filename is like mosaico_{id}.zip
 * Return {id}
 *
 * @param {string} filename
 * @returns {string|false}
 */
function getEditIdFromFilename(filename) {
    var temp = filename.split('.');
    if (temp.length===2) {
        var parts = temp[0].split('_');
        if (parts[0] === 'mosaico') {
            return parts[1];
        }
    }
    return false;
}

/**
 * Transform edits localstorage into Ko ready array
 *
 * @returns {Array}
 */
function readEdits() {

    var edits = [];
    if (localStorage.getItem('edits')) {
        var editKeys = JSON.parse(localStorage.getItem('edits'));
        var md;

        for (var i = 0; i < editKeys.length; i++) {
            md = localStorage.getItem('metadata-' + editKeys[i]);
            if (typeof md == 'string') {
                edits.push(JSON.parse(md));
            } else {
                console.log("Ignoring saved key", editKeys[i], "type", typeof md, md);
            }
        }

        edits.sort(function (a, b) {
            var lastA = a.changed ? a.changed : a.created;
            var lastB = b.changed ? b.changed : b.created;
            if (lastA < lastB) return 1;
            if (lastA > lastB) return -1;
            return 0;
        });
    }
    return edits;
}

/**
 *
 * @param id
 * @param metadata
 * @param template
 */
function importEdit(id, metadata, template) {
    var editKeys = JSON.parse(localStorage.getItem('edits'));

    if (editKeys.indexOf(id) === -1) {
        editKeys.push(id);
        localStorage.setItem('edits', JSON.stringify(editKeys));
        localStorage.setItem("metadata-" + id, metadata);
        localStorage.setItem("template-" + id, template);
        return true;
    }

    alert("Oops, config " + id + " already loaded");
    return false;
}

var viewModel = {
    showSaved: ko.observable(false),
    edits: ko.observableArray(readEdits()),
    templates: templates
};

viewModel.edits.subscribe(function(newEdits) {
    var keys = [];
    for (var i = 0; i < newEdits.length; i++) {
        keys.push(newEdits[i].key);
        localStorage.setItem('metadata-'+newEdits[i].key, ko.toJSON(newEdits[i]));
    }
    localStorage.setItem('edits', ko.toJSON(keys));
});

viewModel.dateFormat = function(unixdate) {
    if (typeof unixdate == 'undefined') return 'DD-MM-YYYY';
    var d = new Date();
    d.setTime(ko.utils.unwrapObservable(unixdate));
    var m = ""+(d.getMonth()+1);
    var h = ""+(d.getHours());
    var i = ""+(d.getMinutes());
    return d.getDate()+"/"+(m.length == 1 ? '0' : '')+m+"/"+d.getFullYear()+" "+(h.length == 1 ? '0' : '')+h+":"+(i.length == 1 ? '0' : '')+i;
};

viewModel.templatesBasePath = 'res/vendor/skins/main/templates/';

viewModel.newEdit = function(shorttmplname) {
    console.log("new", this, template);
    var d = new Date();
    var rnd = Math.random().toString(36).substr(2, 7);
    var template =  viewModel.templatesBasePath + shorttmplname + '/template-' + shorttmplname + '.html';
    viewModel.edits.unshift({ created: Date.now(), key: rnd, name: shorttmplname, template: template });
    document.location = 'editor.html#'+rnd;
    // { data: 'AAAA-MM-GG', key: 'ABCDE' }
    // viewModel.edits.push(template);
};
viewModel.renameEdit = function(index) {
    var newName = window.prompt("Modifica nome", viewModel.edits()[index].name);
    if (newName) {
        var newItem = JSON.parse(ko.toJSON(viewModel.edits()[index]));
        newItem.name = newName;
        viewModel.edits.splice(index, 1, newItem);
    }
    return false;
};
viewModel.deleteEdit = function(index) {
    var confirm = window.confirm("Are you sure you want to delete this content?");
    if (confirm) {
        var res = viewModel.edits.splice(index, 1);
        console.log("removing template ", res);
        localStorage.removeItem('template-'+res[0].key);
    }
    return false;
};
viewModel.list = function(clean) {
    for (var i = localStorage.length - 1; i >= 0; i--) {
        var key = localStorage.key(i);
        if (clean) {
            console.log("removing ", key, localStorage.getItem(key));
            localStorage.removeItem(key);
        } else {
            console.log("ls ", key, localStorage.getItem(key));
        }
    }
};

/**
 * Get data from localstorage and output a zip to the browser
 *
 * @param {String} index Edit id
 */
viewModel.exportEdit = function(index) {

    var editId              = viewModel.edits()[index].key,
        metadataFilename    = 'metadata-'+editId,
        templateFilename    = 'template-'+editId,
        metadataContent     = localStorage.getItem(metadataFilename),
        templateContent     = localStorage.getItem(templateFilename);

    if (metadataContent === null || templateContent === null) {
        alert('Ooops, can\'t find NL ' + editId);
        return false;
    }

    var zip = new JSZip();
    zip.file(metadataFilename + '.json', metadataContent);
    zip.file(templateFilename + '.json', templateContent);
    zip.generateAsync({type:"blob"})
        .then(function (blob) {
            saveAs(blob, "mosaico_"+editId+".zip");
        }, function (err) {
            throw err;
        });

    return false;
};

/**
 * Event handler to the input file change event
 *
 * @param {Object} data
 * @param {Event} event Change event
 */
viewModel.fileSelected = function(data, event) {
    var files = event.target.files;
    for (var i = 0, f; f = files[i]; i++) {
        handleFile(f);
    }
};

document.addEventListener('DOMContentLoaded',function(){
    ko.applyBindings(viewModel);
});
