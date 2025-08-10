// Import necessary classes and types from the Model Context Protocol (MCP) SDK
// MCP is a protocol that allows AI assistants to interact with external tools and data sources
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,  // Schema for when tools are called/executed
  ListToolsRequestSchema, // Schema for when clients request the list of available tools
  McpError,              // Error class for MCP-specific errors
  ErrorCode,            // Standard error codes for MCP
} from '@modelcontextprotocol/sdk/types.js';
import * as chromeAnalyzer from './chrome-analyzer.js';

// Create a new MCP server instance
// This server will expose tools that AI assistants can call to interact with browser data
const server = new Server(
  // Server metadata - identifies this server to clients
  {
    name: 'browser-history-bookmarks-server',
    version: '0.1.0',
  },
  // Server capabilities - what features this server supports
  {
    capabilities: {
      tools: {}, // This server provides tools (functions the AI can call)
    },
  }
);

// Handle requests from AI clients asking "what tools are available?"
// This is called when an AI assistant connects and wants to know what it can do
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Tool 1: Search through browser history
      {
        name: 'search_history',
        description: 'Search browser history for specific terms or patterns',
        // inputSchema defines what parameters this tool accepts (like function arguments)
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to find in browser history'
            },
            start_date: {
              type: 'string',
              description: 'Start date for search (YYYY-MM-DD format)'
            },
            end_date: {
              type: 'string',
              description: 'End date for search (YYYY-MM-DD format)'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return',
              default: 50
            }
          },
          required: [] // All parameters are optional, but at least query or date range must be provided
        }
      },
      // Tool 2: Get browser bookmarks
      {
        name: 'get_bookmarks',
        description: 'Retrieve and analyze browser bookmarks',
        inputSchema: {
          type: 'object',
          properties: {
            folder: {
              type: 'string',
              description: 'Specific bookmark folder to search (optional)'
            },
            include_urls: {
              type: 'boolean',
              description: 'Whether to include full URLs in results',
              default: true
            }
          }
        }
      },
      // Tool 3: Analyze browsing behavior and patterns
      {
        name: 'analyze_browsing_patterns',
        description: 'Analyze browsing patterns and generate insights',
        inputSchema: {
          type: 'object',
          properties: {
            timeframe: {
              type: 'string',
              enum: ['day', 'week', 'month', 'year'], // Restricts to these specific values
              description: 'Timeframe for analysis',
              default: 'week'
            },
            include_domains: {
              type: 'boolean',
              description: 'Include domain-level analysis',
              default: true
            }
          }
        }
      },
      // Tool 4: Export browser data to different file formats
      {
        name: 'export_data',
        description: 'Export browser history and bookmarks to various formats',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['json', 'csv', 'html'], // Supported export formats
              description: 'Export format',
              default: 'json'
            },
            include_history: {
              type: 'boolean',
              description: 'Include browsing history in export',
              default: true
            },
            include_bookmarks: {
              type: 'boolean',
              description: 'Include bookmarks in export',
              default: true
            }
          }
        }
      },
      // Tool 5: Get recent browsing activity from last 24 hours
      {
        name: 'get_recent_browsing',
        description: 'Shows browsing activity from the last 24 hours with visit counts and timestamps',
        inputSchema: {
          type: 'object',
          properties: {
            hours: {
              type: 'number',
              description: 'Number of hours to look back (default: 24)',
              default: 24,
              minimum: 1,
              maximum: 168 // Max 1 week
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return',
              default: 50,
              minimum: 1,
              maximum: 500
            },
            include_visit_details: {
              type: 'boolean',
              description: 'Include detailed visit information like visit count',
              default: true
            }
          }
        }
      },
      // Tool 6: Get history statistics and date range info
      {
        name: 'get_history_stats',
        description: 'Get statistics about Chrome history database including date ranges and total entries',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  };
});

// Handle requests from AI clients to actually execute/call a tool
// This is called when the AI decides to use one of our tools with specific parameters
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Extract the tool name and arguments from the request
  const { name, arguments: args } = request.params;

  // Route to the appropriate tool implementation based on the tool name
  switch (name) {
    case 'search_history':
      // Search Chrome history for URLs/titles matching the query
      try {
        const query = args.query || '';  // Allow empty query for date-only searches
        const startDate = args.start_date;
        const endDate = args.end_date;
        const limit = args.limit || 100;

        // If no query and no date range, require at least one
        if (!query && !startDate && !endDate) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: Please provide either a search query or a date range (or both)'
              }
            ]
          };
        }

        // Search history using ChromeAnalyzer
        const searchResults = await chromeAnalyzer.searchHistory(query, {
          startDate,
          endDate,
          limit
        });

        // Format the results for display
        let resultText = '';
        if (query) {
          resultText = `Search results for "${query}":\n\n`;
        } else {
          resultText = `Browsing history:\n\n`;
        }
        
        if (searchResults.length === 0) {
          resultText += 'No matching entries found in your browsing history.';
          if (startDate || endDate) {
            resultText += `\nDate range: ${startDate || 'beginning'} to ${endDate || 'present'}`;
          }
        } else {
          searchResults.forEach((entry, index) => {
            resultText += `${index + 1}. ${entry.title || 'Untitled'}\n`;
            resultText += `   URL: ${entry.url}\n`;
            resultText += `   Last visited: ${entry.last_visit_date}\n`;
            resultText += `   Visit count: ${entry.visit_count}\n`;
            
            // Extract domain for context
            try {
              const urlObj = new URL(entry.url);
              resultText += `   Domain: ${urlObj.hostname}\n`;
            } catch {
              // Invalid URL, skip domain
            }
            resultText += '\n';
          });

          resultText += `\nTotal results: ${searchResults.length}`;
          if (searchResults.length === limit) {
            resultText += ` (limited to ${limit} entries)`;
          }
          
          if (startDate || endDate) {
            resultText += `\nDate range: ${startDate || 'beginning'} to ${endDate || 'present'}`;
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: resultText
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error searching history: ${error.message}\n\nThis might occur if:\n- Chrome is not installed\n- Chrome profile cannot be accessed\n- History database is locked (Chrome is running)\n- Invalid date format (use YYYY-MM-DD)`
            }
          ]
        };
      }

    case 'get_bookmarks':
      // TODO: In a real implementation, this would:
      // 1. Read Chrome's Bookmarks JSON file
      // 2. Parse the bookmark hierarchy
      // 3. Filter by folder if specified
      // 4. Return organized bookmark data
      return {
        content: [
          {
            type: 'text',
            text: 'Placeholder: Retrieving bookmarks\nThis tool will read Chrome bookmarks and organize them by folders.'
          }
        ]
      };

    case 'analyze_browsing_patterns':
      // TODO: In a real implementation, this would:
      // 1. Query history database for the specified timeframe
      // 2. Analyze visit frequency, time patterns, domain popularity
      // 3. Generate insights about browsing habits
      // 4. Return statistical analysis and visualizations
      return {
        content: [
          {
            type: 'text',
            text: `Placeholder: Analyzing browsing patterns for ${args.timeframe || 'week'}\nThis tool will generate insights about browsing habits and frequently visited sites.`
          }
        ]
      };

    case 'export_data':
      // TODO: In a real implementation, this would:
      // 1. Collect history and/or bookmark data as requested
      // 2. Format data according to the specified format (JSON/CSV/HTML)
      // 3. Write to file or return formatted data
      // 4. Provide download link or file path
      return {
        content: [
          {
            type: 'text',
            text: `Placeholder: Exporting data in ${args.format || 'json'} format\nThis tool will export browser data to the specified format.`
          }
        ]
      };

    case 'get_recent_browsing':
      // Get recent browsing activity from Chrome history
      try {
        const hours = args.hours || 24;
        const limit = args.limit || 50;
        const includeDetails = args.include_visit_details !== false;

        // Get recent browsing data from ChromeAnalyzer
        const recentBrowsing = await chromeAnalyzer.getRecentBrowsing(hours, limit, includeDetails);

        // Format the results for display
        let resultText = `Recent browsing activity (last ${hours} hours):\n\n`;
        
        if (recentBrowsing.length === 0) {
          resultText += 'No browsing activity found in the specified timeframe.';
        } else {
          recentBrowsing.forEach((entry, index) => {
            resultText += `${index + 1}. ${entry.title || 'Untitled'}\n`;
            resultText += `   URL: ${entry.url}\n`;
            resultText += `   Last visited: ${entry.last_visit_date}\n`;
            
            if (includeDetails) {
              resultText += `   Visit count: ${entry.visit_count}\n`;
              if (entry.domain) {
                resultText += `   Domain: ${entry.domain}\n`;
              }
            }
            resultText += '\n';
          });

          resultText += `\nTotal entries: ${recentBrowsing.length}`;
          if (recentBrowsing.length === limit) {
            resultText += ` (limited to ${limit} results)`;
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: resultText
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error retrieving recent browsing activity: ${error.message}\n\nThis might occur if:\n- Chrome is not installed\n- Chrome profile cannot be accessed\n- History database is locked (Chrome is running)`
            }
          ]
        };
      }

    case 'get_history_stats':
      // Get Chrome history database statistics
      try {
        const stats = await chromeAnalyzer.getHistoryStats();
        
        const resultText = `Chrome History Database Statistics:

**Overview:**
- Total unique URLs: ${stats.total_urls.toLocaleString()}
- Total visits: ${stats.total_visits.toLocaleString()}

**Date Range:**
- Earliest visit: ${stats.earliest_visit}
- Latest visit: ${stats.latest_visit}

**Note:** This shows the full range of data available in your Chrome history database.
If you're not seeing results for specific dates, they might be outside this range.`;

        return {
          content: [
            {
              type: 'text',
              text: resultText
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting history statistics: ${error.message}`
            }
          ]
        };
      }

    default:
      // Handle unknown tool names by throwing an MCP error
      // This tells the AI client that the requested tool doesn't exist
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
  }
});

// Main function to start the MCP server
async function main() {
  // Create a transport layer for communication with AI clients
  // StdioServerTransport means the server communicates via standard input/output
  // This allows it to be run as a subprocess by AI clients like Claude Desktop
  const transport = new StdioServerTransport();
  
  // Connect the server to the transport layer
  // This starts listening for requests from AI clients
  await server.connect(transport);
  
  // Log to stderr (not stdout) so it doesn't interfere with the MCP protocol
  // AI clients typically read from stdout for protocol messages
  console.error('Browser History & Bookmarks MCP Server running on stdio');
}

// Start the server and handle any startup errors
main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1); // Exit with error code if server fails to start
});