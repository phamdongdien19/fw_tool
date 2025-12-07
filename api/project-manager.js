import { put, del, head } from '@vercel/blob';

const PROJECTS_LIST_PATH = 'project-manager/projects.json';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '1mb',
        },
    },
};

// Helper function to fetch projects list using head() instead of list()
async function getProjectsList() {
    try {
        // head() is a Simple Operation, not Advanced
        const blobInfo = await head(PROJECTS_LIST_PATH);

        // Fetch the projects data
        const url = new URL(blobInfo.url);
        url.searchParams.set('t', Date.now()); // Cache busting
        const response = await fetch(url.toString(), { cache: 'no-store' });

        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (err) {
        // head() throws if blob doesn't exist - return empty array for new installs
        return [];
    }
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        switch (req.method) {
            case 'GET':
                return await getProjects(req, res);
            case 'POST':
                return await saveProject(req, res);
            case 'PUT':
                return await updateProject(req, res);
            case 'DELETE':
                return await deleteProject(req, res);
            default:
                return res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('Project management error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// Get all projects - uses head() via helper
async function getProjects(req, res) {
    try {
        const projects = await getProjectsList();
        return res.status(200).json({ projects });
    } catch (error) {
        console.error('Get projects error:', error);
        return res.status(200).json({ projects: [] });
    }
}

// Save/create a project - uses head() via helper
async function saveProject(req, res) {
    const { project } = req.body;

    if (!project || !project.id || !project.name) {
        return res.status(400).json({ error: 'Project id and name are required' });
    }

    // Get existing projects using head() instead of list()
    let projects = await getProjectsList();

    // Add or update project
    const existingIndex = projects.findIndex(p => p.id === project.id);
    if (existingIndex >= 0) {
        projects[existingIndex] = { ...projects[existingIndex], ...project, updatedAt: new Date().toISOString() };
    } else {
        projects.unshift({
            ...project,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }

    // Save to blob
    await put(PROJECTS_LIST_PATH, JSON.stringify(projects), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
    });

    return res.status(200).json({ success: true, project });
}

// Update a project - uses head() via helper
async function updateProject(req, res) {
    const { id, updates } = req.body;

    if (!id) {
        return res.status(400).json({ error: 'Project id is required' });
    }

    // Get existing projects using head() instead of list()
    let projects = await getProjectsList();

    if (projects.length === 0) {
        return res.status(404).json({ error: 'No projects found' });
    }

    const index = projects.findIndex(p => p.id === id);
    if (index < 0) {
        return res.status(404).json({ error: 'Project not found' });
    }

    projects[index] = { ...projects[index], ...updates, updatedAt: new Date().toISOString() };

    await put(PROJECTS_LIST_PATH, JSON.stringify(projects), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
    });

    return res.status(200).json({ success: true, project: projects[index] });
}

// Delete a project - uses head() via helper
async function deleteProject(req, res) {
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ error: 'Project id is required' });
    }

    // Get existing projects using head() instead of list()
    let projects = await getProjectsList();

    if (projects.length === 0) {
        return res.status(404).json({ error: 'No projects found' });
    }

    const filteredProjects = projects.filter(p => p.id !== id);

    if (filteredProjects.length === projects.length) {
        return res.status(404).json({ error: 'Project not found' });
    }

    await put(PROJECTS_LIST_PATH, JSON.stringify(filteredProjects), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
    });

    return res.status(200).json({ success: true, message: 'Project deleted' });
}
