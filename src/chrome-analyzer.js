import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

// Chrome data directory paths for different operating systems
const CHROME_PATHS = {
  // macOS Chrome data locations
  darwin: [
    path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Default'),
    path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Profile 1'),
    path.join(os.homedir(), 'Library/Application Support/Chromium/Default'),
  ],
  // Windows Chrome data locations
  win32: [
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/Default'),
    path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/Profile 1'),
    path.join(os.homedir(), 'AppData/Local/Chromium/User Data/Default'),
  ],
  // Linux Chrome data locations
  linux: [
    path.join(os.homedir(), '.config/google-chrome/Default'),
    path.join(os.homedir(), '.config/google-chrome/Profile 1'),
    path.join(os.homedir(), '.config/chromium/Default'),
    path.join(os.homedir(), 'snap/chromium/common/chromium/Default'),
  ]
};

// Module state - cached Chrome profile paths
let chromeProfilePath = null;
let historyDbPath = null;
let bookmarksPath = null;

/**
 * Locate Chrome profile directory on the current system
 * Checks common installation paths for the current OS
 * @returns {Promise<string>} Path to Chrome profile directory
 * @throws {Error} If Chrome installation cannot be found
 */
export async function locateChromeProfile() {
  const platform = os.platform();
  const possiblePaths = CHROME_PATHS[platform] || [];

  // Try each possible Chrome path until we find one that exists
  for (const chromePath of possiblePaths) {
    try {
      // Check if the directory exists and is accessible
      await fs.access(chromePath);
      
      // Verify it's actually a Chrome profile by checking for key files
      const historyPath = path.join(chromePath, 'History');
      const bookmarksFilePath = path.join(chromePath, 'Bookmarks');
      
      // Check if either History database or Bookmarks file exists
      try {
        await fs.access(historyPath);
        chromeProfilePath = chromePath;
        historyDbPath = historyPath;
        bookmarksPath = bookmarksFilePath;
        return chromePath;
      } catch {
        // Try bookmarks file if History doesn't exist
        try {
          await fs.access(bookmarksFilePath);
          chromeProfilePath = chromePath;
          historyDbPath = historyPath;
          bookmarksPath = bookmarksFilePath;
          return chromePath;
        } catch {
          // Neither file exists, continue to next path
          continue;
        }
      }
    } catch {
      // Directory doesn't exist or isn't accessible, continue to next path
      continue;
    }
  }

  throw new Error(
    `Chrome installation not found. Searched paths: ${possiblePaths.join(', ')}\n` +
    `Please ensure Chrome is installed and has been run at least once.`
  );
}

/**
 * Initialize Chrome paths by locating Chrome profile
 * Must be called before using other functions
 */
async function ensureInitialized() {
  if (!chromeProfilePath) {
    await locateChromeProfile();
  }
}

/**
 * Read Chrome history database and execute a SQL query
 * Chrome stores history in an SQLite database with tables like 'urls' and 'visits'
 * @param {string} query - SQL query to execute
 * @param {Array} params - Parameters for the SQL query
 * @returns {Promise<Array>} Query results
 */
export async function queryHistory(query, params = []) {
  await ensureInitialized();

  return new Promise((resolve, reject) => {
    // Check if History database exists
    if (!historyDbPath) {
      reject(new Error('History database path not found'));
      return;
    }

    // Open SQLite database in read-only mode
    // OPEN_READONLY ensures we don't accidentally modify Chrome's data
    const db = new sqlite3.Database(historyDbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(new Error(`Failed to open Chrome History database: ${err.message}`));
        return;
      }
    });

    // Execute the query and collect all results
    db.all(query, params, (err, rows) => {
      if (err) {
        db.close();
        reject(new Error(`Database query failed: ${err.message}`));
        return;
      }

      // Close database connection and return results
      db.close((closeErr) => {
        if (closeErr) {
          console.error('Warning: Failed to close database connection:', closeErr.message);
        }
        resolve(rows);
      });
    });
  });
}

/**
 * Search Chrome history for URLs/titles matching a query
 * @param {string} searchQuery - Text to search for in URLs and titles
 * @param {Object} options - Search options
 * @param {string} options.startDate - Start date (YYYY-MM-DD)
 * @param {string} options.endDate - End date (YYYY-MM-DD)
 * @param {number} options.limit - Maximum results to return
 * @returns {Promise<Array>} Matching history entries
 */
export async function searchHistory(searchQuery, options = {}) {
  const { startDate, endDate, limit = 50 } = options;

  // If no search query provided, search for everything in date range
  const hasSearchQuery = searchQuery && searchQuery.trim().length > 0;

  // Build SQL query with optional date filtering
  let query = `
    SELECT 
      urls.url,
      urls.title,
      urls.visit_count,
      urls.last_visit_time,
      datetime(urls.last_visit_time/1000000 + (strftime('%s', '1601-01-01')), 'unixepoch') as last_visit_date
    FROM urls 
    WHERE 1=1
  `;
  
  const params = [];

  // Add search query filter if provided
  if (hasSearchQuery) {
    query += ` AND (urls.url LIKE ? OR urls.title LIKE ?)`;
    params.push(`%${searchQuery}%`, `%${searchQuery}%`);
  }

  // Add date filtering if provided
  if (startDate) {
    query += ` AND urls.last_visit_time >= ?`;
    // Convert date to Chrome's timestamp format (microseconds since 1601-01-01)
    // Add time to start of day (00:00:00)
    const startTimestamp = (new Date(startDate + 'T00:00:00').getTime() - new Date('1601-01-01').getTime()) * 1000;
    params.push(startTimestamp);
  }

  if (endDate) {
    query += ` AND urls.last_visit_time <= ?`;
    // Add time to end of day (23:59:59.999)
    const endTimestamp = (new Date(endDate + 'T23:59:59.999').getTime() - new Date('1601-01-01').getTime()) * 1000;
    params.push(endTimestamp);
  }

  query += ` ORDER BY urls.last_visit_time DESC LIMIT ?`;
  params.push(limit);

  return queryHistory(query, params);
}

/**
 * Get most visited sites from Chrome history
 * @param {number} limit - Number of top sites to return
 * @returns {Promise<Array>} Most visited sites
 */
export async function getMostVisitedSites(limit = 20) {
  const query = `
    SELECT 
      urls.url,
      urls.title,
      urls.visit_count,
      datetime(urls.last_visit_time/1000000 + (strftime('%s', '1601-01-01')), 'unixepoch') as last_visit_date
    FROM urls 
    WHERE urls.visit_count > 0
    ORDER BY urls.visit_count DESC 
    LIMIT ?
  `;

  return queryHistory(query, [limit]);
}

/**
 * Read Chrome bookmarks from the Bookmarks JSON file
 * Chrome stores bookmarks in a JSON file with a hierarchical structure
 * @returns {Promise<Object>} Parsed bookmarks data
 */
export async function readBookmarks() {
  await ensureInitialized();

  try {
    // Read the Bookmarks file as text
    const bookmarksData = await fs.readFile(bookmarksPath, 'utf8');
    
    // Parse JSON data
    const bookmarks = JSON.parse(bookmarksData);
    
    return bookmarks;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Chrome Bookmarks file not found. Make sure Chrome has been run at least once.');
    } else if (error instanceof SyntaxError) {
      throw new Error('Failed to parse Chrome Bookmarks file. The file may be corrupted.');
    } else {
      throw new Error(`Failed to read Chrome Bookmarks: ${error.message}`);
    }
  }
}

/**
 * Extract all bookmarks from the hierarchical bookmark structure
 * Recursively traverses bookmark folders to find all bookmark URLs
 * @param {Object} bookmarkNode - Bookmark node to process
 * @param {string} folderPath - Current folder path for context
 * @returns {Array} Flattened array of bookmark objects
 */
export function extractBookmarks(bookmarkNode, folderPath = '') {
  const bookmarks = [];

  // Process children of current node
  if (bookmarkNode.children) {
    for (const child of bookmarkNode.children) {
      if (child.type === 'url') {
        // This is a bookmark URL
        bookmarks.push({
          title: child.name,
          url: child.url,
          dateAdded: new Date(parseInt(child.date_added) / 1000), // Convert Chrome timestamp
          folder: folderPath || 'Root'
        });
      } else if (child.type === 'folder') {
        // This is a folder, recursively process its contents
        const newFolderPath = folderPath ? `${folderPath}/${child.name}` : child.name;
        bookmarks.push(...extractBookmarks(child, newFolderPath));
      }
    }
  }

  return bookmarks;
}

/**
 * Get all bookmarks organized by folder
 * @param {string} targetFolder - Optional: filter by specific folder
 * @returns {Promise<Array>} Array of bookmark objects
 */
export async function getBookmarks(targetFolder = null) {
  const bookmarksData = await readBookmarks();
  let allBookmarks = [];

  // Extract bookmarks from each root folder (bookmark_bar, other, synced, etc.)
  if (bookmarksData.roots) {
    for (const [rootName, rootData] of Object.entries(bookmarksData.roots)) {
      if (rootData.children) {
        const folderBookmarks = extractBookmarks(rootData, rootName);
        allBookmarks.push(...folderBookmarks);
      }
    }
  }

  // Filter by target folder if specified
  if (targetFolder) {
    allBookmarks = allBookmarks.filter(bookmark => 
      bookmark.folder.toLowerCase().includes(targetFolder.toLowerCase())
    );
  }

  return allBookmarks;
}

/**
 * Get recent browsing activity from the last N hours
 * @param {number} hours - Number of hours to look back (default: 24)
 * @param {number} limit - Maximum number of results to return (default: 50)
 * @param {boolean} includeDetails - Include visit count and domain info (default: true)
 * @returns {Promise<Array>} Recent browsing history entries
 */
export async function getRecentBrowsing(hours = 24, limit = 50, includeDetails = true) {
  // Calculate the timestamp for N hours ago
  const hoursAgo = new Date(Date.now() - (hours * 60 * 60 * 1000));
  
  // Convert to Chrome's timestamp format (microseconds since 1601-01-01)
  const chromeTimestamp = (hoursAgo.getTime() - new Date('1601-01-01').getTime()) * 1000;

  // Build SQL query to get recent browsing activity
  let query = `
    SELECT 
      urls.url,
      urls.title,
      urls.visit_count,
      urls.last_visit_time,
      datetime(urls.last_visit_time/1000000 + (strftime('%s', '1601-01-01')), 'unixepoch') as last_visit_date,
      visits.visit_time,
      datetime(visits.visit_time/1000000 + (strftime('%s', '1601-01-01')), 'unixepoch') as visit_date
    FROM urls 
    INNER JOIN visits ON urls.id = visits.url
    WHERE visits.visit_time >= ?
    ORDER BY visits.visit_time DESC 
    LIMIT ?
  `;

  const results = await queryHistory(query, [chromeTimestamp, limit]);

  // Process results to add domain information and format data
  const processedResults = results.map(entry => {
    const result = {
      url: entry.url,
      title: entry.title || 'Untitled',
      last_visit_date: entry.visit_date, // Use individual visit time for recent activity
      visit_count: entry.visit_count
    };

    // Extract domain if details are requested
    if (includeDetails) {
      try {
        const urlObj = new URL(entry.url);
        result.domain = urlObj.hostname;
      } catch {
        result.domain = 'Unknown';
      }
    }

    return result;
  });

  return processedResults;
}

/**
 * Get browsing history within a specific date range (uses visits table for more complete data)
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {number} limit - Maximum results to return
 * @returns {Promise<Array>} History entries from visits table
 */
export async function getHistoryByDateRange(startDate, endDate, limit = 100) {
  // Convert dates to Chrome timestamp format
  const startTimestamp = (new Date(startDate + 'T00:00:00').getTime() - new Date('1601-01-01').getTime()) * 1000;
  const endTimestamp = (new Date(endDate + 'T23:59:59.999').getTime() - new Date('1601-01-01').getTime()) * 1000;

  // Query the visits table which has ALL individual visits, not just the last visit
  const query = `
    SELECT 
      urls.url,
      urls.title,
      urls.visit_count,
      visits.visit_time,
      datetime(visits.visit_time/1000000 + (strftime('%s', '1601-01-01')), 'unixepoch') as visit_date,
      visits.transition
    FROM visits 
    INNER JOIN urls ON visits.url = urls.id
    WHERE visits.visit_time >= ? AND visits.visit_time <= ?
    ORDER BY visits.visit_time DESC 
    LIMIT ?
  `;

  const results = await queryHistory(query, [startTimestamp, endTimestamp, limit]);

  return results.map(entry => ({
    url: entry.url,
    title: entry.title || 'Untitled',
    visit_date: entry.visit_date,
    visit_count: entry.visit_count,
    transition: entry.transition
  }));
}

/**
 * Get statistics about history data availability
 * @returns {Promise<Object>} Statistics about the history database
 */
export async function getHistoryStats() {
  const query = `
    SELECT 
      COUNT(*) as total_urls,
      SUM(visit_count) as total_visits,
      MIN(datetime(last_visit_time/1000000 + (strftime('%s', '1601-01-01')), 'unixepoch')) as earliest_visit,
      MAX(datetime(last_visit_time/1000000 + (strftime('%s', '1601-01-01')), 'unixepoch')) as latest_visit
    FROM urls 
    WHERE visit_count > 0
  `;

  const results = await queryHistory(query);
  return results[0];
}

/**
 * Get Chrome profile information and statistics
 * @returns {Promise<Object>} Profile information
 */
export async function getProfileInfo() {
  await ensureInitialized();

  const info = {
    profilePath: chromeProfilePath,
    historyDbExists: false,
    bookmarksExists: false,
    platform: os.platform()
  };

  // Check if files exist
  try {
    await fs.access(historyDbPath);
    info.historyDbExists = true;
  } catch {}

  try {
    await fs.access(bookmarksPath);
    info.bookmarksExists = true;
  } catch {}

  // Get basic statistics if history exists
  if (info.historyDbExists) {
    try {
      const historyStats = await queryHistory(`
        SELECT 
          COUNT(*) as total_urls,
          SUM(visit_count) as total_visits,
          MAX(datetime(last_visit_time/1000000 + (strftime('%s', '1601-01-01')), 'unixepoch')) as latest_visit
        FROM urls
      `);
      info.historyStats = historyStats[0];
    } catch (error) {
      info.historyError = error.message;
    }
  }

  return info;
}