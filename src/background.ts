const READER_URL = chrome.runtime.getURL("reader.html");
const NEWTAB_URL = chrome.runtime.getURL("newtab.html");
const PDF_REDIRECT_RULE_ID = 1;

async function installDNRRules() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [PDF_REDIRECT_RULE_ID],
    addRules: [
      {
        id: PDF_REDIRECT_RULE_ID,
        priority: 1,
        action: {
          type: "redirect" as chrome.declarativeNetRequest.RuleActionType,
          redirect: {
            regexSubstitution: `${READER_URL}?src=\\0`,
          },
        },
        condition: {
          regexFilter: "^https?://[^#]*\\.pdf(\\?[^#]*)?$",
          resourceTypes: ["main_frame" as chrome.declarativeNetRequest.ResourceType],
          excludedInitiatorDomains: [new URL(READER_URL).hostname],
        },
      },
    ],
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await installDNRRules();

  chrome.contextMenus.create({
    id: "margin-open-link",
    title: "Open in Margin",
    contexts: ["link"],
    targetUrlPatterns: ["*://*/*.pdf", "*://*/*.pdf?*"],
  });

  chrome.contextMenus.create({
    id: "margin-open-library",
    title: "Open Margin library",
    contexts: ["action", "page"],
  });
});

chrome.runtime.onStartup.addListener(() => {
  installDNRRules().catch((e) => console.error("margin: dnr", e));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "margin-open-link" && info.linkUrl) {
    const url = `${READER_URL}?src=${encodeURIComponent(info.linkUrl)}`;
    chrome.tabs.create({ url, index: tab ? tab.index + 1 : undefined });
  } else if (info.menuItemId === "margin-open-library") {
    chrome.tabs.create({ url: NEWTAB_URL });
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: NEWTAB_URL });
});

export {};
