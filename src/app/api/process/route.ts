import { NextResponse } from 'next/server';
import { processInternalLinks, readSitemap } from './interLink.js';

export async function POST(request: Request) {
  try {
    const { content, sitemapUrl } = await request.json();
    
    if (!content || !sitemapUrl) {
      return NextResponse.json(
        { error: 'Content and sitemap URL are required' },
        { status: 400 }
      );
    }

    console.log('Step 1: Starting to process content with:', { sitemapUrl, contentLength: content.length });
    
    // First test if we can read the sitemap
    console.log('Step 2: Testing sitemap access...');
    try {
      const sitemapData = await readSitemap(sitemapUrl);
      console.log('Step 3: Sitemap read successfully, URL count:', sitemapData?.size || 0);
    } catch (error: any) {
      console.error('Sitemap read error:', error);
      return NextResponse.json(
        { error: 'Failed to read sitemap: ' + error.message },
        { status: 400 }
      );
    }

    console.log('Step 4: Processing content...');
    // Replace literal \n with actual newlines
    const processedContent = content.replace(/\\n/g, '\n');
    const result = await processInternalLinks(processedContent, sitemapUrl);
    console.log('Step 5: Processing completed successfully');
    
    if (!result) {
      return NextResponse.json(
        { error: 'No result returned from processing' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('Processing error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process content' },
      { status: 500 }
    );
  }
}
