// A* search implementation for text similarity
// Based on the concept of finding the best match between a query and text

export type SearchResult = {
  taskId: string;
  score: number;
  matches: { start: number; end: number }[];
};

// A* search implementation for finding best matching tasks
export function aStarTextSearch(
  query: string,
  tasks: { id: string; title: string }[]
): SearchResult[] {
  if (!query.trim()) {
    // Return all tasks with neutral score if no query
    return tasks.map(task => ({
      taskId: task.id,
      score: 1.0, // Changed to 1.0 for neutral score
      matches: []
    }));
  }

  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase().trim();
  
  for (const task of tasks) {
    const textLower = task.title.toLowerCase();
    let score = 0.0;
    
    // Exact match gets highest score
    if (textLower === queryLower) {
      score = 1.0;
    } 
    // Exact substring match
    else if (textLower.includes(queryLower)) {
      // Score based on how much of the text matches the query
      score = 0.7 + (queryLower.length / textLower.length) * 0.3;
    } 
    // Word boundary matching
    else {
      const words = textLower.split(/\s+/);
      let maxWordScore = 0;
      
      // Check each word for matches
      for (const word of words) {
        if (word.startsWith(queryLower)) {
          // Prefix match gets high score
          maxWordScore = Math.max(maxWordScore, 0.6 + (queryLower.length / word.length) * 0.4);
        } else if (word.includes(queryLower)) {
          // Partial match within word
          maxWordScore = Math.max(maxWordScore, 0.3 + (queryLower.length / word.length) * 0.3);
        }
      }
      
      score = maxWordScore;
    }
    
    // Only include results with some similarity
    if (score > 0) {
      results.push({
        taskId: task.id,
        score,
        matches: [] // For highlighting matches in the future
      });
    }
  }
  
  // Sort by score (highest first)
  return results.sort((a, b) => b.score - a.score);
}