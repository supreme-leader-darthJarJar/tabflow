console.log('Background script loaded');

let autoSaveTimer = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  if (request.action === 'startAutoSave') {
    console.log('Starting auto-save with interval:', request.interval);
    startAutoSave(request.interval);
  } else if (request.action === 'stopAutoSave') {
    console.log('Stopping auto-save');
    stopAutoSave();
  }
});

function startAutoSave(interval) {
  stopAutoSave(); // Clear any existing timer
  console.log(`Setting up auto-save timer for ${interval} minutes`);
  
  // Use chrome.alarms instead of setInterval
  chrome.alarms.create('autoSave', {
    periodInMinutes: interval
  });
  
  // Listen for alarm
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'autoSave') {
      console.log('Auto-save interval triggered');
      try {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        console.log(`Found ${tabs.length} tabs to save`);
        const timestamp = new Date().toLocaleTimeString();
        
        const { savedSessions = [] } = await chrome.storage.local.get('savedSessions');
        console.log('Current saved sessions:', savedSessions.length);
        
        const session = {
          name: `Auto-saved at ${timestamp}`,
          tabs: tabs.map(tab => ({
            url: tab.url,
            title: tab.title
          })),
          timestamp: Date.now()
        };
        
        await chrome.storage.local.set({
          savedSessions: [...savedSessions, session]
        });
        
        try {
          const views = chrome.extension.getViews({ type: "popup" });
          if (views.length > 0) {
            chrome.runtime.sendMessage({
              action: 'autoSaveComplete',
              timestamp: timestamp
            });
          }
        } catch (error) {
          console.log('Popup is closed, skipping notification');
        }
        
        console.log('Auto-saved tabs:', timestamp);
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }
  });
}

function stopAutoSave() {
  chrome.alarms.clear('autoSave');
  autoSaveTimer = null;
}

// Initialize auto-save on extension startup
chrome.runtime.onStartup.addListener(async () => {
  const settings = await chrome.storage.local.get(['autoSaveEnabled', 'autoSaveInterval']);
  if (settings.autoSaveEnabled) {
    startAutoSave(settings.autoSaveInterval || 30);
  }
});