
if (!window.disneyPalInjected) {
    window.disneyPalInjected = true;

    
    //////////////////////////////////////////////////////////////////////////
    // Variable Declaration                                                 //
    //////////////////////////////////////////////////////////////////////////
        
        
    var queue = null;
    var queueCount = 0
    
    var messages = null;

    var newServerVideo = "";

    var showRecover = false;
    var overlayRecover = false;
    var reactRecover = false;
    var port = chrome.runtime.connect({name: "main"});
    
    var socket;
    var socketUrl = 'wss://server.disneywatchparty.com'
    var connectedToSocket = false;
    var notifMessage = "";
    var notifColor = "brown";
    var userCount = 1;

    var host;
    var hostOnly = false;
    var serverState = null;
    var serverUpdatedTime = "";
    var sessionId;

    var othersTyping = false;
    var isBuffering = false;
    var ignoreEvents = 0;
    var syncRange = 3;

    var video = null;
    var syncInterval;
    var videoInterval;
    var nickname = "User"

    const reaction_map = {
        'fire' : chrome.runtime.getURL("/images/fire.png"),
        'cry' : chrome.runtime.getURL("/images/cry.png"),
        'love' : chrome.runtime.getURL("/images/love.png"),
        'shock' : chrome.runtime.getURL("/images/shock.png"),
        'laugh' : chrome.runtime.getURL("/images/laughing.png")
    }


    //////////////////////////////////////////////////////////////////////////
    // Utility Methods                                                      //
    //////////////////////////////////////////////////////////////////////////
    
    // Returns a function, that, as long as it continues to be invoked, will not
    // be triggered. The function will be called after it stops being called for
    // N milliseconds. If `immediate` is passed, trigger the function on the
    // leading edge, instead of the trailing.
    function debounce(func, wait, immediate) {
        var timeout;
        return function() {
            var context = this, args = arguments;
            var later = function() {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            var callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    };
    
    var queueTask = function(task) {
        if(queueCount == 0)
        {
            queue = $.Deferred().resolve();
        }
        queueCount+=1;
        queue = queue.then(task).then(() => {
            queueCount -= 1;
        });
    };
    
    var getBeginState = function() {
        return {
            condition: "PlAY",
            time: 0,
            updatedAt: Date.now()
        }
    }

    function waitUntil(condition, delay, timeout) {
        return new Promise(function (resolve, reject) {
            var start = Date.now()
            var interval = setInterval(function () {
                if (condition) {
                    clearInterval(interval);
                    resolve();
                }
                
                now = Date.now();
                
                if (now - start >= timeout) {
                    clearInterval(interval)
                    resolve();
                }
            }, delay);
        });
    }
    
    var saveNickName = function() {
        chrome.storage.sync.set({"nickname": self.nickname},() => {})
    }

    var loadNickName = function(callback) {
        chrome.storage.sync.get({"nickname": 'User'}, (resp) => {
            self.nickname = resp.nickname;
            callback()
        })
    }


    var getCurrentState = function() {
        currentTime = video.currentTime;
        if (video.paused) {
            return {
                condition: "PAUSED",
                time: currentTime,
                updatedAt: Date.now()
            }
        }else if(video.seeking) {
            return {
                condition: "SEEK",
                time: currentTime,
                updatedAt: Date.now()
            }
        }else {
            return {
                condition: "PLAY",
                time: currentTime,
                updatedAt: Date.now()
            }
        }
    }

    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return [
          h,
          m > 9 ? m : (h ? '0' + m : m || '0'),
          s > 9 ? s : '0' + s
        ].filter(Boolean).join(':');
    }


    var loadVideoHandlers = (video) => {
        self.video = video;
        video.onplay = onPlay;
        video.onpause = onPause;
        video.onseeking = onSeeking;
        video.onwaiting = onBuffer;
        video.oncanplay = videoCanPlay;   
    }
    function waitForConnection () {
        var start = performance.now();
        var now = 0;
        var timeout = arguments.length >= 1 && arguments[0] !== undefined ? arguments[0] : 0;
        return new Promise(function (resolve, reject) {
            var interval = setInterval(function () {
                if (connectedToSocket) {
                    clearInterval(interval);
                    resolve();
                }
                now = performance.now();
    
                if (now - start >= timeout) {
                    clearInterval(interval);
                    reject();
                }
            }, 150);
        });
    }

    function waitUntilElementsLoaded(selector) {
        var timeout = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        var repeatDelay = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 100;
        var start = performance.now();
        var now = 0;
    
        return new Promise(function (resolve, reject) {
            var interval = setInterval(function () {
                var element = document.querySelector(selector);
    
                if (element instanceof Element && connectedToSocket) {
                    clearInterval(interval);
    
                    resolve(element);
                }
    
                now = performance.now();
    
                if (now - start >= timeout) {
                    clearInterval(interval);
                    if(!connectedToSocket) {
                        reject("Could not connect to server. Please try again");
                    }
                    reject("Could not find video. Please try again");
                }
            }, repeatDelay);
        });
    }


    var cleanup = function () {
        queueTask(toggleChat(false,false,false).then(() => {
            queue = $.Deferred().resolve();
        }));
        removeChat();
        window.disneyPalInjected = false;
        if(socket){
            socket.disconnect();
        }
        chrome.runtime.onMessage.removeListener(handleEvent);
        clearInterval(syncInterval)
        clearInterval(videoInterval)
        sessionId = "";
        port = null;
        removeChat();
    }

    
function displayReaction(reaction) {
    if (!reaction_map.hasOwnProperty(reaction)) {
        return;
    }
    var r_size = Math.floor(Math.random() * 65) + 20;
    var r_right = Math.floor(Math.random() * 95);
    var r_time = Math.floor(Math.random() * 2000) + 800;

    var url = reaction_map[reaction];
    var reaction = $('<img class="reaction" src="'+ url +'">');
    reaction.css("position", "absolute");
    reaction.css("display", "block");
    reaction.css("width",`${r_size}px`);
    reaction.css("height",`${r_size}px`);
    reaction.css("right",`${r_right}%`);
    reaction.css("top","100%");
    reaction.css("opacity",'0.85')
    $("#hudson-wrapper").append(reaction);
   reaction.animate({
           top : "-10%",
            opacity: "0"
        }, r_time, function(){
                reaction.remove();
        });
    }

    //////////////////////////////////////////////////////////////////////////
    // Next Episode Logic                                                   //
    //////////////////////////////////////////////////////////////////////////
    
    
    //Checks that the video changed correctly after 3 seconds
    function checkVideoChanged(url,videoId) {
        setTimeout(
            function() {
                var currentVid = window.location.href.match(/^.*\/([0-9a-zA-Z-]+)\??.*/)[1];
                if(currentVid != videoId) {
                    alert(`Please navigate to the next video at: ${url} and click the red DP icon to join.`)
                    cleanup();
                }
            }, 3600);
        }
        
    var goToNextEpisode = function (url, videoId) {
        return new Promise(async function(resolve,reject) {
            ignoreEvents += 1;
            video.currentTime = video.duration
            await waitUntilElementsLoaded('.sc-iRbamj','2000','300').catch(() => {
                alert(`Please navigate to the next video at: ${url} and click the red DP icon to join.`);
            })
            await delay(700);
            $('.play').click();
            checkVideoChanged(url, videoId);
            ignoreEvents -=1;
            resolve();
        });
    }




    //////////////////////////////////////////////////////////////////////////
    // Chat Methods                                                         //
    //////////////////////////////////////////////////////////////////////////

    var setUserCount = function(users) {
        $('#usercount-label').html(`Users: ${users}`);
    }

    var loadMessages = function() {
        if(messages == null) {
            return;
        }
        for (var i = 0; i < messages.length; i++) {
            var message = JSON.parse(messages[i]);
            if(message.state) {
                let state = message.state;
                let nickName = message.nickname
                addStateMessage(state,nickName);
            }else {
                addUserMessage(message,false)
            }
        }
    }

    var addUserMessage = function (data,animate) {
        let sender = data.nickname;
        let message = data.message;
        if(self.lastMessageId == data.id) {
            $('.messageText:first').append(`<br> ${message}`);
        }else {
            const usermessageTemplate = `
            <div class="chatMessage ui small black icon attached message">
                <i class="small user icon" id="userIcon"></i>
                <div class="messageContent" style="word-wrap: break-word; width: 80%;">
                    <div class="header messageSender">${sender}:</div>
                    <p class="messageText">${message}</p>
                </div>
            </div>
            `;
            $('#chat-content').prepend(usermessageTemplate);
        }
        let scrollTime = animate ? 100 : 0;
        $('#chat-content').animate({ scrollTop: $('#chat-content').prop("scrollHeight")},scrollTime);
        self.lastMessageId = data.id  
    }

    var addPauseMessage = function (sender) {
        const message = `
            <div class="chatMessage ui small black icon attached message">
                <i class="pause icon" id="userIcon"></i>
                <div class="systemMessage">
                    <p class="pauseMessage">${sender} paused the video</p>
                </div>
            </div>
        `;
        $('#chat-content').prepend(message);
        self.lastMessageId = "";
    }

    var addPlayMessage = function (sender) {
        const message = `
            <div class="chatMessage ui small black icon attached message">
                <i class="play icon" id="userIcon"></i>
                <div class="systemMessage">
                    <p class="pauseMessage">${sender} started playing the video</p>
                </div>
            </div>
        `;
        $('#chat-content').prepend(message);
        self.lastMessageId = "";
    }

    var addJoinMessage = function (sender) {
        const message = `
            <div class="chatMessage ui small black icon attached message">
                <i class="small user plus icon" id="userIcon"></i>
                <div class="systemMessage">
                    <p class="pauseMessage">${sender} joined the room</p>
                </div>
            </div>
        `;
        $('#chat-content').prepend(message);
        self.lastMessageId = "";
    }

    var showHostMessage = function() {
        $('#hostOnlyLabel').show();
    }
    
    var hideHostMessage = function() {
        $('#hostOnlyLabel').hide();
    }
    var addCreatedMessage = function (sender) {
        const message = `
            <div class="chatMessage ui small black icon attached message">
                <i class="small user plus icon" id="userIcon"></i>
                <div class="systemMessage">
                    <p class="pauseMessage">${sender} created the room</p>
                </div>
            </div>
        `;
        $('#chat-content').prepend(message);
        self.lastMessageId = "";
    }

    var addLeaveMessage = function (sender) {
        const message = `
            <div class="chatMessage ui small black icon attached message">
                <i class="sign out alternate icon" id="userIcon"></i>
                <div class="systemMessage">
                    <p class="pauseMessage">${sender} left the room</p>
                </div>
            </div>
        `;
        $('#chat-content').prepend(message);
        self.lastMessageId = "";
    }

    var addSeekMessage = function(sender, time) {
        const message = `
            <div class="chatMessage ui small black icon attached message">
                <i class="play icon" id="userIcon"></i>
                <div class="systemMessage">
                    <p class="pauseMessage">${sender} skipped to ${formatTime(Math.round(time))}</p>
                </div>
            </div>
        `;
        $('#chat-content').prepend(message);
        self.lastMessageId = "";
    }

    var addChangedMessage = function(sender) {
        const message = `
            <div class="chatMessage ui small black icon attached message">
                <i class="play icon" id="userIcon"></i>
                <div class="systemMessage">
                    <p class="pauseMessage">${sender} started the next video</p>
                </div>
            </div>
        `;
        $('#chat-content').prepend(message);
        self.lastMessageId = "";
    }

    var nickNameChange = function(oldName, newName) {
        const message = `
            <div class="chatMessage ui small black icon attached message">
                <i class="user plus icon" id="userIcon"></i>
                <div class="systemMessage">
                    <p class="pauseMessage">${oldName} changed their name to ${newName}</p>
                </div>
            </div>
        `;
        $('#chat-content').prepend(message);
        self.lastMessageId = "";
    }

    var removeChat = function() {
        $('#chatWrapper').remove();
        self.lastMessageId = "";
    }

    var injectChat = function() {
        return new Promise((resolve,reject) => {
            $.get(chrome.extension.getURL('html/chat.html') ,function(data) {
                $('#hudson-wrapper').after(data);
                setupHandlers();
                setUserCount(self.userCount)
                self.lastMessageId = "";
                loadMessages();
                var instaSrc = chrome.runtime.getURL("/images/instagram.png")
                $('#instaImage').attr("src", instaSrc);
                $('#insta-container').click(() => {
                    port.postMessage({category: "room", action : "instaClicked"});
                })
                resolve();
            });
        });
    }

    var injectReactions = function() {
        return new Promise((resolve,reject) => {
            var laughSrc = chrome.runtime.getURL("/images/laughing.png")
            var loveSrc = chrome.runtime.getURL("/images/love.png")
            var crySrc = chrome.runtime.getURL("/images/cry.png")
            var shockSrc = chrome.runtime.getURL("/images/shock.png")
            var fireSrc = chrome.runtime.getURL("/images/fire.png") 
            $.get(chrome.extension.getURL('html/reactions.html') ,function(data) {
                $('#messageInfo').after(data);
                $('#laughingImage').attr("src", laughSrc);
                $('#cryingImage').attr("src", crySrc);
                $('#shockImage').attr("src", shockSrc);
                $('#loveImage').attr("src", loveSrc);
                $('#fireImage').attr("src", fireSrc);
                $('#laughingButton').click(laughClicked);
                $('#cryingButton').click(cryClicked);
                $('#shockButton').click(shockClicked);
                $('#loveButton').click(loveClicked);
                $('#fireButton').click(fireClicked);
                resolve();
            });
        });
    };

    var setupCSS = function () {
        var path = chrome.extension.getURL('styles/chat.css');
        var semanticPath = chrome.extension.getURL('semantic/semantic.min.css')
        $('head').append($('<link>')
            .attr("rel", "stylesheet")
            .attr("type", "text/css")
            .attr("href", path));         
        $('head').append($('<link>')
        .attr("rel", "stylesheet")
        .attr("type", "text/css")
        .attr("href", semanticPath));      
    }    


    var setupHandlers = function () {
        $('#messageInfo').hide();
        $('#messageInput').keydown( function() {
            if(!othersTyping) {
                var sendTyping = function() {
                    return new Promise((resolve,reject) => {
                        socket.emit('typing_start',() => {
                            resolve();
                        })
                    });
                };
                queueTask(sendTyping);
            }
        })
        $('#messageInput').on('keyup', function(e) {
            if(e.keyCode === 13) {
                $('#messageInput').val("");
                $(this).css({'height':30});
            }
        });
        $('#messageInput').on('keydown', function(e) {
            if(e.keyCode !== 13) {
                var totalHeight = $(this).prop('scrollHeight');
                $(this).css({'height':totalHeight});
            } else {
                const text = $('#messageInput').val();
                $('#messageInput').val("");
                if(text.trim() != "") {
                    onEnterPressed(text.trim());
                    // $(this).css({'height':25});
                }
            }
        });

        $('#messageInput').keyup(debounce(function() {
            var stopTyping = function() {
                return new Promise((resolve,reject) => {
                    socket.emit('typing_stop',() => {
                        resolve();
                    })
                });
            };
            queueTask(stopTyping);
        },1000));
    }

    
    

    var ischatShowing = function() {
        return (document.getElementsByClassName('chat-visible').length != 0 || document.getElementsByClassName('overlay-visible').length != 0)
    }

    var isReactionsShowing = function() {
        return (document.getElementsByClassName('reaction-visible').length != 0)
    }

    var isOverlaying = function() {
        return (document.getElementsByClassName('overlay-visible').length == 1)
    }

    var clearChat = function() {
        if($('#chat-content')) {
            $('#chat-content').innerHTML = ""
        }
        removeChat();
        messages = null;
    }

    var toggleChat = function(show, overlay, reactions) {
        //Use to recover the chat when the video changes
        return new Promise(async (resolve, reject) => {
            showRecover = show;
            overlayRecover = overlay;
            reactRecover = reactions;
            if(!show) {
                if(ischatShowing()) {
                    $('#chatWrapper').hide()
                    $('.btm-media-overlays-container').removeClass('overlay-visible');
                    $('#hudson-wrapper').removeClass('chat-visible');
                }
            }else
            {
                if(!$('#chatWrapper').length) {
                    await injectChat();
                }
                $('#chatWrapper').show()
                if(overlay) {
                    $('.btm-media-overlays-container').addClass('overlay-visible');
                    $('#hudson-wrapper').removeClass('chat-visible');
                }else {
                    $('#hudson-wrapper').addClass('chat-visible');
                    $('.btm-media-overlays-container').removeClass('overlay-visible');
                }
            }
            if(reactions) {
                if(!$('#reactionHolder').length) {
                    await injectReactions();
                }
            }else {
                if($('#reactionHolder').length) {
                    $('#reactionHolder').detach();
                }
            }
            resolve();
        });
    }

    var updateSubMessage = function () {
        if(othersTyping && isBuffering) {
            $('#messageInfo').show();
            $('#messageInfo').transition('fade up in');
            $('#messageInfo').html('People are typing/buffering');
        }else if (othersTyping) {
            $('#messageInfo').show();
            $('#messageInfo').transition('fade up in');
            $('#messageInfo').html('People are typing');
        }else if(isBuffering) {
            $('#messageInfo').show();
            $('#messageInfo').transition('fade up in');
            $('#messageInfo').html('People are buffering');
        }else {
            if(!($('#messageInfo').is(":hidden"))){
                $('#messageInfo').transition('fade up out');
            }
        }
        $('#chat-content').animate({ scrollTop: $('#chat-content').prop("scrollHeight")},100);
    }
    

    var addStateMessage = function(state, nickname) {
        var time = state.time;
        switch(state.condition) {
            case "SEEK": {
                addSeekMessage(nickname, time)
                return;
            }

            case "PLAY": {
                addPlayMessage(nickname)
                return;
            }

            case "PAUSED": {
                addPauseMessage(nickname)
                return;
            }
        }
    }

    
    //////////////////////////////////////////////////////////////////////////
    // Socket Events                                                        //
    //////////////////////////////////////////////////////////////////////////

    socket = io(socketUrl, {
        transports: ['websocket'],
        forceNew: true
    });

    socket.on('connect', () => {
        connectedToSocket = true;
        syncInterval = setInterval(getServerSync,5000);
        videoInterval = setInterval(checkVideo, 5000); 
    })

    socket.on('disconnect', () => {
        cleanup();
    });

    socket.on('userMessage', (data) => {
        addUserMessage(data,true);
        port.postMessage({category: "room", action : "message"})
    })

    socket.on('notifMessage', (data) => {
        notifMessage = data.message;
        notifColor = data.color;
    })


    socket.on('nickNameChanged', (data) => {
        nickNameChange(data.oldName, data.nickname)
    })

    socket.on('userJoined', (data) => {
        addJoinMessage(data.nickname)
        setUserCount(data.userCount)
    })

    socket.on('react',(data) => {
        if(reactRecover) {
            displayReaction(data.reaction)
        }
    })

    socket.on('userDisconnect', (data) => {
        addLeaveMessage(data.nickname)
        setUserCount(data.userCount);
    })

    socket.on('stateChanged', (data) => {
        serverState = data.state;
        serverUpdatedTime = Date.now();
        queueTask(sync);
        addStateMessage(data.state, data.nickname)
    })

    socket.on('buffering', () => {
        isBuffering = true;
        updateSubMessage();
    })

    socket.on('canPlay', () => {
        isBuffering = false
        updateSubMessage();
    })

    socket.on('typing', () => {
        othersTyping = true;
        updateSubMessage();
    })

    socket.on('typingStop', () => {
        othersTyping = false;
        updateSubMessage();
    })

    socket.on('changedVideo',(data) => {
        addChangedMessage(data.nickname)
        var videoId = window.location.href.match(/^.*\/([0-9a-zA-Z-]+)\??.*/)[1];
        serverState = data.state;
        serverUpdatedTime = Date.now();
        if(data.videoId != videoId) {
            let url = `https://www.disneyplus.com/video/${data.videoId}?dpSessionId=${self.sessionId}`
            queueTask(goToNextEpisode(url,data.videoId));
            newServerVideo = data.videoId
        }else {
            queueTask(sync);
            toggleChat(showRecover,overlayRecover,reactRecover)
        }
    });

    socket.on('noHost', () => {
        self.hostOnly = false;
        hideHostMessage();
    });
    


    //////////////////////////////////////////////////////////////////////////
    // Sync Handling                                                        //
    //////////////////////////////////////////////////////////////////////////

    var systemPause = function() {
        return new Promise( async function (resolve, reject) {
            ignoreEvents += 1;
            $(".btm-media-player").click() //Click this to reveal the icons
            await delay(100);
            if ($('.pause-icon')) {
                $('.pause-icon').click();
            }
            await waitUntil(getCurrentState().condition == "PAUSED",300,1500)
            ignoreEvents -=1;
            resolve();
        });  
    }

    var systemPlay = function() {
        return new Promise(async function (resolve, reject) {
            ignoreEvents += 1;
            $(".btm-media-player").click()
            await delay(100);
            if ($('.play-icon')) {
                $('.play-icon').click();
            }
            await waitUntil(getCurrentState().condition == "PLAY",300,1500)
            ignoreEvents -=1;
            resolve();
        });   
    }

    var systemSeek = function(time) {
        return new Promise(async (resolve, reject) => {
            ignoreEvents += 1;
            video.currentTime = time;
            await delay(500)
            await waitUntil(video.seeking == false, 500, 1500)
            ignoreEvents -= 1;
            resolve();
        })
    }

    
    var updateServerState = function() {   
        return new Promise((resolve,reject) => {
            if(hostOnly == true && (socket.id != host)){
                queueTask(sync);
                resolve();
                return;
            }
            socket.emit('stateUpdated', getCurrentState(), () => {
                resolve();
            })
        })
    }
    
    function delay(delayInms) {
        return new Promise(resolve  => {
            setTimeout(() => {
                resolve();
            }, delayInms);
        });
    }
    
    var sync = function() { 
        if (ignoreEvents > 0 || video == null || sessionId == null ||
            serverState == null || serverState.condition == null || serverState.time == null || serverState.updatedAt == null) {
            return Promise.resolve();
        }
        const currentStateObject = getCurrentState();
        const currentVideoTime = parseFloat(currentStateObject.time);
        const currentCondition = currentStateObject.condition;
        
        let serverCondition = serverState.condition;
        if(!video.src) {
            return Promise.resolve();     
        }
        var elapsedTime;
        if(serverUpdatedTime == null) {
            elapsedTime = (Date.now() - serverState.updatedAt)/1000;
        }else {
            elapsedTime = (Date.now() - serverUpdatedTime)/1000;
        }
        if(serverState.serverElapsedTime) {
            elapsedTime += serverState.serverElapsedTime
        }
        
        let serverVideoTime = parseFloat(serverState.time);
        let serverPredictedTime = serverVideoTime + elapsedTime;
        let error = serverCondition == "PAUSED" ? Math.abs(currentVideoTime - serverVideoTime) : (Math.abs(serverPredictedTime - currentVideoTime))
        if(serverCondition == "PAUSED") {
            var temp = Promise.resolve();
            if(currentCondition != "PAUSED") {
                temp = systemPause();
            }
            return temp.then(() => {
                if(error > syncRange) {
                    return systemSeek(serverVideoTime)
                }
            });
        }else {
            var temp = Promise.resolve();
            if(currentCondition == "PAUSED") {
                temp = systemPlay();
            }
            return temp.then(() => {
                if(error > syncRange) {
                    return systemSeek(serverPredictedTime)
                }
            })
            
        }
    }
    
    var getServerSync = function() {
        if(queueCount == 0 && ignoreEvents == 0) {
            queueTask(sync)
        }else {
            return;
        }
    }
    
    
    //////////////////////////////////////////////////////////////////////////
    // User Events                                                          //
    //////////////////////////////////////////////////////////////////////////
    
    var onPlay = function() {
        if(ignoreEvents > 0)
        {
            return;
        }else{
            queueTask(updateServerState);
        }
    }
    
    var onPause = function() {
        if (ignoreEvents > 0)
        {
            return;
        }else{
            queueTask(updateServerState);
        }
    }

    var onEnterPressed = function(text) {
        socket.emit('userMessage', {message: text})
    }
    
    var onSeeking = function() {
        if(ignoreEvents > 0)
        {
            return;
        }else {
            queueTask(updateServerState);
        }
    }
    
    var onBuffer = function() {
        var buffer = function() {
            return new Promise((resolve,reject) => {
                socket.emit('buffer_start',() => {
                    resolve();
                })
            });
        };
        queueTask(buffer);
    }
    
    var videoCanPlay = function() {
        var buffer = function() {
            return new Promise((resolve,reject) => {
                socket.emit('buffer_stop',() => {
                    resolve();
                })
            });
        };
        queueTask(buffer);
    }
    
    var checkVideo = function() {
        if(sessionId == "") {
            return;
        }
        waitUntilElementsLoaded('video',1000,100).then((newVideo) => {
            if (newVideo == null || newVideo.currentSrc != self.video.currentSrc) {
                if(newVideo != null) {
                    var videoId = window.location.href.match(/^.*\/([0-9a-zA-Z-]+)\??.*/)[1];
                    loadVideoHandlers(newVideo)
                    if(videoId != newServerVideo) {
                        if(hostOnly && socket.id != host) {
                            return;
                        }
                        socket.emit('changedVideo', {newVideoId: videoId, state: getBeginState()}); 
                        port.postMessage({category: "room", action : "changedVideo"});
                    }
                    queueTask(toggleChat(showRecover,overlayRecover,reactRecover));
                }else {
                    cleanup();
                }
            }else {
                return;
            }
        }).catch(() => {
            cleanup();
        })
    }

    var laughClicked = function () {
        var react = function() {
            return new Promise((resolve,reject) => {
                socket.emit('react',{reaction: 'laugh'},() => {
                    resolve();
                })
            });
        };
        queueTask(react);
    }
    
    var cryClicked = function () {
        var react = function() {
            return new Promise((resolve,reject) => {
                socket.emit('react',{reaction: 'cry'},() => {
                    resolve();
                })
            });
        };
        queueTask(react);
    }
    
    var shockClicked = function () {
        var react = function() {
            return new Promise((resolve,reject) => {
                socket.emit('react',{reaction: 'shock'},() => {
                    resolve();
                })
            });
        };
        queueTask(react);
    }
    
    var loveClicked = function () {
        var react = function() {
            return new Promise((resolve,reject) => {
                socket.emit('react',{reaction: 'love'},() => {
                    resolve();
                })
            });
        };
        queueTask(react);
    }

    var fireClicked = function () {
        var react = function() {
            return new Promise((resolve,reject) => {
                socket.emit('react',{reaction: 'fire'},() => {
                    resolve();
                })
            });
        };
        queueTask(react);
    }




    var handleEvent = function(request,sender,callback) {
        switch(request.type) {
            case "createRoom": {
                if(request.data && request.data.videoId)
                {
                    if(video == undefined || video == null) {
                        callback({
                            error: "Please refresh the page and try again."
                        });
                        return true;
                    }
                    if(!socket.connected) {
                        callback({
                            error: "Could not connect to the server. Please refresh and try again later."
                        });
                        return true;
                    }
                    let state = getCurrentState()
                    let data = {
                        videoId: request.data.videoId,
                        nickname: self.nickname,
                        state: state,
                        hostOnly: request.data.hostOnly
                    }
                    socket.emit('createRoom', data, function(response) {
                        sessionId = response.sessionId;
                        queueTask(toggleChat(true,false,true).then(() => {
                            addCreatedMessage(self.nickname);
                            hideHostMessage();
                        }));
                        clearChat();
                        serverState = state;
                        serverUpdatedTime = Date.now();
                        queueTask(sync);
                        self.hostOnly = data.hostOnly;
                        self.host = socket.id;
                        callback({
                            sessionId: response.sessionId,
                            hostOnly: self.hostOnly,
                            chatShowing: true,
                            overlaying: false,
                            reactShowing: true,
                            nickname: self.nickname
                        })
                    });
                }
                return true;
            }
            case "joinRoom": {
                if(request.data && request.data.videoId && request.data.sessionId)
                {
                    if(!socket.connected) {
                        callback({
                            error: "Could not connect to the server. Please refresh and try again later."
                        });
                        return true;
                    }   
                    let data = {
                        videoId: request.data.videoId,
                        sessionId: request.data.sessionId,
                        nickname: self.nickname,
                    }
                    socket.emit('joinRoom',data , function(response) {
                        if(response.error) {
                            callback({error: "Invalid Session Id"})
                        }else{
                            clearChat();
                            let userCount = response.userCount
                            self.userCount = userCount;
                            self.messages = response.messages
                            self.hostOnly = response.hostOnly;
                            self.host = response.host;
                            queueTask(toggleChat(true,false,true).then(() => {
                                addJoinMessage(self.nickname);
                                if(self.hostOnly) {
                                    showHostMessage();
                                }else {
                                    hideHostMessage();
                                }
                            }));
                            let state = response.state
                            sessionId = request.data.sessionId
                            serverState = state;
                            serverUpdatedTime = Date.now();
                            queueTask(sync);
                            callback({
                                sessionId: request.data.sessionId,
                                chatShowing: true,
                                overlaying: false,
                                reactShowing: true,
                                nickname: self.nickname,
                                hostOnly: response.hostOnly
                            })
                        }
                    });
                }else {
                    callback({error: "Invalid request"})
                }
                return true;
            }
            case "leaveRoom": {
                sessionId = "";
                serverState = null;
                socket.emit('leaveRoom',() => {});
                clearChat();
                queueTask(toggleChat(false,false,false))
                self.video = null;
                callback();
                return true;
            }

            case "toggleChat": {
                queueTask(toggleChat(request.data.show, request.data.overlay, request.data.reactions));
                callback()
                return true;
            }

            case "loadRoomData": {
                if(!self.video) {
                    waitUntilElementsLoaded('video',8000,200).then((src) => {
                        loadVideoHandlers(src);
                        callback({
                            sessionId: sessionId,
                            chatShowing: ischatShowing(),
                            overlaying: isOverlaying(),
                            reactShowing: isReactionsShowing(),
                            nickname: self.nickname,
                            notif: notifMessage,
                            notifColor: notifColor
                            })
                    }).catch((message) => {
                        callback({
                            error: message
                        })
                    });
                }else {
                    callback({
                        sessionId: sessionId,
                        chatShowing: ischatShowing(),
                        overlaying: isOverlaying(),
                        reactShowing: isReactionsShowing(),
                        nickname: self.nickname,
                        notif: notifMessage,
                        notifColor: notifColor
                    })
                }
                return true;
            }
            case "setUsername": {
                var oldName = nickname
                var newName = request.data.username
                socket.emit('changeNickName',{oldName: oldName, nickname: newName}, () => {
                    nickname = newName
                    saveNickName();
                    callback();
                });
                return true;
            }
        }
    }
    setupCSS();
    
    loadNickName(() => {
        chrome.runtime.onMessage.addListener(handleEvent);
    });
}