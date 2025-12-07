/**
 * FW Tools - Data Collection Pro
 * Main Application Entry Point
 */

// ===== Global State =====
let currentView = 'dashboard';
let pendingFile = null;

// ===== Pagination State =====
let paginationState = {
    currentPage: 1,
    rowsPerPage: 100,
    totalRows: 0,
    totalPages: 1
};

// ===== Column Visibility State =====
let visibleColumns = new Set(); // All visible by default
let columnVisibilityInitialized = false; // Track if user has modified

// ===== Starred Projects Key (declared early for use by renderProjectsList) =====
const STARRED_PROJECTS_KEY = 'fw_tools_starred_projects';

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    // Initialize modules
    ConfigManager.init();
    DataManager.init();
    FilterEngine.init();
    UIRenderer.init();

    // Initialize StorageManager (for server persistence)
    if (typeof StorageManager !== 'undefined') {
        StorageManager.init();
    }

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

// ===== Project Management =====
function handleProjectSelect(projectName) {
    if (projectName) {
        StorageManager.loadProject(projectName);
    }
}

function saveCurrentProject() {
    if (!DataManager.hasData()) {
        UIRenderer.showToast('Không có dữ liệu để lưu.', 'warning');
        return;
    }

    let projectName = StorageManager.currentProject;

    if (!projectName) {
        projectName = prompt('Nhập tên project:');
        if (!projectName) return;
    }

    StorageManager.saveProject(projectName);
}

function createNewProject() {
    if (DataManager.hasData() && !confirm('Tạo project mới sẽ xóa dữ liệu hiện tại. Tiếp tục?')) {
        return;
    }

    const projectName = prompt('Nhập tên project mới:');
    if (!projectName) return;

    DataManager.clear();
    StorageManager.currentProject = projectName;
    StorageManager.isDirty = false;
    StorageManager.updateSaveIndicator('saved');

    document.getElementById('projectSelect').value = '';
    UIRenderer.updateFileInfo();
    UIRenderer.renderDataTable();
    UIRenderer.showToast(`Project "${projectName}" đã được tạo. Import file để bắt đầu.`, 'info');
}

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
        urlImport: 'URL Import',
        projects: 'Projects',
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
        case 'urlImport':
            // Render URL import table if data exists
            if (urlImportState.data.length > 0) {
                renderUrlDataTable();
            }
            loadUrlHistoryList();
            break;
        case 'projects':
            renderProjectsList();
            break;
        case 'data':
            UIRenderer.renderDataTable();
            UIRenderer.renderFilterConditions();
            renderProjectInfoPanel();
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

    // Auto-save logic - save immediately to ensure persistence
    if (typeof StorageManager !== 'undefined') {
        // If no project selected, use filename
        if (!StorageManager.currentProject) {
            StorageManager.currentProject = pendingFile.name.split('.')[0];
        }
        // Save immediately, don't wait for auto-save delay
        StorageManager.saveProject();
    }

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
    } else if (type === 'email') {
        result = BatchManager.markEmailBatch(limit, indices);
    } else if (type === 'remind_sms') {
        result = BatchManager.markRemindSmsBatch(limit, indices);
    } else if (type === 'remind_email') {
        result = BatchManager.markRemindEmailBatch(limit, indices);
    }

    if (result.success) {
        UIRenderer.showToast(result.message, 'success');
        UIRenderer.renderDataTable();
        UIRenderer.renderDashboard();
        updateUndoRedoButtons();

        // Update delete batch dropdown
        if (typeof updateDeleteBatchDropdown === 'function') {
            updateDeleteBatchDropdown();
        }

        // Trigger auto-save
        if (typeof StorageManager !== 'undefined') {
            StorageManager.markDirty();
        }

        // Auto export if configured
        const config = ConfigManager.getAll();
        if (config.EXPORT_AFTER_MARK) {
            if (type === 'sms') {
                ExportManager.exportSmsBatch(result.newBatch);
            } else if (type === 'email') {
                ExportManager.exportEmailBatch(result.newBatch);
            }
            // Remind exports? Assuming not needed for now or handled manually
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
        REMIND_SMS_BATCH_COL: document.getElementById('configRemindSmsBatchCol').value,
        REMIND_EMAIL_BATCH_COL: document.getElementById('configRemindEmailBatchCol').value,
        STATUS_COL: document.getElementById('configStatusCol').value,
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
        // Do NOT auto-close here - let callback control when to close
        // This allows form values to be read before modal closes
        if (onConfirm) onConfirm();
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
    document.getElementById('urlImportPanel').style.display = type === 'url' ? 'block' : 'none';
    document.getElementById('apiImportPanel').style.display = type === 'api' ? 'block' : 'none';

    // Load API credentials if switching to API tab
    if (type === 'api') {
        loadApiCredentials();
        updatePlidColumnSelect();
    }
}

// ===== Import from URL =====
async function importFromUrl() {
    const url = document.getElementById('importUrl').value.trim();

    if (!url) {
        UIRenderer.showToast('Vui lòng nhập URL.', 'warning');
        return;
    }

    const progress = document.getElementById('urlImportProgress');
    const progressFill = document.getElementById('urlProgressFill');
    const progressText = document.getElementById('urlProgressText');

    progress.style.display = 'block';
    progressFill.style.width = '30%';
    progressText.textContent = 'Đang tải từ URL...';

    try {
        // Use CORS proxy
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch URL');
        }

        progressFill.style.width = '60%';
        progressText.textContent = 'Đang parse dữ liệu...';

        let workbook;
        if (result.encoding === 'base64') {
            // Excel file
            const binary = atob(result.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            workbook = XLSX.read(bytes, { type: 'array' });
        } else {
            // CSV/text file
            workbook = XLSX.read(result.data, { type: 'string' });
        }

        progressFill.style.width = '80%';
        progressText.textContent = 'Đang import...';

        // Parse data
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (!jsonData || jsonData.length === 0) {
            throw new Error('File is empty or invalid');
        }

        const headers = jsonData[0].map(h => String(h).trim());
        const data = jsonData.slice(1).map((row, i) => {
            const obj = { _rowIndex: i };
            headers.forEach((h, j) => {
                obj[h] = row[j] !== undefined ? row[j] : '';
            });
            return obj;
        });

        DataManager.setData(headers, data, result.filename || 'URL Import');

        // Auto-save logic - save immediately to ensure persistence
        if (typeof StorageManager !== 'undefined') {
            if (!StorageManager.currentProject) {
                StorageManager.currentProject = result.filename || 'URL Import';
            }
            // Save immediately, don't wait for auto-save delay
            StorageManager.saveProject();
        }

        progressFill.style.width = '100%';
        progressText.textContent = 'Hoàn thành!';

        UIRenderer.showToast(`Import thành công ${data.length} dòng từ URL.`, 'success');
        addNotification(`Import ${data.length} rows từ URL`, '🌐');

        // Switch to data view
        setTimeout(() => {
            progress.style.display = 'none';
            switchView('data');
        }, 1000);

    } catch (error) {
        console.error('URL import error:', error);
        UIRenderer.showToast(`Lỗi: ${error.message}`, 'error');
        progress.style.display = 'none';
    }
}

window.importFromUrl = importFromUrl;

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
    const container = input.closest('.multi-select-dropdown');
    const options = container.querySelectorAll('.multi-select-options .dropdown-item');

    options.forEach(opt => {
        const text = opt.querySelector('span').textContent.toLowerCase();
        opt.style.display = text.includes(filter) ? 'flex' : 'none';
    });
};

// Select All / Deselect All in multi-select
window.selectAllMulti = function (conditionId, dropdownId, selectAll) {
    const container = document.getElementById(dropdownId);
    if (!container) return;

    const checkboxes = container.querySelectorAll('.multi-select-options input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = selectAll;
    });

    // Update trigger text and filter condition
    const values = selectAll
        ? Array.from(checkboxes).map(cb => cb.value)
        : [];

    const trigger = container.querySelector('.multi-select-trigger');
    if (trigger) {
        trigger.textContent = values.length > 0 ? `${values.length} selected` : 'Select values...';
    }

    FilterEngine.updateCondition(parseFloat(conditionId), { value: values });
};

// Select only currently visible/matched items
window.selectMatchedMulti = function (conditionId, dropdownId) {
    const container = document.getElementById(dropdownId);
    if (!container) return;

    const checkboxes = container.querySelectorAll('.multi-select-options .dropdown-item');
    const values = [];

    checkboxes.forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        // Only select visible items
        if (item.style.display !== 'none') {
            checkbox.checked = true;
            values.push(checkbox.value);
        }
    });

    const trigger = container.querySelector('.multi-select-trigger');
    if (trigger) {
        trigger.textContent = values.length > 0 ? `${values.length} selected` : 'Select values...';
    }

    FilterEngine.updateCondition(parseFloat(conditionId), { value: values });
};

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select-container')) {
        document.querySelectorAll('.multi-select-dropdown').forEach(d => {
            d.style.display = 'none';
        });
    }
    // Also close column visibility panel
    if (!e.target.closest('.column-visibility-dropdown')) {
        const panel = document.getElementById('columnVisibilityPanel');
        if (panel) panel.style.display = 'none';
    }
});

// ===== Shuffle Data =====
function shuffleData() {
    if (!DataManager.hasData()) {
        UIRenderer.showToast('Không có dữ liệu để shuffle.', 'warning');
        return;
    }

    DataManager.saveUndoState();

    // Fisher-Yates shuffle
    const data = DataManager.data;
    for (let i = data.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [data[i], data[j]] = [data[j], data[i]];
    }

    // Re-assign row indices
    data.forEach((row, index) => {
        row._rowIndex = index;
    });

    UIRenderer.renderDataTable();
    UIRenderer.showToast(`Đã shuffle ${data.length} dòng dữ liệu!`, 'success');

    // Mark dirty for auto-save
    if (typeof StorageManager !== 'undefined') {
        StorageManager.markDirty();
    }
}

// ===== Pagination =====
function updatePagination(filteredData = null) {
    const data = filteredData || DataManager.getData();
    paginationState.totalRows = data.length;
    paginationState.totalPages = Math.ceil(data.length / paginationState.rowsPerPage) || 1;

    // Ensure current page is valid
    if (paginationState.currentPage > paginationState.totalPages) {
        paginationState.currentPage = paginationState.totalPages;
    }
    if (paginationState.currentPage < 1) {
        paginationState.currentPage = 1;
    }

    renderPaginationControls();
}

function renderPaginationControls() {
    const { currentPage, totalPages, rowsPerPage, totalRows } = paginationState;

    // Update page info
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }

    // Update visible/total count
    const start = (currentPage - 1) * rowsPerPage + 1;
    const end = Math.min(currentPage * rowsPerPage, totalRows);
    document.getElementById('visibleCount').textContent = totalRows > 0 ? `${start}-${end}` : '0';
    document.getElementById('totalCount').textContent = totalRows;

    // Enable/disable buttons
    document.getElementById('pageFirst').disabled = currentPage === 1;
    document.getElementById('pagePrev').disabled = currentPage === 1;
    document.getElementById('pageNext').disabled = currentPage === totalPages;
    document.getElementById('pageLast').disabled = currentPage === totalPages;

    // Render page numbers
    const numbersContainer = document.getElementById('pageNumbers');
    if (numbersContainer) {
        numbersContainer.innerHTML = '';
        const maxButtons = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);
        startPage = Math.max(1, endPage - maxButtons + 1);

        for (let i = startPage; i <= endPage; i++) {
            const btn = document.createElement('button');
            btn.className = `btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline'}`;
            btn.textContent = i;
            btn.onclick = () => goToPage(i);
            numbersContainer.appendChild(btn);
        }
    }
}

function goToPage(action) {
    const { currentPage, totalPages } = paginationState;

    if (action === 'first') {
        paginationState.currentPage = 1;
    } else if (action === 'prev') {
        paginationState.currentPage = Math.max(1, currentPage - 1);
    } else if (action === 'next') {
        paginationState.currentPage = Math.min(totalPages, currentPage + 1);
    } else if (action === 'last') {
        paginationState.currentPage = totalPages;
    } else if (typeof action === 'number') {
        paginationState.currentPage = action;
    }

    UIRenderer.renderDataTable();
}

function changeRowsPerPage(value) {
    paginationState.rowsPerPage = parseInt(value);
    paginationState.currentPage = 1;
    UIRenderer.renderDataTable();
}

// ===== Column Visibility =====
function initColumnVisibility() {
    const headers = DataManager.getHeaders();
    visibleColumns = new Set(headers); // All visible by default
    renderColumnVisibilityList();
}

function renderColumnVisibilityList() {
    const list = document.getElementById('columnVisibilityList');
    if (!list) return;

    const headers = DataManager.getHeaders();
    list.innerHTML = headers.map(col => `
        <label>
            <input type="checkbox" 
                ${visibleColumns.has(col) ? 'checked' : ''} 
                onchange="toggleColumn('${col}', this.checked)">
            <span>${col}</span>
        </label>
    `).join('');
}

function toggleColumn(column, visible) {
    if (visible) {
        visibleColumns.add(column);
    } else {
        visibleColumns.delete(column);
    }
    UIRenderer.renderDataTable();
}

function toggleAllColumns(showAll) {
    columnVisibilityInitialized = true; // User has explicitly modified
    if (showAll) {
        visibleColumns = new Set(DataManager.getHeaders());
    } else {
        visibleColumns = new Set(); // Empty set = show nothing
    }
    renderColumnVisibilityList();
    UIRenderer.renderDataTable();
}

// Toggle column visibility panel
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('columnVisibilityBtn');
    if (btn) {
        btn.onclick = (e) => {
            e.stopPropagation();
            const panel = document.getElementById('columnVisibilityPanel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        };
    }
});

// Make functions global
window.shuffleData = shuffleData;
window.goToPage = goToPage;
window.changeRowsPerPage = changeRowsPerPage;
window.toggleColumn = toggleColumn;
window.toggleAllColumns = toggleAllColumns;
window.initColumnVisibility = initColumnVisibility;
window.updatePagination = updatePagination;

// ===== Notification System =====
let notifications = [];

function addNotification(title, icon = '📢') {
    const notification = {
        id: Date.now(),
        title,
        icon,
        time: new Date(),
        read: false
    };
    notifications.unshift(notification);
    updateNotificationBadge();
    renderNotifications();
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    const unreadCount = notifications.filter(n => !n.read).length;
    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

function renderNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    if (notifications.length === 0) {
        list.innerHTML = '<div class="notification-empty">Không có thông báo mới</div>';
        return;
    }

    list.innerHTML = notifications.slice(0, 20).map(n => {
        const timeStr = n.time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="notification-item ${n.read ? '' : 'unread'}" onclick="markNotificationRead(${n.id})">
                <span class="notification-icon">${n.icon}</span>
                <div class="notification-content">
                    <div class="notification-title">${n.title}</div>
                    <div class="notification-time">${timeStr}</div>
                </div>
            </div>
        `;
    }).join('');
}

function toggleNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function markNotificationRead(id) {
    const n = notifications.find(n => n.id === id);
    if (n) n.read = true;
    updateNotificationBadge();
    renderNotifications();
}

function clearNotifications() {
    notifications = [];
    updateNotificationBadge();
    renderNotifications();
}

// ===== Delete Batch =====
function updateDeleteBatchDropdown() {
    const typeSelect = document.getElementById('deleteBatchType');
    const numberSelect = document.getElementById('deleteBatchNumber');
    if (!typeSelect || !numberSelect) return;

    const type = typeSelect.value;
    const batches = type === 'sms' ? DataManager.getSmsBatches() : DataManager.getEmailBatches();

    numberSelect.innerHTML = '<option value="">-- Select --</option>' +
        batches.map(b => `<option value="${b}">Batch ${b}</option>`).join('');
}

function deleteBatchAction() {
    const type = document.getElementById('deleteBatchType').value;
    const batchNumber = parseInt(document.getElementById('deleteBatchNumber').value);

    if (!batchNumber) {
        UIRenderer.showToast('Vui lòng chọn batch để xóa.', 'warning');
        return;
    }

    if (!confirm(`Bạn có chắc muốn xóa ${type.toUpperCase()} Batch ${batchNumber}?`)) {
        return;
    }

    let result;
    if (type === 'sms') {
        result = BatchManager.deleteSmsBatch(batchNumber);
    } else {
        result = BatchManager.deleteEmailBatch(batchNumber);
    }

    if (result.success) {
        UIRenderer.showToast(result.message, 'success');
        addNotification(`Đã xóa ${type.toUpperCase()} Batch ${batchNumber}`, '🗑️');
        UIRenderer.renderDataTable();
        UIRenderer.renderDashboard();
        updateDeleteBatchDropdown();

        if (typeof StorageManager !== 'undefined') {
            StorageManager.markDirty();
        }
    } else {
        UIRenderer.showToast(result.message, 'error');
    }
}

// Update dropdown when type changes
document.addEventListener('DOMContentLoaded', () => {
    const typeSelect = document.getElementById('deleteBatchType');
    if (typeSelect) {
        typeSelect.addEventListener('change', updateDeleteBatchDropdown);
    }
});

// Close notification panel when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.notification-bell')) {
        const panel = document.getElementById('notificationPanel');
        if (panel) panel.style.display = 'none';
    }
});

// Make functions global
window.toggleNotificationPanel = toggleNotificationPanel;
window.clearNotifications = clearNotifications;
window.markNotificationRead = markNotificationRead;
window.addNotification = addNotification;
window.updateDeleteBatchDropdown = updateDeleteBatchDropdown;
window.deleteBatchAction = deleteBatchAction;

// ===== URL Import Module =====
const URL_DEFAULT_COLUMNS = [
    'Response ID', 'status', 'source', 'db.mobile',
    'prov_name', 'age_group', 'gender', 'sguid.plid'
];

const urlImportState = {
    data: [],
    headers: [],
    visibleColumns: new Set(),
    filteredData: [],
    filterColumn: '',
    selectedFilterValues: new Set(),
    currentPage: 1,
    rowsPerPage: 100,
    totalPages: 1,
    projectName: '',
    currentUrl: ''
};

const URL_HISTORY_KEY = 'fw_tools_url_history';

// Initialize history on load
document.addEventListener('DOMContentLoaded', () => {
    loadUrlHistoryList();
});

async function importUrlModule() {
    const url = document.getElementById('urlModuleInput').value.trim();
    const projectName = document.getElementById('urlProjectName')?.value.trim() || '';

    if (!url) {
        UIRenderer.showToast('Vui lòng nhập URL.', 'warning');
        return;
    }

    const progress = document.getElementById('urlModuleProgress');
    const progressFill = document.getElementById('urlModuleProgressFill');
    const progressText = document.getElementById('urlModuleProgressText');

    progress.style.display = 'block';
    progressFill.style.width = '30%';
    progressText.textContent = 'Đang tải từ URL...';

    try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch URL');
        }

        progressFill.style.width = '60%';
        progressText.textContent = 'Đang parse dữ liệu...';

        let workbook;
        if (result.encoding === 'base64') {
            const binary = atob(result.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            workbook = XLSX.read(bytes, { type: 'array' });
        } else {
            workbook = XLSX.read(result.data, { type: 'string' });
        }

        progressFill.style.width = '80%';
        progressText.textContent = 'Đang xử lý...';

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (!jsonData || jsonData.length === 0) {
            throw new Error('File is empty or invalid');
        }

        urlImportState.headers = jsonData[0].map(h => String(h).trim());
        urlImportState.data = jsonData.slice(1);
        urlImportState.filteredData = urlImportState.data;
        // Set default visible columns (only include if header exists)
        const defaultCols = urlImportState.headers.filter(h => URL_DEFAULT_COLUMNS.includes(h));
        urlImportState.visibleColumns = new Set(defaultCols.length > 0 ? defaultCols : urlImportState.headers);
        urlImportState.filterColumn = '';
        urlImportState.filterValue = '';
        urlImportState.currentPage = 1;
        urlImportState.currentUrl = url;
        urlImportState.projectName = projectName;

        // Save to history
        saveUrlToHistory(url, projectName || result.filename || url, urlImportState.data.length);

        progressFill.style.width = '100%';
        progressText.textContent = 'Hoàn thành!';

        setTimeout(() => {
            progress.style.display = 'none';
            initUrlFilters();
            initUrlColumnVisibility();
            renderUrlDataTable();
        }, 500);

        UIRenderer.showToast(`Import thành công ${urlImportState.data.length} dòng.`, 'success');
        addNotification(`Import ${urlImportState.data.length} rows: ${projectName || 'URL'}`, '🌐');

    } catch (error) {
        console.error('URL import error:', error);
        UIRenderer.showToast(`Lỗi: ${error.message}`, 'error');
        progress.style.display = 'none';
    }
}

function initUrlFilters() {
    const colSelect = document.getElementById('urlFilterColumn');
    if (!colSelect) return;

    colSelect.innerHTML = '<option value="">-- Lọc theo cột --</option>' +
        urlImportState.headers.map(h => `<option value="${h}">${truncateText(h, 20)}</option>`).join('');

    // Reset filter values list
    const valuesList = document.getElementById('urlFilterValuesList');
    if (valuesList) valuesList.innerHTML = '';

    const filterBtn = document.getElementById('urlFilterValBtn');
    if (filterBtn) filterBtn.textContent = 'Chọn giá trị ▼';
}

function updateUrlFilterValues() {
    const col = document.getElementById('urlFilterColumn').value;
    const valSelect = document.getElementById('urlFilterValue');

    if (!col) {
        document.getElementById('urlFilterValuesList').innerHTML = '';
        document.getElementById('urlFilterValBtn').textContent = 'Chọn giá trị ▼';
        return;
    }

    const colIndex = urlImportState.headers.indexOf(col);
    const uniqueVals = [...new Set(urlImportState.data.map(row => String(row[colIndex] || '')))].sort();

    // Reset selected filter values
    urlImportState.selectedFilterValues = new Set();
    urlImportState.filterColumn = col;

    // Render checkbox list
    document.getElementById('urlFilterValuesList').innerHTML = uniqueVals.slice(0, 100).map(v => `
        <label title="${v}">
            <input type="checkbox" data-value="${v.replace(/"/g, '&quot;')}" onchange="toggleUrlFilterValue(this)">
            <span>${truncateText(v, 25) || '(empty)'}</span>
        </label>
    `).join('');

    document.getElementById('urlFilterValBtn').textContent = 'Chọn giá trị ▼';
}

function toggleUrlFilterPanel() {
    const panel = document.getElementById('urlFilterPanel');
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
}

function toggleUrlFilterValue(checkbox) {
    const val = checkbox.dataset.value;
    if (checkbox.checked) {
        urlImportState.selectedFilterValues.add(val);
    } else {
        urlImportState.selectedFilterValues.delete(val);
    }
}

function toggleUrlFilterAll(selectAll) {
    const checkboxes = document.querySelectorAll('#urlFilterValuesList input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = selectAll;
        if (selectAll) urlImportState.selectedFilterValues.add(cb.dataset.value);
    });
    if (!selectAll) urlImportState.selectedFilterValues = new Set();
}

function applyUrlMultiFilter() {
    const selected = urlImportState.selectedFilterValues;

    if (!urlImportState.filterColumn || selected.size === 0) {
        urlImportState.filteredData = urlImportState.data;
        document.getElementById('urlFilterValBtn').textContent = 'Tất cả';
    } else {
        const colIndex = urlImportState.headers.indexOf(urlImportState.filterColumn);
        urlImportState.filteredData = urlImportState.data.filter(row =>
            selected.has(String(row[colIndex] || ''))
        );
        document.getElementById('urlFilterValBtn').textContent = `${selected.size} đã chọn`;
    }

    urlImportState.currentPage = 1;
    document.getElementById('urlFilterPanel').style.display = 'none';
    renderUrlDataTable();
}

function clearUrlFilter() {
    document.getElementById('urlFilterColumn').value = '';
    document.getElementById('urlFilterValuesList').innerHTML = '';
    document.getElementById('urlFilterValBtn').textContent = 'Chọn giá trị ▼';
    urlImportState.filterColumn = '';
    urlImportState.selectedFilterValues = new Set();
    urlImportState.filteredData = urlImportState.data;
    urlImportState.currentPage = 1;
    renderUrlDataTable();
}

function initUrlColumnVisibility() {
    const list = document.getElementById('urlColumnList');
    list.innerHTML = urlImportState.headers.map(col => `
        <label title="${col}">
            <input type="checkbox" ${urlImportState.visibleColumns.has(col) ? 'checked' : ''} 
                onchange="toggleUrlColumn('${col}', this.checked)">
            <span>${truncateText(col, 18)}</span>
        </label>
    `).join('');
}

function toggleUrlColumnPanel() {
    const panel = document.getElementById('urlColVisPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function toggleUrlColumn(col, visible) {
    if (visible) urlImportState.visibleColumns.add(col);
    else urlImportState.visibleColumns.delete(col);
    renderUrlDataTable();
}

function toggleUrlAllColumns(showAll) {
    if (showAll) urlImportState.visibleColumns = new Set(urlImportState.headers);
    else urlImportState.visibleColumns = new Set();
    initUrlColumnVisibility();
    renderUrlDataTable();
}

function renderUrlDataTable() {
    const tableHead = document.getElementById('urlDataTableHead');
    const tableBody = document.getElementById('urlDataTableBody');
    const dataCard = document.getElementById('urlDataCard');
    const dataInfo = document.getElementById('urlDataInfo');
    const dataTitle = document.getElementById('urlDataTitle');

    if (!urlImportState.data.length) return;

    dataCard.style.display = 'block';
    if (urlImportState.projectName) {
        dataTitle.textContent = `📊 ${urlImportState.projectName}`;
    }

    // Get visible headers
    const visHeaders = urlImportState.headers.filter(h => urlImportState.visibleColumns.has(h));
    const visIndices = visHeaders.map(h => urlImportState.headers.indexOf(h));

    // Calculate pagination
    const totalRows = urlImportState.filteredData.length;
    urlImportState.totalPages = Math.ceil(totalRows / urlImportState.rowsPerPage) || 1;

    // Render headers with tooltip
    tableHead.innerHTML = `<tr><th>#</th>${visHeaders.map(h =>
        `<th title="${h}">${truncateText(h, 15)}</th>`
    ).join('')}</tr>`;

    // Render rows
    const start = (urlImportState.currentPage - 1) * urlImportState.rowsPerPage;
    const end = Math.min(start + urlImportState.rowsPerPage, totalRows);
    const pageData = urlImportState.filteredData.slice(start, end);

    tableBody.innerHTML = pageData.map((row, i) => {
        const rowNum = start + i + 1;
        return `<tr><td class="row-number">${rowNum}</td>${visIndices.map(idx => {
            const val = String(row[idx] || '');
            return `<td title="${escapeHtml(val)}">${escapeHtml(truncateText(val, 20))}</td>`;
        }).join('')}</tr>`;
    }).join('');

    // Update info
    const filtered = urlImportState.filterValue ? ` (đã lọc từ ${urlImportState.data.length})` : '';
    dataInfo.textContent = `${start + 1}-${end} / ${totalRows} dòng${filtered}`;
    document.getElementById('urlPaginationInfo').textContent = `Page ${urlImportState.currentPage} / ${urlImportState.totalPages}`;

    renderUrlPageNumbers();
}

function truncateText(text, maxLen) {
    if (!text) return '';
    return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
}

function renderUrlPageNumbers() {
    const container = document.getElementById('urlPageNumbers');
    const current = urlImportState.currentPage;
    const total = urlImportState.totalPages;

    let pages = [];
    for (let i = Math.max(1, current - 2); i <= Math.min(total, current + 2); i++) {
        pages.push(i);
    }

    container.innerHTML = pages.map(p =>
        `<button class="btn btn-xs ${p === current ? 'btn-primary' : 'btn-outline'}" onclick="goToUrlPage(${p})">${p}</button>`
    ).join('');
}

function goToUrlPage(page) {
    if (page === 'first') urlImportState.currentPage = 1;
    else if (page === 'prev') urlImportState.currentPage = Math.max(1, urlImportState.currentPage - 1);
    else if (page === 'next') urlImportState.currentPage = Math.min(urlImportState.totalPages, urlImportState.currentPage + 1);
    else if (page === 'last') urlImportState.currentPage = urlImportState.totalPages;
    else urlImportState.currentPage = page;

    renderUrlDataTable();
}

function changeUrlRowsPerPage(value) {
    urlImportState.rowsPerPage = parseInt(value);
    urlImportState.currentPage = 1;
    renderUrlDataTable();
}

function saveUrlToHistory(url, projectName, rowCount) {
    let history = JSON.parse(localStorage.getItem(URL_HISTORY_KEY) || '[]');

    // Extract base URL for comparison (without query params for Google Sheets etc)
    const getBaseUrl = (urlStr) => {
        try {
            const urlObj = new URL(urlStr);
            return urlObj.origin + urlObj.pathname;
        } catch {
            return urlStr;
        }
    };

    const baseUrl = getBaseUrl(url);

    // Remove existing entry with same base URL OR same project name (if provided)
    history = history.filter(h => {
        const existingBase = getBaseUrl(h.url);
        const sameBaseUrl = existingBase === baseUrl;
        const sameProject = projectName && h.projectName && h.projectName === projectName;
        return !sameBaseUrl && !sameProject;
    });

    // Add new entry at the beginning
    history.unshift({
        url,
        projectName,
        rowCount,
        timestamp: new Date().toISOString()
    });

    // Keep only last 20 items (increased from 10)
    history = history.slice(0, 20);
    localStorage.setItem(URL_HISTORY_KEY, JSON.stringify(history));
    loadUrlHistoryList();
}

function loadUrlHistoryList() {
    const listContainer = document.getElementById('urlHistoryList');
    if (!listContainer) return;

    const history = JSON.parse(localStorage.getItem(URL_HISTORY_KEY) || '[]');

    if (history.length === 0) {
        listContainer.innerHTML = '<div class="url-history-empty">Chưa có lịch sử import</div>';
        return;
    }

    listContainer.innerHTML = history.map((h, i) => {
        const date = new Date(h.timestamp).toLocaleDateString('vi-VN');
        const time = new Date(h.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const name = h.projectName || 'Unknown';
        return `
            <div class="url-history-item" onclick="loadUrlHistoryItem(${i})">
                <div class="url-history-info">
                    <div class="url-history-name" title="${h.url}">${name}</div>
                    <div class="url-history-meta">
                        <span>${h.rowCount} rows</span>
                        <span>${date} ${time}</span>
                    </div>
                </div>
                <button class="url-history-delete" onclick="event.stopPropagation(); deleteUrlHistoryItem(${i})" title="Xóa">✕</button>
            </div>
        `;
    }).join('');
}

async function loadUrlHistoryItem(index) {
    const history = JSON.parse(localStorage.getItem(URL_HISTORY_KEY) || '[]');
    const item = history[index];

    if (item) {
        document.getElementById('urlModuleInput').value = item.url;
        if (document.getElementById('urlProjectName')) {
            document.getElementById('urlProjectName').value = item.projectName || '';
        }
        // Hide history panel
        const panel = document.getElementById('urlHistoryList');
        if (panel) panel.style.display = 'none';
        document.getElementById('urlHistoryToggleIcon').textContent = '▼';

        await importUrlModule();
    }
}

function deleteUrlHistoryItem(index) {
    let history = JSON.parse(localStorage.getItem(URL_HISTORY_KEY) || '[]');
    const deleted = history[index];

    if (deleted && confirm(`Xóa "${deleted.projectName || 'Unknown'}" khỏi lịch sử?`)) {
        history.splice(index, 1);
        localStorage.setItem(URL_HISTORY_KEY, JSON.stringify(history));
        loadUrlHistoryList();
        UIRenderer.showToast('Đã xóa khỏi lịch sử', 'info');
    }
}

function toggleUrlHistoryPanel() {
    const panel = document.getElementById('urlHistoryList');
    const icon = document.getElementById('urlHistoryToggleIcon');

    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        icon.textContent = '▲';
        loadUrlHistoryList(); // Refresh list when opening
    } else {
        panel.style.display = 'none';
        icon.textContent = '▼';
    }
}

function clearAllUrlHistory() {
    const history = JSON.parse(localStorage.getItem(URL_HISTORY_KEY) || '[]');

    if (history.length === 0) {
        UIRenderer.showToast('Lịch sử đã trống', 'info');
        return;
    }

    if (confirm(`Xóa tất cả ${history.length} mục trong lịch sử?`)) {
        localStorage.removeItem(URL_HISTORY_KEY);
        loadUrlHistoryList();
        UIRenderer.showToast('Đã xóa tất cả lịch sử', 'success');
    }
}

// Make URL history functions global
window.loadUrlHistoryItem = loadUrlHistoryItem;
window.deleteUrlHistoryItem = deleteUrlHistoryItem;
window.toggleUrlHistoryPanel = toggleUrlHistoryPanel;
window.clearAllUrlHistory = clearAllUrlHistory;

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Close panels when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.url-visibility-dropdown')) {
        const panel = document.getElementById('urlColVisPanel');
        if (panel) panel.style.display = 'none';
    }
});

// Make URL module functions global
window.importUrlModule = importUrlModule;
window.goToUrlPage = goToUrlPage;
window.changeUrlRowsPerPage = changeUrlRowsPerPage;
window.loadUrlHistory = loadUrlHistory;
window.updateUrlFilterValues = updateUrlFilterValues;
window.toggleUrlFilterPanel = toggleUrlFilterPanel;
window.toggleUrlFilterValue = toggleUrlFilterValue;
window.toggleUrlFilterAll = toggleUrlFilterAll;
window.applyUrlMultiFilter = applyUrlMultiFilter;
window.clearUrlFilter = clearUrlFilter;
window.toggleUrlColumnPanel = toggleUrlColumnPanel;
window.toggleUrlColumn = toggleUrlColumn;
window.toggleUrlAllColumns = toggleUrlAllColumns;

// ===== Starred Projects =====
// STARRED_PROJECTS_KEY is declared at top of file

function getStarredProjects() {
    return JSON.parse(localStorage.getItem(STARRED_PROJECTS_KEY) || '[]');
}

function saveStarredProjects(projects) {
    localStorage.setItem(STARRED_PROJECTS_KEY, JSON.stringify(projects));
}

function isProjectStarred(projectName) {
    return getStarredProjects().includes(projectName);
}

function toggleStarProject(projectName) {
    let starred = getStarredProjects();
    if (starred.includes(projectName)) {
        starred = starred.filter(p => p !== projectName);
        UIRenderer.showToast(`Đã bỏ sao: ${projectName}`, 'info');
    } else {
        starred.push(projectName);
        UIRenderer.showToast(`Đã gắn sao: ${projectName}`, 'success');
    }
    saveStarredProjects(starred);
    renderStarredProjects();
    updateProjectStarButton();
    // Also refresh Projects tab list
    if (typeof renderProjectsList === 'function') {
        renderProjectsList();
    }
}

function renderStarredProjects() {
    const container = document.getElementById('starredProjectsList');
    if (!container) return;

    const starred = getStarredProjects();

    if (starred.length === 0) {
        container.innerHTML = '<p class="no-starred">Chưa có dự án nào được gắn sao. Click ⭐ bên cạnh tên dự án để thêm.</p>';
        return;
    }

    container.innerHTML = starred.map(name => `
        <div class="starred-project-item" onclick="loadStarredProject('${name}')">
            <img src="assets/icons/star.png" alt="★" class="star-icon">
            <span class="project-name">${name}</span>
            <button class="btn btn-xs unstar-btn" onclick="event.stopPropagation(); toggleStarProject('${name}')">✕</button>
        </div>
    `).join('');
}

function loadStarredProject(projectName) {
    const projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
        // Find and select the project
        const options = Array.from(projectSelect.options);
        const option = options.find(o => o.text === projectName || o.value.includes(projectName));
        if (option) {
            projectSelect.value = option.value;
            handleProjectSelect(option.value);
        } else {
            UIRenderer.showToast(`Không tìm thấy project: ${projectName}`, 'warning');
        }
    }
}

function updateProjectStarButton() {
    const currentProject = document.getElementById('projectSelect')?.selectedOptions[0]?.text;
    const starBtn = document.getElementById('projectStarBtn');
    if (starBtn && currentProject && currentProject !== '-- Chọn Project --') {
        const isStarred = isProjectStarred(currentProject);
        starBtn.innerHTML = isStarred ? '⭐' : '☆';
        starBtn.classList.toggle('starred', isStarred);
        starBtn.style.display = 'inline-block';
        // Show delete button too
        const deleteBtn = document.getElementById('deleteProjectBtn');
        if (deleteBtn) deleteBtn.style.display = 'inline-block';
    } else if (starBtn) {
        starBtn.style.display = 'none';
        const deleteBtn = document.getElementById('deleteProjectBtn');
        if (deleteBtn) deleteBtn.style.display = 'none';
    }
}

async function deleteCurrentProject() {
    const projectSelect = document.getElementById('projectSelect');
    const selectedOption = projectSelect?.selectedOptions[0];

    if (!selectedOption || !selectedOption.value) {
        UIRenderer.showToast('Vui lòng chọn project để xóa.', 'warning');
        return;
    }

    const projectName = selectedOption.value; // value is the project name
    const displayName = selectedOption.text;

    if (!confirm(`Bạn có chắc chắn muốn xóa project "${displayName}"?\nHành động này không thể hoàn tác.`)) {
        return;
    }

    try {
        // Delete from Vercel Blob using correct endpoint
        const response = await fetch(`/api/projects/delete?name=${encodeURIComponent(projectName)}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Failed to delete project');
        }

        // Remove from starred projects
        let starred = getStarredProjects();
        starred = starred.filter(p => p !== displayName);
        saveStarredProjects(starred);

        // Remove from dropdown
        projectSelect.removeChild(selectedOption);
        projectSelect.value = '';

        // Reset UI
        updateProjectStarButton();
        renderStarredProjects();

        // Clear current data if this was the current project
        if (StorageManager.currentProject === projectName) {
            StorageManager.currentProject = null;
            DataManager.clear();
            UIRenderer.renderDataTable();
            UIRenderer.updateFileInfo();
        }

        UIRenderer.showToast(`Đã xóa project: ${displayName}`, 'success');
        addNotification(`Xóa project: ${displayName}`, '🗑️');

    } catch (error) {
        console.error('Delete project error:', error);
        UIRenderer.showToast(`Lỗi: ${error.message}`, 'error');
    }
}

// Initialize starred projects on load
document.addEventListener('DOMContentLoaded', () => {
    renderStarredProjects();
    if (typeof ProjectManager !== 'undefined') {
        ProjectManager.init();
    }
});

// Make starred functions global
window.toggleStarProject = toggleStarProject;
window.loadStarredProject = loadStarredProject;
window.renderStarredProjects = renderStarredProjects;
window.updateProjectStarButton = updateProjectStarButton;
window.deleteCurrentProject = deleteCurrentProject;

// ===== Project Management Module =====
var selectedProjectId = null;

async function renderProjectsList() {
    const listContainer = document.getElementById('projectsList');
    const countBadge = document.getElementById('projectCount');
    if (!listContainer || typeof ProjectManager === 'undefined') return;

    // Get projects directly from cache
    const projects = ProjectManager.getAllProjects();
    countBadge.textContent = projects.length;

    if (projects.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📂</span>
                <p>Chưa có project nào</p>
                <div class="empty-state-actions" style="display: flex; gap: 10px; justify-content: center; margin-top: 10px;">
                    <button class="btn btn-outline" onclick="openProjectModal()">
                        Tạo project đầu tiên
                    </button>
                    <button class="btn btn-sm btn-ghost" onclick="ProjectManager.syncFromServer()">
                        🔄 Tải lại
                    </button>
                </div>
            </div>
        `;
        return;
    }

    const activeId = ProjectManager.activeProjectId;

    listContainer.innerHTML = projects.map(p => {
        if (!p) return ''; // Skip invalid items

        const isActive = p.id === activeId;
        const isSelected = p.id === selectedProjectId;
        const isStarred = isProjectStarred(p.name);
        const quotaInfo = p.quotas && p.quotas.length > 0
            ? `${p.quotas.reduce((s, q) => s + q.count, 0)}/${p.quotas.reduce((s, q) => s + q.limit, 0)}`
            : '';

        // Escape special characters in name for HTML attributes
        const safeName = (p.name || 'Unnamed').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeId = (p.id || '').replace(/'/g, "\\'");

        return `
            <div class="project-item ${isSelected ? 'active' : ''}" onclick="selectProject('${safeId}')">
                <div class="project-item-icon">📊</div>
                <div class="project-item-info">
                    <div class="project-item-name">
                        ${p.isCached ? '<span title="Đã tải sẵn (nhanh)" style="color: #f59e0b; margin-right: 4px;">⚡</span>' : ''}
                        ${p.name || 'Unnamed'}
                    </div>
                    <div class="project-item-meta">
                        <span>Survey: ${p.surveyId || '-'}</span>
                        ${quotaInfo ? `<span>${quotaInfo}</span>` : ''}
                    </div>
                </div>
                <div class="project-item-actions">
                    <span class="project-star ${isStarred ? 'starred' : ''}" 
                          onclick="event.stopPropagation(); toggleStarProject('${safeName}')"
                          title="${isStarred ? 'Bỏ sao' : 'Gắn sao'}">${isStarred ? '⭐' : '☆'}</span>
                    ${isActive ? '<span class="project-item-badge active">Active</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
}

function selectProject(projectId) {
    selectedProjectId = projectId;
    renderProjectsList();
    renderProjectDetail(projectId);

    // Auto-refresh quota status if project has surveyId
    const project = ProjectManager.getProject(projectId);
    if (project && project.surveyId && typeof AlchemerAPI !== 'undefined' && AlchemerAPI.isConfigured()) {
        // Auto-fetch quotas in background
        setTimeout(() => {
            refreshProjectQuotas();
        }, 300);
    }
}

function renderProjectDetail(projectId) {
    const detailCard = document.getElementById('projectDetailCard');
    const noSelected = document.getElementById('noProjectSelected');

    if (!projectId || typeof ProjectManager === 'undefined') {
        detailCard.style.display = 'none';
        noSelected.style.display = 'block';
        return;
    }

    const project = ProjectManager.getProject(projectId);
    if (!project) {
        detailCard.style.display = 'none';
        noSelected.style.display = 'block';
        return;
    }

    detailCard.style.display = 'block';
    noSelected.style.display = 'none';

    // Update detail fields
    document.getElementById('projectDetailTitle').textContent = project.name;
    document.getElementById('projectSurveyId').textContent = project.surveyId || '-';
    document.getElementById('projectTarget').textContent = project.target ? `${project.target} responses` : '-';
    document.getElementById('projectCriteria').textContent = project.criteria || 'Chưa có tiêu chí';

    // Notes section
    const notesSection = document.getElementById('projectNotesSection');
    const notesText = document.getElementById('projectNotes');
    if (project.notes) {
        notesSection.style.display = 'block';
        notesText.textContent = project.notes;
    } else {
        notesSection.style.display = 'none';
    }

    // Last fetch time
    const lastFetch = document.getElementById('quotaLastFetch');
    if (project.lastQuotaFetch) {
        const date = new Date(project.lastQuotaFetch);
        lastFetch.textContent = `Cập nhật: ${date.toLocaleString('vi-VN')}`;
    } else {
        lastFetch.textContent = 'Chưa fetch';
    }

    // Render quotas
    renderProjectQuotas(project);

    // Render data info
    const dataInfoContainer = document.getElementById('projectDataInfo');
    if (dataInfoContainer) {
        if (project.dataInfo && project.dataInfo.fileName) {
            const importDate = new Date(project.dataInfo.importedAt).toLocaleString('vi-VN');
            dataInfoContainer.innerHTML = `
                <div class="data-info-content">
                    <p><strong>File:</strong> ${project.dataInfo.fileName}</p>
                    <p><strong>Số dòng:</strong> ${project.dataInfo.rowCount || 0}</p>
                    <p><strong>Import lúc:</strong> ${importDate}</p>
                </div>
                <button class="btn btn-sm btn-outline" onclick="loadProjectData('${projectId}')">
                    📂 Load Data
                </button>
            `;
        } else {
            dataInfoContainer.innerHTML = '<p class="no-data-text">Chưa có data. Click "Import Data" để thêm.</p>';
        }
    }
}

function renderProjectQuotas(project) {
    const quotaList = document.getElementById('projectQuotaList');
    const quotaSummary = document.getElementById('quotaSummary');

    if (!project.quotas || project.quotas.length === 0) {
        quotaList.innerHTML = `
            <div class="empty-state small">
                <p>Click "Refresh" để lấy quota từ Alchemer</p>
            </div>
        `;
        quotaSummary.style.display = 'none';
        return;
    }

    const renderItem = (q) => {
        const percent = q.limit > 0 ? Math.round((q.count / q.limit) * 100) : 0;
        let progressClass = 'low';
        if (percent >= 100) progressClass = 'complete';
        else if (percent >= 70) progressClass = 'high';
        else if (percent >= 40) progressClass = 'medium';

        return `
            <div class="quota-item">
                <div class="quota-item-header">
                    <span class="quota-item-name">${q.name}</span>
                    <span class="quota-item-count">${q.count}/${q.limit} (còn ${q.remaining})</span>
                </div>
                <div class="quota-progress">
                    <div class="quota-progress-fill ${progressClass}" style="width: ${Math.min(percent, 100)}%"></div>
                </div>
            </div>
        `;
    };

    const MAX_VISIBLE = 5;
    const items = project.quotas;
    const visibleItems = items.slice(0, MAX_VISIBLE);
    const hiddenItems = items.slice(MAX_VISIBLE);
    const hasHidden = hiddenItems.length > 0;

    let html = visibleItems.map(renderItem).join('');

    if (hasHidden) {
        html += `
            <div id="quotaDetailsProjects" class="collapsed">
                ${hiddenItems.map(renderItem).join('')}
            </div>
            <div class="quota-action-row" style="text-align: center; margin-top: 8px;">
                <button class="btn btn-sm btn-link" id="quotaExpandBtnProjects" onclick="toggleQuotaDetails('projects')" style="text-decoration: none; color: var(--primary-color);">
                    ▼ Xem thêm (${hiddenItems.length})
                </button>
            </div>
        `;
    }

    quotaList.innerHTML = html;

    // Summary
    const totalCompleted = project.quotas.reduce((s, q) => s + q.count, 0);
    const totalRemaining = project.quotas.reduce((s, q) => s + q.remaining, 0);

    document.getElementById('quotaTotalCompleted').textContent = totalCompleted;
    document.getElementById('quotaTotalRemaining').textContent = totalRemaining;
    quotaSummary.style.display = 'flex';
}

async function refreshProjectQuotas() {
    if (!selectedProjectId) {
        UIRenderer.showToast('Vui lòng chọn project', 'warning');
        return;
    }

    const btn = document.getElementById('refreshQuotaBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Loading...';

    try {
        const result = await ProjectManager.fetchQuotas(selectedProjectId);
        renderProjectDetail(selectedProjectId);
        UIRenderer.showToast(`Đã cập nhật ${result.quotas.length} quotas`, 'success');
    } catch (error) {
        console.error('Fetch quotas error:', error);
        UIRenderer.showToast(`Lỗi: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Refresh';
    }
}

function openProjectModal(editId = null) {
    const project = editId ? ProjectManager.getProject(editId) : null;
    const isEdit = !!project;

    const modalBody = `
        <div class="form-group">
            <label>Tên Project *</label>
            <input type="text" id="projectNameInput" class="form-control" 
                value="${isEdit ? project.name : ''}" placeholder="VD: Survey ABC - Wave 1">
        </div>
        <div class="form-group">
            <label>Survey ID (Alchemer)</label>
            <input type="text" id="projectSurveyIdInput" class="form-control" 
                value="${isEdit ? project.surveyId : ''}" placeholder="VD: 8154556">
        </div>
        <div class="form-group">
            <label>Target (số người)</label>
            <input type="number" id="projectTargetInput" class="form-control" 
                value="${isEdit ? project.target : ''}" placeholder="VD: 500">
        </div>
        <div class="form-group">
            <label>Tiêu chí dự án</label>
            <textarea id="projectCriteriaInput" class="form-control" rows="3" 
                placeholder="VD: Nam/Nữ 18-45, TPHCM, thu nhập 10-20tr">${isEdit ? project.criteria : ''}</textarea>
        </div>
        <div class="form-group">
            <label>Ghi chú</label>
            <textarea id="projectNotesInput" class="form-control" rows="2" 
                placeholder="VD: Ưu tiên nhóm 25-35 tuổi">${isEdit ? project.notes : ''}</textarea>
        </div>
    `;

    openModal(
        isEdit ? 'Chỉnh sửa Project' : 'Tạo Project mới',
        modalBody,
        () => saveProjectFromModal(editId)
    );
}

async function saveProjectFromModal(editId = null) {
    const name = document.getElementById('projectNameInput').value.trim();
    const surveyId = document.getElementById('projectSurveyIdInput').value.trim();
    const target = document.getElementById('projectTargetInput').value;
    const criteria = document.getElementById('projectCriteriaInput').value.trim();
    const notes = document.getElementById('projectNotesInput').value.trim();

    if (!name) {
        UIRenderer.showToast('Vui lòng nhập tên project', 'warning');
        return;
    }

    if (editId) {
        await ProjectManager.updateProject(editId, { name, surveyId, target, criteria, notes });
        UIRenderer.showToast('Đã cập nhật project', 'success');
    } else {
        const newProject = await ProjectManager.createProject({ name, surveyId, target, criteria, notes });
        selectedProjectId = newProject.id;
        UIRenderer.showToast('Đã tạo project mới', 'success');
    }

    closeModal();
    await renderProjectsList();
    if (selectedProjectId) {
        renderProjectDetail(selectedProjectId);
    }
}

function editCurrentProject() {
    if (selectedProjectId) {
        openProjectModal(selectedProjectId);
    }
}

async function deleteCurrentProjectMgmt() {
    if (!selectedProjectId) return;

    const project = ProjectManager.getProject(selectedProjectId);
    if (!project) return;

    if (confirm(`Xóa project "${project.name}"?\nHành động này không thể hoàn tác.`)) {
        try {
            await ProjectManager.deleteProject(selectedProjectId);
            selectedProjectId = null;
            renderProjectsList();
            renderProjectDetail(null);
            UIRenderer.showToast('Đã xóa project', 'success');
        } catch (error) {
            console.error('Delete project failed:', error);
            UIRenderer.showToast(`Lỗi xóa project: ${error.message}`, 'error');
        }
    }
}

function setAsActiveProject() {
    if (!selectedProjectId) return;

    const project = ProjectManager.getProject(selectedProjectId);
    if (!project) return;

    ProjectManager.setActiveProject(selectedProjectId);
    renderProjectsList();
    UIRenderer.showToast('Đã set project active', 'success');

    // Update project info panel in data view
    renderProjectInfoPanel();

    // Also sync with StorageManager for Filter & Batch dropdown
    StorageManager.currentProject = project.name;
    StorageManager.loadProjectList();
}

// Project Info Panel for Data View
function renderProjectInfoPanel() {
    const container = document.getElementById('projectInfoPanelContainer');
    if (!container || typeof ProjectManager === 'undefined') return;

    const activeProject = ProjectManager.getActiveProject();
    if (!activeProject) {
        container.innerHTML = '';
        return;
    }

    const summary = ProjectManager.getQuotaSummary(activeProject.id);
    const quotas = activeProject.quotas || [];
    const showCollapsed = quotas.length > 3; // Collapse if more than 3 quotas

    // Build quota details HTML
    let quotaDetailsHtml = '';
    if (quotas.length > 0) {
        quotaDetailsHtml = quotas.map(q => {
            const percent = q.limit > 0 ? Math.round((q.count / q.limit) * 100) : 0;
            const barClass = percent >= 100 ? 'complete' : percent >= 80 ? 'near' : '';
            return `
                <div class="quota-item-mini">
                    <span class="quota-name">${q.name}</span>
                    <span class="quota-count">${q.count}/${q.limit}</span>
                    <div class="quota-bar-mini ${barClass}">
                        <div class="quota-fill-mini" style="width: ${Math.min(100, percent)}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    container.innerHTML = `
        <div class="project-info-panel">
            <div class="project-info-panel-header" onclick="toggleProjectInfoPanel()">
                <h4>📋 ${activeProject.name}</h4>
                <button class="project-info-panel-toggle" id="projectInfoToggle">−</button>
            </div>
            <div class="project-info-panel-body" id="projectInfoBody">
                ${activeProject.criteria ? `<div class="info-line"><strong>📌 Tiêu chí:</strong> ${activeProject.criteria}</div>` : ''}
                ${activeProject.notes ? `<div class="info-line"><strong>💡</strong> ${activeProject.notes}</div>` : ''}
                ${summary ? `
                    <div class="quota-summary-mini">
                        <div class="quota-headline" onclick="toggleQuotaDetails('infoPanel')" style="cursor: pointer;">
                            <strong>📊 Quota:</strong>
                            <span class="quota-total">${summary.totalCompleted}/${summary.totalLimit}</span>
                            <span class="quota-remaining">(còn ${summary.totalRemaining})</span>
                            ${quotas.length > 0 ? `<span class="quota-expand-btn" id="quotaExpandBtnInfo">${showCollapsed ? '▶' : '▼'}</span>` : ''}
                        </div>
                        <div class="quota-progress-mini">
                            <div class="quota-bar-full" style="width: ${Math.min(100, Math.round((summary.totalCompleted / summary.totalLimit) * 100))}%"></div>
                        </div>
                        <div class="quota-details-mini ${showCollapsed ? 'collapsed' : ''}" id="quotaDetailsInfo">
                            ${quotaDetailsHtml}
                        </div>
                    </div>
                ` : '<div class="info-line"><em>Chưa có dữ liệu quota</em></div>'}
            </div>
        </div>
    `;
}

function toggleQuotaDetails(location) {
    const detailsId = location === 'infoPanel' ? 'quotaDetailsInfo' : 'quotaDetailsProjects';
    const btnId = location === 'infoPanel' ? 'quotaExpandBtnInfo' : 'quotaExpandBtnProjects';

    const details = document.getElementById(detailsId);
    const btn = document.getElementById(btnId);

    if (details && btn) {
        if (details.classList.contains('collapsed')) {
            details.classList.remove('collapsed');

            if (location === 'infoPanel') {
                btn.textContent = '▼';
            } else {
                btn.textContent = '▲ Thu gọn';
            }
        } else {
            details.classList.add('collapsed');

            if (location === 'infoPanel') {
                btn.textContent = '▶';
            } else {
                // Determine count if possible, or just "Xem thêm"
                const count = details.children.length;
                btn.textContent = `▼ Xem thêm (${count})`;
            }
        }
    }
}

window.toggleQuotaDetails = toggleQuotaDetails;

function toggleProjectInfoPanel() {
    const body = document.getElementById('projectInfoBody');
    const toggle = document.getElementById('projectInfoToggle');
    if (body && toggle) {
        if (body.style.display === 'none') {
            body.style.display = 'block';
            toggle.textContent = '−';
        } else {
            body.style.display = 'none';
            toggle.textContent = '+';
        }
    }
}

// Make project functions global
window.openProjectModal = openProjectModal;
window.selectProject = selectProject;
window.editCurrentProject = editCurrentProject;
window.deleteCurrentProjectMgmt = deleteCurrentProjectMgmt;
window.refreshProjectQuotas = refreshProjectQuotas;
window.setAsActiveProject = setAsActiveProject;
window.renderProjectsList = renderProjectsList;
window.renderProjectInfoPanel = renderProjectInfoPanel;
window.toggleProjectInfoPanel = toggleProjectInfoPanel;

// ===== Alchemer API Credentials =====
function loadAlchemerCredentialsForm() {
    if (typeof AlchemerAPI === 'undefined') return;

    const creds = AlchemerAPI.getCredentials();
    const tokenInput = document.getElementById('alchemerApiToken');
    const secretInput = document.getElementById('alchemerApiSecret');
    const statusBadge = document.getElementById('alchemerApiStatus');

    if (tokenInput && creds.apiToken) {
        tokenInput.value = creds.apiToken;
    }
    if (secretInput && creds.apiSecret) {
        secretInput.value = creds.apiSecret;
    }

    updateAlchemerApiStatus();
}

function updateAlchemerApiStatus() {
    const statusBadge = document.getElementById('alchemerApiStatus');
    if (!statusBadge || typeof AlchemerAPI === 'undefined') return;

    if (AlchemerAPI.isConfigured()) {
        statusBadge.textContent = '✓ Configured';
        statusBadge.classList.add('configured');
    } else {
        statusBadge.textContent = 'Not configured';
        statusBadge.classList.remove('configured');
    }
}

function saveAlchemerCredentials() {
    const apiToken = document.getElementById('alchemerApiToken').value.trim();
    const apiSecret = document.getElementById('alchemerApiSecret').value.trim();

    if (!apiToken || !apiSecret) {
        UIRenderer.showToast('Vui lòng nhập đầy đủ API Token và Secret', 'warning');
        return;
    }

    if (typeof AlchemerAPI === 'undefined') {
        UIRenderer.showToast('AlchemerAPI không khả dụng', 'error');
        return;
    }

    // Save credentials (surveyId can be empty for now)
    AlchemerAPI.saveCredentials(apiToken, apiSecret, AlchemerAPI.config.surveyId || '');

    updateAlchemerApiStatus();
    UIRenderer.showToast('Đã lưu API credentials', 'success');
}

async function testAlchemerConnection() {
    if (typeof AlchemerAPI === 'undefined') {
        UIRenderer.showToast('AlchemerAPI không khả dụng', 'error');
        return;
    }

    if (!AlchemerAPI.isConfigured()) {
        UIRenderer.showToast('Vui lòng lưu credentials trước', 'warning');
        return;
    }

    UIRenderer.showToast('Đang kiểm tra kết nối...', 'info');

    try {
        // Try to get account info or survey list to test connection
        const url = AlchemerAPI.buildUrl('/account');
        const response = await AlchemerAPI.fetchWithProxy(url);

        if (response.result_ok) {
            UIRenderer.showToast('✓ Kết nối thành công!', 'success');
        } else {
            UIRenderer.showToast('Lỗi: ' + (response.message || 'Connection failed'), 'error');
        }
    } catch (error) {
        console.error('Test connection error:', error);
        UIRenderer.showToast('Lỗi kết nối: ' + error.message, 'error');
    }
}

// Load credentials when config view is shown
document.addEventListener('DOMContentLoaded', () => {
    loadAlchemerCredentialsForm();
});

// Make Alchemer functions global
window.saveAlchemerCredentials = saveAlchemerCredentials;
window.testAlchemerConnection = testAlchemerConnection;
window.loadAlchemerCredentialsForm = loadAlchemerCredentialsForm;

// ===== Import Data for Projects =====
function importDataForProject() {
    if (!selectedProjectId) {
        UIRenderer.showToast('Vui lòng chọn project trước', 'warning');
        return;
    }

    // Trigger file input
    document.getElementById('projectFileInput').click();
}

async function handleProjectFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!selectedProjectId) {
        UIRenderer.showToast('Vui lòng chọn project trước', 'warning');
        return;
    }

    const project = ProjectManager.getProject(selectedProjectId);
    if (!project) {
        UIRenderer.showToast('Project không tồn tại', 'error');
        return;
    }

    UIRenderer.showToast('Đang import ' + file.name + '...', 'info');

    try {
        // Use DataManager to import the file
        const result = await DataManager.importFile(file);

        if (result.success) {
            // Set as active project first
            ProjectManager.setActiveProject(selectedProjectId);
            StorageManager.currentProject = project.name;

            // Render the data table immediately
            UIRenderer.renderDataTable();

            // Save data to server
            const saveResult = await StorageManager.saveProject(project.name);

            // Update project dataInfo locally (don't save to server again, just update local cache)
            const dataInfo = {
                fileName: file.name,
                rowCount: result.rows || DataManager.getData().length,
                importedAt: new Date().toISOString()
            };

            // Update local project cache with dataInfo
            const projectInCache = ProjectManager.getProject(project.id);
            if (projectInCache) {
                projectInCache.dataInfo = dataInfo;
            }

            // Refresh project detail to show data info
            renderProjectDetail(selectedProjectId);

            if (saveResult.success) {
                console.log('Project data saved to server');
            }
        } else {
            throw new Error(result.error || 'Import failed');
        }
    } catch (error) {
        console.error('Import error:', error);
        UIRenderer.showToast('Lỗi import: ' + error.message, 'error');
    }

    // Reset file input
    event.target.value = '';
}

function updateProjectDataInfo(projectId, dataInfo) {
    const project = ProjectManager.getProject(projectId);
    if (!project) return;

    // Directly update local cache (don't trigger server save)
    project.dataInfo = dataInfo;

    // Update UI
    const infoContainer = document.getElementById('projectDataInfo');
    if (infoContainer && dataInfo) {
        const importDate = new Date(dataInfo.importedAt).toLocaleString('vi-VN');
        infoContainer.innerHTML = `
            <div class="data-info-content">
                <p><strong>File:</strong> ${dataInfo.fileName}</p>
                <p><strong>Số dòng:</strong> ${dataInfo.rowCount}</p>
                <p><strong>Import lúc:</strong> ${importDate}</p>
            </div>
            <button class="btn btn-sm btn-outline" onclick="loadProjectData('${projectId}')">
                📂 Load Data
            </button>
        `;
    }
}

async function loadProjectData(projectId) {
    const project = ProjectManager.getProject(projectId);
    if (!project) {
        UIRenderer.showToast('Project không tồn tại', 'error');
        return;
    }

    UIRenderer.showToast('Đang load data...', 'info');

    try {
        const result = await StorageManager.loadProject(project.name);
        if (result.success) {
            // Set as active and switch view
            ProjectManager.setActiveProject(projectId);
            switchView('data');
            UIRenderer.showToast(`Đã load data cho project "${project.name}"`, 'success');
        } else {
            throw new Error(result.error || 'Load failed');
        }
    } catch (error) {
        console.error('Load error:', error);
        UIRenderer.showToast('Lỗi load data: ' + error.message, 'error');
    }
}

// Make project data functions global
window.importDataForProject = importDataForProject;
window.handleProjectFileImport = handleProjectFileImport;
window.updateProjectDataInfo = updateProjectDataInfo;
window.loadProjectData = loadProjectData;

