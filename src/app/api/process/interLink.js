import axios from 'axios';
import xml2js from 'xml2js';
import natural from 'natural';

const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;

// Cache for stemmed words to improve performance
const stemCache = new Map();
function cachedStem(word) {
    if (stemCache.has(word)) {
        return stemCache.get(word);
    }
    const stemmed = stemmer.stem(word);
    stemCache.set(word, stemmed);
    return stemmed;
}

async function fetchAndParseSitemap(sitemapUrl) {
    try {
        // Add timeout to axios request
        const response = await axios.get(sitemapUrl, {
            timeout: 30000, // 30 seconds timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; InternalLinkBot/1.0)'
            }
        });
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(response.data);
        if (!result) {
            throw new Error('Failed to parse sitemap XML');
        }
        return result;
    } catch (error) {
        console.error(`Error fetching sitemap ${sitemapUrl}:`, error);
        throw new Error(`Failed to fetch or parse sitemap: ${error.message}`);
    }
}

async function extractUrlsFromSitemap(sitemapData) {
    const urls = new Set();
    
    if (!sitemapData) return urls;

    // Handle sitemap index files
    if (sitemapData.sitemapindex) {
        const nestedSitemaps = sitemapData.sitemapindex.sitemap || [];
        for (const sitemap of nestedSitemaps) {
            const nestedUrl = sitemap.loc[0];
            const nestedData = await fetchAndParseSitemap(nestedUrl);
            const nestedUrls = await extractUrlsFromSitemap(nestedData);
            nestedUrls.forEach(url => urls.add(url));
        }
    }

    // Handle regular sitemap files
    if (sitemapData.urlset) {
        const urlEntries = sitemapData.urlset.url || [];
        urlEntries.forEach(entry => {
            if (entry.loc && entry.loc[0]) {
                urls.add(entry.loc[0]);
            }
        });
    }

    return urls;
}

function extractPhrasesFromContent(content) {
    const phrases = new Set();
    
    // Split into sentences first
    const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    
    for (const sentence of sentences) {
        // Skip URLs and existing markdown links
        const cleanSentence = sentence.replace(/\[.*?\]\(.*?\)/g, '') // Remove markdown links
                                    .replace(/https?:\/\/[^\s)]+/g, '') // Remove URLs
                                    .replace(/\*\*(.*?)\*\*/g, '$1');  // Remove bold markers but keep content
        
        // Split sentence into words
        const words = cleanSentence.split(/\s+/).filter(w => {
            // Filter out markdown syntax and very short words
            return w.length > 1 && 
                   !w.startsWith('[') && 
                   !w.startsWith('(') && 
                   !w.endsWith(']') && 
                   !w.endsWith(')') &&
                   !w.includes('/') && // Skip path segments
                   !/^[0-9-]+$/.test(w); // Skip numbers and dashes
        });
        
        // First try to find meaningful phrases (2-3 words)
        for (let i = 0; i < words.length; i++) {
            // Try 3-word phrases first
            if (i + 2 < words.length) {
                const threeWordPhrase = words.slice(i, i + 3).join(' ');
                if (threeWordPhrase.length >= 5) {
                    phrases.add(threeWordPhrase);
                }
            }
            // Then try 2-word phrases
            if (i + 1 < words.length) {
                const twoWordPhrase = words.slice(i, i + 2).join(' ');
                if (twoWordPhrase.length >= 4) {
                    phrases.add(twoWordPhrase);
                }
            }
        }
        
        // Only add single words if they're significant terms
        for (const word of words) {
            if (word.length >= 5 && // Increased minimum length for single words
                !word.includes('.') && 
                /^[A-Z]/.test(word)) { // Prefer capitalized single words
                phrases.add(word);
            }
        }
    }
    
    return Array.from(phrases);
}

function calculateSemanticSimilarity(phrase1, phrase2) {
    // Tokenize and stem both phrases
    const tokens1 = tokenizer.tokenize(phrase1.toLowerCase());
    const tokens2 = tokenizer.tokenize(phrase2.toLowerCase());
    
    const stemmed1 = tokens1.map(token => cachedStem(token));
    const stemmed2 = tokens2.map(token => cachedStem(token));
    
    // Calculate Jaccard similarity of stemmed tokens
    const set1 = new Set(stemmed1);
    const set2 = new Set(stemmed2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    const jaccardSim = intersection.size / union.size;
    
    // Combine scores
    return Math.min(1, jaccardSim);
}

function findRelatedKeywords(phrase, sitemapKeywords) {
    const phraseWords = tokenizer.tokenize(phrase.toLowerCase());
    if (!phraseWords || phraseWords.length === 0) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const [keyword, metadata] of sitemapKeywords) {
        const { url, isSingleWord } = metadata;
        
        // For single-word keywords, require exact match
        if (isSingleWord) {
            if (phrase.toLowerCase() === keyword) {
                return {
                    key: keyword,
                    url,
                    score: 1
                };
            }
            continue;
        }

        // For multi-word keywords, use existing similarity logic
        const keywordWords = tokenizer.tokenize(keyword);
        if (!keywordWords || keywordWords.length === 0) continue;

        // Calculate similarity using stemming
        const phraseStems = new Set(phraseWords.map(word => cachedStem(word)));
        const keywordStems = new Set(keywordWords.map(word => cachedStem(word)));

        // Calculate Jaccard similarity
        const intersection = new Set([...phraseStems].filter(x => keywordStems.has(x)));
        const union = new Set([...phraseStems, ...keywordStems]);
        
        const score = intersection.size / union.size;

        if (score > bestScore) {
            bestScore = score;
            bestMatch = {
                key: keyword,
                url,
                score
            };
        }
    }

    // Return match only if score exceeds threshold
    return bestScore >= 0.8 ? bestMatch : null;
}

function getContext(content, phrase) {
    // Escape special regex characters in the phrase
    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    try {
        // Use positive lookbehind/lookahead to get surrounding context
        const regex = new RegExp(`[^.!?]*?${escapedPhrase}[^.!?]*`, 'g');
        const match = content.match(regex);
        return match ? match[0].trim() : '';
    } catch (error) {
        console.error('Error getting context:', error);
        // Fallback to simple substring if regex fails
        const index = content.indexOf(phrase);
        if (index === -1) return '';
        
        const start = Math.max(0, content.lastIndexOf('.', index) + 1);
        const end = Math.min(content.length, content.indexOf('.', index + phrase.length));
        return content.substring(start, end).trim();
    }
}

export async function readSitemap(sitemapUrl) {
    try {
        const sitemapData = await fetchAndParseSitemap(sitemapUrl);
        const urls = await extractUrlsFromSitemap(sitemapData);
        
        const keywords = new Map();
        
        for (const url of urls) {
            try {
                // Extract the last part of the URL path
                const pathSegment = new URL(url).pathname.split('/').pop();
                if (!pathSegment) continue;

                // Convert hyphenated path to keyword
                const keyword = pathSegment.replace(/-/g, ' ');
                
                // Store both the original form and hyphenated form for matching
                keywords.set(keyword, { url, isHyphenated: pathSegment.includes('-') });
                if (pathSegment.includes('-')) {
                    // Also store the hyphenated version as is
                    keywords.set(pathSegment, { url, isHyphenated: true });
                }
                
            } catch (error) {
                console.error('Error processing URL:', url, error);
                continue;
            }
        }
        
        return keywords;
    } catch (error) {
        console.error('Error processing sitemap:', error);
        return new Map();
    }
}

export async function processInternalLinks(content, sitemapKeywords) {
    try {
        // sitemapKeywords is now passed directly as a Map
        if (!(sitemapKeywords instanceof Map)) {
            throw new Error('Invalid sitemap data format');
        }

        const addedLinks = [];
        const stats = { totalMatches: 0, uniqueUrls: new Set() };
        
        // Keep track of positions where links exist to avoid nesting
        const linkPositions = [];
        
        // Track which keywords have been linked to avoid duplicates
        const linkedKeywords = new Set();
        
        // First pass: Find existing links and mark their positions
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        while ((match = linkRegex.exec(content)) !== null) {
            linkPositions.push({
                start: match.index,
                end: match.index + match[0].length
            });
        }
        
        // Function to check if a position overlaps with existing links
        const isPositionSafe = (start, end) => {
            return !linkPositions.some(pos => 
                (start >= pos.start && start <= pos.end) || 
                (end >= pos.start && end <= pos.end) ||
                (start <= pos.start && end >= pos.end)
            );
        };

        // Split content into lines to process non-header content
        const lines = content.split('\n');
        let processedContent = '';
        let currentPosition = 0;
        
        // Process each line
        for (const line of lines) {
            // Skip header lines (starting with #)
            if (line.trim().startsWith('#')) {
                processedContent += line + '\n';
                currentPosition += line.length + 1; // +1 for newline
                continue;
            }
            
            let currentLine = line;
            let lineOffset = currentPosition;
            
            // Store markdown formatting positions
            const boldRegex = /\*\*(.*?)\*\*/g;
            const markdownFormats = [];
            while ((match = boldRegex.exec(currentLine)) !== null) {
                markdownFormats.push({
                    type: 'bold',
                    start: match.index,
                    end: match.index + match[0].length,
                    content: match[1]
                });
            }
            
            // Extract potential phrases from the line
            const phrases = extractPhrasesFromContent(currentLine);
            
            // Sort phrases by length (longer phrases first)
            phrases.sort((a, b) => b.length - a.length);
            
            // Find related keywords for each phrase
            for (const phrase of phrases) {
                // Skip if this phrase is already part of a link
                const phraseIndex = currentLine.toLowerCase().indexOf(phrase.toLowerCase());
                if (phraseIndex === -1) continue;
                
                const matchStart = lineOffset + phraseIndex;
                const matchEnd = matchStart + phrase.length;
                
                if (!isPositionSafe(matchStart, matchEnd)) continue;
                
                // Check if phrase is within markdown formatting
                const isInMarkdown = markdownFormats.some(format => {
                    const phraseStartInLine = phraseIndex;
                    const phraseEndInLine = phraseIndex + phrase.length;
                    return (phraseStartInLine >= format.start && phraseEndInLine <= format.end);
                });
                
                // Find related keywords using semantic similarity
                const relatedKeyword = findRelatedKeywords(phrase, sitemapKeywords);
                
                if (relatedKeyword && relatedKeyword.score >= 0.8) {
                    const { key, url } = relatedKeyword;
                    
                    // Skip if this keyword has already been linked
                    if (linkedKeywords.has(key.toLowerCase())) {
                        continue;
                    }
                    
                    // For single words, check if they're part of a larger meaningful phrase
                    if (!phrase.includes(' ')) {
                        const surroundingText = getContext(currentLine, phrase);
                        const words = surroundingText.split(/\s+/);
                        const phraseIndex = words.findIndex(w => w.toLowerCase().includes(phrase.toLowerCase()));
                        
                        // Check words before and after
                        if (phraseIndex !== -1) {
                            const prevWord = phraseIndex > 0 ? words[phraseIndex - 1] : '';
                            const nextWord = phraseIndex < words.length - 1 ? words[phraseIndex + 1] : '';
                            
                            // If the word is part of a meaningful phrase, skip it
                            if ((prevWord && calculateSemanticSimilarity(prevWord + ' ' + phrase, key) > 0.5) ||
                                (nextWord && calculateSemanticSimilarity(phrase + ' ' + nextWord, key) > 0.5)) {
                                continue;
                            }
                        }
                    }
                    
                    // Get the context to ensure relevance
                    const context = getContext(currentLine, phrase);
                    if (!context) continue;
                    
                    // Create the link, preserving any markdown formatting
                    let link;
                    if (isInMarkdown) {
                        // For text within markdown formatting, wrap the markdown around the link
                        link = `**[${phrase}](${url})**`;
                    } else {
                        link = `[${phrase}](${url})`;
                    }
                    
                    const beforeMatch = currentLine.slice(0, phraseIndex);
                    const afterMatch = currentLine.slice(phraseIndex + phrase.length);
                    currentLine = beforeMatch + link + afterMatch;
                    
                    // Update link positions for future checks
                    linkPositions.push({
                        start: matchStart,
                        end: matchStart + link.length
                    });
                    
                    // Mark this keyword as linked
                    linkedKeywords.add(key.toLowerCase());
                    
                    addedLinks.push({ keyword: phrase, url });
                    stats.totalMatches++;
                    stats.uniqueUrls.add(url);
                }
            }
            
            processedContent += currentLine + '\n';
            currentPosition += line.length + 1; // +1 for newline
        }

        return {
            found_links: addedLinks,
            updated_content: processedContent.trimEnd(), // Remove trailing newline
            stats: { 
                totalMatches: stats.totalMatches, 
                uniqueUrls: stats.uniqueUrls.size 
            }
        };
    } catch (error) {
        console.error('Error processing internal links:', error);
        return {
            found_links: [],
            updated_content: content,
            stats: { totalMatches: 0, uniqueUrls: 0 }
        };
    }
}
