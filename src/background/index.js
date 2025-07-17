// 存储规则组和活动规则组
let ruleGroups = {
  default: {
    name: '默认规则组',
    enabled: true,
    rules: []
  }
};
let activeRuleGroup = 'default';

// 存储多个代理配置
let proxyConfigs = [];

// 添加全局启用禁用开关状态
let globalEnabled = true;

// 从存储中加载规则
chrome.storage.local.get(['ruleGroups', 'activeRuleGroup'], (result) => {
  if (result.ruleGroups) {
    ruleGroups = result.ruleGroups;
  }
  if (result.activeRuleGroup) {
    activeRuleGroup = result.activeRuleGroup;
  }
});

// 从存储中加载配置和全局开关状态
chrome.storage.local.get(['proxyConfigs', 'globalEnabled'], (result) => {
  if (result.proxyConfigs && Array.isArray(result.proxyConfigs)) {
    proxyConfigs = result.proxyConfigs;
  } else {
    // 如果没有配置，创建一个默认配置
    proxyConfigs = [{
      id: 'default',
      name: '默认配置',
      enabled: false,
      config: {
        proxy: []
      }
    }];
  }
  
  // 加载全局开关状态，默认为启用
  if (result.globalEnabled !== undefined) {
    globalEnabled = result.globalEnabled;
  }
  
  // 初始化时更新动态规则
  updateDynamicRules();
});

// 监听存储变化
chrome.storage.onChanged.addListener((changes) => {
  if (changes.ruleGroups) {
    ruleGroups = changes.ruleGroups.newValue;
  }
  if (changes.activeRuleGroup) {
    activeRuleGroup = changes.activeRuleGroup.newValue;
  }
});

// 监听存储变化，包括全局开关状态
chrome.storage.onChanged.addListener((changes) => {
  if (changes.proxyConfigs) {
    proxyConfigs = changes.proxyConfigs.newValue || [];
    updateDynamicRules();
  }
  if (changes.globalEnabled !== undefined) {
    globalEnabled = changes.globalEnabled.newValue;
    updateDynamicRules();
  }
});

// 检查URL是否匹配规则
function matchUrl(url, pattern) {
  try {
    // 如果pattern包含正则表达式特殊字符，使用正则匹配
    if (pattern.includes('(') || pattern.includes('[') || pattern.includes('*') || pattern.includes('\\')) {
      const regex = new RegExp(pattern);
      return regex.test(url);
    } else {
      // 否则使用精确匹配
      return url === pattern;
    }
  } catch (e) {
    console.error('Invalid regex pattern:', pattern, e);
    // 如果正则表达式无效，回退到字符串匹配
    return url.includes(pattern);
  }
}

// 替换URL中的占位符
function replaceUrl(url, fromPattern, toPattern) {
  try {
    // 如果fromPattern包含正则表达式特殊字符，使用正则替换
    if (fromPattern.includes('(') || fromPattern.includes('[') || fromPattern.includes('*') || fromPattern.includes('\\')) {
      const regex = new RegExp(fromPattern);
      return url.replace(regex, toPattern);
    } else {
      // 否则使用简单替换
      return toPattern;
    }
  } catch (e) {
    console.error('Error replacing URL:', e);
    return toPattern;
  }
}

// 将正则表达式转换为declarativeNetRequest格式
function convertToDeclarativeRule(fromPattern, toPattern, ruleId) {
  try {
    // 将 $1, $2 等替换为 \1, \2 格式（declarativeNetRequest使用单反斜杠格式）
    const substitution = toPattern.replace(/\$(\d+)/g, '\\$1');
    
    return {
      id: ruleId,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          regexSubstitution: substitution
        }
      },
      condition: {
        regexFilter: fromPattern,
        resourceTypes: ["script", "stylesheet", "main_frame", "sub_frame", "xmlhttprequest", "other"]
      }
    };
  } catch (e) {
    console.error('Error converting rule:', e);
    return null;
  }
}

// 更新动态规则
async function updateDynamicRules() {
  try {
    // 清除所有现有的动态规则
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: await chrome.declarativeNetRequest.getDynamicRules().then(rules => rules.map(rule => rule.id))
    });

    // 如果全局禁用，不添加任何规则
    if (!globalEnabled) {
      console.log('[xSwitch] Global disabled, no rules added');
      return;
    }

    // 获取所有启用的配置
    const enabledConfigs = proxyConfigs.filter(config => config.enabled);
    
    if (enabledConfigs.length === 0) {
      console.log('[xSwitch] No enabled configs, no rules added');
      return;
    }

    const newRules = [];
    let ruleId = 1;

    // 遍历所有启用的配置
    for (const config of enabledConfigs) {
      if (!config.config || !config.config.proxy || !Array.isArray(config.config.proxy)) {
        continue;
      }

      // 遍历当前配置的代理规则
      for (const rule of config.config.proxy) {
        if (!Array.isArray(rule) || rule.length < 2) {
          continue;
        }

        const [fromPattern, toPattern] = rule;
        const declarativeRule = convertToDeclarativeRule(fromPattern, toPattern, ruleId);
        
        if (declarativeRule) {
          newRules.push(declarativeRule);
          ruleId++;
          console.log(`[xSwitch] Config "${config.name}" rule added: ${fromPattern} -> ${toPattern}`);
        }
      }
    }

    // 添加新规则
    if (newRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: newRules
      });
      console.log(`[xSwitch] Added ${newRules.length} dynamic rules`);
    }

  } catch (error) {
    console.error('[xSwitch] Error updating dynamic rules:', error);
    
    // 如果declarativeNetRequest不可用，回退到传统的webRequest方式
    console.log('[xSwitch] Falling back to webRequest method');
    setupWebRequestListener();
  }
}

// 传统的webRequest监听器（作为回退方案）
function setupWebRequestListener() {
  // 移除现有的监听器
  if (chrome.webRequest.onBeforeRequest.hasListener(webRequestHandler)) {
    chrome.webRequest.onBeforeRequest.removeListener(webRequestHandler);
  }
  
  // 添加新的监听器（不使用blocking）
  chrome.webRequest.onBeforeRequest.addListener(
    webRequestHandler,
    { urls: ["<all_urls>"] }
  );
}

// webRequest处理函数
function webRequestHandler(details) {
  // 如果是扩展自身的请求，不拦截
  if (details.initiator && details.initiator.startsWith('chrome-extension://')) {
    return;
  }

  // 首先检查全局开关，如果全局禁用则直接返回
  if (!globalEnabled) {
    return;
  }

  // 获取所有启用的代理配置
  const enabledConfigs = proxyConfigs.filter(config => config.enabled);
  
  if (enabledConfigs.length === 0) {
    return;
  }

  // 遍历所有启用的配置
  for (const config of enabledConfigs) {
    if (!config.config || !config.config.proxy || !Array.isArray(config.config.proxy)) {
      continue;
    }

    // 遍历当前配置的代理规则
    for (const rule of config.config.proxy) {
      if (!Array.isArray(rule) || rule.length < 2) {
        continue;
      }

      const [fromPattern, toPattern] = rule;
      
      if (matchUrl(details.url, fromPattern)) {
        const redirectUrl = replaceUrl(details.url, fromPattern, toPattern);
        console.log(`[xSwitch] Config "${config.name}" would redirect ${details.url} to ${redirectUrl}`);
        // 注意：由于没有blocking权限，这里只能记录日志，无法实际重定向
        break;
      }
    }
  }
}

// 获取本地文件内容
async function getLocalFileContent(path) {
  try {
    const response = await fetch(`file://${path}`);
    if (response.ok) {
      return await response.text();
    }
    throw new Error(`Failed to load file: ${path}`);
  } catch (e) {
    console.error('Failed to load local file:', path, e);
    return JSON.stringify({
      error: true,
      message: `Failed to load local file: ${path}`,
      details: e.message
    });
  }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getRules') {
    sendResponse({
      ruleGroups,
      activeRuleGroup
    });
  }
  
  if (message.action === 'reloadConfig') {
    // 重新加载配置
    chrome.storage.local.get(['proxyConfig', 'proxyEnabled'], (result) => {
      if (result.proxyConfig) {
        proxyConfig = result.proxyConfig;
      }
      if (result.proxyEnabled !== undefined) {
        proxyEnabled = result.proxyEnabled;
      }
      sendResponse({ success: true });
    });
    return true; // 异步响应
  }
  
  if (message.action === 'toggleProxy') {
    proxyEnabled = message.enabled;
    sendResponse({ success: true });
  }
  
  if (message.action === 'getConfig') {
    sendResponse({
      proxyConfig,
      proxyEnabled
    });
  }
  
  if (message.action === 'reloadConfigs') {
    // 重新加载配置
    chrome.storage.local.get(['proxyConfigs'], (result) => {
      if (result.proxyConfigs && Array.isArray(result.proxyConfigs)) {
        proxyConfigs = result.proxyConfigs;
        updateDynamicRules();
      }
      sendResponse({ success: true });
    });
    return true; // 异步响应
  }
  
  if (message.action === 'getConfigs') {
    sendResponse({
      proxyConfigs
    });
  }
  
  // 添加全局开关切换处理
  if (message.action === 'toggleGlobal') {
    globalEnabled = message.enabled;
    chrome.storage.local.set({ globalEnabled }, () => {
      updateDynamicRules();
      sendResponse({ success: true, globalEnabled });
    });
    return true; // 异步响应
  }
  
  // 添加获取全局状态处理
  if (message.action === 'getGlobalState') {
    sendResponse({ globalEnabled });
  }
});

console.log('[xSwitch] Background script loaded');