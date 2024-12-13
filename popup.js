class TabFlow {
    constructor() {
      this.currentTabs = [];
      this.savedSessions = [];
      this.sortOptions = {
        name: 'Name (A-Z)',
        date: 'Date Created',
        tabCount: 'Number of Tabs'
      };

      this.filterOptions = {
        today: 'Today',
        week: 'This Week',
        month: 'This Month',
      };
      this.autoSaveCheckInterval = null;

      // Add message listener for auto-save notifications
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'autoSaveComplete') {
          this.handleAutoSaveComplete(request.timestamp);
        }
      });

      this.init();
    }
  
    async init() {
      this.setupEventListeners();
      await this.loadSavedSessions();
      await this.loadCurrentTabs();
      await this.setupAutoSave();
      this.setupTheme();
    }
  
    setupEventListeners() {
      document.getElementById('searchInput').addEventListener('input', (e) => this.handleSearch(e.target.value));
      document.getElementById('saveSession').addEventListener('click', () => this.saveCurrentSession());
      document.getElementById('toggleTheme').addEventListener('click', () => this.toggleTheme());
      document.getElementById('closeSettings').addEventListener('click', () => this.toggleSettings());
      document.getElementById('settingsButton').addEventListener('click', () => this.toggleSettings());
      document.getElementById('autoSaveEnabled').addEventListener('change', (e) => this.toggleAutoSave(e));
      document.getElementById('autoSaveInterval').addEventListener('change', (e) => this.updateAutoSaveInterval(e));
    }
    
    toggleSettings() {
      const menu = document.getElementById('settingsMenu');
      menu.classList.toggle('hidden');
    }

    async toggleAutoSave(e) {
      console.log('Toggle auto-save:', e.target.checked);
      const interval = document.getElementById('autoSaveInterval');
      
      await chrome.storage.local.set({
        autoSaveEnabled: e.target.checked,
        autoSaveInterval: parseInt(interval.value)
      });

      if (e.target.checked) {
        console.log('Sending startAutoSave message');
        chrome.runtime.sendMessage({
          action: 'startAutoSave',
          interval: parseInt(interval.value)
        });
      } else {
        console.log('Sending stopAutoSave message');
        chrome.runtime.sendMessage({ action: 'stopAutoSave' });
      }
    }

    async updateAutoSaveInterval(e) {
      const interval = parseInt(e.target.value);
      await chrome.storage.local.set({ autoSaveInterval: interval });
      
      const { autoSaveEnabled } = await chrome.storage.local.get('autoSaveEnabled');
      if (autoSaveEnabled) {
        chrome.runtime.sendMessage({
          action: 'startAutoSave',
          interval: interval
        });
      }
    }

    async setupAutoSave() {
      const settings = await chrome.storage.local.get(['autoSaveEnabled', 'autoSaveInterval']);
      
      const autoSaveCheckbox = document.getElementById('autoSaveEnabled');
      const intervalSelect = document.getElementById('autoSaveInterval');
      
      autoSaveCheckbox.checked = settings.autoSaveEnabled || false;
      intervalSelect.value = settings.autoSaveInterval || '30';

      if (settings.autoSaveEnabled) {
        chrome.runtime.sendMessage({
          action: 'startAutoSave',
          interval: parseInt(intervalSelect.value)
        });
      }
    }
    async loadCurrentTabs() {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      this.currentTabs = tabs;
      this.renderTabs();
    }
  
    async loadSavedSessions() {
      const result = await chrome.storage.local.get('savedSessions');
      this.savedSessions = result.savedSessions || [];
      this.renderSessions();
    }
  
    renderTabs() {
      const container = document.getElementById('currentTabs');
      container.innerHTML = '';
  
      this.currentTabs.forEach(tab => {
        const tabElement = this.createTabElement(tab);
        container.appendChild(tabElement);
      });
    }
  
    renderSessions() {
      const container = document.getElementById('savedSessions');
      container.innerHTML = '';
  
      this.savedSessions.forEach((session, index) => {
        const sessionElement = this.createSessionElement(session, index);
        container.appendChild(sessionElement);
      });
    }
  
    createTabElement(tab) {
      const div = document.createElement('div');
      div.className = 'tab-item';
      div.innerHTML = `
        <img class="favicon" src="${tab.favIconUrl || 'icons/default-favicon.png'}" alt="">
        <span class="tab-title">${tab.title}</span>
        <button class="close-tab">×</button>
      `;
  
      div.querySelector('.close-tab').addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(tab.id);
      });
  
      div.addEventListener('click', () => this.activateTab(tab.id));
      return div;
    }
  
    createSessionElement(session, index) {
      const div = document.createElement('div');
      div.className = 'session-item';
      div.innerHTML = `
        <span class="session-title">
          <span class="session-name">${session.name}</span>
          <span class="rename-icon">〜</span>
          <span>(${session.tabs.length} tabs)</span>
        </span>
        <button class="restore-session">Restore</button>
        <button class="delete-session">Delete</button>
      `;
  
      // Add rename functionality
      const renameIcon = div.querySelector('.rename-icon');
      const sessionName = div.querySelector('.session-name');
  
      renameIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'session-name-input';
        input.value = session.name;
        
        // Replace text with input
        sessionName.replaceWith(input);
        input.focus();
  
        // Handle saving the new name
        input.addEventListener('blur', () => {
          if (input.value.trim()) {
            this.savedSessions[index].name = input.value.trim();
            chrome.storage.local.set({ savedSessions: this.savedSessions }, () => {
              this.renderSessions();
            });
          }
        });
  
        // Handle Enter key
        input.addEventListener('keyup', (e) => {
          if (e.key === 'Enter') {
            input.blur();
          }
        });
      });
  
      div.querySelector('.restore-session').addEventListener('click', (e) => {
        e.stopPropagation();
        this.restoreSession(index);
      });
  
      div.querySelector('.delete-session').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSession(index);
      });
  
      return div;
    }
    
    
    async saveCurrentSession() {
      const name = prompt('Enter session name:', `Session ${this.savedSessions.length + 1}`);
      if (!name) return;
  
      const session = {
        name,
        tabs: this.currentTabs.map(tab => ({
          url: tab.url,
          title: tab.title
        })),
        timestamp: Date.now()
      };
  
      this.savedSessions.push(session);
      await chrome.storage.local.set({ savedSessions: this.savedSessions });
      this.renderSessions();
    }
  
    async restoreSession(index) {
      const session = this.savedSessions[index];
      const window = await chrome.windows.create();
      
      for (const tab of session.tabs) {
        await chrome.tabs.create({
          windowId: window.id,
          url: tab.url
        });
      }
  
      // Close the initial blank tab that's created with the new window
      const tabs = await chrome.tabs.query({ windowId: window.id });
      await chrome.tabs.remove(tabs[0].id);
    }
  
    async deleteSession(index) {
      this.savedSessions.splice(index, 1);
      await chrome.storage.local.set({ savedSessions: this.savedSessions });
      this.renderSessions();
    }
  
    async closeTab(tabId) {
      await chrome.tabs.remove(tabId);
      await this.loadCurrentTabs();
    }
  
    async activateTab(tabId) {
      await chrome.tabs.update(tabId, { active: true });
    }
  
    handleSearch(query) {
      if (!query) {
        this.renderTabs();
        return;
      }

      query = query.toLowerCase();
      
      const filters = {
        domain: (tab) => tab.url.toLowerCase().includes(query),
        title: (tab) => tab.title.toLowerCase().includes(query),
      };

      const activeFilters = ['domain', 'title']; // You could make this configurable
      
      const filteredTabs = this.currentTabs.filter(tab => 
        activeFilters.some(filterName => filters[filterName](tab))
      );

      const container = document.getElementById('currentTabs');
      container.innerHTML = '';
      filteredTabs.forEach(tab => {
        const tabElement = this.createTabElement(tab);
        container.appendChild(tabElement);
      });
    }
  
    toggleTheme() {
      console.log("Toggle theme clicked!");
      const isDark = document.body.getAttribute('data-theme') === 'dark';
      console.log("Current theme is dark?", isDark);
      document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
      console.log("Set theme to:", isDark ? 'light' : 'dark');
      chrome.storage.local.set({ theme: isDark ? 'light' : 'dark' });
    }
  
    async setupTheme() {
      const result = await chrome.storage.local.get('theme');
      const theme = result.theme || 'light'; // Default to light if no theme saved
      document.body.setAttribute('data-theme', theme);
    }

    async handleAutoSaveComplete(timestamp) {
      // Refresh the sessions list
      await this.loadSavedSessions();
      
      // Add visual feedback
      const container = document.getElementById('savedSessions');
      container.classList.add('save-flash');
      setTimeout(() => {
        container.classList.remove('save-flash');
      }, 1000);
      
      // Show notification
      const notification = document.createElement('div');
      notification.className = 'save-notification';
      notification.textContent = `Auto-saved at ${timestamp}`;
      document.body.appendChild(notification);
      
      // Remove notification after 3 seconds
      setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(100%)';
        setTimeout(() => notification.remove(), 300);
      }, 3000);
    }
  }
  
  // Initialize the extension
  document.addEventListener('DOMContentLoaded', () => {
    new TabFlow();
  });
