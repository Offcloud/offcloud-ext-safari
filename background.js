var remoteOptionId = safari.extension.settings.remoteOptionId;
var apiKey = safari.extension.settings.apiKey;

var APIURLS = {
    instantDld: 'https://offcloud.com/api/instant/download',
    cloudDld: 'https://offcloud.com/api/cloud/download',
    remoteDld: 'https://offcloud.com/api/remote/download',
    login: 'https://offcloud.com/login',
    checkLogin: 'https://offcloud.com/api/login/check',
    getRemoteId: 'https://offcloud.com/api/remote-account/list',
    remoteSet: 'https://www.offcloud.com/#/remote'
};

safari.extension.settings.addEventListener("change", settingsChanged, false);

function settingsChanged() {
    apiKey = safari.extension.settings.apiKey;
    remoteOptionId = safari.extension.settings.remoteOptionId;
    setDefaultRemoteAccount(function () {
    });
}

safari.application.addEventListener("command", onContextMenuCommand, false);
safari.application.addEventListener("contextmenu", function (event) {
    if (event.userInfo.selectionText || event.userInfo.linkUrl) {
        event.contextMenu.appendContextMenuItem('InstantDownloadSelectedLinks', 'Instant download selected links');
        event.contextMenu.appendContextMenuItem('CloudDownloadSelectedLinks', 'Cloud download selected links');
        event.contextMenu.appendContextMenuItem('RemoteDownloadSelectedLinks', 'Remote download selected links');
    }

    event.contextMenu.appendContextMenuItem('InstantDownloadCustomLinks', 'Instant download custom links');
    event.contextMenu.appendContextMenuItem('CloudDownloadCustomLinks', 'Cloud download custom links');
    event.contextMenu.appendContextMenuItem('RemoteDownloadCustomLinks', 'Remote download custom links');
}, false);

function onContextMenuCommand(event) {
    var activeTab = safari.application.activeBrowserWindow.activeTab;
    switch (event.command) {
        case "InstantDownloadSelectedLinks":
            downloadAction(event.userInfo, activeTab, APIURLS.instantDld, false, 0);
            break;
        case "CloudDownloadSelectedLinks":
            downloadAction(event.userInfo, activeTab, APIURLS.cloudDld, false, 1);
            break;
        case "RemoteDownloadSelectedLinks":
            downloadAction(event.userInfo, activeTab, APIURLS.remoteDld, false, 2);
            break;
        case "InstantDownloadCustomLinks":
            customDownload(activeTab, 0);
            break;
        case "CloudDownloadCustomLinks":
            customDownload(activeTab, 1);
            break;
        case "RemoteDownloadCustomLinks":
            customDownload(activeTab, 2);
            break;
    }
}

function customDownload(tab, type) {
    if (apiKey == null) {
        notifyEmptyApiKey();
    } else {
        tab.page.dispatchMessage("showModal", {type: type});
    }
}

function downloadAction(clickData, tab, apiLink, remote, type) {
    if (apiKey == null) {
        notifyEmptyApiKey();
    } else {
        startAction();
    }

    function startAction() {
        apiLink += "?apiKey=" + apiKey;

        tab.page.dispatchMessage("appendLoader", {});

        if (clickData.linkUrl) {
            processCall(apiLink, clickData.linkUrl, remote, tab, type);
        } else if (clickData.selectionText) {
            tab.page.dispatchMessage("getSelectedHtml", {
                remote: remote,
                apiLink: apiLink,
                type: type
            });
        }
    }
}

function processMultipleLink(html, needReg, remote, tab, api, href, type) {
    var result = [];
    if (needReg) {
        result = findLinkByRegex(html);
    } else {
        result = findLinkByText(html);
    }

    result = result.map(function (link) {
        if (link.startsWith('http')) {
            return link;
        } else {
            return href + link;
        }
    });

    if (result && result.length > 1) {
        var requestList = [];
        for (var i = 0; i < result.length; i++) {
            var dataBody = {
                url: result[i]
            };
            if (remote) {
                dataBody.remoteOptionId = remoteOptionId;
            }
            requestList.push($.ajax(api, {
                method: 'POST',
                data: dataBody
            }));
        }
        var multiRequest = $.when.apply($, requestList);
        multiRequest.done(function (data) {
            var finalData = [];
            $.each(arguments, function (index, responseData) {
                if (responseData[1] == "success") {
                    if (responseData[0].not_available) {
                        tab.page.dispatchMessage("errorNotification", {});
                        return false;
                    } else {
                        if (remote) {
                            tab.page.dispatchMessage("remoteInProcessNotification", {});
                            return false;
                        } else {
                            if (!responseData[0].error)
                                finalData.push(responseData[0].url);
                        }
                    }
                } else {
                    tab.page.dispatchMessage("errorNotification", {});
                }
            });

            if (finalData.length != 0) {
                //copying the result to the clipboard
                var text = finalData.join("\n");
                tab.page.dispatchMessage("successNotification", {
                    text: text,
                    type: type,
                    urls: finalData
                });
            }
        });
    } else if (result && result.length == 1) {
        processCall(api, result[0], remote, tab, type);
    }
}

function processCall(api, link, remote, tab, type) {
    var dataBody = {
        url: link
    };
    if (remote) {
        dataBody.remoteOptionId = remoteOptionId;
        processAjax(api, link, true, tab, dataBody, type);

    } else {
        processAjax(api, link, false, tab, dataBody, type);
    }
}

function findLinkByRegex(html) {
    var linkReg = /href=[\'"]?([^\'" >]+)/g;
    var result = html.match(linkReg);
    if (result) {
        for (var i = 0; i < result.length; i++) {
            result[i] = result[i].replace('href="', '');
        }
    }
    return result;
}

function findLinkByText(text) {
    var urlReg = /[a-zA-z]+:\/\/[^\s]*/g;
    return text.match(urlReg);
}

function processAjax(api, link, remote, tab, dataBody, type) {
    $.ajax(api, {
        method: 'POST',
        data: dataBody
    }).done(function (data) {
        if (!data.not_available && remote) {
            tab.page.dispatchMessage("remoteInProcessNotification", {});
        } else if (!data.not_available) {
            var url = data.url;
            if (url != null) {
                tab.page.dispatchMessage("successNotification", {
                    text: url,
                    type: type,
                    urls: [url]
                });
            } else {
                tab.page.dispatchMessage("errorNotification", {});
            }
        } else {
            tab.page.dispatchMessage("errorNotification", {});
        }
    }).fail(function () {
        tab.page.dispatchMessage("errorNotification", {});
    });
}

function setDefaultRemoteAccount(callback) {
    $.get(APIURLS.getRemoteId + "?apikey=" + apiKey, function (data) {
        if (!data.error) {
            var remoteOptionsArray = data.data;
            if (remoteOptionsArray.length > 0)
                remoteOptionId = remoteOptionsArray[0].remoteOptionId;
            callback();
        }
    });
}

safari.application.addEventListener("message", onMessage, false);

function onMessage(event) {
    var cmd = event.name;

    if (cmd == "custom") {
        var currentApi;
        if (event.message.type == 0) {
            currentApi = APIURLS.instantDld;
        } else if (event.message.type == 1) {
            currentApi = APIURLS.cloudDld;
        } else {
            currentApi = APIURLS.remoteDld;
        }
        currentApi += "?apiKey=" + apiKey;
        event.target.page.dispatchMessage("appendLoader", {});
        processMultipleLink(event.message.html, false, event.message.type == 2, event.target, currentApi, null, event.message.type);
    } else if (cmd == "getSelectedHtml-result") {
        if (event.message && event.message.html) {
            processMultipleLink(event.message.html, true, event.message.remote, event.target, event.message.apiLink, event.message.href, event.message.type);
        }
    } else if (cmd == "successNotification-result") {
        event.message.urls.forEach(function (url) {
            safari.application.activeBrowserWindow.openTab().url = url;
        });
    }
}

function showErrorMessage() {
    showNotification("errorMsg", {
        type: "basic",
        title: ' Offcloud.com is offline',
        message: 'Sorry, Offcloud.com is offline, please try again later'
    });
}

function notifyEmptyApiKey() {
    showNotification("emptyApiKey", {
            type: "basic",
            title: 'ApiKey is empty',
            message: "ApiKey can't be empty. Please set value for ApiKey in extension settings."
        },
        false);
}

function showNotification(name, options, redirect, redirectUrl) {
    alert(options.message);
    if (redirect) {
        safari.application.activeBrowserWindow.openTab().url = redirectUrl;
    }
}