/**
 * Project Manager - FW Tools
 * Manages project data, criteria, and Alchemer quota integration
 */

const ProjectManager = {
    // Storage key
    STORAGE_KEY: 'fw_tools_projects',

    // Current active project
    activeProjectId: null,

    // Projects array
    projects: [],

    /**
     * Initialize Project Manager
     */
    init() {
        this.loadProjects();
        this.loadActiveProject();
        console.log('ProjectManager initialized with', this.projects.length, 'projects');
    },

    /**
     * Load projects from localStorage
     */
    loadProjects() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            this.projects = stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Failed to load projects:', e);
            this.projects = [];
        }
    },

    /**
     * Save projects to localStorage
     */
    saveProjects() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.projects));
            return true;
        } catch (e) {
            console.error('Failed to save projects:', e);
            return false;
        }
    },

    /**
     * Generate unique project ID
     */
    generateId() {
        return 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Create a new project
     */
    createProject({ name, surveyId, criteria, target, notes }) {
        const project = {
            id: this.generateId(),
            name: name || 'Untitled Project',
            surveyId: surveyId || '',
            criteria: criteria || '',
            target: parseInt(target) || 0,
            notes: notes || '',
            quotas: [],
            lastQuotaFetch: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.projects.unshift(project);
        this.saveProjects();

        return project;
    },

    /**
     * Update an existing project
     */
    updateProject(id, updates) {
        const index = this.projects.findIndex(p => p.id === id);
        if (index === -1) return null;

        this.projects[index] = {
            ...this.projects[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        this.saveProjects();
        return this.projects[index];
    },

    /**
     * Delete a project
     */
    deleteProject(id) {
        const index = this.projects.findIndex(p => p.id === id);
        if (index === -1) return false;

        this.projects.splice(index, 1);

        if (this.activeProjectId === id) {
            this.activeProjectId = null;
        }

        this.saveProjects();
        return true;
    },

    /**
     * Get project by ID
     */
    getProject(id) {
        return this.projects.find(p => p.id === id) || null;
    },

    /**
     * Get all projects
     */
    getAllProjects() {
        return [...this.projects];
    },

    /**
     * Get active project
     */
    getActiveProject() {
        if (!this.activeProjectId) return null;
        return this.getProject(this.activeProjectId);
    },

    /**
     * Set active project
     */
    setActiveProject(id) {
        this.activeProjectId = id;
        localStorage.setItem('fw_tools_active_project', id || '');
    },

    /**
     * Load active project from storage
     */
    loadActiveProject() {
        this.activeProjectId = localStorage.getItem('fw_tools_active_project') || null;
        return this.getActiveProject();
    },

    /**
     * Fetch quotas from Alchemer API
     * @param {string} projectId - Project ID to fetch quotas for
     * @returns {Promise<Object>} Quota data
     */
    async fetchQuotas(projectId) {
        const project = this.getProject(projectId);
        if (!project || !project.surveyId) {
            throw new Error('Project không có Survey ID');
        }

        // Check if AlchemerAPI is configured
        if (typeof AlchemerAPI === 'undefined' || !AlchemerAPI.isConfigured()) {
            throw new Error('Chưa cấu hình Alchemer API credentials');
        }

        try {
            // Use AlchemerAPI to fetch quotas (uses CORS proxy internally)
            const surveyId = project.surveyId;
            const quotasUrl = AlchemerAPI.buildUrl(`/survey/${surveyId}/quotas`);
            const result = await AlchemerAPI.fetchWithProxy(quotasUrl);

            if (!result.result_ok && !result.success) {
                throw new Error(result.error || 'Failed to fetch quotas');
            }

            // Parse quota data - API returns { result_ok, quotas: [...] }
            // Each quota has: id, name, description, responses (count), limit, distributed
            const rawQuotas = result.quotas || result.data || [];
            const quotas = rawQuotas.map(q => ({
                id: q.id,
                name: q.name || `Quota ${q.id}`,
                description: q.description || '',
                limit: parseInt(q.limit) || 0,
                count: parseInt(q.responses) || 0,  // API uses 'responses' not 'current_count'
                remaining: Math.max(0, (parseInt(q.limit) || 0) - (parseInt(q.responses) || 0)),
                distributed: q.distributed === 'true',
                isComplete: (parseInt(q.responses) || 0) >= (parseInt(q.limit) || 0)
            }));

            // Update project with quota data
            this.updateProject(projectId, {
                quotas: quotas,
                lastQuotaFetch: new Date().toISOString()
            });

            return {
                success: true,
                quotas: quotas,
                total: quotas.reduce((sum, q) => sum + q.limit, 0),
                completed: quotas.reduce((sum, q) => sum + q.count, 0),
                remaining: quotas.reduce((sum, q) => sum + q.remaining, 0)
            };

        } catch (error) {
            console.error('Failed to fetch quotas:', error);
            throw error;
        }
    },

    /**
     * Get quota summary for a project
     */
    getQuotaSummary(projectId) {
        const project = this.getProject(projectId);
        if (!project || !project.quotas || project.quotas.length === 0) {
            return null;
        }

        const quotas = project.quotas;
        const totalLimit = quotas.reduce((sum, q) => sum + q.limit, 0);
        const totalCompleted = quotas.reduce((sum, q) => sum + q.count, 0);

        return {
            projectName: project.name,
            surveyId: project.surveyId,
            criteria: project.criteria,
            target: project.target,
            notes: project.notes,
            quotaCount: quotas.length,
            totalLimit: totalLimit,
            totalCompleted: totalCompleted,
            totalRemaining: quotas.reduce((sum, q) => sum + q.remaining, 0),
            quotas: quotas,
            lastFetch: project.lastQuotaFetch,
            completionRate: totalLimit > 0 ? Math.round((totalCompleted / totalLimit) * 100) : 0
        };
    },

    /**
     * Get quota text summary (for display)
     */
    getQuotaTextSummary(projectId) {
        const summary = this.getQuotaSummary(projectId);
        if (!summary) return 'Chưa có dữ liệu quota';

        const lines = [];
        lines.push(`📊 ${summary.projectName}`);
        if (summary.criteria) {
            lines.push(`📌 Tiêu chí: ${summary.criteria}`);
        }
        lines.push(`📈 Hoàn thành: ${summary.totalCompleted}/${summary.totalLimit} (${summary.completionRate}%)`);
        lines.push(`⏳ Còn thiếu: ${summary.totalRemaining}`);

        if (summary.notes) {
            lines.push(`💡 ${summary.notes}`);
        }

        return lines.join('\n');
    },

    /**
     * Export projects as JSON
     */
    exportProjects() {
        return JSON.stringify(this.projects, null, 2);
    },

    /**
     * Import projects from JSON
     */
    importProjects(jsonString, merge = false) {
        try {
            const imported = JSON.parse(jsonString);
            if (!Array.isArray(imported)) {
                throw new Error('Invalid format');
            }

            if (merge) {
                // Merge with existing, avoiding duplicates
                imported.forEach(proj => {
                    const existing = this.projects.find(p => p.id === proj.id);
                    if (!existing) {
                        this.projects.push(proj);
                    }
                });
            } else {
                // Replace all
                this.projects = imported;
            }

            this.saveProjects();
            return { success: true, count: imported.length };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
};

// Initialize when script loads
if (typeof window !== 'undefined') {
    window.ProjectManager = ProjectManager;

    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ProjectManager.init();
        });
    } else {
        // DOM already loaded
        ProjectManager.init();
    }
}
