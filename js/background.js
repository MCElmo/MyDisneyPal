var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-162950882-1']);
_gaq.push(['_trackPageview']);

(function() {
  var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
  ga.src = 'https://ssl.google-analytics.com/ga.js';
  var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
})();

chrome.runtime.onConnect.addListener(function(port) {
  port.onMessage.addListener(function(request) {
      if(request.category) {
          _gaq.push(['_trackEvent', request.category, request.action]);
      }
  });
});

  chrome.runtime.onInstalled.addListener(function(details){
    var version = chrome.runtime.getManifest().version;
    if(details.reason == "install"){
        _gaq.push(['_trackEvent', 'install', version]);
    } else if(details.reason == "update"){
        _gaq.push(['_trackEvent', 'update', details.previousVersion + ' -> ' + version]);
    }
    chrome.tabs.create({url: "https://mydisneypal.com/?install#instructions"}, function (tab) {
        console.log("Launched new tab on install");
    });
});