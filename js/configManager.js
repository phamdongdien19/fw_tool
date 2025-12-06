/**
 * Config Manager - FW Tools
 * Handles configuration storage and retrieval
 */

const ConfigManager = {
    // Default configuration (matching Apps Script FW_DEFAULTS)
    DEFAULTS: {
        SOURCE_COL: 'E',           // sguid_link column
        CONTENT_COL: 'P',          // SMS content column
        BATCH_COL: 'Q',            // SMS batch column
        EMAIL_COL: 'H',            // Email address column
        EMAIL_BATCH_COL: 'S',      // Email batch column
        EMAIL_LINK_COL: 'E',       // Email link column (sguid)
        REMIND_SMS_BATCH_COL: 'T', // Remind SMS Batch column
        REMIND_EMAIL_BATCH_COL: 'U', // Remind Email Batch column
        STATUS_COL: 'V',           // Respondent Status column
        DEFAULT_LIMIT: 500,
        EXPORT_AFTER_MARK: false,
        OVERWRITE_BATCH: false,
        TEMPLATE_TEXT: 'IFM co KS 11phut ve nha dep song chat, nhan evoucher gotit 20.000d (250373).Hay tham gia ngay hom nay. Link: ',
        // Default visible columns (empty = show all, or list column names)
        DEFAULT_VISIBLE_COLUMNS: [],
        // Alchemer API config
        ALCHEMER_API_KEY: '',
        ALCHEMER_SECRET_KEY: '',
    },

    // Current config
    config: null,

    // Template library
    templates: [],

    // Local storage keys
    STORAGE_KEYS: {
        CONFIG: 'fw_tools_config',
        TEMPLATES: 'fw_tools_templates',
        THEME: 'fw_tools_theme',
        EXPORT_HISTORY: 'fw_tools_export_history',
        ACTION_HISTORY: 'fw_tools_action_history',
        VISIBLE_COLUMNS: 'fw_tools_visible_columns'
    },

    /**
     * Initialize config manager - load from localStorage or set defaults
     */
    init() {
        this.loadConfig();
        this.loadTemplates();
        this.loadTheme();
        console.log('ConfigManager initialized', this.config);
    },

    /**
     * Load config from localStorage
     */
    loadConfig() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.CONFIG);
            if (stored) {
                this.config = { ...this.DEFAULTS, ...JSON.parse(stored) };
            } else {
                this.config = { ...this.DEFAULTS };
            }
        } catch (e) {
            console.warn('Failed to load config from localStorage:', e);
            this.config = { ...this.DEFAULTS };
        }
    },

    /**
     * Save current config to localStorage
     */
    saveConfig() {
        try {
            localStorage.setItem(this.STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
            return true;
        } catch (e) {
            console.error('Failed to save config:', e);
            return false;
        }
    },

    /**
     * Get a config value
     */
    get(key) {
        return this.config[key] ?? this.DEFAULTS[key];
    },

    /**
     * Set a config value
     */
    set(key, value) {
        this.config[key] = value;
        this.saveConfig();
    },

    /**
     * Reset config to defaults
     */
    resetToDefaults() {
        this.config = { ...this.DEFAULTS };
        this.saveConfig();
    },

    /**
     * Get all config
     */
    getAll() {
        return { ...this.config };
    },

    /**
     * Update multiple config values at once
     */
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        this.saveConfig();
    },

    // ===== Template Management =====

    /**
     * Load templates from localStorage
     */
    loadTemplates() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.TEMPLATES);
            if (stored) {
                this.templates = JSON.parse(stored);
            } else {
                // Add default template
                this.templates = [{
                    id: Date.now(),
                    name: 'Default Template',
                    text: this.DEFAULTS.TEMPLATE_TEXT,
                    createdAt: new Date().toISOString()
                }];
                this.saveTemplates();
            }
        } catch (e) {
            console.warn('Failed to load templates:', e);
            this.templates = [];
        }
    },

    /**
     * Save templates to localStorage
     */
    saveTemplates() {
        try {
            localStorage.setItem(this.STORAGE_KEYS.TEMPLATES, JSON.stringify(this.templates));
            return true;
        } catch (e) {
            console.error('Failed to save templates:', e);
            return false;
        }
    },

    /**
     * Add a new template
     */
    addTemplate(name, text) {
        const template = {
            id: Date.now(),
            name: name || `Template ${this.templates.length + 1}`,
            text: text,
            createdAt: new Date().toISOString()
        };
        this.templates.push(template);
        this.saveTemplates();
        return template;
    },

    /**
     * Delete a template by id
     */
    deleteTemplate(id) {
        this.templates = this.templates.filter(t => t.id !== id);
        this.saveTemplates();
    },

    /**
     * Get all templates
     */
    getTemplates() {
        return [...this.templates];
    },

    /**
     * Get template by id
     */
    getTemplate(id) {
        return this.templates.find(t => t.id === id);
    },

    // ===== Theme Management =====

    /**
     * Load theme preference
     */
    loadTheme() {
        const theme = localStorage.getItem(this.STORAGE_KEYS.THEME) || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        return theme;
    },

    /**
     * Toggle theme
     */
    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem(this.STORAGE_KEYS.THEME, newTheme);
        return newTheme;
    },

    /**
     * Get current theme
     */
    getTheme() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    },

    // ===== Export History =====

    /**
     * Add export to history
     */
    addExportHistory(exportInfo) {
        try {
            let history = this.getExportHistory();
            history.unshift({
                ...exportInfo,
                timestamp: new Date().toISOString()
            });
            // Keep only last 50 exports
            history = history.slice(0, 50);
            localStorage.setItem(this.STORAGE_KEYS.EXPORT_HISTORY, JSON.stringify(history));
        } catch (e) {
            console.error('Failed to save export history:', e);
        }
    },

    /**
     * Get export history
     */
    getExportHistory() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.EXPORT_HISTORY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    },

    // ===== Action History =====

    /**
     * Add action to history (for Recent Actions display)
     */
    addActionHistory(action) {
        try {
            let history = this.getActionHistory();
            history.unshift({
                ...action,
                timestamp: new Date().toISOString()
            });
            // Keep only last 20 actions
            history = history.slice(0, 20);
            localStorage.setItem(this.STORAGE_KEYS.ACTION_HISTORY, JSON.stringify(history));
        } catch (e) {
            console.error('Failed to save action history:', e);
        }
    },

    /**
     * Get action history
     */
    getActionHistory() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.ACTION_HISTORY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    },

    /**
     * Clear action history
     */
    clearActionHistory() {
        localStorage.removeItem(this.STORAGE_KEYS.ACTION_HISTORY);
    },

    // ===== Column Utilities =====

    /**
     * Convert column letter to index (A=0, B=1, etc.)
     */
    colToIndex(col) {
        if (typeof col === 'number') return col;
        col = String(col).trim().toUpperCase();
        let n = 0;
        for (let i = 0; i < col.length; i++) {
            n = n * 26 + (col.charCodeAt(i) - 64);
        }
        return n - 1; // 0-indexed
    },

    /**
     * Convert index to column letter (0=A, 1=B, etc.)
     */
    indexToCol(index) {
        let s = '';
        let n = index + 1; // 1-indexed
        while (n > 0) {
            const m = (n - 1) % 26;
            s = String.fromCharCode(65 + m) + s;
            n = Math.floor((n - 1) / 26);
        }
        return s;
    },

    /**
     * Generate column options for dropdowns
     */
    generateColumnOptions(maxCols = 26) {
        const options = [];
        for (let i = 0; i < maxCols; i++) {
            const letter = this.indexToCol(i);
            options.push({ value: letter, label: letter });
        }
        return options;
    }
};

// Initialize when script loads
if (typeof window !== 'undefined') {
    window.ConfigManager = ConfigManager;
}
