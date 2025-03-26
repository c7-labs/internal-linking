const { processInternalLinks, readSitemap } = require('./interLink');

exports.handler = async function(event, context) {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse the incoming request body
    const { content, sitemapUrl } = JSON.parse(event.body);

    // Validate input
    if (!content || !sitemapUrl) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Content and sitemap URL are required' })
      };
    }

    // First read and process the sitemap
    const sitemapKeywords = await readSitemap(sitemapUrl);
    
    // Then process the content with the sitemap keywords
    const result = await processInternalLinks(content, sitemapKeywords);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Error processing request:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error: ' + error.message,
        details: error.stack
      })
    };
  }
};
