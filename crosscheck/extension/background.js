// Opens the side panel from the toolbar button and from the right-click menu.

const MENU_ID = 'crosscheck-selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Cross-check selected text',
    contexts: ['selection'],
  });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab) return;
  // Must run inside the click's user gesture, so open before any await.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  handOver(info, tab);
});

async function handOver(info, tab) {
  const text = (await readSelection(tab)) || info.selectionText || '';
  if (!text.trim()) return;
  await chrome.storage.session.set({ pending: { text, at: Date.now() } });
}

// info.selectionText flattens line breaks, which the citation finder needs,
// so read the selection from the page when the page allows it.
async function readSelection(tab) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? '',
    });
    return typeof result?.result === 'string' ? result.result : '';
  } catch {
    return ''; // chrome:// pages, the PDF viewer, the Web Store, etc.
  }
}
