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

        // Auto-load last project if exists
        this.autoLoadLastProject();

        // Setup unload warning
        this.setupBeforeUnload();
    },

    /**
     * Warn before closing if unsaved changes exist
     */
    setupBeforeUnload() {
        window.addEventListener('beforeunload', (e) => {
            if (this.isDirty) {
                // Cancel the event
                e.preventDefault();
                // Chrome requires returnValue to be set
                e.returnValue = '';
            }
        });
    },

    /**
     * Auto-load the last used project on page refresh
     */
    async autoLoadLastProject() {
        const lastProject = localStorage.getItem('fw_tools_last_project');
        console.log(`[StorageManager] Checking for last project: ${lastProject || 'none'}`);

        if (lastProject) {
            console.log(`[StorageManager] Will auto-load project: ${lastProject}`);
            // Delay slightly to ensure UI is ready
            setTimeout(async () => {
                try {
                    console.log(`[StorageManager] Starting loadProject for: ${lastProject}`);
                    // Load silently (no toast)
                    const result = await this.loadProject(lastProject, true);
                    console.log(`[StorageManager] loadProject result:`, result);

                    if (result.success) {
                        // Update the project dropdown selection
                        const projectSelect = document.getElementById('projectSelect');
                        if (projectSelect) {
                            projectSelect.value = lastProject;
                            // Trigger change event to let other components know
                            projectSelect.dispatchEvent(new Event('change'));
                        }
                        console.log(`[StorageManager] Auto-load complete. DataManager has ${DataManager.getRowCount()} rows`);
                    }
                } catch (error) {
                    console.error(`[StorageManager] Auto-load failed:`, error);
                }
            }, 500);
        } else {
            console.log(`[StorageManager] No last project found in localStorage`);
        }
    },

    saveLastProject(projectName) {
        if (projectName) {
            localStorage.setItem('fw_tools_last_project', projectName);
        }
    },

    async saveProject(projectNameInput = null) {
        const projectName = projectNameInput || this.currentProject;
        if (!projectName) {
            UIRenderer.showToast('Chưa chọn project để lưu', 'warning');
            return { success: false };
        }

        if (this.isSaving) return;
        this.isSaving = true;
        this.updateSaveIndicator('saving');

        try {
            console.log(`[StorageManager] Saving project: ${projectName}`);
            const data = DataManager.getData();
            const headers = DataManager.getHeaders();

            // Basic metadata
            const metadata = {
                fileInfo: DataManager.getFileInfo(),
                config: ConfigManager.getAll(),
                savedAt: new Date().toISOString()
            };

            // Call API
            const response = await fetch(`${this.apiBase}/api/projects/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectName,
                    data,
                    headers,
                    metadata
                })
            });

            const result = await response.json();

            if (result.success) {
                this.isDirty = false;
                this.updateSaveIndicator('saved');

                // Sync to ProjectManager
                if (result.url) {
                    await this.syncProjectToManager(projectName, result.url);
                }

                // Local backup
                this.saveToLocalStorage(projectName);

                // Only show toast if manual save (not auto-save triggered usually, but here we can show)
                // UIRenderer.showToast('Đã lưu project', 'success'); 
                return { success: true, url: result.url };
            } else {
                throw new Error(result.error || 'Unknown error');
            }

        } catch (error) {
            console.error('Save error:', error);
            this.updateSaveIndicator('error');
            UIRenderer.showToast(`Lỗi lưu project: ${error.message}`, 'error');
            return { success: false, error: error.message };
        } finally {
            this.isSaving = false;
        }
    },

    async syncProjectToManager(projectName, dataUrl) {
        if (typeof ProjectManager === 'undefined') return;

        // Check if project exists in ProjectManager
        const existingProjects = ProjectManager.getAllProjects();
        const existing = existingProjects.find(p => p.name === projectName);

        if (existing) {
            // Update local cache only (don't call updateProject which saves empty data)
            existing.dataFileUrl = dataUrl;
            existing.updatedAt = new Date().toISOString();
            ProjectManager.saveToLocalStorage();
        } else {
            // Add to local cache only - DO NOT call createProject() or saveProjectToServer()
            // because that would overwrite the blob we just saved with actual data
            const newProject = {
                id: ProjectManager.generateId(),
                name: projectName,
                surveyId: '',
                criteria: '',
                target: 0,
                notes: 'Auto-created from data save',
                dataFileUrl: dataUrl,
                quotas: [],
                lastQuotaFetch: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            ProjectManager.projects.unshift(newProject);
            ProjectManager.saveToLocalStorage();

            // Refresh the project dropdown
            if (typeof renderProjectsList === 'function') {
                renderProjectsList();
            }
        }
    },

    /**
     * Load project from server
     */
    async loadProject(projectName, silent = false) {
        if (!projectName) {
            if (!silent) UIRenderer.showToast('Vui lòng chọn project.', 'warning');
            return { success: false };
        }

        try {
            if (!silent) UIRenderer.showToast('Đang tải project...', 'info');

            // Quick Load: Check ProjectManager cache first
            if (typeof ProjectManager !== 'undefined') {
                const projects = ProjectManager.getAllProjects();
                const cached = projects.find(p => p.name === projectName);

                // If properly cached with data
                if (cached && cached.isCached && cached.data && cached.data.length > 0) {
                    console.log('[StorageManager] Fast loading from cache:', projectName);

                    DataManager.setHeaders(cached.headers || []);
                    DataManager.setData(cached.data || [], projectName);

                    // Restore config
                    if (cached.config) {
                        ConfigManager.updateConfig(cached.config);
                    }

                    this.currentProject = projectName;
                    this.isDirty = false;
                    this.updateSaveIndicator('saved');
                    this.saveLastProject(projectName);

                    // Update UI
                    UIRenderer.updateFileInfo();
                    UIRenderer.renderDataTable();
                    UIRenderer.renderDashboard();

                    // Sync with Project Detail UI
                    if (typeof window.updateProjectDataInfo === 'function') {
                        const dataInfo = {
                            fileName: cached.blobUrl || projectName,
                            rowCount: cached.data.length,
                            importedAt: cached.updatedAt || new Date().toISOString()
                        };
                        window.updateProjectDataInfo(cached.id, dataInfo);
                    }

                    if (!silent) UIRenderer.showToast(`Đã tải nhanh "${projectName}"`, 'success');
                    return { success: true };
                }
            }

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

                // Save as last project so we remember what was viewed for next time
                this.saveLastProject(projectName);

                // Update UI
                UIRenderer.updateFileInfo();
                UIRenderer.renderDataTable();
                UIRenderer.renderDashboard();

                // Sync with Project Detail UI if function exists (Project Management tab)
                if (typeof window.updateProjectDataInfo === 'function' && typeof ProjectManager !== 'undefined') {
                    const projects = ProjectManager.getAllProjects();
                    const project = projects.find(p => p.name === projectName);
                    if (project) {
                        const dataInfo = {
                            fileName: metadata?.fileInfo?.name || projectName,
                            rowCount: data.length,
                            importedAt: metadata?.savedAt || new Date().toISOString()
                        };
                        window.updateProjectDataInfo(project.id, dataInfo);
                    }
                }

                if (!silent) UIRenderer.showToast(`Đã tải project "${projectName}" (${data.length} rows)`, 'success');
                return { success: true };
            } else {
                throw new Error(result.error || 'Load failed');
            }

        } catch (error) {
            console.error('Load error:', error);

            // Try loading from localStorage
            const localData = this.loadFromLocalStorage(projectName);
            if (localData) {
                if (!silent) UIRenderer.showToast('Đã tải từ local backup.', 'warning');
                return { success: true };
            }

            if (!silent) UIRenderer.showToast(`Lỗi tải project: ${error.message}`, 'error');
            return { success: false, message: error.message };
        }
    },

    /**
     * Get list of saved projects - merged from server AND ProjectManager
     */
    async loadProjectList() {
        const allProjects = new Map(); // Use Map to dedupe by name

        // 1. Get projects from ProjectManager first (priority)
        if (typeof ProjectManager !== 'undefined') {
            const pmProjects = ProjectManager.getAllProjects();
            pmProjects.forEach(p => {
                allProjects.set(p.name, {
                    name: p.name,
                    id: p.id,
                    hasMetadata: true,
                    surveyId: p.surveyId,
                    criteria: p.criteria
                });
            });
        }

        // 2. Get projects from server (data files) and merge
        try {
            const response = await fetch(`${this.apiBase}/api/projects/list`);
            const result = await response.json();

            if (result.success && result.projects) {
                result.projects.forEach(p => {
                    const name = p.name || p;
                    if (!allProjects.has(name)) {
                        allProjects.set(name, {
                            name: name,
                            url: p.url,
                            hasData: true,
                            hasMetadata: false
                        });
                    } else {
                        // Merge: project from PM now also has data
                        const existing = allProjects.get(name);
                        existing.hasData = true;
                        existing.url = p.url;
                    }
                });
            }
        } catch (error) {
            console.error('Server list error:', error);
        }

        // 3. Also check localStorage
        const localProjects = this.getLocalProjects();
        localProjects.forEach(p => {
            const name = p.name || p;
            if (!allProjects.has(name)) {
                allProjects.set(name, {
                    name: name,
                    hasData: true,
                    hasMetadata: false,
                    isLocal: true
                });
            }
        });

        const projects = Array.from(allProjects.values());
        this.renderProjectDropdown(projects);
        return projects;
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

            // Show indicator if project has metadata (from ProjectManager)
            const metaIcon = project.hasMetadata ? '📋 ' : '';
            option.textContent = metaIcon + name;

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
