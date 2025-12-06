/**
 * Storage Manager - FW Tools
 * Handles saving/loading project data to/from server
 */

const StorageManager = {
    // API base URL - will be relative in production
    apiBase: '',

    // Current project state
    currentProject: null,
    isDirty: false,
    isSaving: false,

    // Auto-save settings
    autoSaveEnabled: true,
    autoSaveDelay: 5000, // 5 seconds
    autoSaveTimer: null,

    /**
     * Initialize Storage Manager
     */
    init() {
        // Detect if running on Vercel (has /api endpoints) or locally
        this.apiBase = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1'
            ? '' : '';

        console.log('StorageManager initialized');
        this.loadProjectList();
    },

    /**
     * Save current project to server
     */
    async saveProject(projectName = null) {
        const name = projectName || this.currentProject || 'untitled';

        if (!DataManager.hasData()) {
            UIRenderer.showToast('Không có dữ liệu để save.', 'warning');
            return { success: false, message: 'No data to save' };
        }

        this.isSaving = true;
        this.updateSaveIndicator('saving');

        try {
            const response = await fetch(`${this.apiBase}/api/projects/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    projectName: name,
                    headers: DataManager.getHeaders(),
                    data: DataManager.getData(),
                    metadata: {
                        fileInfo: DataManager.getFileInfo(),
                        config: ConfigManager.getAll()
                    }
                })
            });

            const result = await response.json();

            if (result.success) {
                this.currentProject = name;
                this.isDirty = false;
                this.updateSaveIndicator('saved');
                this.saveToLocalStorage(name); // Backup to localStorage
                UIRenderer.showToast(`Đã lưu project "${name}"`, 'success');
                this.loadProjectList(); // Refresh project list
                return { success: true, message: result.message };
            } else {
                throw new Error(result.error || 'Save failed');
            }

        } catch (error) {
            console.error('Save error:', error);
            this.updateSaveIndicator('error');

            // Fallback to localStorage
            this.saveToLocalStorage(name);
            UIRenderer.showToast(`Lỗi save server. Đã lưu local backup.`, 'warning');

            return { success: false, message: error.message };
        } finally {
            this.isSaving = false;
        }
    },

    /**
     * Load project from server
     */
    async loadProject(projectName) {
        if (!projectName) {
            UIRenderer.showToast('Vui lòng chọn project.', 'warning');
            return { success: false };
        }

        try {
            UIRenderer.showToast('Đang tải project...', 'info');

            const response = await fetch(`${this.apiBase}/api/projects/load?name=${encodeURIComponent(projectName)}`);
            const result = await response.json();

            if (result.success && result.project) {
                const { headers, data, metadata } = result.project;

                // Load data into DataManager
                DataManager.setData(headers, data, projectName);

                // Restore config if available
                if (metadata?.config) {
                    ConfigManager.updateConfig(metadata.config);
                }

                this.currentProject = projectName;
                this.isDirty = false;
                this.updateSaveIndicator('saved');

                // Update UI
                UIRenderer.updateFileInfo();
                UIRenderer.renderDataTable();
                UIRenderer.renderDashboard();

                UIRenderer.showToast(`Đã tải project "${projectName}" (${data.length} rows)`, 'success');
                return { success: true };
            } else {
                throw new Error(result.error || 'Load failed');
            }

        } catch (error) {
            console.error('Load error:', error);

            // Try loading from localStorage
            const localData = this.loadFromLocalStorage(projectName);
            if (localData) {
                UIRenderer.showToast('Đã tải từ local backup.', 'warning');
                return { success: true };
            }

            UIRenderer.showToast(`Lỗi tải project: ${error.message}`, 'error');
            return { success: false, message: error.message };
        }
    },

    /**
     * Get list of saved projects
     */
    async loadProjectList() {
        try {
            const response = await fetch(`${this.apiBase}/api/projects/list`);
            const result = await response.json();

            if (result.success) {
                this.renderProjectDropdown(result.projects);
                return result.projects;
            }
            return [];

        } catch (error) {
            console.error('List error:', error);
            // Try loading from localStorage
            const localProjects = this.getLocalProjects();
            if (localProjects.length > 0) {
                this.renderProjectDropdown(localProjects);
            }
            return [];
        }
    },

    /**
     * Delete a project
     */
    async deleteProject(projectName) {
        if (!confirm(`Xóa project "${projectName}"?`)) {
            return { success: false };
        }

        try {
            const response = await fetch(`${this.apiBase}/api/projects/delete?name=${encodeURIComponent(projectName)}`, {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                UIRenderer.showToast(`Đã xóa project "${projectName}"`, 'success');
                this.loadProjectList();

                if (this.currentProject === projectName) {
                    this.currentProject = null;
                    DataManager.clear();
                    UIRenderer.renderDataTable();
                }

                return { success: true };
            } else {
                throw new Error(result.error);
            }

        } catch (error) {
            console.error('Delete error:', error);
            UIRenderer.showToast(`Lỗi xóa project: ${error.message}`, 'error');
            return { success: false };
        }
    },

    /**
     * Mark data as changed (for auto-save)
     */
    markDirty() {
        this.isDirty = true;
        this.updateSaveIndicator('unsaved');

        // Trigger auto-save
        if (this.autoSaveEnabled && this.currentProject) {
            this.scheduleAutoSave();
        }
    },

    /**
     * Schedule auto-save
     */
    scheduleAutoSave() {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }

        this.autoSaveTimer = setTimeout(() => {
            if (this.isDirty && this.currentProject && !this.isSaving) {
                console.log('Auto-saving...');
                this.saveProject();
            }
        }, this.autoSaveDelay);
    },

    /**
     * Update save indicator UI
     */
    updateSaveIndicator(status) {
        const indicator = document.getElementById('saveIndicator');
        if (!indicator) return;

        const states = {
            saved: { text: '✓ Saved', class: 'saved' },
            saving: { text: '⏳ Saving...', class: 'saving' },
            unsaved: { text: '● Unsaved', class: 'unsaved' },
            error: { text: '⚠ Error', class: 'error' }
        };

        const state = states[status] || states.saved;
        indicator.textContent = state.text;
        indicator.className = `save-indicator ${state.class}`;
    },

    /**
     * Render project dropdown in UI
     */
    renderProjectDropdown(projects) {
        const select = document.getElementById('projectSelect');
        if (!select) return;

        const currentValue = select.value;

        select.innerHTML = '<option value="">-- Chọn Project --</option>';

        projects.forEach(project => {
            const name = project.name || project;
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            if (name === this.currentProject) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    },

    /**
     * LocalStorage fallback methods
     */
    saveToLocalStorage(projectName) {
        try {
            const projectData = {
                projectName,
                headers: DataManager.getHeaders(),
                data: DataManager.getData(),
                metadata: {
                    fileInfo: DataManager.getFileInfo(),
                    config: ConfigManager.getAll(),
                    savedAt: new Date().toISOString()
                }
            };
            localStorage.setItem(`fw_project_${projectName}`, JSON.stringify(projectData));

            // Update project list
            const list = this.getLocalProjects();
            if (!list.find(p => p.name === projectName)) {
                list.push({ name: projectName, savedAt: new Date().toISOString() });
                localStorage.setItem('fw_project_list', JSON.stringify(list));
            }
        } catch (e) {
            console.error('LocalStorage save error:', e);
        }
    },

    loadFromLocalStorage(projectName) {
        try {
            const data = localStorage.getItem(`fw_project_${projectName}`);
            if (data) {
                const project = JSON.parse(data);
                DataManager.setData(project.headers, project.data, projectName);
                if (project.metadata?.config) {
                    ConfigManager.updateConfig(project.metadata.config);
                }
                this.currentProject = projectName;
                UIRenderer.updateFileInfo();
                UIRenderer.renderDataTable();
                return true;
            }
        } catch (e) {
            console.error('LocalStorage load error:', e);
        }
        return false;
    },

    getLocalProjects() {
        try {
            return JSON.parse(localStorage.getItem('fw_project_list') || '[]');
        } catch {
            return [];
        }
    }
};

// Export for use
if (typeof window !== 'undefined') {
    window.StorageManager = StorageManager;
}
