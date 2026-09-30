// screencv/lib/job-description-cleaner.js
// Clean job descriptions - remove HTML, markdown, special characters

function cleanJobDescription(text) {
  if (!text) return "";

  let cleaned = text
    // Remove markdown links [text](url)
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    
    // Remove HTML entities
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    
    // Remove HTML tags
    .replace(/<[^>]+>/g, "")
    
    // Remove special quote characters ('' "" '' "" etc)
    .replace(/[''""]/g, '"')
    .replace(/[«»]/g, '"')
    
    // Remove excessive whitespace
    .replace(/\s+/g, " ")
    
    // Trim
    .trim();

  return cleaned;
}

module.exports = {
  cleanJobDescription,
};