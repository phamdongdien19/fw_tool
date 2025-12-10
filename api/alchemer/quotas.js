/**
 * Alchemer Quotas API Proxy
 * Proxies quota requests to Alchemer API to avoid CORS issues
 */

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { surveyId } = req.query;

        if (!surveyId) {
            return res.status(400).json({
                result_ok: false,
                error: 'Survey ID is required'
            });
        }

        // Get API credentials from environment or localStorage (passed as query params)
        const apiToken = req.query.api_token || process.env.ALCHEMER_API_TOKEN;
        const apiSecret = req.query.api_token_secret || process.env.ALCHEMER_API_SECRET;

        if (!apiToken || !apiSecret) {
            return res.status(400).json({
                result_ok: false,
                error: 'API credentials not provided. Pass api_token and api_token_secret as query params.'
            });
        }

        // Build Alchemer API URL
        const alchemerUrl = `https://api.alchemer.com/v5/survey/${surveyId}/quotas?api_token=${apiToken}&api_token_secret=${apiSecret}`;

        console.log(`Fetching quotas for survey ${surveyId}...`);

        // Fetch from Alchemer
        const response = await fetch(alchemerUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        const data = await response.json();

        // Log the raw response structure for debugging
        console.log('Alchemer quotas raw response:', JSON.stringify(data).substring(0, 500));

        if (!response.ok) {
            return res.status(response.status).json({
                result_ok: false,
                error: data.message || 'Failed to fetch quotas from Alchemer',
                details: data
            });
        }

        // Normalize the response - Alchemer may return quotas in different structures
        // Possible formats: { data: [...] }, { data: { quotas: [...] } }, { quotas: [...] }
        let quotas = [];
        if (Array.isArray(data.data)) {
            quotas = data.data;
        } else if (data.data && Array.isArray(data.data.quotas)) {
            quotas = data.data.quotas;
        } else if (Array.isArray(data.quotas)) {
            quotas = data.quotas;
        }

        console.log(`Found ${quotas.length} quotas for survey`);

        // Return normalized quota data
        return res.status(200).json({
            result_ok: true,
            data: quotas,
            count: quotas.length
        });

    } catch (error) {
        console.error('Quotas proxy error:', error);
        return res.status(500).json({
            result_ok: false,
            error: 'Failed to fetch quotas',
            details: error.message
        });
    }
}
