# Chrome History & Bookmarks MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with tools to analyze Chrome browser history and bookmarks data.

## Features

🔍 **History Search** - Search through Chrome browsing history by keywords, URLs, and date ranges  
📊 **History Statistics** - Get insights about your browsing data including date ranges and visit counts  
⏰ **Recent Browsing** - View recent browsing activity from the last 24 hours (configurable)  
🔖 **Bookmarks Access** - Read and analyze Chrome bookmarks (coming soon)  
📈 **Browsing Patterns** - Analyze browsing habits and patterns (coming soon)  
📤 **Data Export** - Export history and bookmarks to various formats (coming soon)  

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/chrome-history-mcp-server.git
   cd chrome-history-mcp-server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the server:**
   ```bash
   node src/mcp-server.js
   ```

## Usage with Claude Desktop

1. **Configure Claude Desktop** by editing your config file:

   **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
   **Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

2. **Add the MCP server configuration:**
   ```json
   {
     "mcpServers": {
       "chrome-history": {
         "command": "node",
         "args": ["/path/to/your/project/src/mcp-server.js"],
         "env": {}
       }
     }
   }
   ```

3. **Restart Claude Desktop** and start using the tools!

## Available Tools

### `search_history`
Search through Chrome browsing history with optional date filtering.

**Example usage:**
```
"Search my browser history for 'github'"
"Find all YouTube videos I watched last week"
"Show me what I browsed between 2024-01-01 and 2024-01-31"
```

### `get_recent_browsing`
Get browsing activity from recent hours with visit details and timestamps.

**Example usage:**
```
"Show me what I've been browsing in the last 24 hours"
"What websites did I visit in the last 6 hours?"
```

### `get_history_stats`
Get statistics about your Chrome history database including date ranges and total entries.

**Example usage:**
```
"Show me my Chrome history statistics"
"What's the date range of my browsing history?"
```

## How It Works

This MCP server:

1. **Locates Chrome** - Automatically finds Chrome profile directory across platforms (macOS, Windows, Linux)
2. **Reads SQLite Database** - Safely accesses Chrome's History database in read-only mode
3. **Provides Tools** - Exposes browsing data through standardized MCP tools
4. **Cross-Platform** - Works with Chrome, Chromium, and various Chrome profiles

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude        │    │   MCP Server     │    │   Chrome        │
│   Desktop       │◄──►│   (This Project) │◄──►│   Browser       │
│   (AI Client)   │    │                  │    │   SQLite DB     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Technical Details

- **Language:** JavaScript (ES modules)
- **Protocol:** Model Context Protocol (MCP)
- **Database:** SQLite3 (Chrome's History database)
- **Platforms:** macOS, Windows, Linux
- **Chrome Support:** Chrome, Chromium, multiple profiles

## Security & Privacy

- **Read-only access** - Never modifies Chrome data
- **Local processing** - All data stays on your machine
- **No network requests** - Operates entirely offline
- **Database safety** - Uses SQLite read-only mode to prevent corruption

## Requirements

- **Node.js** 16+ with ES modules support
- **Chrome/Chromium** installed and run at least once
- **MCP-compatible client** (like Claude Desktop)

## Contributing

Contributions welcome! Please feel free to submit issues and pull requests.

## License

MIT License - see LICENSE file for details.

## Troubleshooting

**"Chrome installation not found"**
- Ensure Chrome is installed and has been run at least once
- Check if you're using a custom Chrome profile location

**"Database query failed"**
- Make sure Chrome is closed (database might be locked)
- Verify Chrome profile permissions

**"No results for date range"**
- Use `get_history_stats` to check available date range
- Ensure date format is YYYY-MM-DD

## Future Features

- 🔖 Full bookmarks analysis and search
- 📊 Advanced browsing pattern analysis  
- 📤 Export to JSON, CSV, HTML formats
- 🧹 Privacy-focused history cleaning tools
- 📈 Browsing time analytics and insights