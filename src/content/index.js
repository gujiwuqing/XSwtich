// 内容脚本 - 在页面中执行的脚本

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'injectScript') {
    try {
      // 注入JavaScript
      const script = document.createElement('script');
      script.textContent = message.code;
      document.head.appendChild(script);
      document.head.removeChild(script);
      sendResponse({ success: true });
    } catch (error) {
      console.error('[FliggySwitch] Error injecting script:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  if (message.action === 'modifyResponse') {
    // 这部分需要配合background脚本使用
    // 由于内容脚本限制，某些操作需要通过消息传递给background
    sendResponse({ received: true });
  }
});

// 通知background脚本内容脚本已加载
chrome.runtime.sendMessage({ action: 'contentScriptLoaded' });

console.log('[FliggySwitch] Content script loaded');