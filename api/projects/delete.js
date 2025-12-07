import { del, head, put } from '@vercel/blob';

const PROJECTS_INDEX_PATH = 'projects/_index.json';

// Helper function to get projects index
async function getProjectsIndex() {
    try {
        const blobInfo = await head(PROJECTS_INDEX_PATH);
        const url = new URL(blobInfo.url);
        url.searchParams.set('t', Date.now());
        const response = await fetch(url.toString(), { cache: 'no-store' });

        if (response.ok) {
            const indexData = await response.json();
            return indexData.projects || [];
        }
        return [];
    } catch (err) {
        return [];
    }
}

// Helper function to remove project from index
async function removeFromProjectsIndex(projectName) {
    try {
        let projects = await getProjectsIndex();
        const newProjects = projects.filter(p => p.name !== projectName);

        if (newProjects.length !== projects.length) {
            await put(PROJECTS_INDEX_PATH, JSON.stringify({ projects: newProjects }), {
                access: 'public',
                contentType: 'application/json',
                addRandomSuffix: false,
            });
            console.log('[delete.js] Removed from projects index:', projectName);
        }
    } catch (err) {
        console.warn('[delete.js] Failed to update projects index:', err.message);
    }
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { name, url } = req.query;

        // If URL is provided, delete directly
        if (url) {
            await del(url);
            // Try to extract name from URL and update index
            const urlMatch = url.match(/projects\/(.+)\.json/);
            if (urlMatch) {
                await removeFromProjectsIndex(decodeURIComponent(urlMatch[1]));
            }
            return res.status(200).json({
                success: true,
                message: `Project deleted successfully (by URL)`
            });
        }

        if (!name) {
            return res.status(400).json({ error: 'Project name or URL is required' });
        }

        // Use head() instead of list() to find the project
        // head() is a Simple Operation, not Advanced
        const blobPath = `projects/${name}.json`;
        let blobInfo;

        try {
            blobInfo = await head(blobPath);
        } catch (headErr) {
            // head() throws if blob doesn't exist
            // Try URL-encoded version of the name
            try {
                const encodedPath = `projects/${encodeURIComponent(name)}.json`;
                blobInfo = await head(encodedPath);
            } catch (headErr2) {
                return res.status(404).json({
                    error: 'Project not found',
                    projectName: name
                });
            }
        }

        // Delete the blob using the URL from head()
        await del(blobInfo.url);

        // Update the projects index
        await removeFromProjectsIndex(name);

        return res.status(200).json({
            success: true,
            message: `Project "${name}" deleted successfully`
        });

    } catch (error) {
        console.error('Delete error:', error);
        return res.status(500).json({
            error: 'Failed to delete project',
            details: error.message
        });
    }
}
