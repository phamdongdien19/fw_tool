import { put, list, del, head } from '@vercel/blob';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb',
        },
    },
};

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { projectName, data, headers, metadata } = req.body;

        if (!projectName) {
            return res.status(400).json({
                success: false,
                error: 'Project name is required'
            });
        }

        // Create project data object
        const projectData = {
            projectName,
            headers: headers || [],
            data: data || [],
            metadata: {
                ...metadata,
                savedAt: new Date().toISOString(),
                rowCount: data ? data.length : 0,
                columnCount: headers ? headers.length : 0
            }
        };

        // Convert to JSON string
        const jsonContent = JSON.stringify(projectData);
        console.log(`Saving project "${projectName}" - size: ${jsonContent.length} bytes, rows: ${projectData.metadata.rowCount}`);

        // Create blob filename
        const blobPath = `projects/${projectName}.json`;

        // Upload to Vercel Blob
        const blob = await put(blobPath, jsonContent, {
            access: 'public',
            contentType: 'application/json',
            addRandomSuffix: false,
        });

        return res.status(200).json({
            success: true,
            message: `Project "${projectName}" saved successfully`,
            url: blob.url,
            savedAt: projectData.metadata.savedAt,
            rowCount: projectData.metadata.rowCount
        });

    } catch (error) {
        console.error('Save error:', error);
        return res.status(500).json({
            success: false,
            error: `Failed to save project: ${error.message}`,
            details: error.message
        });
    }
}
