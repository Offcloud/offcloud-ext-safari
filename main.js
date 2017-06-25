initMain();

function initMain() {
    document.addEventListener('contextmenu', function (event) {
        function getSelectionText() {
            var text = '';
            if (window.getSelection) {
                text = window.getSelection().toString();
            } else if (document.selection && document.selection.type != "Control") {
                text = document.selection.createRange().text;
            }
            return text;
        }

        var link = $(event.target).closest('a');
        var linkUrl = link ? link.attr('href') : '';
        var selectionText = getSelectionText();
        safari.self.tab.setContextMenuEventUserInfo(event, {linkUrl: linkUrl, selectionText: selectionText});
    }, false);

    var $loaderContainer = $("<div>").css({
        'position': 'fixed',
        'bottom': '5px',
        'right': '5px',
        'z-index': '999999999'
    });

    var $loaderSpinner = $('<div>').addClass('loader');

    $loaderContainer.append($loaderSpinner);

    safari.self.addEventListener("message", requestHandler, false);

    function requestHandler(event) {
        if (event.name == "getSelectedHtml") {
            var selectedHtml = getHTMLOfSelection();
            var response = {
                html: selectedHtml,
                href: location.href,
                remote: event.message.remote,
                apiLink: event.message.apiLink,
                type: event.message.type
            };
            safari.self.tab.dispatchMessage("getSelectedHtml-result", response);
        } else if (event.name == "appendLoader") {
            appendLoader();
        } else if (event.name == "remoteInProcessNotification") {
            showRemoteInProcessNotification();
            return true;
        } else if (event.name == "successNotification") {
            showSuccessNotification(event.message.text, event.message.type, function (obj) {
                obj.urls = event.message.urls;
                safari.self.tab.dispatchMessage("successNotification-result", obj);
            });
        } else if (event.name == "errorNotification") {
            showErrorNotification();
        } else if (event.name == "showModal") {
            showModal(event.message.type);
        }
    }

    function getHTMLOfSelection() {
        var range;
        if (document.selection && document.selection.createRange) {
            range = document.selection.createRange();
            return range.htmlText;
        } else if (window.getSelection) {
            var selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                range = selection.getRangeAt(0);
                var clonedSelection = range.cloneContents();
                var div = document.createElement('div');
                div.appendChild(clonedSelection);
                return div.innerHTML;
            } else {
                return '';
            }
        } else {
            return '';
        }
    }

    function appendLoader() {
        $loaderContainer.appendTo('body');
    }

    function removeLoader() {
        $loaderContainer.remove();
    }

    function showRemoteInProcessNotification() {
        removeLoader();
        notie.alert({
            type: 1,
            text: 'Your remote upload has begun.',
            time: 4
        });
    }

    function showSuccessNotification(text, type, callback) {
        removeLoader();
        var confirmText = "";
        if (type == 0)
            confirmText = 'Download links copied to clipboard. Open them in new tab?';
        else if (type == 1)
            confirmText = 'Transfer has started & links are copied. Open them in new tab?'

        notie.confirm({
            text: confirmText,
            submitText: 'Yes',
            cancelText: 'No',
            submitCallback: function () {
                copyTextToClipboard(text);
                callback({success: true});
            },
            cancelCallback: function () {
                copyTextToClipboard(text);
            }
        });
    }

    function showErrorNotification() {
        removeLoader();
        notie.alert({
            type: 'error',
            text: 'An error occured!',
            time: 4
        });
    }

    function showModal(type) {
        var label = "";

        if (type == 0)
            label = 'Instant download custom links';
        else if (type == 1)
            label = 'Cloud download custom links';
        else if (type == 2)
            label = 'Remote download custom links';

        notie.textarea({
            text: label,
            submitText: 'Process link(s) to Offcloud.com',
            cancelText: 'Cancel',
            rows: 5,
            submitCallback: function (customLinks) {
                if (customLinks && customLinks.trim() != "") {
                    safari.self.tab.dispatchMessage("custom", {
                        html: customLinks,
                        type: type
                    });
                }
            }
        });
    }

    function copyTextToClipboard(text) {
        var copyFrom = $('<textarea/>');
        copyFrom.text(text.replace("\n", "\r\n"));
        $('body').append(copyFrom);
        copyFrom.select();
        document.execCommand('copy');
        copyFrom.remove();
    }
}