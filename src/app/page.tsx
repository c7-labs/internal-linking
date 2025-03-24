'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const markdownStyles = {
  container: {
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#333',
    position: 'relative' as const,
  },
  h1: {
    fontSize: '2em',
    fontWeight: 'bold',
    marginBottom: '1rem',
    marginTop: '1.5rem',
    borderBottom: '1px solid #eee',
    paddingBottom: '0.3rem',
  },
  h2: {
    fontSize: '1.5em',
    fontWeight: 'bold',
    marginBottom: '0.75rem',
    marginTop: '1.5rem',
    borderBottom: '1px solid #eee',
    paddingBottom: '0.3rem',
  },
  h3: {
    fontSize: '1.25em',
    fontWeight: 'bold',
    marginBottom: '0.75rem',
    marginTop: '1rem',
  },
  h4: {
    fontSize: '1em',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
    marginTop: '1rem',
  },
  p: {
    marginBottom: '1rem',
    whiteSpace: 'pre-wrap',
  },
  strong: {
    fontWeight: 'bold',
  },
  em: {
    fontStyle: 'italic',
  },
  blockquote: {
    borderLeft: '4px solid #ddd',
    paddingLeft: '1rem',
    marginLeft: '0',
    marginRight: '0',
    color: '#666',
  },
  code: {
    backgroundColor: '#f5f5f5',
    padding: '0.2em 0.4em',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '0.85em',
  },
  pre: {
    backgroundColor: '#f5f5f5',
    padding: '1rem',
    borderRadius: '5px',
    overflow: 'auto',
    marginBottom: '1rem',
  },
  ul: {
    listStyleType: 'disc',
    marginBottom: '1rem',
    paddingLeft: '2rem',
  },
  ol: {
    listStyleType: 'decimal',
    marginBottom: '1rem',
    paddingLeft: '2rem',
  },
  li: {
    marginBottom: '0.5rem',
  },
  link: {
    color: '#2563eb',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  hr: {
    border: 'none',
    borderTop: '1px solid #eee',
    margin: '1.5rem 0',
  },
  copyButton: {
    position: 'absolute' as const,
    top: '1rem',
    right: '1rem',
    padding: '0.5rem 1rem',
    backgroundColor: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: '0.375rem',
    color: '#374151',
    fontSize: '0.875rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s',
    zIndex: 10,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    ':hover': {
      backgroundColor: '#e5e7eb',
      transform: 'translateY(-1px)',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    },
  },
};

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const markdownComponents: Components = {
  h1: ({children, ...props}) => <h1 style={markdownStyles.h1} {...props}>{children}</h1>,
  h2: ({children, ...props}) => <h2 style={markdownStyles.h2} {...props}>{children}</h2>,
  h3: ({children, ...props}) => <h3 style={markdownStyles.h3} {...props}>{children}</h3>,
  h4: ({children, ...props}) => <h4 style={markdownStyles.h4} {...props}>{children}</h4>,
  p: ({children, ...props}) => <p style={markdownStyles.p} {...props}>{children}</p>,
  strong: ({children, ...props}) => <strong style={markdownStyles.strong} {...props}>{children}</strong>,
  em: ({children, ...props}) => <em style={markdownStyles.em} {...props}>{children}</em>,
  blockquote: ({children, ...props}) => <blockquote style={markdownStyles.blockquote} {...props}>{children}</blockquote>,
  code: ({inline, children, ...props}: CodeProps) => {
    const style = inline ? markdownStyles.code : undefined;
    return inline ? (
      <code style={style} {...props}>{children}</code>
    ) : (
      <pre style={markdownStyles.pre}>
        <code {...props}>{children}</code>
      </pre>
    );
  },
  ul: ({children, ...props}) => <ul style={markdownStyles.ul} {...props}>{children}</ul>,
  ol: ({children, ...props}) => <ol style={markdownStyles.ol} {...props}>{children}</ol>,
  li: ({children, ...props}) => <li style={markdownStyles.li} {...props}>{children}</li>,
  hr: (props) => <hr style={markdownStyles.hr} {...props} />,
  a: ({children, ...props}) => (
    <a 
      {...props} 
      target="_blank" 
      rel="noopener noreferrer" 
      style={markdownStyles.link}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = '#1e40af';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = '#2563eb';
      }}
    >
      {children}
    </a>
  ),
};

export default function Home() {
  const [content, setContent] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  const processContent = async () => {
    try {
      setLoading(true);
      setError('');
      setResult(null);
      
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, sitemapUrl }),
      });

      const data = await response.json();
      if (response.ok) {
        setResult(data.result);
      } else {
        setError(data.error || 'Failed to process content');
      }
    } catch (error: any) {
      setError(error.message || 'Error processing content');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (result?.updated_content) {
      try {
        await navigator.clipboard.writeText(result.updated_content);
        setCopyStatus('copied');
        setTimeout(() => setCopyStatus('idle'), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  return (
    <main className="min-h-screen p-4">
      <div className="flex gap-4 h-[calc(100vh-32px)]">
        <div className="flex-1 flex flex-col gap-4">
          <input
            type="text"
            placeholder="Enter sitemap URL"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            className="w-full p-2 border rounded"
          />
          <textarea
            placeholder="Enter content here"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 w-full p-2 border rounded resize-none"
          />
          <button
            onClick={processContent}
            disabled={loading || !content || !sitemapUrl}
            className="p-2 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600 transition-colors"
          >
            {loading ? 'Processing...' : 'Process Content'}
          </button>
        </div>
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-600">Processing content...</p>
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="absolute top-0 left-0 right-0 p-3 bg-red-100 text-red-700 rounded-t z-10">
              {error}
            </div>
          ) : null}
          <div className="w-full h-full p-2 border rounded overflow-auto bg-white">
            {result?.updated_content ? (
              <div style={markdownStyles.container}>
                <button 
                  onClick={copyToClipboard}
                  style={{
                    ...markdownStyles.copyButton,
                    backgroundColor: copyStatus === 'copied' ? '#dcfce7' : '#f3f4f6',
                    borderColor: copyStatus === 'copied' ? '#86efac' : '#e5e7eb',
                    color: copyStatus === 'copied' ? '#166534' : '#374151',
                  }}
                >
                  {copyStatus === 'copied' ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      Copy
                    </>
                  )}
                </button>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {result.updated_content}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-gray-400 p-2">Processed content will appear here</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
