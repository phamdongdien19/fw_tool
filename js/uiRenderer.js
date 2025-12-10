/**
 * UI Renderer - FW Tools
 * Handles UI rendering and interactions
 */

const UIRenderer = {
    // Pagination settings
    pageSize: 100,
    currentPage: 0,

    /**
     * Initialize UI
     */
    init() {
        this.currentPage = 0;
        console.log('UIRenderer initialized');
    },

    /**
     * Render data table
     */
    renderDataTable(data = null, headers = null) {
        const tableHead = document.getElementById('dataTableHead');
        const tableBody = document.getElementById('dataTableBody');
        const emptyState = document.getElementById('dataEmptyState');

        if (!tableHead || !tableBody) return;

        const allData = data || DataManager.getData();
        const allHeaders = headers || DataManager.getHeaders();

        // Get visible columns - respect user selection even if empty
        let displayHeaders;
        if (typeof columnVisibilityInitialized !== 'undefined' && columnVisibilityInitialized) {
            // User has explicitly set columns, respect their choice
            displayHeaders = allHeaders.filter(h => visibleColumns.has(h));
        } else if (typeof visibleColumns !== 'undefined' && visibleColumns.size > 0) {
            // Initial state with some columns selected
            displayHeaders = allHeaders.filter(h => visibleColumns.has(h));
        } else {
            // Default: show all columns
            displayHeaders = allHeaders;
        }

        // Apply filters
        let displayData, displayIndices;
        if (FilterEngine.hasActiveFilters()) {
            const filtered = FilterEngine.apply(allData);
            displayData = filtered.data;
            displayIndices = filtered.indices;
        } else {
            displayData = allData;
            displayIndices = allData.map((_, i) => i);
        }

        // Update pagination state
        if (typeof updatePagination === 'function') {
            updatePagination(displayData);
        }

        // Show/hide empty state
        if (allData.length === 0) {
            emptyState.style.display = 'flex';
            tableHead.innerHTML = '';
            tableBody.innerHTML = '';
            return;
        }
        emptyState.style.display = 'none';

        // Render headers with visible columns only
        tableHead.innerHTML = `
            <tr>
                <th class="row-number-header">#</th>
                ${displayHeaders.map(h => `<th>${this.escapeHtml(h)}</th>`).join('')}
            </tr>
        `;

        // Use global pagination state
        const pageState = typeof paginationState !== 'undefined' ? paginationState : { currentPage: 1, rowsPerPage: 25 };
        const start = (pageState.currentPage - 1) * pageState.rowsPerPage;
        const end = Math.min(start + pageState.rowsPerPage, displayData.length);
        const pageData = displayData.slice(start, end);
        const pageIndices = displayIndices.slice(start, end);

        // Render rows with visible columns only
        tableBody.innerHTML = pageData.map((row, i) => {
            const originalIndex = pageIndices[i];
            return `
                <tr data-index="${originalIndex}">
                    <td class="row-number">${originalIndex + 1}</td>
                    ${displayHeaders.map(h => {
                const value = row[h];
                const displayValue = value !== null && value !== undefined ? value : '';

                // Check if it's a batch column
                const config = ConfigManager.getAll();
                let cellClass = '';
                if (h === DataManager.findColumn(config.BATCH_COL) && value) {
                    cellClass = 'cell-batch sms';
                } else if (h === DataManager.findColumn(config.EMAIL_BATCH_COL) && value) {
                    cellClass = 'cell-batch email';
                }

                return `<td title="${this.escapeHtml(String(displayValue))}"><span class="${cellClass}">${this.escapeHtml(String(displayValue))}</span></td>`;
            }).join('')}
                </tr>
            `;
        }).join('');

        // Update filter status
        document.getElementById('filterStatus').textContent = FilterEngine.getSummary();

        // Initialize column visibility list if needed (only if user hasn't set it)
        if (typeof initColumnVisibility === 'function' &&
            visibleColumns.size === 0 &&
            allHeaders.length > 0 &&
            (typeof columnVisibilityInitialized === 'undefined' || !columnVisibilityInitialized)) {
            initColumnVisibility();
        }
    },

    /**
     * Render dashboard stats
     */
    renderDashboard() {
        const stats = DataManager.getStats();

        document.getElementById('totalRows').textContent = this.formatNumber(stats.total);
        document.getElementById('smsMarked').textContent = this.formatNumber(stats.smsMarked);
        document.getElementById('emailMarked').textContent = this.formatNumber(stats.emailMarked);
        document.getElementById('pendingRows').textContent = this.formatNumber(stats.pending);

        // Enable/disable quick action buttons
        const hasData = stats.total > 0;
        document.getElementById('quickMarkSms').disabled = !hasData;
        document.getElementById('quickMarkEmail').disabled = !hasData;
        document.getElementById('quickExport').disabled = !hasData || (stats.smsBatches === 0 && stats.emailBatches === 0);

        // Render recent actions
        this.renderRecentActions();

        // Render batch chart
        this.renderBatchChart();
    },

    /**
     * Render recent actions list
     */
    renderRecentActions() {
        const actionList = document.getElementById('actionList');
        const actions = ConfigManager.getActionHistory();

        if (actions.length === 0) {
            actionList.innerHTML = `
                <li class="empty-state">
                    <span class="empty-icon">📝</span>
                    <p>Chưa có hoạt động nào</p>
                </li>
            `;
            return;
        }

        actionList.innerHTML = actions.slice(0, 10).map(action => {
            const time = new Date(action.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            let text = '';
            switch (action.type) {
                case 'mark_sms':
                    text = `Batch ${action.batch} SMS (${action.count} rows)`;
                    break;
                case 'mark_email':
                    text = `Batch ${action.batch} Email (${action.count} rows)`;
                    break;
                case 'export_sms':
                case 'export_email':
                    text = `Exported batch ${action.batch} (${action.count} rows)`;
                    break;
                case 'import':
                    text = `Imported ${action.filename}`;
                    break;
                default:
                    text = action.type;
            }
            return `
                <li>
                    <span class="action-icon">${action.icon || '📌'}</span>
                    <span class="action-text">${text}</span>
                    <span class="action-time">${time}</span>
                </li>
            `;
        }).join('');
    },

    /**
     * Render batch chart
     */
    renderBatchChart() {
        const chartContainer = document.getElementById('batchChart');
        const smsBatches = DataManager.getSmsBatches();
        const emailBatches = DataManager.getEmailBatches();

        if (smsBatches.length === 0 && emailBatches.length === 0) {
            chartContainer.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📊</span>
                    <p>Import data để xem thống kê batch</p>
                </div>
            `;
            return;
        }

        const config = ConfigManager.getAll();
        const data = DataManager.getData();
        const smsBatchCol = DataManager.findColumn(config.BATCH_COL);
        const emailBatchCol = DataManager.findColumn(config.EMAIL_BATCH_COL);

        // Count rows per batch
        const batchCounts = {};
        const maxBatch = Math.max(...smsBatches, ...emailBatches, 0);

        for (let i = 1; i <= maxBatch; i++) {
            batchCounts[i] = { sms: 0, email: 0 };
        }

        data.forEach(row => {
            if (smsBatchCol && row[smsBatchCol]) {
                const b = row[smsBatchCol];
                if (batchCounts[b]) batchCounts[b].sms++;
            }
            if (emailBatchCol && row[emailBatchCol]) {
                const b = row[emailBatchCol];
                if (batchCounts[b]) batchCounts[b].email++;
            }
        });

        const maxCount = Math.max(...Object.values(batchCounts).flatMap(b => [b.sms, b.email]), 1);

        chartContainer.innerHTML = Object.entries(batchCounts).map(([batch, counts]) => {
            const smsHeight = (counts.sms / maxCount) * 180;
            const emailHeight = (counts.email / maxCount) * 180;
            return `
                <div class="chart-bar-group" style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <div style="display: flex; gap: 2px; align-items: flex-end; height: 180px;">
                        ${counts.sms > 0 ? `<div class="chart-bar sms" style="height: ${smsHeight}px; width: 20px;" data-value="${counts.sms}"></div>` : ''}
                        ${counts.email > 0 ? `<div class="chart-bar email" style="height: ${emailHeight}px; width: 20px;" data-value="${counts.email}"></div>` : ''}
                    </div>
                    <span style="font-size: 11px; color: var(--text-secondary);">B${batch}</span>
                </div>
            `;
        }).join('');
    },

    /**
     * Render filter conditions UI
     */
    renderFilterConditions() {
        const container = document.getElementById('filterConditions');
        const headers = DataManager.getHeaders();
        const operators = FilterEngine.getOperators();

        if (FilterEngine.conditions.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px;">Chưa có filter. Click "+ Add Condition" để thêm.</p>';
            return;
        }

        container.innerHTML = FilterEngine.conditions.map(condition => `
            <div class="filter-condition" data-id="${condition.id}">
                <select class="form-control form-control-sm filter-column" onchange="updateFilterCondition(${condition.id}, 'column', this.value)">
                    <option value="">-- Chọn cột --</option>
                    ${headers.map(h => `<option value="${h}" ${condition.column === h ? 'selected' : ''}>${h}</option>`).join('')}
                </select>
                <select class="form-control form-control-sm filter-operator" onchange="updateFilterCondition(${condition.id}, 'operator', this.value)">
                    ${operators.map(op => `<option value="${op.value}" ${condition.operator === op.value ? 'selected' : ''}>${op.label}</option>`).join('')}
                </select>
                
                ${this.renderFilterInput(condition)}
                
                <button class="btn btn-sm btn-danger btn-remove" onclick="removeFilterCondition(${condition.id})">×</button>
            </div>
        `).join('');
    },

    /**
     * Render appropriate input for filter condition
     */
    renderFilterInput(condition) {
        if (['inList', 'notInList'].includes(condition.operator) && condition.column) {
            // Render multi-select dropdown
            const uniqueValues = DataManager.getUniqueValues(condition.column);
            const selectedValues = Array.isArray(condition.value)
                ? condition.value
                : (condition.value ? String(condition.value).split(',') : []);

            // Create a unique ID for this dropdown
            const dropdownId = `dropdown-${condition.id}`.replace('.', '-');

            // Generate options HTML
            const optionsHtml = uniqueValues.map(val => {
                const isSelected = selectedValues.includes(String(val));
                const displayVal = String(val) || '(Empty)';
                const escapedVal = this.escapeHtml(String(val));
                return `
                    <label class="dropdown-item">
                        <input type="checkbox" 
                            value="${escapedVal}" 
                            ${isSelected ? 'checked' : ''}
                            onchange="updateMultiSelect('${condition.id}', this)"
                        >
                        <span>${this.escapeHtml(displayVal)}</span>
                    </label>
                `;
            }).join('');

            return `
                <div class="multi-select-container" id="${dropdownId}">
                    <div class="multi-select-trigger form-control form-control-sm" onclick="toggleMultiSelect('${dropdownId}')">
                        ${selectedValues.length > 0 ? `${selectedValues.length} selected` : 'Select values...'}
                    </div>
                    <div class="multi-select-dropdown" style="display: none;">
                        <input type="text" class="multi-select-search form-control form-control-sm" 
                            placeholder="Type to filter..." 
                            onclick="event.stopPropagation()"
                            onkeyup="filterMultiSelectOptions(this)"
                        >
                        <div class="multi-select-actions" onclick="event.stopPropagation()">
                            <button type="button" class="btn btn-xs btn-outline" onclick="selectAllMulti('${condition.id}', '${dropdownId}', true)">All</button>
                            <button type="button" class="btn btn-xs btn-outline" onclick="selectAllMulti('${condition.id}', '${dropdownId}', false)">None</button>
                            <button type="button" class="btn btn-xs btn-outline" onclick="selectMatchedMulti('${condition.id}', '${dropdownId}')">Matched</button>
                        </div>
                        <div class="multi-select-options">
                            ${optionsHtml}
                        </div>
                    </div>
                </div>
            `;
        }

        // Default text input with Autocomplete (Datalist)
        const listId = `list-${condition.id}`.replace('.', '-');
        let dataListHtml = '';

        if (condition.column) {
            const uniqueValues = DataManager.getUniqueValues(condition.column);
            // Limit to 100 simple values for performance
            const simpleValues = uniqueValues
                .map(v => String(v))
                .filter(v => v.length < 50) // Skip very long text
                .slice(0, 100);

            dataListHtml = `
                <datalist id="${listId}">
                    ${simpleValues.map(v => `<option value="${this.escapeHtml(v)}">`).join('')}
                </datalist>
            `;
        }

        return `
            <input type="text" class="form-control form-control-sm filter-value" 
                value="${this.escapeHtml(condition.value || '')}"
                placeholder="Value..."
                list="${listId}"
                onchange="updateFilterCondition(${condition.id}, 'value', this.value)"
                ${['isEmpty', 'isNotEmpty'].includes(condition.operator) ? 'disabled' : ''}>
            ${dataListHtml}
        `;
    },

    /**
     * Render export options
     */
    renderExportOptions() {
        console.log('[UIRenderer] renderExportOptions called');

        // Update SMS batch select
        const smsBatchSelect = document.getElementById('smsBatchSelect');
        const smsBatches = DataManager.getSmsBatches();
        console.log('[UIRenderer] smsBatches from DataManager:', smsBatches);
        console.log('[UIRenderer] smsBatchSelect element:', smsBatchSelect);

        if (smsBatchSelect) {
            smsBatchSelect.innerHTML = '<option value="">-- Chọn batch --</option>' +
                smsBatches.map(b => `<option value="${b}">Batch ${b}</option>`).join('');
            console.log('[UIRenderer] Updated smsBatchSelect innerHTML');
        }

        // Update Email batch select
        const emailBatchSelect = document.getElementById('emailBatchSelect');
        const emailBatches = DataManager.getEmailBatches();
        if (emailBatchSelect) {
            emailBatchSelect.innerHTML = '<option value="">-- Chọn batch --</option>' +
                emailBatches.map(b => `<option value="${b}">Batch ${b}</option>`).join('');
        }

        // Update custom column selector
        const columnSelector = document.getElementById('customColumnSelector');
        const headers = DataManager.getHeaders();
        if (columnSelector) {
            columnSelector.innerHTML = headers.map(h => `
                <label>
                    <input type="checkbox" value="${h}" checked>
                    ${this.escapeHtml(h)}
                </label>
            `).join('');
        }

        // Render export history
        this.renderExportHistory();
    },

    /**
     * Render export history
     */
    renderExportHistory() {
        const historyList = document.getElementById('exportHistory');
        const history = ConfigManager.getExportHistory();

        if (history.length === 0) {
            historyList.innerHTML = `
                <li class="empty-state">
                    <span class="empty-icon">📁</span>
                    <p>Chưa có export nào</p>
                </li>
            `;
            return;
        }

        historyList.innerHTML = history.slice(0, 10).map(exp => {
            const time = new Date(exp.timestamp).toLocaleString('vi-VN');
            return `
                <li>
                    <div>
                        <strong>${exp.filename || 'Unknown'}</strong>
                        <br><small>${exp.type} - ${exp.rows} rows</small>
                    </div>
                    <small>${time}</small>
                </li>
            `;
        }).join('');
    },

    /**
     * Render config page
     */
    renderConfig() {
        const config = ConfigManager.getAll();
        const headers = DataManager.getHeaders();

        // Generate column options
        const columnOptions = headers.length > 0
            ? headers.map((h, i) => ({ value: ConfigManager.indexToCol(i), label: `${ConfigManager.indexToCol(i)} - ${h}` }))
            : ConfigManager.generateColumnOptions();

        const optionsHtml = columnOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');

        // Update selects
        ['configSourceCol', 'configContentCol', 'configBatchCol', 'configEmailCol', 'configEmailBatchCol', 'configEmailLinkCol'].forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                select.innerHTML = optionsHtml;
            }
        });

        // Set values
        document.getElementById('configSourceCol').value = config.SOURCE_COL;
        document.getElementById('configContentCol').value = config.CONTENT_COL;
        document.getElementById('configBatchCol').value = config.BATCH_COL;
        document.getElementById('configEmailCol').value = config.EMAIL_COL;
        document.getElementById('configEmailBatchCol').value = config.EMAIL_BATCH_COL;
        document.getElementById('configEmailLinkCol').value = config.EMAIL_LINK_COL;

        document.getElementById('templateText').value = config.TEMPLATE_TEXT || '';
        document.getElementById('configOverwriteBatch').checked = config.OVERWRITE_BATCH;
        document.getElementById('configExportAfterMark').checked = config.EXPORT_AFTER_MARK;
        document.getElementById('configDefaultLimit').value = config.DEFAULT_LIMIT;

        // Render template library
        this.renderTemplateLibrary();
    },

    /**
     * Render template library
     */
    renderTemplateLibrary() {
        const templateList = document.getElementById('templateList');
        const templates = ConfigManager.getTemplates();

        if (templates.length === 0) {
            templateList.innerHTML = '<p style="color: var(--text-secondary);">Chưa có template nào.</p>';
            return;
        }

        templateList.innerHTML = templates.map(t => `
            <div class="template-item">
                <span class="template-name">${this.escapeHtml(t.name)}</span>
                <div class="template-actions">
                    <button class="btn btn-sm btn-outline" onclick="loadTemplate(${t.id})">Load</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTemplate(${t.id})">×</button>
                </div>
            </div>
        `).join('');
    },

    /**
     * Show toast notification
     */
    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toastContainer');

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <div class="toast-content">
                <span class="toast-message">${message}</span>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    /**
     * Update file info display
     */
    updateFileInfo() {
        const fileInfo = DataManager.getFileInfo();
        const fileInfoEl = document.getElementById('fileInfo');

        if (fileInfo.name) {
            fileInfoEl.innerHTML = `
                <span class="file-name">${this.escapeHtml(fileInfo.name)}</span>
                <span class="file-rows">(${DataManager.getRowCount()} rows)</span>
            `;
        } else {
            fileInfoEl.innerHTML = '<span class="file-name">No file loaded</span>';
        }
    },

    /**
     * Escape HTML
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Format number with commas
     */
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
};

if (typeof window !== 'undefined') {
    window.UIRenderer = UIRenderer;
}
