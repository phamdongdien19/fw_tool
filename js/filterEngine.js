/**
 * Filter Engine - FW Tools
 * Handles data filtering with visual builder support
 */

const FilterEngine = {
    // Current filter conditions
    conditions: [],

    // Filter presets
    presets: {},

    // Filtered data cache
    filteredData: null,
    filteredIndices: null,

    // Search query
    searchQuery: '',

    /**
     * Initialize filter engine
     */
    init() {
        this.conditions = [];
        this.filteredData = null;
        this.filteredIndices = null;
        this.searchQuery = '';
        this.loadPresets();
        console.log('FilterEngine initialized');
    },

    /**
     * Add a filter condition
     */
    addCondition(condition = null) {
        const newCondition = condition || {
            id: Date.now(),
            column: '',
            operator: 'equals',
            value: '',
            active: true
        };
        this.conditions.push(newCondition);
        return newCondition;
    },

    /**
     * Update a condition
     */
    updateCondition(id, updates) {
        const condition = this.conditions.find(c => c.id === id);
        if (condition) {
            Object.assign(condition, updates);
            this.invalidateCache();
        }
    },

    /**
     * Remove a condition
     */
    removeCondition(id) {
        this.conditions = this.conditions.filter(c => c.id !== id);
        this.invalidateCache();
    },

    /**
     * Clear all conditions
     */
    clearConditions() {
        this.conditions = [];
        this.invalidateCache();
    },

    /**
     * Set search query
     */
    setSearchQuery(query) {
        this.searchQuery = query.toLowerCase().trim();
        this.invalidateCache();
    },

    /**
     * Invalidate filter cache
     */
    invalidateCache() {
        this.filteredData = null;
        this.filteredIndices = null;
    },

    /**
     * Apply filters to data
     */
    apply(data) {
        // Check cache
        if (this.filteredData !== null) {
            return {
                data: this.filteredData,
                indices: this.filteredIndices
            };
        }

        const activeConditions = this.conditions.filter(c => c.active && c.column);

        this.filteredData = [];
        this.filteredIndices = [];

        data.forEach((row, index) => {
            // Check search query first
            if (this.searchQuery && !this.matchesSearch(row)) {
                return;
            }

            // Check all conditions
            if (activeConditions.length === 0 || this.matchesAllConditions(row, activeConditions)) {
                this.filteredData.push(row);
                this.filteredIndices.push(index);
            }
        });

        return {
            data: this.filteredData,
            indices: this.filteredIndices
        };
    },

    /**
     * Check if row matches search query
     */
    matchesSearch(row) {
        if (!this.searchQuery) return true;

        return Object.values(row).some(value => {
            if (value === null || value === undefined) return false;
            return String(value).toLowerCase().includes(this.searchQuery);
        });
    },

    /**
     * Check if row matches all conditions
     */
    matchesAllConditions(row, conditions) {
        return conditions.every(condition => this.matchCondition(row, condition));
    },

    /**
     * Check if row matches a single condition
     */
    matchCondition(row, condition) {
        const { column, operator, value } = condition;
        const cellValue = row[column];

        // Handle null/undefined
        if (cellValue === null || cellValue === undefined) {
            switch (operator) {
                case 'isEmpty':
                    return true;
                case 'isNotEmpty':
                    return false;
                default:
                    return false;
            }
        }

        const cellStr = String(cellValue).toLowerCase();
        const valueStr = String(value).toLowerCase();
        const cellNum = parseFloat(cellValue);
        const valueNum = parseFloat(value);

        switch (operator) {
            case 'equals':
                return cellStr === valueStr;
            case 'notEquals':
                return cellStr !== valueStr;
            case 'contains':
                return cellStr.includes(valueStr);
            case 'notContains':
                return !cellStr.includes(valueStr);
            case 'startsWith':
                return cellStr.startsWith(valueStr);
            case 'endsWith':
                return cellStr.endsWith(valueStr);
            case 'isEmpty':
                return cellStr === '' || cellStr === 'null' || cellStr === 'undefined';
            case 'isNotEmpty':
                return cellStr !== '' && cellStr !== 'null' && cellStr !== 'undefined';
            case 'greaterThan':
                return !isNaN(cellNum) && !isNaN(valueNum) && cellNum > valueNum;
            case 'lessThan':
                return !isNaN(cellNum) && !isNaN(valueNum) && cellNum < valueNum;
            case 'greaterOrEqual':
                return !isNaN(cellNum) && !isNaN(valueNum) && cellNum >= valueNum;
            case 'lessOrEqual':
                return !isNaN(cellNum) && !isNaN(valueNum) && cellNum <= valueNum;
            case 'regex':
                try {
                    const regex = new RegExp(value, 'i');
                    return regex.test(cellStr);
                } catch {
                    return false;
                }
            case 'inList':
                if (!value) return false;
                // Value is expected to be an array or comma-separated string
                const list = Array.isArray(value) ? value : String(value).split(',').map(v => v.trim().toLowerCase());
                return list.some(item => String(item).toLowerCase() === cellStr);
            case 'notInList':
                if (!value) return true;
                const excList = Array.isArray(value) ? value : String(value).split(',').map(v => v.trim().toLowerCase());
                return !excList.some(item => String(item).toLowerCase() === cellStr);
            default:
                return true;
        }
    },

    /**
     * Get available operators
     */
    getOperators() {
        return [
            { value: 'equals', label: 'Equals' },
            { value: 'notEquals', label: 'Not equals' },
            { value: 'contains', label: 'Contains' },
            { value: 'notContains', label: 'Not contains' },
            { value: 'startsWith', label: 'Starts with' },
            { value: 'endsWith', label: 'Ends with' },
            { value: 'isEmpty', label: 'Is empty' },
            { value: 'isNotEmpty', label: 'Is not empty' },
            { value: 'greaterThan', label: 'Greater than (>)' },
            { value: 'lessThan', label: 'Less than (<)' },
            { value: 'greaterOrEqual', label: 'Greater or equal (>=)' },
            { value: 'lessOrEqual', label: 'Less or equal (<=)' },
            { value: 'regex', label: 'Regex match' },
            { value: 'inList', label: 'In list (Multi-select)' },
            { value: 'notInList', label: 'Not in list' }
        ];
    },

    /**
     * Get filter summary text
     */
    getSummary() {
        const activeConditions = this.conditions.filter(c => c.active && c.column);

        if (activeConditions.length === 0 && !this.searchQuery) {
            return 'No filter';
        }

        const parts = [];

        if (this.searchQuery) {
            parts.push(`Search: "${this.searchQuery}"`);
        }

        if (activeConditions.length > 0) {
            parts.push(`${activeConditions.length} filter${activeConditions.length > 1 ? 's' : ''}`);
        }

        return parts.join(' + ');
    },

    /**
     * Check if any filter is active
     */
    hasActiveFilters() {
        return this.conditions.some(c => c.active && c.column) || this.searchQuery.length > 0;
    },

    // ===== Presets =====

    /**
     * Load presets from localStorage
     */
    loadPresets() {
        try {
            const stored = localStorage.getItem('fw_tools_filter_presets');
            this.presets = stored ? JSON.parse(stored) : this.getDefaultPresets();
        } catch (e) {
            this.presets = this.getDefaultPresets();
        }
    },

    /**
     * Get default presets
     */
    getDefaultPresets() {
        const config = ConfigManager.getAll();
        return {
            'unmarked': {
                name: 'Chưa đánh batch',
                conditions: [
                    { column: config.BATCH_COL, operator: 'isEmpty', value: '' },
                    { column: config.EMAIL_BATCH_COL, operator: 'isEmpty', value: '' }
                ]
            },
            'sms-pending': {
                name: 'SMS chưa gửi',
                conditions: [
                    { column: config.BATCH_COL, operator: 'isEmpty', value: '' }
                ]
            },
            'email-pending': {
                name: 'Email chưa gửi',
                conditions: [
                    { column: config.EMAIL_BATCH_COL, operator: 'isEmpty', value: '' }
                ]
            }
        };
    },

    /**
     * Save current filter as preset
     */
    savePreset(name) {
        if (!name) return false;

        const key = name.toLowerCase().replace(/\s+/g, '-');
        this.presets[key] = {
            name: name,
            conditions: JSON.parse(JSON.stringify(this.conditions))
        };

        try {
            localStorage.setItem('fw_tools_filter_presets', JSON.stringify(this.presets));
            return true;
        } catch (e) {
            return false;
        }
    },

    /**
     * Load a preset
     */
    loadPreset(key) {
        const headers = DataManager.getHeaders();
        const preset = this.presets[key];
        if (!preset) return false;

        this.conditions = preset.conditions.map(c => {
            // Try to find column by letter
            const colIndex = ConfigManager.colToIndex(c.column);
            const columnName = colIndex >= 0 && colIndex < headers.length ? headers[colIndex] : c.column;

            return {
                id: Date.now() + Math.random(),
                column: columnName,
                operator: c.operator,
                value: c.value,
                active: true
            };
        });

        this.invalidateCache();
        return true;
    },

    /**
     * Get all presets
     */
    getPresets() {
        return { ...this.presets };
    },

    /**
     * Delete a preset
     */
    deletePreset(key) {
        delete this.presets[key];
        try {
            localStorage.setItem('fw_tools_filter_presets', JSON.stringify(this.presets));
        } catch (e) {
            // Ignore
        }
    }
};

// Initialize when script loads
if (typeof window !== 'undefined') {
    window.FilterEngine = FilterEngine;
}
