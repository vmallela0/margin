import { listBooks, deleteBook, getSettings } from "./lib/storage";
import { deleteBlob } from "./lib/blobs";

const READER_URL = chrome.runtime.getURL("reader.html");
const NEWTAB_URL = chrome.runtime.getURL("newtab.html");
const PDF_REDIRECT_RULE_ID = 1;
const RECYCLE_ALARM = "margin-recycle";

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

async function recycleUnshelved() {
  const settings = await getSettings();
  if (!settings.autoRecycleDays) return;
  const cutoff = Date.now() - settings.autoRecycleDays * 86_400_000;
  const books = await listBooks();
  for (const book of books) {
    if (book.shelf || book.pinned) continue;
    const age = book.lastOpenedAt ?? book.addedAt;
    if (age < cutoff) {
      if (book.source.kind === "blob") await deleteBlob(book.id).catch(() => {});
      await deleteBook(book.id);
    }
  }
}

function scheduleRecycleAlarm() {
  chrome.alarms.get(RECYCLE_ALARM, (existing) => {
    if (!existing) {
      chrome.alarms.create(RECYCLE_ALARM, { delayInMinutes: 60, periodInMinutes: 1440 });
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECYCLE_ALARM) recycleUnshelved().catch(() => {});
});

chrome.runtime.onInstalled.addListener(async () => {
  await installDNRRules();
  scheduleRecycleAlarm();

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
  scheduleRecycleAlarm();
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
