'use strict';


var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-162950882-1']);


(function() {
  var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
  ga.src = 'https://ssl.google-analytics.com/ga.js';
  var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
})();


function isEmpty(str) {
    return (!str || 0 === str.length);
}

$(document).ready( function(){
    chrome.tabs.query({
        active: true,
        currentWindow: true
    }, function(tabs) {
        var activeTab = tabs[0];
        const createButton = $('#createPartyButton');
        const inRoomMenu = $('#inRoomMenu');
        const createMenu = $("#createMenu");
        const errorContent = $("#errorContent");
        const errorMessage = $('#errorMessage');
        const siteMessage = $('#siteMessage')
        const dismissError = $('#dismissError');
        const disconnectButton = $('#disconnectButton')
        const hostOnly = $('#hostOnly');
        const partyUrl = $('#partyUrl');
        const copyButton = $("#partyUrlButton");
        const roomUrl = $("#partyUrl");
        const showChat = $('#showChatButton');
        const overlayChat = $('#overlayChatButton');
        const showReactions = $('#showReactions');
        const userNameInput = $('#userNameInput');
        const saveChangesButton = $('#saveChangesButton');
        inRoomMenu.hide();


        var getUrlVars = function(url) {
            var vars = {};
            url.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
                vars[key] = value;
            });
            return vars;
        }

        var getUrlParam = function (url, parameter){
            var urlparameter = null;
            if(url.indexOf(parameter) > -1){
                urlparameter = getUrlVars(url)[parameter];
            }
            return urlparameter;
        }
        var lockUI = function() {
            disconnectButton.prop("disabled", true);
            hostOnly.prop("disabled", true);
            createButton.prop("disabled", true);
        }

        var unlockUI = function() {
            disconnectButton.prop("disabled", false);
            hostOnly.prop("disabled", false);
            createButton.prop("disabled", false);
        }

        var showError = function(message) {
            errorContent.removeClass('hidden');
            createMenu.hide();
            // $('#messageDiv').show();
            $("#notifDiv").addClass('hidden')
            errorMessage.html(message);
        }

        var hideError = function() {
            createMenu.show();
            // $('#messageDiv').hide();
            errorContent.addClass('hidden');
        }

        var connectToRoom = function(sessionId, chatShowing, overlaying, reactShowing, nickname) {
            unlockUI();
            var customUrl = activeTab.url.split('?')[0] + '?dpSessionId=' + sessionId;
            inRoomMenu.show();
            userNameInput.val(nickname)
            toggleChat(chatShowing);
            toggleOther(overlayChat,overlaying);
            toggleOther(showReactions, reactShowing);
            createMenu.hide();
            partyUrl.val(customUrl).select();
        }

        var leaveRoom = function() {
            inRoomMenu.hide();
            createMenu.transition('fade');
            hostOnly.prop('checked', false);
        }

        var sendMessage = function(type, data, callback) {
            lockUI();
            var activeTabId = activeTab.id;
            chrome.tabs.executeScript(activeTabId, {file: "jquery.js"}, () => {
                chrome.tabs.executeScript(activeTabId, {file: "socket.io.js"}, () => {
                    chrome.tabs.executeScript(activeTabId, {file: "semantic/semantic.min.js"}, () => {
                        chrome.tabs.executeScript(activeTab.id, {file: 'js/roomController.js'}, () => {
                            chrome.tabs.sendMessage(activeTab.id, {
                                type: type,
                                data: data
                            }, function(response) {
                                unlockUI();
                                if(response) {
                                    if (response && response.error) {
                                        createButton.removeClass('loading');
                                        showError(response.error);
                                        return;
                                    }
                                }
                                if(callback) {
                                    callback(response)
                                }
                            });
                        });
                    });
                });
            });
        };
        var videoId = activeTab.url.match(/^.*\/([0-9a-zA-Z-]+)\??.*/)[1];
        
        function loadInitialData() {
            lockUI();
            if(!((activeTab.url.includes("www.disneyplus.com")) 
                && (activeTab.url.includes('video/')))) {
                siteMessage.show();
                return true;
            }
            _gaq.push(['_trackPageview']);
            createButton.addClass('loading');
                
            sendMessage('loadRoomData', {}, function (data) {
                unlockUI();
                if(!data) {
                    return;
                }
                if(!(isEmpty(data.notif))) {
                    $("#notifDiv").removeClass('hidden')
                    $("#notifDiv").addClass(data.notifColor)
                    $("#notifText").html(data.notif)
                }
                if(data.sessionId) {
                    connectToRoom(data.sessionId, data.chatShowing, data.overlaying, data.reactShowing, data.nickname)
                    createButton.removeClass('loading');
                }else
                {
                    let sessionId = getUrlParam(activeTab.url,"dpSessionId")
                    if(sessionId) {
                        sendMessage('joinRoom',{sessionId: sessionId, videoId: videoId}, function(response) {
                            _gaq.push(['_trackEvent', 'room', 'join']);
                            connectToRoom(response.sessionId, response.chatShowing, response.overlaying,response.reactShowing, response.nickname)
                            createButton.removeClass('loading');
                        })
                    }else {
                        createButton.removeClass('loading');
                    }
                }
            });
        }
        loadInitialData();

        createButton.click(function(){
            createButton.addClass('loading');
            sendMessage('createRoom', {
                videoId: videoId,
                hostOnly: $('#hostOnly').is(':checked')
            }, function(response) {
                _gaq.push(['_trackEvent', 'room', 'create']);
                connectToRoom(response.sessionId, response.chatShowing, response.overlaying,response.reactShowing, response.nickname)
                createButton.removeClass('loading');
            });
        });

          
        copyButton.click(function() {
            roomUrl.select();
            document.execCommand("copy");
        });

        roomUrl.click(function() {
            roomUrl.select();
            document.execCommand("copy");
        });

        dismissError.click(function () {
            hideError();
        });

        disconnectButton.click(function() {
            sendMessage('leaveRoom', {}, function(response) {
               leaveRoom();
               window.close();
            });
        });

        saveChangesButton.click(function() {
            let username = userNameInput.val();
            sendMessage('setUsername', {username: username}, () => {
                window.close();
            });
        })

        var toggleChat = function(show) {
            if(show) {
                overlayChat.show();
                showChat.addClass("toggled")
                showChat.addClass('green');
                showChat.removeClass('red');
            }else {
                showChat.removeClass('toggled');
                showChat.removeClass('green');
                showChat.addClass('red');
                overlayChat.hide();
            }
        }

        var toggleOther = function(object, show) {
            if(show) {
                object.addClass('green');
                object.removeClass('red');
                object.addClass("toggled")
            }else {
                object.removeClass('toggled');
                object.removeClass('green');
                object.addClass('red');
            }
        }

        var sendToggleMessage = function() {
            sendMessage('toggleChat',{
                show: showChat.hasClass("toggled"), 
                overlay: overlayChat.hasClass("toggled"),
                reactions: showReactions.hasClass("toggled")
            }, () => {});
        }
        showChat.click(() => {
            toggleChat(!showChat.hasClass("toggled"))
            sendToggleMessage();
        });

        overlayChat.click(() => {
            toggleOther(overlayChat, !overlayChat.hasClass("toggled"));
            sendToggleMessage();
        });

        showReactions.click(() => {
            toggleOther(showReactions, !showReactions.hasClass("toggled"));
            sendToggleMessage();
        })
    });
});