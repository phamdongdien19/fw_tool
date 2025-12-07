/**
 * Data Manager - FW Tools
 * Handles data import, storage, and manipulation
 */

const DataManager = {
    // Current data
    data: [],           // Array of row objects
    headers: [],        // Array of column headers
    originalData: [],   // Original data for reset

    // Undo/Redo stacks
    undoStack: [],
    redoStack: [],
    maxUndoSteps: 50,

    // File info
    fileInfo: {
        name: null,
        type: null,
        size: null,
        loadedAt: null
    },

    // Batch tracking
    smsBatches: new Set(),
    emailBatches: new Set(),

    /**
     * Initialize data manager
     */
    init() {
        this.clear();
        console.log('DataManager initialized');
    },

    /**
     * Clear all data
     */
    clear() {
        this.data = [];
        this.headers = [];
        this.originalData = [];
        this.undoStack = [];
        this.redoStack = [];
        this.smsBatches.clear();
        this.emailBatches.clear();
        this.fileInfo = {
            name: null,
            type: null,
            size: null,
            loadedAt: null
        };
    },

    /**
     * Import data from file
     * @param {File} file - File object
     * @param {Object} options - Import options
     * @returns {Promise<{success: boolean, rows: number, cols: number}>}
     */
    async importFile(file, options = {}) {
        const { headerRow = 1, sheetIndex = 0 } = options;

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

                    // Get sheet
                    const sheetName = workbook.SheetNames[sheetIndex] || workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];

                    // Convert to JSON (with header)
                    const jsonData = XLSX.utils.sheet_to_json(sheet, {
                        header: 1,
                        defval: ''
                    });

                    if (!jsonData || jsonData.length === 0) {
                        reject(new Error('File is empty or invalid'));
                        return;
                    }

                    // Extract headers
                    const headerRowIndex = Math.max(0, headerRow - 1);
                    this.headers = jsonData[headerRowIndex].map((h, i) => {
                        return String(h || `Column ${ConfigManager.indexToCol(i)}`).trim();
                    });

                    // Extract data rows
                    const dataRows = jsonData.slice(headerRowIndex + 1);
                    this.data = dataRows.map((row, rowIndex) => {
                        const rowObj = { _rowIndex: rowIndex };
                        this.headers.forEach((header, colIndex) => {
                            rowObj[header] = row[colIndex] !== undefined ? row[colIndex] : '';
                        });
                        return rowObj;
                    });

                    // Store original
                    this.originalData = JSON.parse(JSON.stringify(this.data));

                    // Update file info
                    this.fileInfo = {
                        name: file.name,
                        type: file.type || this.getFileType(file.name),
                        size: file.size,
                        loadedAt: new Date().toISOString(),
                        sheetName: sheetName,
                        sheets: workbook.SheetNames
                    };

                    // Detect batches
                    this.detectBatches();

                    // Auto-create required columns if they don't exist
                    this.ensureRequiredColumns();

                    // Clear undo/redo
                    this.undoStack = [];
                    this.redoStack = [];

                    resolve({
                        success: true,
                        rows: this.data.length,
                        cols: this.headers.length,
                        sheets: workbook.SheetNames
                    });

                } catch (error) {
                    console.error('Error parsing file:', error);
                    reject(error);
                }
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Get file type from extension
     */
    getFileType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const types = {
            'csv': 'text/csv',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xls': 'application/vnd.ms-excel'
        };
        return types[ext] || 'unknown';
    },

    /**
     * Ensure required columns exist after import
     * These columns are needed for batch marking, content generation, etc.
     */
    ensureRequiredColumns() {
        // Define required columns in order they should be added
        const requiredColumns = [
            'Content_SMS',          // SMS content (generated from template)
            'SMS_Batch',            // SMS batch number
            'Content_Email',        // Email content
            'Email_Batch',          // Email batch number
            'Remind_SMS_Batch',     // Remind SMS batch
            'Remind_Email_Batch',   // Remind Email batch
            'Response_Status'       // Respondent status from API
        ];

        // Check each required column and add if missing
        let columnsAdded = [];
        requiredColumns.forEach(colName => {
            // Check if column exists (case-insensitive)
            const exists = this.headers.some(h =>
                h.toLowerCase() === colName.toLowerCase() ||
                h.toLowerCase().replace(/[_\s]/g, '') === colName.toLowerCase().replace(/[_\s]/g, '')
            );

            if (!exists) {
                // Add column to headers
                this.headers.push(colName);

                // Initialize empty value for each row
                this.data.forEach(row => {
                    row[colName] = '';
                });

                columnsAdded.push(colName);
            }
        });

        if (columnsAdded.length > 0) {
            console.log('Auto-created columns:', columnsAdded);
        }

        return columnsAdded;
    },

    /**
     * Detect existing batches in data
     */
    detectBatches() {
        this.smsBatches.clear();
        this.emailBatches.clear();

        const config = ConfigManager.getAll();
        const batchCol = this.findColumn(config.BATCH_COL);
        const emailBatchCol = this.findColumn(config.EMAIL_BATCH_COL);

        this.data.forEach(row => {
            if (batchCol && row[batchCol]) {
                const batch = parseInt(row[batchCol]);
                if (!isNaN(batch) && batch > 0) {
                    this.smsBatches.add(batch);
                }
            }
            if (emailBatchCol && row[emailBatchCol]) {
                const batch = parseInt(row[emailBatchCol]);
                if (!isNaN(batch) && batch > 0) {
                    this.emailBatches.add(batch);
                }
            }
        });
    },

    /**
     * Find column by letter or name (case-insensitive)
     */
    findColumn(colRef) {
        if (!colRef) return null;

        const colRefStr = String(colRef);

        // Try as column letter first (E -> index 4 -> headers[4])
        if (/^[A-Z]+$/i.test(colRefStr)) {
            const index = ConfigManager.colToIndex(colRefStr);
            if (index >= 0 && index < this.headers.length) {
                return this.headers[index];
            }
        }

        // Try exact match first
        if (this.headers.includes(colRefStr)) {
            return colRefStr;
        }

        // Try case-insensitive match
        const lowerRef = colRefStr.toLowerCase();
        const normalizedRef = lowerRef.replace(/[_\s]/g, '');

        for (const header of this.headers) {
            if (header.toLowerCase() === lowerRef) {
                return header;
            }
            // Also try without underscores/spaces
            if (header.toLowerCase().replace(/[_\s]/g, '') === normalizedRef) {
                return header;
            }
        }

        return null;
    },

    /**
     * Get column index by header name
     */
    getColumnIndex(headerName) {
        return this.headers.indexOf(headerName);
    },

    /**
     * Check if data is loaded
     */
    hasData() {
        return this.data.length > 0;
    },

    /**
     * Get row count
     */
    getRowCount() {
        return this.data.length;
    },

    /**
     * Get all data
     */
    getData() {
        return this.data;
    },

    /**
     * Set headers
     */
    setHeaders(headers) {
        this.headers = headers || [];
    },

    /**
     * Set data from external source (e.g., server)
     * @param {Array} headers - Column headers
     * @param {Array} data - Row data
     * @param {string} projectName - Project name for file info
     */
    setData(headers, data, projectName = 'Loaded Project') {
        this.headers = headers || [];
        this.data = data || [];
        this.originalData = JSON.parse(JSON.stringify(this.data));

        this.fileInfo = {
            name: projectName,
            type: 'project',
            size: JSON.stringify(data).length,
            loadedAt: new Date().toISOString()
        };

        // Detect batches
        this.detectBatches();

        // Clear undo/redo
        this.undoStack = [];
        this.redoStack = [];

        console.log(`DataManager: Loaded ${this.data.length} rows, ${this.headers.length} columns`);
    },

    /**
     * Get headers
     */
    getHeaders() {
        return this.headers;
    },

    /**
     * Get file info
     */
    getFileInfo() {
        return { ...this.fileInfo };
    },

    /**
     * Get row by index
     */
    getRow(index) {
        return this.data[index];
    },

    /**
     * Update a cell value
     */
    updateCell(rowIndex, column, value) {
        if (rowIndex >= 0 && rowIndex < this.data.length) {
            const col = this.findColumn(column) || column;
            if (this.data[rowIndex].hasOwnProperty(col)) {
                this.saveUndoState();
                this.data[rowIndex][col] = value;
                return true;
            }
        }
        return false;
    },

    /**
     * Update multiple rows at once (for batch operations)
     */
    updateRows(updates) {
        this.saveUndoState();
        updates.forEach(({ rowIndex, updates: rowUpdates }) => {
            if (rowIndex >= 0 && rowIndex < this.data.length) {
                Object.entries(rowUpdates).forEach(([col, value]) => {
                    const column = this.findColumn(col) || col;
                    if (this.headers.includes(column)) {
                        this.data[rowIndex][column] = value;
                    }
                });
            }
        });
    },

    /**
     * Save current state for undo
     */
    saveUndoState() {
        // Clone current data
        const state = JSON.parse(JSON.stringify(this.data));
        this.undoStack.push(state);

        // Limit stack size
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }

        // Clear redo stack on new action
        this.redoStack = [];
    },

    /**
     * Undo last action
     */
    undo() {
        if (this.undoStack.length === 0) return false;

        // Save current for redo
        this.redoStack.push(JSON.parse(JSON.stringify(this.data)));

        // Restore previous state
        this.data = this.undoStack.pop();
        this.detectBatches();

        return true;
    },

    /**
     * Redo last undone action
     */
    redo() {
        if (this.redoStack.length === 0) return false;

        // Save current for undo
        this.undoStack.push(JSON.parse(JSON.stringify(this.data)));

        // Restore redo state
        this.data = this.redoStack.pop();
        this.detectBatches();

        return true;
    },

    /**
     * Check if undo is available
     */
    canUndo() {
        return this.undoStack.length > 0;
    },

    /**
     * Check if redo is available
     */
    canRedo() {
        return this.redoStack.length > 0;
    },

    /**
     * Get next batch number for SMS
     */
    getNextSmsBatch() {
        if (this.smsBatches.size === 0) return 1;
        return Math.max(...this.smsBatches) + 1;
    },

    /**
     * Get next batch number for Email
     */
    getNextEmailBatch() {
        if (this.emailBatches.size === 0) return 1;
        return Math.max(...this.emailBatches) + 1;
    },

    /**
     * Get all SMS batch numbers
     */
    getSmsBatches() {
        return Array.from(this.smsBatches).sort((a, b) => a - b);
    },

    /**
     * Get all Email batch numbers
     */
    getEmailBatches() {
        return Array.from(this.emailBatches).sort((a, b) => a - b);
    },

    /**
     * Get statistics
     */
    getStats() {
        const config = ConfigManager.getAll();
        const batchCol = this.findColumn(config.BATCH_COL);
        const emailBatchCol = this.findColumn(config.EMAIL_BATCH_COL);

        let smsMarked = 0;
        let emailMarked = 0;

        this.data.forEach(row => {
            if (batchCol && row[batchCol]) smsMarked++;
            if (emailBatchCol && row[emailBatchCol]) emailMarked++;
        });

        return {
            total: this.data.length,
            smsMarked,
            emailMarked,
            pending: this.data.length - Math.max(smsMarked, emailMarked),
            smsBatches: this.smsBatches.size,
            emailBatches: this.emailBatches.size
        };
    },

    /**
     * Reset data to original state
     */
    resetToOriginal() {
        if (this.originalData.length > 0) {
            this.saveUndoState();
            this.data = JSON.parse(JSON.stringify(this.originalData));
            this.detectBatches();
            return true;
        }
        return false;
    },

    /**
     * Add a new column
     */
    addColumn(name, defaultValue = '') {
        if (this.headers.includes(name)) {
            return false; // Column already exists
        }

        this.saveUndoState();
        this.headers.push(name);
        this.data.forEach(row => {
            row[name] = defaultValue;
        });

        return true;
    },

    /**
     * Ensure column exists (add if not)
     */
    ensureColumn(name, defaultValue = '') {
        if (!this.headers.includes(name)) {
            this.headers.push(name);
            this.data.forEach(row => {
                row[name] = defaultValue;
            });
        }
    },

    /**
     * Get unique values in a column
     */
    getUniqueValues(column) {
        const col = this.findColumn(column);
        if (!col) return [];

        const values = new Set();
        this.data.forEach(row => {
            if (row[col] !== '' && row[col] !== null && row[col] !== undefined) {
                values.add(row[col]);
            }
        });

        return Array.from(values).sort();
    },

    /**
     * Export data to array format for XLSX
     */
    toArrayFormat(rows = null, columns = null) {
        const dataToExport = rows || this.data;
        const colsToExport = columns || this.headers;

        // Header row
        const result = [colsToExport];

        // Data rows
        dataToExport.forEach(row => {
            const rowData = colsToExport.map(col => {
                const column = this.findColumn(col) || col;
                return row[column] !== undefined ? row[column] : '';
            });
            result.push(rowData);
        });

        return result;
    }
};

// Initialize when script loads
if (typeof window !== 'undefined') {
    window.DataManager = DataManager;
}
