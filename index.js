/**
 * FW Tools - Data Collection Pro
 * Main Application Entry Point
 */

// ===== Global State =====
let currentView = 'dashboard';
let pendingFile = null;

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    // Initialize modules
    ConfigManager.init();
    DataManager.init();
    FilterEngine.init();
    UIRenderer.init();

    // Setup event listeners
    setupNavigation();
    setupSidebar();
    setupThemeToggle();
    setupFileImport();
    setupFilterPanel();
    setupExportTabs();
    setupSearch();

    // Initial render
    UIRenderer.renderDashboard();
    UIRenderer.renderConfig();

    console.log('FW Tools initialized successfully');
});

// ===== Navigation =====
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            switchView(view);
        });
    });
}

function switchView(viewName) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}View`).classList.add('active');

    // Update title
    const titles = {
        dashboard: 'Dashboard',
        import: 'Import Data',
        data: 'Data View',
        export: 'Export',
        config: 'Configuration'
    };
    document.getElementById('pageTitle').textContent = titles[viewName] || viewName;

    // Refresh view content
    switch (viewName) {
        case 'dashboard':
            UIRenderer.renderDashboard();
            break;
        case 'data':
            UIRenderer.renderDataTable();
            UIRenderer.renderFilterConditions();
            break;
        case 'export':
            UIRenderer.renderExportOptions();
            break;
        case 'config':
            UIRenderer.renderConfig();
            break;
    }

    currentView = viewName;

    // Close mobile menu
    document.getElementById('sidebar').classList.remove('mobile-open');
}

// ===== Sidebar =====
function setupSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebarToggle');
    const mobileBtn = document.getElementById('mobileMenuBtn');

    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });

    mobileBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
    });
}

// ===== Theme Toggle =====
function setupThemeToggle() {
    const toggle = document.getElementById('themeToggle');
    const icon = toggle.querySelector('.theme-icon');

    // Set initial icon
    icon.textContent = ConfigManager.getTheme() === 'dark' ? '☀️' : '🌙';

    toggle.addEventListener('click', () => {
        const newTheme = ConfigManager.toggleTheme();
        icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    });
}

// ===== File Import =====
function setupFileImport() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    });

    // Click to select
    dropZone.addEventListener('click', (e) => {
        // Prevent duplicate trigger if clicking on the label or input itself
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL' || e.target.tagName === 'BUTTON' || e.target.closest('label') || e.target.closest('.btn')) {
            return;
        }
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFileSelect(file);
    });
}

async function handleFileSelect(file) {
    // Validate file type
    const validTypes = ['csv', 'xlsx', 'xls'];
    const ext = file.name.split('.').pop().toLowerCase();

    if (!validTypes.includes(ext)) {
        UIRenderer.showToast('File không hợp lệ. Chỉ hỗ trợ CSV, XLSX, XLS.', 'error');
        return;
    }

    pendingFile = file;

    // Show options
    document.getElementById('importOptions').style.display = 'block';

    // If Excel, we could show sheet selection
    // For now, just proceed
    await previewFile();
}

async function previewFile() {
    if (!pendingFile) return;

    try {
        const result = await DataManager.importFile(pendingFile, {
            headerRow: parseInt(document.getElementById('headerRow').value) || 1
        });

        // Show preview
        const previewDiv = document.getElementById('importPreview');
        const previewTable = document.getElementById('previewTable');
        const previewCount = document.getElementById('previewCount');

        previewDiv.style.display = 'block';
        previewCount.textContent = `${result.rows} rows, ${result.cols} columns`;

        // Render preview (first 10 rows)
        const headers = DataManager.getHeaders();
        const data = DataManager.getData().slice(0, 10);

        previewTable.querySelector('thead').innerHTML = `
            <tr>${headers.map(h => `<th>${UIRenderer.escapeHtml(h)}</th>`).join('')}</tr>
        `;

        previewTable.querySelector('tbody').innerHTML = data.map(row => `
            <tr>${headers.map(h => `<td>${UIRenderer.escapeHtml(String(row[h] || ''))}</td>`).join('')}</tr>
        `).join('');

    } catch (error) {
        UIRenderer.showToast(`Lỗi đọc file: ${error.message}`, 'error');
    }
}

function cancelImport() {
    pendingFile = null;
    document.getElementById('importOptions').style.display = 'none';
    document.getElementById('importPreview').style.display = 'none';
    DataManager.clear();
}

function confirmImport() {
    if (!DataManager.hasData()) {
        UIRenderer.showToast('Không có dữ liệu để import.', 'error');
        return;
    }

    // Log action
    ConfigManager.addActionHistory({
        type: 'import',
        filename: pendingFile.name,
        icon: '📥'
    });

    // Hide import UI
    document.getElementById('importOptions').style.display = 'none';
    document.getElementById('importPreview').style.display = 'none';

    // Update UI
    UIRenderer.updateFileInfo();
    UIRenderer.showToast(`Đã import ${DataManager.getRowCount()} dòng từ ${pendingFile.name}`, 'success');

    // Switch to data view
    switchView('data');

    pendingFile = null;
}

// ===== Filter Panel =====
function setupFilterPanel() {
    const filterToggle = document.getElementById('filterToggle');
    const filterPanel = document.getElementById('filterPanel');

    filterToggle.addEventListener('click', () => {
        const isVisible = filterPanel.style.display !== 'none';
        filterPanel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            UIRenderer.renderFilterConditions();
        }
    });

    // Filter preset
    document.getElementById('filterPreset').addEventListener('change', (e) => {
        if (e.target.value) {
            FilterEngine.loadPreset(e.target.value);
            UIRenderer.renderFilterConditions();
            applyFilters();
        }
    });
}

function addFilterCondition() {
    FilterEngine.addCondition();
    UIRenderer.renderFilterConditions();
}

function updateFilterCondition(id, field, value) {
    FilterEngine.updateCondition(id, { [field]: value });

    // Re-render if operator or column changes (to update inputs/datalists)
    if (field === 'operator' || field === 'column') {
        UIRenderer.renderFilterConditions();
    }
}

function removeFilterCondition(id) {
    FilterEngine.removeCondition(id);
    UIRenderer.renderFilterConditions();
    applyFilters();
}

function applyFilters() {
    FilterEngine.invalidateCache();
    UIRenderer.renderDataTable();
}

function clearFilters() {
    FilterEngine.clearConditions();
    FilterEngine.setSearchQuery('');
    document.getElementById('searchInput').value = '';
    UIRenderer.renderFilterConditions();
    UIRenderer.renderDataTable();
}

function saveFilterPreset() {
    const name = prompt('Nhập tên cho filter preset:');
    if (name) {
        FilterEngine.savePreset(name);
        UIRenderer.showToast('Đã lưu filter preset.', 'success');
    }
}

// ===== Search =====
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    let debounceTimer;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            FilterEngine.setSearchQuery(e.target.value);
            UIRenderer.renderDataTable();
        }, 300);
    });
}

// ===== Batch Operations =====
function markBatch(type, limit) {
    // Get visible indices if filter is active
    let indices = null;
    if (FilterEngine.hasActiveFilters()) {
        const filtered = FilterEngine.apply(DataManager.getData());
        indices = filtered.indices;
    }

    let result;
    if (type === 'sms') {
        result = BatchManager.markSmsBatch(limit, indices);
    } else {
        result = BatchManager.markEmailBatch(limit, indices);
    }

    if (result.success) {
        UIRenderer.showToast(result.message, 'success');
        UIRenderer.renderDataTable();
        UIRenderer.renderDashboard();
        updateUndoRedoButtons();

        // Auto export if configured
        const config = ConfigManager.getAll();
        if (config.EXPORT_AFTER_MARK) {
            if (type === 'sms') {
                ExportManager.exportSmsBatch(result.newBatch);
            } else {
                ExportManager.exportEmailBatch(result.newBatch);
            }
        }
    } else {
        UIRenderer.showToast(result.message, 'error');
    }
}

function markBatchPrompt(type) {
    const limit = prompt(`Nhập số dòng muốn mark ${type.toUpperCase()}:`, '500');
    if (limit) {
        const num = parseInt(limit);
        if (num > 0) {
            markBatch(type, num);
        } else {
            UIRenderer.showToast('Số không hợp lệ.', 'error');
        }
    }
}

// ===== Undo/Redo =====
function undoAction() {
    if (DataManager.undo()) {
        UIRenderer.showToast('Đã hoàn tác.', 'info');
        UIRenderer.renderDataTable();
        UIRenderer.renderDashboard();
        updateUndoRedoButtons();
    }
}

function redoAction() {
    if (DataManager.redo()) {
        UIRenderer.showToast('Đã redo.', 'info');
        UIRenderer.renderDataTable();
        UIRenderer.renderDashboard();
        updateUndoRedoButtons();
    }
}

function updateUndoRedoButtons() {
    document.getElementById('undoBtn').disabled = !DataManager.canUndo();
    document.getElementById('redoBtn').disabled = !DataManager.canRedo();
}

// ===== Export =====
function setupExportTabs() {
    document.querySelectorAll('.export-type-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.export-type-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.export-panel').forEach(p => p.style.display = 'none');
            document.getElementById(`${btn.dataset.type}ExportPanel`).style.display = 'block';
        });
    });

    // Batch select change handlers
    document.getElementById('smsBatchSelect').addEventListener('change', (e) => {
        const batch = parseInt(e.target.value);
        const rows = batch ? BatchManager.getSmsBatchRows(batch) : [];
        document.getElementById('smsExportCount').textContent = rows.length;
    });

    document.getElementById('emailBatchSelect').addEventListener('change', (e) => {
        const batch = parseInt(e.target.value);
        const rows = batch ? BatchManager.getEmailBatchRows(batch) : [];
        document.getElementById('emailExportCount').textContent = rows.length;
    });
}

function executeExport() {
    const activeTab = document.querySelector('.export-type-tabs .tab-btn.active').dataset.type;
    const format = document.getElementById('exportFormat').value;

    let result;

    switch (activeTab) {
        case 'sms':
            const smsBatch = parseInt(document.getElementById('smsBatchSelect').value);
            if (!smsBatch) {
                UIRenderer.showToast('Vui lòng chọn batch SMS.', 'warning');
                return;
            }
            result = ExportManager.exportSmsBatch(smsBatch);
            break;

        case 'email':
            const emailBatch = parseInt(document.getElementById('emailBatchSelect').value);
            if (!emailBatch) {
                UIRenderer.showToast('Vui lòng chọn batch Email.', 'warning');
                return;
            }
            result = ExportManager.exportEmailBatch(emailBatch);
            break;

        case 'custom':
            const selectedCols = Array.from(document.querySelectorAll('#customColumnSelector input:checked'))
                .map(cb => cb.value);
            const useFilter = document.getElementById('customExportFilter').value === 'visible';
            result = ExportManager.exportCustom({ columns: selectedCols, useFilter, format });
            break;
    }

    if (result.success) {
        UIRenderer.showToast(result.message, 'success');
        UIRenderer.renderExportHistory();
    } else {
        UIRenderer.showToast(result.message, 'error');
    }
}

function exportLatestBatch() {
    const latestSms = ExportManager.getLatestSmsBatch();
    const latestEmail = ExportManager.getLatestEmailBatch();

    if (!latestSms && !latestEmail) {
        UIRenderer.showToast('Chưa có batch nào để export.', 'warning');
        return;
    }

    // Export SMS if exists
    if (latestSms) {
        const result = ExportManager.exportSmsBatch(latestSms);
        UIRenderer.showToast(result.message, result.success ? 'success' : 'error');
    }
}

// ===== Config =====
function saveConfig() {
    const config = {
        SOURCE_COL: document.getElementById('configSourceCol').value,
        CONTENT_COL: document.getElementById('configContentCol').value,
        BATCH_COL: document.getElementById('configBatchCol').value,
        EMAIL_COL: document.getElementById('configEmailCol').value,
        EMAIL_BATCH_COL: document.getElementById('configEmailBatchCol').value,
        EMAIL_LINK_COL: document.getElementById('configEmailLinkCol').value,
        TEMPLATE_TEXT: document.getElementById('templateText').value,
        OVERWRITE_BATCH: document.getElementById('configOverwriteBatch').checked,
        EXPORT_AFTER_MARK: document.getElementById('configExportAfterMark').checked,
        DEFAULT_LIMIT: parseInt(document.getElementById('configDefaultLimit').value) || 500
    };

    ConfigManager.updateConfig(config);
    UIRenderer.showToast('Đã lưu cấu hình.', 'success');
}

function resetConfig() {
    if (confirm('Bạn có chắc muốn reset về cấu hình mặc định?')) {
        ConfigManager.resetToDefaults();
        UIRenderer.renderConfig();
        UIRenderer.showToast('Đã reset cấu hình.', 'info');
    }
}

function saveCurrentTemplate() {
    const text = document.getElementById('templateText').value;
    if (!text) {
        UIRenderer.showToast('Template đang trống.', 'warning');
        return;
    }

    const name = prompt('Nhập tên template:');
    if (name) {
        ConfigManager.addTemplate(name, text);
        UIRenderer.renderTemplateLibrary();
        UIRenderer.showToast('Đã lưu template.', 'success');
    }
}

function loadTemplate(id) {
    const template = ConfigManager.getTemplate(id);
    if (template) {
        document.getElementById('templateText').value = template.text;
        UIRenderer.showToast('Đã load template.', 'info');
    }
}

function deleteTemplate(id) {
    if (confirm('Xóa template này?')) {
        ConfigManager.deleteTemplate(id);
        UIRenderer.renderTemplateLibrary();
    }
}

// ===== Utility =====
function refreshData() {
    FilterEngine.invalidateCache();
    UIRenderer.renderDataTable();
}

// ===== Modal =====
function openModal(title, content, onConfirm) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = content;
    document.getElementById('modalOverlay').classList.add('active');

    const confirmBtn = document.getElementById('modalConfirm');
    confirmBtn.onclick = () => {
        if (onConfirm) onConfirm();
        closeModal();
    };
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

// Close modal on overlay click
document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') {
        closeModal();
    }
});

// ===== Import Tab Switch =====
function switchImportTab(type) {
    // Update tab buttons
    document.querySelectorAll('.import-type-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.importType === type);
    });

    // Update panels
    document.getElementById('fileImportPanel').style.display = type === 'file' ? 'block' : 'none';
    document.getElementById('apiImportPanel').style.display = type === 'api' ? 'block' : 'none';

    // Load API credentials if switching to API tab
    if (type === 'api') {
        loadApiCredentials();
        updatePlidColumnSelect();
    }
}

// ===== Alchemer API Functions =====
function loadApiCredentials() {
    if (typeof AlchemerAPI === 'undefined') {
        console.warn('AlchemerAPI not loaded');
        return;
    }

    AlchemerAPI.init();
    const creds = AlchemerAPI.getCredentials();

    document.getElementById('apiToken').value = creds.apiToken || '';
    document.getElementById('apiSecret').value = creds.apiSecret || '';
    document.getElementById('apiSurveyId').value = creds.surveyId || '';

    // Update status badge
    const statusBadge = document.getElementById('apiStatus');
    if (AlchemerAPI.isConfigured()) {
        statusBadge.textContent = '✅ Configured';
        statusBadge.classList.add('configured');
    } else {
        statusBadge.textContent = 'Not configured';
        statusBadge.classList.remove('configured');
    }
}

function saveApiCredentials() {
    const token = document.getElementById('apiToken').value.trim();
    const secret = document.getElementById('apiSecret').value.trim();
    const surveyId = document.getElementById('apiSurveyId').value.trim();

    if (!token || !secret) {
        UIRenderer.showToast('Vui lòng nhập API Token và Secret.', 'warning');
        return;
    }

    AlchemerAPI.saveCredentials(token, secret, surveyId);
    UIRenderer.showToast('Đã lưu API credentials.', 'success');
    loadApiCredentials();
}

async function testApiConnection() {
    if (!AlchemerAPI.isConfigured()) {
        UIRenderer.showToast('Vui lòng nhập và lưu credentials trước.', 'warning');
        return;
    }

    UIRenderer.showToast('Đang test connection...', 'info');

    try {
        const surveys = await AlchemerAPI.getSurveys();
        UIRenderer.showToast(`✅ Kết nối thành công! Tìm thấy ${surveys.length} surveys.`, 'success');
    } catch (error) {
        UIRenderer.showToast(`❌ Lỗi: ${error.message}`, 'error');
    }
}

function updatePlidColumnSelect() {
    const select = document.getElementById('plidColumnSelect');
    const headers = DataManager.getHeaders();

    select.innerHTML = '<option value="">-- Chọn cột chứa PLID --</option>';
    headers.forEach(h => {
        select.innerHTML += `<option value="${h}">${h}</option>`;
    });

    // Try to auto-select common plid column names
    const plidNames = ['plid', 'PLID', 'panelist_id', 'respondent_id', 'rid', 'uid'];
    for (const name of plidNames) {
        if (headers.includes(name)) {
            select.value = name;
            break;
        }
    }
}

async function fetchAndUpdateStatus() {
    const surveyId = document.getElementById('apiSurveyId').value.trim();
    const plidColumn = document.getElementById('plidColumnSelect').value;
    const statusColumn = document.getElementById('statusColumnName').value.trim() || 'Response_Status';

    if (!surveyId) {
        UIRenderer.showToast('Vui lòng nhập Survey ID.', 'warning');
        return;
    }

    if (!plidColumn) {
        UIRenderer.showToast('Vui lòng chọn cột PLID.', 'warning');
        return;
    }

    if (!DataManager.hasData()) {
        UIRenderer.showToast('Chưa có dữ liệu. Vui lòng import file trước.', 'warning');
        return;
    }

    const progressDiv = document.getElementById('apiProgress');
    const progressFill = document.getElementById('apiProgressFill');
    const progressText = document.getElementById('apiProgressText');
    const resultDiv = document.getElementById('apiResult');
    const fetchBtn = document.getElementById('fetchStatusBtn');

    // Show progress
    progressDiv.style.display = 'flex';
    resultDiv.style.display = 'none';
    fetchBtn.disabled = true;

    try {
        // Fetch status data from API
        const fetchResult = await AlchemerAPI.fetchStatusData(surveyId, (current, total) => {
            const percent = Math.round((current / total) * 100);
            progressFill.style.width = `${percent}%`;
            progressText.textContent = `${percent}% (${current}/${total})`;
        });

        UIRenderer.showToast(`Đã fetch ${fetchResult.totalResponses} responses từ API.`, 'success');

        // Apply status to data
        const applyResult = AlchemerAPI.applyStatusToData(plidColumn, statusColumn);

        // Show result
        resultDiv.style.display = 'block';
        resultDiv.className = 'api-result success';
        resultDiv.innerHTML = `
            <strong>✅ Hoàn thành!</strong><br>
            - Tổng từ API: ${fetchResult.totalResponses}<br>
            - Matched: ${applyResult.matched} / ${applyResult.total}<br>
            - Not found: ${applyResult.notFound}<br>
            - Complete: ${fetchResult.statuses.Complete}, Partial: ${fetchResult.statuses.Partial}, Disqualified: ${fetchResult.statuses.Disqualified}
        `;

        // Refresh data view
        UIRenderer.renderDataTable();
        UIRenderer.renderDashboard();
        updateUndoRedoButtons();

    } catch (error) {
        resultDiv.style.display = 'block';
        resultDiv.className = 'api-result error';
        resultDiv.innerHTML = `<strong>❌ Lỗi:</strong> ${error.message}`;
        UIRenderer.showToast(`Lỗi: ${error.message}`, 'error');
    } finally {
        fetchBtn.disabled = false;
    }
}

async function fetchFullSurveyData() {
    const surveyId = document.getElementById('apiSurveyId').value.trim();

    if (!surveyId) {
        UIRenderer.showToast('Vui lòng nhập Survey ID.', 'warning');
        return;
    }

    if (DataManager.hasData() && !confirm('Dữ liệu hiện tại sẽ bị thay thế. Tiếp tục?')) {
        return;
    }

    UIRenderer.showToast('Đang fetch data từ Alchemer...', 'info');

    try {
        // Fetch questions for better headers
        const questions = await AlchemerAPI.getSurveyQuestions(surveyId);

        // Fetch all responses
        const responses = await AlchemerAPI.fetchAllResponses(surveyId, (current, total) => {
            console.log(`Fetching: ${current}/${total}`);
        });

        // Convert to flat data
        const { headers, data } = AlchemerAPI.convertToFlatData(responses, questions);

        // Load into DataManager
        DataManager.setData(headers, data, `Alchemer Survey ${surveyId}`);

        UIRenderer.showToast(`Đã import ${data.length} responses từ Alchemer.`, 'success');
        UIRenderer.updateFileInfo();
        switchView('data');

    } catch (error) {
        UIRenderer.showToast(`Lỗi: ${error.message}`, 'error');
    }
}

// ===== Multi-Select Helper Functions =====
window.toggleMultiSelect = function (id) {
    const dropdown = document.querySelector(`#${id} .multi-select-dropdown`);
    const allDropdowns = document.querySelectorAll('.multi-select-dropdown');

    // Close others
    allDropdowns.forEach(d => {
        if (d !== dropdown) d.style.display = 'none';
    });

    // Toggle current
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
        if (dropdown.style.display === 'flex') {
            const search = dropdown.querySelector('.multi-select-search');
            if (search) search.focus();
        }
    }
};

window.updateMultiSelect = function (conditionId, checkbox) {
    const container = checkbox.closest('.multi-select-container');
    const checkedBoxes = container.querySelectorAll('input[type="checkbox"]:checked');
    const values = Array.from(checkedBoxes).map(cb => cb.value);

    // Update trigger text
    const trigger = container.querySelector('.multi-select-trigger');
    if (trigger) {
        trigger.textContent = values.length > 0
            ? `${values.length} selected`
            : 'Select values...';
    }

    // Update filter condition
    FilterEngine.updateCondition(parseFloat(conditionId), { value: values });
};

window.filterMultiSelectOptions = function (input) {
    const filter = input.value.toLowerCase();
    const options = input.nextElementSibling.querySelectorAll('.dropdown-item');

    options.forEach(opt => {
        const text = opt.querySelector('span').textContent.toLowerCase();
        opt.style.display = text.includes(filter) ? 'flex' : 'none';
    });
};

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select-container')) {
        document.querySelectorAll('.multi-select-dropdown').forEach(d => {
            d.style.display = 'none';
        });
    }
});
