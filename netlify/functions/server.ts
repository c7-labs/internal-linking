import { Context } from '@netlify/functions'

// Extend RequestInit type to include duplex
interface ExtendedRequestInit extends RequestInit {
  duplex?: 'half'
}

export default async function handler(req: Request, context: Context) {
  try {
    const url = new URL(req.url)
    
    // Ensure we're forwarding to the correct API endpoint
    const targetPath = url.pathname.startsWith('/.netlify/functions/server') 
      ? url.pathname.replace('/.netlify/functions/server', '/api/process')
      : url.pathname

    console.log('Forwarding request to:', targetPath)
    
    // Clone the request body
    let body: string | null = null
    if (req.body) {
      const contentType = req.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const json = await req.json()
        body = JSON.stringify(json)
      } else {
        body = await req.text()
      }
    }
    
    // Clean up headers
    const headers = new Headers()
    headers.set('Content-Type', 'application/json')
    
    // Forward the request to the Next.js API route
    const response = await fetch(`${url.origin}${targetPath}`, {
      method: req.method,
      headers,
      body,
      duplex: 'half'
    } as ExtendedRequestInit)

    const responseData = await response.text()
    console.log('Response status:', response.status)
    
    const responseHeaders = new Headers()
    responseHeaders.set('Content-Type', 'application/json')
    
    return new Response(responseData, {
      status: response.status,
      headers: responseHeaders
    })
  } catch (error) {
    console.error('Server function error:', error)
    const headers = new Headers()
    headers.set('Content-Type', 'application/json')
    
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers
    })
  }
}
