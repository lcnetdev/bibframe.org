import './style.css'
import './bulma.min.css'
import MD5 from 'crypto-js/md5'

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Convert Wikimedia image URL to thumbnail
function convertToThumbnail(imageUrl, width = 80) {
  // Convert full Wikimedia Commons URLs to thumbnail URLs using MD5 hashing
  if (!imageUrl || !imageUrl.includes('commons.wikimedia.org')) {
    return imageUrl;
  }

  try {
    // Extract filename from the URL
    let filename;
    if (imageUrl.includes('/wiki/File:')) {
      filename = imageUrl.split('/wiki/File:')[1];
    } else if (imageUrl.includes('/wikipedia/commons/')) {
      filename = imageUrl.split('/').pop();
    } else {
      filename = imageUrl.split('/').pop();
    }

    // Decode URL encoding if present
    filename = decodeURIComponent(filename);
    filename = filename.replace(/ /g, '_'); // Replace spaces with underscores for MD5

    // Generate MD5 hash of filename using proper MD5 implementation
    const md5Hash = MD5(filename).toString();

    // Build thumbnail URL according to Wikimedia rules
    const firstChar = md5Hash.charAt(0);
    const firstTwoChars = md5Hash.substring(0, 2);

    let thumbnailUrl = `https://upload.wikimedia.org/wikipedia/commons/thumb/${firstChar}/${firstTwoChars}/${encodeURIComponent(filename)}/${width}px-${encodeURIComponent(filename)}`;

    if (thumbnailUrl.endsWith(".tif")){
      thumbnailUrl = thumbnailUrl + ".jpg"
    }
    if (thumbnailUrl.endsWith(".svg")){
      thumbnailUrl = thumbnailUrl + ".png"
    }

    return thumbnailUrl;
  } catch (error) {
    console.error('Error converting to thumbnail:', error);
    return imageUrl;
  }
}

// Get initials from name
function getInitials(name) {
  if (!name) return '';
  const parts = name.split(/[,\s]+/).filter(part => part.length > 0);
  if (parts.length >= 2) {
    return (parts[1][0] + parts[0][0]).toUpperCase(); // First name, Last name
  }
  return parts[0][0].toUpperCase();
}

// Levenshtein distance calculation
function levenshteinDistance(str1, str2) {
  const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator, // substitution
      );
    }
  }

  return track[str2.length][str1.length];
}

// Create results container
function createResultsContainer() {
  const existingResults = document.getElementById('search-results');
  if (existingResults) {
    return existingResults;
  }

  const searchInput = document.getElementById('search');
  if (!searchInput) {
    console.error('Search input not found');
    return null;
  }

  const searchContainer = searchInput.closest('.field');
  if (!searchContainer) {
    console.error('Search container not found');
    return null;
  }

  const resultsDiv = document.createElement('div');
  resultsDiv.id = 'search-results';
  resultsDiv.className = 'columns mt-4';
  searchContainer.parentNode.insertBefore(resultsDiv, searchContainer.nextSibling);
  return resultsDiv;
}

// Format contributor results
async function formatContributors(data) {
  if (!data.hits || data.hits.length === 0) {
    return '<p class="has-text-grey">No contributors found</p>';
  }

  // Sort by contributions count (higher first)
  const sortedHits = [...data.hits].sort((a, b) => {
    const aContributions = a.contributions || 0;
    const bContributions = b.contributions || 0;
    return bContributions - aContributions;
  });

  // Fetch proper names for each contributor
  const enrichedHits = await Promise.all(sortedHits.map(async (hit) => {
    let properName = hit.suggestLabel; // Default fallback

    // Check if token looks like LCCN (e.g., "n89601384")
    if (hit.token && hit.token.match(/^n\d+$/)) {
      try {
        const response = await fetch(`https://id.loc.gov/authorities/names/${hit.token}.json`);
        if (response.ok) {
          const data = await response.json();
          // The response is an array - find the main authority object
          const agent = data.find(item =>
            item['@id'] === `http://id.loc.gov/authorities/names/${hit.token}` &&
            item['@type'] &&
            (Array.isArray(item['@type']) ? item['@type'].includes('http://www.loc.gov/mads/rdf/v1#Authority') : item['@type'] === 'http://www.loc.gov/mads/rdf/v1#Authority')
          );
          if (agent && agent['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']) {
            const authLabels = agent['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'];
            if (authLabels && authLabels.length > 0 && authLabels[0]['@value']) {
              properName = authLabels[0]['@value'];
              console.log(`Found name for ${hit.token}: ${properName}`);
            }
          } else {
            console.log(`No authoritativeLabel found for ${hit.token}`);
          }
        }
      } catch (error) {
        console.error(`Error fetching name for ${hit.token}:`, error);
      }
    }

    return {
      ...hit,
      displayName: properName
    };
  }));

  // Start Wikidata enrichment after display
  setTimeout(() => enrichContributorsWithWikidata(enrichedHits), 100);

  return enrichedHits.map(hit => {
    const initials = getInitials(hit.displayName);
    return `
      <div class="box p-2 mb-2 contributor-box" data-token="${hit.token}" data-label="${hit.displayName}" style="display: flex; align-items: stretch; min-height: 100px;">
        <div class="contributor-image mr-3" data-lccn="${hit.token}">
          <div class="initials-circle" style="width: 80px; height: 100%; min-height: 96px; border-radius: 12px; background: linear-gradient(135deg, #85c1f5 0%, #276dcc 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.5rem;">
            ${initials}
          </div>
        </div>
        <div style="flex: 1; padding: 0.5rem 0;">
          <p class="has-text-weight-semibold">${hit.displayName}</p>
          ${hit.contributions ? `<p class="is-size-7 has-text-primary has-text-weight-semibold">${hit.contributions} contributions</p>` : ''}
          ${hit.more?.birthdates && hit.more.birthdates[0] && hit.more.birthdates[0] !== 'undefined' ? `<p class="is-size-7 has-text-grey">Born: ${hit.more.birthdates[0]}</p>` : ''}
          ${hit.more?.occupations && hit.more.occupations.length > 0 && hit.more.occupations[0] !== 'undefined' ? `<p class="is-size-7 has-text-grey">${hit.more.occupations.filter(o => o && o !== 'undefined').join(', ')}</p>` : ''}
          <div class="wikidata-info" data-lccn="${hit.token}"></div>
        </div>
      </div>
    `;
  }).join('');
}

// Enrich contributors with Wikidata information
async function enrichContributorsWithWikidata(hits) {
  // Extract LCCN tokens
  const lccnTokens = hits
    .map(hit => hit.token)
    .filter(token => token && token.startsWith('n'));

  if (lccnTokens.length === 0) return;

  // Build SPARQL query
  const sparqlQuery = `
    SELECT ?item ?itemLabel ?lccn ?image ?birthDate ?deathDate ?description WHERE {
      VALUES ?lccn { ${lccnTokens.map(token => `"${token}"`).join(' ')} }
      ?item wdt:P244 ?lccn .
      OPTIONAL { ?item wdt:P18 ?image }
      OPTIONAL { ?item wdt:P569 ?birthDate }
      OPTIONAL { ?item wdt:P570 ?deathDate }
      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en" .
        ?item schema:description ?description .
        ?item rdfs:label ?itemLabel .
      }
    }
  `;

  const wikidataUrl = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`;

  try {
    const response = await fetch(wikidataUrl, {
      headers: {
        'Accept': 'application/sparql-results+json'
      }
    });

    if (!response.ok) {
      console.error('Wikidata query failed:', response.status);
      return;
    }

    const data = await response.json();
    console.log('Wikidata results:', data);

    // Process results and update UI
    if (data.results && data.results.bindings) {
      data.results.bindings.forEach(binding => {
        const lccn = binding.lccn?.value;
        const description = binding.description?.value;
        const wikidataUri = binding.item?.value;
        const image = binding.image?.value;

        // Update image if available
        if (image && lccn) {
          const imageContainer = document.querySelector(`.contributor-box[data-token="${lccn}"] .contributor-image`);
          if (imageContainer) {
            const thumbnailUrl = convertToThumbnail(image, 80);
            const contributorBox = document.querySelector(`.contributor-box[data-token="${lccn}"]`);
            const displayName = contributorBox ? contributorBox.dataset.label : '';
            imageContainer.innerHTML = `
              <img src="${thumbnailUrl}" alt="Author photo" style="width: 80px; height: 100%; min-height: 96px; border-radius: 12px; object-fit: cover; opacity: 0;" onload="this.classList.add('loaded');" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
              <div class="initials-circle" style="width: 80px; height: 100%; min-height: 96px; border-radius: 12px; background: linear-gradient(135deg, #85c1f5 0%, #276dcc 100%); display: none; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.5rem;">
                ${getInitials(displayName)}
              </div>
            `;
          }
        }

        // Find the corresponding contributor box for description
        const contributorBox = document.querySelector(`.contributor-box[data-token="${lccn}"] .wikidata-info`);

        if (contributorBox && description && description !== 'undefined') {
          contributorBox.innerHTML = `
            <p class="is-size-7 has-text-dark mt-2">
              <strong>Wikidata:</strong> ${description}
            </p>
          `;
        }

        console.log(`LCCN: ${lccn}, Description: ${description}, Image: ${image}, Wikidata: ${wikidataUri}`);
      });
    }
  } catch (error) {
    console.error('Error fetching Wikidata:', error);
  }
}

// Format instances results for numeric searches
function formatInstances(data) {
  if (!data.hits || data.hits.length === 0) {
    return '<p class="has-text-grey">No instances found</p>';
  }

  return data.hits.map(hit => {
    const uri = hit.uri;
    const label = hit.aLabel || 'Unknown Instance';

    return `
      <div class="box p-3 mb-2 title-result" data-uri="${uri}" style="cursor: pointer;" onclick="handleInstanceClick('${uri}')">
        <p class="has-text-weight-semibold">${label}</p>
        ${hit.suggestLabel ? `<p class="is-size-7 has-text-grey">${hit.suggestLabel}</p>` : ''}
      </div>
    `;
  }).join('');
}

// Format title results
function formatTitles(data, searchQuery) {
  if (!data.hits || data.hits.length === 0) {
    return '<p class="has-text-grey">No titles found</p>';
  }

  // Filter out excluded URIs
  let filteredHits = data.hits.filter(hit =>
    !window.excludedUris || !window.excludedUris.has(hit.uri)
  );

  if (filteredHits.length === 0) {
    return '<p class="has-text-grey">No titles found</p>';
  }

  // Add distance scores and sort
  const scoredHits = filteredHits.map(hit => {
    // Check if first contributor appears in aLabel
    const firstContributor = hit.more?.contributors && hit.more.contributors[0];
    const hasContributorInLabel = firstContributor && hit.aLabel &&
      hit.aLabel.includes(firstContributor);

    // Remove contributors from aLabel before calculating distance
    let labelForDistance = hit.aLabel || hit.suggestLabel || '';
    if (hit.more?.contributors) {
      // Remove all contributors from the label for distance calculation
      hit.more.contributors.forEach(contributor => {
        labelForDistance = labelForDistance.replace(contributor, '').replace(/^\.\s*/, '').trim();
      });
    }

    // Calculate Levenshtein distance from search query (using label without contributors)
    let distance = searchQuery ?
      levenshteinDistance(searchQuery.toLowerCase(), labelForDistance.toLowerCase()) :
      999999;

    // Apply bonus (reduce distance) if contributor appears in label
    // Bigger bonus if the search query appears in the contributor name
    if (hasContributorInLabel && firstContributor && searchQuery) {
      const contributorMatchesSearch = firstContributor.toLowerCase().includes(searchQuery.toLowerCase());
      if (contributorMatchesSearch) {
        distance = Math.max(0, distance - 25); // Very big bonus when searching for an author and their name appears properly
      } else {
        distance = Math.max(0, distance - 8); // Moderate bonus for other contributors in label
      }
    }

    // Check if English language
    const isEnglish = hit.more?.languages &&
      hit.more.languages.some(lang =>
        lang === 'English' || lang === 'mlang:eng' || lang.toLowerCase().includes('eng')
      );

    // Get token as number (default to very large number if not present)
    const tokenNum = hit.token ? parseInt(hit.token) : 999999999;

    return {
      ...hit,
      distance: distance,
      originalDistance: searchQuery ?
        levenshteinDistance(searchQuery.toLowerCase(), labelForDistance.toLowerCase()) :
        999999,
      labelWithoutContributors: labelForDistance,
      hasContributorInLabel: hasContributorInLabel,
      isEnglish: isEnglish,
      tokenNum: tokenNum
    };
  });

  // Sort by: 1) distance (ascending), 2) contributor in label, 3) English preference, 4) token (ascending)
  scoredHits.sort((a, b) => {
    // First sort by distance
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }

    // Then by contributor appearing in label (those with contributor first)
    if (a.hasContributorInLabel !== b.hasContributorInLabel) {
      return a.hasContributorInLabel ? -1 : 1;  // Fixed: reversed the comparison
    }

    // Then by English preference (English first)
    if (a.isEnglish !== b.isEnglish) {
      return b.isEnglish ? 1 : -1;
    }

    // Finally by token number
    return a.tokenNum - b.tokenNum;
  });


  return scoredHits.map(hit => `
    <div class="box p-3 mb-2 title-result" data-uri="${hit.uri}" style="cursor: pointer;">
      <p class="has-text-weight-semibold">${hit.suggestLabel}</p>
      ${hit.vLabel && hit.vLabel !== hit.aLabel ?
        `<p class="is-size-6 has-text-dark">${hit.vLabel}</p>` : ''}
      ${hit.more?.contributors && hit.more.contributors.length > 1 ?
        `<p class="is-size-7 has-text-grey">Contributors: ${hit.more.contributors.slice(1).join(', ')}</p>` : ''}
      ${hit.more?.languages ? `<p class="is-size-7 has-text-grey">Language: ${hit.more.languages.join(', ')}</p>` : ''}
    </div>
  `).join('');
}

// Store the current abort controller globally
let currentSearchController = null;

// Store navigation context for back button
let navigationContext = {
  type: null, // 'search', 'all-instances', 'contributor-works'
  data: null  // Store relevant data for reconstruction
};

// Perform searches - make it globally available for back button
window.performSearches = async function performSearches(query) {
  // Set navigation context
  navigationContext = {
    type: 'search',
    data: { query }
  };

  // Cancel any pending search
  if (currentSearchController) {
    currentSearchController.abort();
    currentSearchController = null;
  }

  if (!query || query.length < 2) {
    const resultsDiv = document.getElementById('search-results');
    if (resultsDiv) {
      resultsDiv.innerHTML = '';
    }
    return;
  }

  // Create a new AbortController for this search
  currentSearchController = new AbortController();
  const signal = currentSearchController.signal;

  const resultsDiv = createResultsContainer();
  if (!resultsDiv) {
    console.error('Could not create results container');
    return;
  }
  resultsDiv.innerHTML = '<div class="column"><p>Searching...</p></div>';

  try {
    // Check if the search query is numeric only
    const isNumericOnly = /^\d+$/.test(query.trim());

    if (isNumericOnly) {
      // For numeric-only searches, use the instances endpoint
      const instancesUrl = `https://id.loc.gov/resources/instances/suggest2/?q=${encodeURIComponent(query)}&searchtype=keyword`;

      const response = await fetch(instancesUrl, { signal });
      const instancesData = await response.json();

      // Format the instances results
      resultsDiv.innerHTML = `
        <div class="column">
          <h4 class="title is-5 mb-3">Instance Search Results for "${query}"</h4>
          <div class="instance-results">
            ${formatInstances(instancesData)}
          </div>
        </div>
      `;
    } else {
      // Regular search for non-numeric queries
      const namesUrl = `https://id.loc.gov/authorities/names/suggest2/?q=${encodeURIComponent(query)}*&searchtype=keyword&rdftype=PersonalName&usage=true&count=20`;
      const worksUrl = `https://id.loc.gov/resources/works/suggest2/?q=${encodeURIComponent(query)}&searchtype=keyword&rdftype=Monograph&rdftype=Text&count=100`;

      const [namesResponse, worksResponse] = await Promise.all([
        fetch(namesUrl, { signal }),
        fetch(worksUrl, { signal })
      ]);

      const [namesData, worksData] = await Promise.all([
        namesResponse.json(),
        worksResponse.json()
      ]);

      // Format contributors (now async)
      const contributorHTML = await formatContributors(namesData);

      resultsDiv.innerHTML = `
        <div class="column is-4">
          <h4 class="title is-5 mb-3">Contributors - Click to Load</h4>
          <div class="contributor-results">
            ${contributorHTML}
          </div>
        </div>
        <div class="column is-8">
          <h4 class="title is-5 mb-3">Titles - results for "<i>${query}</i>"</h4>
          <div class="title-results">
            ${formatTitles(worksData, query)}
          </div>
        </div>
      `;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Search cancelled due to new input');
      return;
    }
    resultsDiv.innerHTML = `
      <div class="column">
        <div class="notification is-danger">
          Error performing search: ${error.message}
        </div>
      </div>
    `;
  } finally {
    // Clear the controller reference if this was the current search
    if (currentSearchController?.signal === signal) {
      currentSearchController = null;
    }
  }
}

// Fetch instance details for works
async function fetchInstanceDetails(works, showPublication = true) {
  // Process each work independently
  works.forEach(async (work) => {
    const workId = work.uri.split('/').pop();
    const instanceUrl = `https://id.loc.gov/resources/instances/${workId}.bibframe_raw.json`;

    try {
      const response = await fetch(instanceUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Find the main instance object
      const mainInstance = data.find(item =>
        item['@id'] === `http://id.loc.gov/resources/instances/${workId}`
      );

      let publicationStatement = '';
      let responsibilityStatement = '';

      if (mainInstance) {
        // Extract publication statement
        if (mainInstance['http://id.loc.gov/ontologies/bibframe/publicationStatement']) {
          publicationStatement = mainInstance['http://id.loc.gov/ontologies/bibframe/publicationStatement'][0]?.['@value'] || '';

          // Find all years in the publication statement (including those with 'c' prefix)
          const yearMatches = publicationStatement.match(/\b(c?)(1[5-9]\d{2}|20[0-2]\d)\b/g);
          if (yearMatches && yearMatches.length > 0) {
            // Extract numeric values for comparison
            const yearsWithInfo = yearMatches.map(y => {
              const hasC = y.startsWith('c');
              const numericYear = parseInt(y.replace('c', ''));
              return { original: y, numeric: numericYear, hasC };
            });

            // Find the newest year
            const newestYearInfo = yearsWithInfo.reduce((max, current) =>
              current.numeric > max.numeric ? current : max
            );

            // Bold only the newest year (including its 'c' if present)
            publicationStatement = publicationStatement.replace(
              new RegExp(`\\b${newestYearInfo.original}\\b`, 'g'),
              `<strong>${newestYearInfo.original}</strong>`
            );
          }
        }

        // Extract responsibility statement
        if (mainInstance['http://id.loc.gov/ontologies/bibframe/responsibilityStatement']) {
          responsibilityStatement = mainInstance['http://id.loc.gov/ontologies/bibframe/responsibilityStatement'][0]?.['@value'] || '';
        }
      }

      // Update the UI for this specific work
      const detailsDiv = document.querySelector(`.instance-details[data-work-id="${workId}"]`);
      if (detailsDiv) {
        if (publicationStatement || responsibilityStatement) {
          detailsDiv.innerHTML = `
            ${responsibilityStatement ? `<p class="is-size-7 has-text-grey">By: ${responsibilityStatement}</p>` : ''}
            ${(publicationStatement && showPublication) ? `<p class="is-size-7 has-text-grey"><strong>Published:</strong> ${publicationStatement}</p>` : ''}
          `;
        } else {
          detailsDiv.innerHTML = '<p class="is-size-7 has-text-grey-light">No instance details available</p>';
        }
      }
    } catch (error) {
      console.error(`Error fetching instance for work ${workId}:`, error);

      // Update UI to show error
      const detailsDiv = document.querySelector(`.instance-details[data-work-id="${workId}"]`);
      if (detailsDiv) {
        detailsDiv.innerHTML = '<p class="is-size-7 has-text-grey-light">Details not available</p>';
      }
    }
  });
}

// Handle contributor click
async function handleContributorClick(lccn, contributorName) {
  // Smooth scroll to top
  const resultsContainer = document.getElementById('search-results');
  if (resultsContainer) {
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  console.log(`[CONTRIBUTOR] Processing works for: ${contributorName} (${lccn})`);

  // Show loading state in titles column
  const titleColumn = document.querySelector('#search-results .column:last-child .title-results');
  const titleHeader = document.querySelector('#search-results .column:last-child h4');
  const titleColumnContainer = document.querySelector('#search-results .column:last-child');

  // Store the current search value for the back button
  const searchInput = document.getElementById('search');
  const currentSearch = searchInput ? searchInput.value : '';

  if (titleColumn) {
    titleColumn.innerHTML = `
      <div class="progress-container">
        <div class="progress">
          <div class="progress-bar" style="width: 0%"></div>
        </div>
        <div class="progress-text">Loading contributor works...</div>
      </div>
    `;
  }

  // Helper function to update progress
  const updateProgress = (percentage, text) => {
    const progressBar = titleColumn?.querySelector('.progress-bar');
    const progressText = titleColumn?.querySelector('.progress-text');
    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = text;
  };

  if (titleHeader) {
    titleHeader.innerHTML = `
      <span style="display: flex; align-items: center; justify-content: space-between;">
        <span>Titles - Please Select Work</span>
        <button class="button is-small is-light" onclick="(() => { const input = document.getElementById('search'); if (input && input.value) { performSearches(input.value); } })()">
          <span>← Back</span>
        </button>
      </span>
    `;
  }

  try {
    // Fetch first page to get total pages
    updateProgress(5, 'Fetching contributor information...');
    const firstPageUrl = `https://id.loc.gov/resources/works/relationships/contributorto/?label=http://id.loc.gov/authorities/names/${lccn}&page=0`;
    const firstPageResponse = await fetch(firstPageUrl);
    const firstPageData = await firstPageResponse.json();

    // Determine how many pages to fetch
    const maxPage = Math.min(firstPageData.summary.totalPages, 49); // Cap at 50 pages total
    updateProgress(10, `Found ${firstPageData.summary.totalPages + 1} pages of works...`);

    // Create array of promises for all pages
    const pagePromises = [];
    for (let page = 0; page <= maxPage; page++) {
      const pageUrl = `https://id.loc.gov/resources/works/relationships/contributorto/?label=http://id.loc.gov/authorities/names/${lccn}&page=${page}`;
      pagePromises.push(fetch(pageUrl).then(res => res.json()));
    }

    // Fetch all pages simultaneously
    updateProgress(15, `Loading ${maxPage + 1} pages of works...`);
    const allPagesData = await Promise.all(pagePromises);
    updateProgress(30, 'Processing work records...');

    // Collapse all results into one array and deduplicate by URI
    const allResultsRaw = allPagesData.flatMap(pageData => pageData.results || []);
    const uriMap = new Map();
    allResultsRaw.forEach(result => {
      if (!uriMap.has(result.uri)) {
        uriMap.set(result.uri, result);
      }
    });
    const allResults = Array.from(uriMap.values());
    console.log(`Total results before dedup: ${allResultsRaw.length}, after dedup: ${allResults.length}`);

    // Fetch bibframe data for each work to check if it has Text type
    console.log(`Checking types for ${allResults.length} works...`);
    updateProgress(35, `Fetching details for ${allResults.length} works...`);

    let completedCount = 0;
    const workPromises = allResults.map(async work => {
      const workId = work.uri.split('/').pop();
      try {
        const response = await fetch(`https://id.loc.gov/resources/works/${workId}.bibframe_raw.json`);
        const data = await response.json();

        // Update progress as each work completes
        completedCount++;
        const progressPercent = 35 + Math.round((completedCount / allResults.length) * 55); // 35% to 90%
        updateProgress(progressPercent, `Loading work details... (${completedCount}/${allResults.length})`);
        const mainWork = data.find(item => item['@id'] === work.uri);

        let isText = false;
        let isNonText = false;
        let workType = null;
        if (mainWork) {
          console.log(`Work ${workId}:`, mainWork['@type']);
          if (mainWork['@type'] && Array.isArray(mainWork['@type'])) {
            isText = mainWork['@type'].includes('http://id.loc.gov/ontologies/bibframe/Text');
            // If it has a type but not Text, it's non-text (like MusicAudio, MovingImage, etc.)
            isNonText = !isText && mainWork['@type'].length > 1; // Has types beyond just "Work"

            // Extract the specific work type (not Work, Monograph, or Text)
            if (isNonText) {
              const specificType = mainWork['@type'].find(type => {
                const typeName = type.split('/').pop();
                return typeName !== 'Work' && typeName !== 'Monograph' && typeName !== 'Text';
              });
              if (specificType) {
                workType = specificType.split('/').pop(); // Extract just the type name
              }
            }

            console.log(`  Has Text type: ${isText}, Is Non-Text: ${isNonText}, Work Type: ${workType}`);
          } else {
            console.log(`  No @type field found`);
          }
        } else {
          console.log(`  Main work not found for ${work.uri}`);
        }

        return { ...work, isText, isNonText, workType, bibframeData: data };
      } catch (error) {
        console.error(`  Error fetching ${workId}:`, error);
        return { ...work, isText: true, isNonText: false, workType: null, bibframeData: null }; // Default to text if error
      }
    });

    const enrichedResults = await Promise.all(workPromises);
    updateProgress(95, 'Organizing results...');

    // Store enriched results globally for later use when displaying instances
    window.contributorWorksBibframeData = {};
    enrichedResults.forEach(work => {
      window.contributorWorksBibframeData[work.uri] = work.bibframeData;
    });

    // Helper function to normalize title for comparison
    function normalizeTitle(title) {
      return title
        .toLowerCase()
        .replace(/[.,;:!?\-–—'"'""\[\](){}]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    }

    // Group results by title and type
    const textWorks = {};
    const nonTextWorks = {};
    const titleCounts = {}; // Track frequency of each title form

    let nonTextCount = 0;
    enrichedResults.forEach(work => {
      // Extract just the title part after the contributor name
      let title = work.label;
      const workId = work.uri.split('/').pop();

      console.log(`[TITLE DEBUG ${workId}] Starting title extraction`);
      console.log(`[TITLE DEBUG ${workId}] Initial label from API:`, work.label);
      console.log(`[TITLE DEBUG ${workId}] Known contributor:`, contributorName);

      // If no label, try to get title from bibframe data
      if (!title) {
        console.log(`[TITLE DEBUG ${workId}] No label from API, checking bibframe data`);

        if (work.bibframeData) {
          console.log(`[TITLE DEBUG ${workId}] Bibframe data exists, searching for work object`);
          const mainWork = work.bibframeData.find(item => item['@id'] === work.uri);

          if (mainWork) {
            console.log(`[TITLE DEBUG ${workId}] Found main work object`);

            // Try to get aap (authorized access point) or title
            const aap = mainWork['http://id.loc.gov/ontologies/bflc/aap'];
            if (aap && aap[0]) {
              title = aap[0]['@value'];
              console.log(`[TITLE DEBUG ${workId}] ✓ Using AAP: "${title}"`);
            } else {
              console.log(`[TITLE DEBUG ${workId}] No AAP found, trying title property`);

              // Try to get title from title property
              const titleProp = mainWork['http://id.loc.gov/ontologies/bibframe/title'];
              if (titleProp && titleProp[0]) {
                const titleId = titleProp[0]['@id'];
                console.log(`[TITLE DEBUG ${workId}] Found title reference: ${titleId}`);

                const titleObj = work.bibframeData.find(item => item['@id'] === titleId);
                if (titleObj) {
                  console.log(`[TITLE DEBUG ${workId}] Found title object`);

                  const mainTitle = titleObj['http://id.loc.gov/ontologies/bibframe/mainTitle'];
                  if (mainTitle && mainTitle[0]) {
                    title = mainTitle[0]['@value'];
                    console.log(`[TITLE DEBUG ${workId}] ✓ Using mainTitle: "${title}"`);
                  } else {
                    console.log(`[TITLE DEBUG ${workId}] No mainTitle in title object`);
                  }
                } else {
                  console.log(`[TITLE DEBUG ${workId}] Could not find title object with ID: ${titleId}`);
                }
              } else {
                console.log(`[TITLE DEBUG ${workId}] No title property in main work`);
              }
            }
          } else {
            console.log(`[TITLE DEBUG ${workId}] Could not find main work object in bibframe data`);
          }
        } else {
          console.log(`[TITLE DEBUG ${workId}] No bibframe data available`);
        }
      } else {
        console.log(`[TITLE DEBUG ${workId}] ✓ Using label from API: "${title}"`);
      }

      // Final fallback to Work ID if still no title
      if (!title) {
        console.warn(`[TITLE DEBUG ${workId}] ⚠️ No title found anywhere, using ID fallback`);
        title = `Work ${workId}`;
      } else {
        console.log(`[TITLE DEBUG ${workId}] Final title before processing: "${title}"`);
      }

      // Try multiple patterns to strip contributor names
      // Pattern 1: "Lastname, Firstname, dates. Title" or "Lastname, Firstname, dates Title"
      // Pattern 2: "Lastname, Firstname. Title" or "Lastname, Firstname Title"

      // Store original for debugging
      const originalTitle = title;
      let extractionSuccessful = false;

      // First, try to use the known contributor name if available
      if (contributorName && title.startsWith(contributorName)) {
        // Direct match - contributor name is at the beginning
        let remainder = title.substring(contributorName.length);

        // Remove common separators after name: ". ", ", ", "- ", ": "
        remainder = remainder.replace(/^[\s.,:\-–—]+/, '');

        if (remainder && remainder.length > 0) {
          title = remainder.trim();
          console.log(`[TITLE DEBUG] Used known contributor name to extract: "${title}"`);
          extractionSuccessful = true;
        }
      } else if (contributorName) {
        // Try to extract just the last name from contributorName for partial matching
        const contributorParts = contributorName.split(',')[0].trim(); // Get last name
        if (title.startsWith(contributorParts)) {
          // Find where the actual title begins after the author info
          const patterns = [
            new RegExp(`^${contributorParts.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.]*\\.\s+`), // Lastname...anything. Title
            new RegExp(`^${contributorParts.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.]*[-–]\s+`)  // Lastname...anything- Title
          ];

          for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match) {
              title = title.substring(match[0].length);
              console.log(`[TITLE DEBUG] Used partial contributor match to extract: "${title}"`);
              extractionSuccessful = true;
              break;
            }
          }
        }
      }

      // If we couldn't use the contributor name, fall back to pattern matching
      if (!extractionSuccessful && title.match(/^[^,]+,\s*[^,\.]+/)) {
        // Find where the actual title starts
        // Could be after ". " or after a year pattern like "1928- " or "1928-2021 "

        // First check for pattern with titles/honorifics: "Lastname, Firstname, Title/Sir/Dr., dates. Title"
        const authorWithTitleMatch = title.match(/^[^,]+,\s*[^,]+(?:,\s*(?:Sir|Dr|Prof|Mr|Mrs|Ms|Miss|Lord|Lady|Baron|Count|Duke)[^,]*)?(?:,\s*\d{4}[-–](?:\d{4})?)?\s*\.\s+/);

        if (authorWithTitleMatch) {
          // Extract everything after the author with title/honorific
          title = title.substring(authorWithTitleMatch[0].length);
          console.log(`[TITLE DEBUG] Matched author with title/honorific pattern, extracted: "${title}"`);
          extractionSuccessful = true;
        } else {
          // Check for pattern: "Lastname, Firstname, dates- Title" or "Lastname, Firstname, dates. Title"
          const authorWithDatesMatch = title.match(/^[^,]+,\s*[^,]+,\s*\d{4}[-–](?:\d{4})?\s*[-.]?\s*/);

          if (authorWithDatesMatch) {
            // Extract everything after the author with dates
            title = title.substring(authorWithDatesMatch[0].length);
            console.log(`[TITLE DEBUG] Matched author with dates pattern, extracted: "${title}"`);
            extractionSuccessful = true;
          } else {
            // Handle names with initials like "Rowling, J. K. Harry Potter"
            // This regex matches: Lastname, (initials and names). Title
            const nameWithInitialsMatch = title.match(/^[^,]+,\s*(?:[A-Z]\.?\s*)+(?:[A-Za-z]+\s*)?(?:\([^)]+\))?\s*\.\s+([A-Z])/);

            if (nameWithInitialsMatch) {
              // Found a name with initials pattern, extract everything after it
              const titleStartIndex = title.indexOf(nameWithInitialsMatch[1], nameWithInitialsMatch.index);
              title = title.substring(titleStartIndex);
              console.log(`[TITLE DEBUG] Matched name with initials, extracted: "${title}"`);
              extractionSuccessful = true;
            } else {
              // Fallback: look for the last ". " that appears to end the author name
              // This handles both "Lastname, Firstname. Title" and "Lastname, F. M. Title"
              const lastAuthorPeriod = title.match(/^[^,]+,\s*[^.]+\.\s+/);
              if (lastAuthorPeriod) {
                title = title.substring(lastAuthorPeriod[0].length);
                console.log(`[TITLE DEBUG] Matched last period pattern, extracted: "${title}"`);
                extractionSuccessful = true;
              }
            }
          }
        }

        // Only apply additional processing if we haven't successfully extracted a title
        if (!extractionSuccessful) {
          // Only check for standalone years if title still looks like author format
          if (title && title.match(/^[^,]+,\s*[^,\.]+/)) {
            const yearMatch = title.match(/\d{4}[-–]\d{0,4}\s+/);
            const yearEndMatch = title.match(/\d{4}[-–]\s+/);

            if (yearMatch) {
              // If there's a year range like "1928-1981 ", use end of that
              title = title.substring(yearMatch.index + yearMatch[0].length);
            } else if (yearEndMatch) {
              // If there's a year with dash like "1928- ", use end of that
              title = title.substring(yearEndMatch.index + yearEndMatch[0].length);
            }
          }

          // Final fallback for other patterns - only if title still looks like author format
          if (!title || title.match(/^[^,]+,\s*[^,\.]+/)) {
            // Look for pattern with just comma and space after second word
            const commaCount = (originalTitle.match(/,/g) || []).length;
            if (commaCount >= 1) {
              // Find the second comma or first space after first comma
              const firstComma = originalTitle.indexOf(',');
              const afterFirstComma = originalTitle.substring(firstComma + 1).trim();
              const nextDelimiter = afterFirstComma.search(/[\s,]/);
              if (nextDelimiter > -1) {
                const startOfTitle = firstComma + 1 + nextDelimiter + 1;
                const potentialTitle = originalTitle.substring(startOfTitle).trim();
                // Only use this if it looks like a real title (not another name)
                if (potentialTitle && !potentialTitle.match(/^[^,]+,\s*[^,]+/)) {
                  title = potentialTitle;
                  console.log(`[TITLE DEBUG] Used fallback pattern, extracted: "${title}"`);
                }
              }
            }
          }
        }
      }

      // Normalize the title for grouping
      const normalizedTitle = normalizeTitle(title);

      // Track title frequency for determining most common form
      if (!titleCounts[normalizedTitle]) {
        titleCounts[normalizedTitle] = {};
      }
      if (!titleCounts[normalizedTitle][title]) {
        titleCounts[normalizedTitle][title] = 0;
      }
      titleCounts[normalizedTitle][title]++;

      if (work.isNonText) {
        nonTextCount++;
        console.log(`Non-text work found: ${title}`);
      }

      // Store work with normalized title for grouping
      work.displayTitle = title;
      work.normalizedTitle = normalizedTitle;

      console.log(`[TITLE DEBUG ${workId}] After processing:`);
      console.log(`[TITLE DEBUG ${workId}]   Display title: "${work.displayTitle}"`);
      console.log(`[TITLE DEBUG ${workId}]   Normalized: "${work.normalizedTitle}"`);

      // Keep the workType for non-text works
    });

    // Now group by normalized titles and choose most common form for display
    // Also deduplicate by URI
    const seenUris = new Set();
    enrichedResults.forEach(work => {
      // Skip if we've already seen this URI
      if (seenUris.has(work.uri)) {
        console.log(`Skipping duplicate URI: ${work.uri}`);
        return;
      }
      seenUris.add(work.uri);

      const normalizedTitle = work.normalizedTitle;
      const targetGroup = work.isNonText ? nonTextWorks : textWorks;

      // Find the most common form of this normalized title
      let mostCommonForm = work.displayTitle;
      if (titleCounts[normalizedTitle]) {
        let maxCount = 0;
        Object.entries(titleCounts[normalizedTitle]).forEach(([form, count]) => {
          if (count > maxCount) {
            maxCount = count;
            mostCommonForm = form;
          }
        });
      }

      // Use the normalized title as key but store the most common form
      if (!targetGroup[normalizedTitle]) {
        targetGroup[normalizedTitle] = {
          displayTitle: mostCommonForm,
          works: []
        };
      }
      targetGroup[normalizedTitle].works.push(work);
    });

    console.log(`Total works: ${enrichedResults.length}, Non-text works: ${nonTextCount}`);

    // Sort titles alphabetically by display title
    const sortedTextTitles = Object.keys(textWorks).sort((a, b) => {
      return textWorks[a].displayTitle.localeCompare(textWorks[b].displayTitle);
    });
    const sortedNonTextTitles = Object.keys(nonTextWorks).sort((a, b) => {
      return nonTextWorks[a].displayTitle.localeCompare(nonTextWorks[b].displayTitle);
    });

    console.log(`Text titles: ${sortedTextTitles.length}, Non-text titles: ${sortedNonTextTitles.length}`);

    // Display the grouped results
    if (titleColumn) {
      if (sortedTextTitles.length === 0 && sortedNonTextTitles.length === 0) {
        titleColumn.innerHTML = '<p class="has-text-grey">No works found</p>';
      } else {
        let resultsHtml = '';

        // Separate text works into popular (>1 instance) and unique (1 instance)
        const popularTextTitles = sortedTextTitles.filter(key => textWorks[key].works.length > 1);
        const uniqueTextTitles = sortedTextTitles.filter(key => textWorks[key].works.length === 1);

        // Display popular titles (multiple instances)
        if (popularTextTitles.length > 0) {
          resultsHtml += `<p class="has-text-primary has-text-weight-semibold mb-3">Multiple Instances</p>`;
          resultsHtml += popularTextTitles.map(key => {
            const groupData = textWorks[key];
            const works = groupData.works;
            const displayTitle = groupData.displayTitle;
            const primaryWork = works[0];
            const allWorkUris = works.map(w => w.uri).join(',');

            // Debug empty titles
            if (!displayTitle || displayTitle.trim() === '') {
              console.error(`[TITLE DEBUG] EMPTY TITLE for group with key "${key}"`);
              console.error(`[TITLE DEBUG] Works in group:`, works);
              console.error(`[TITLE DEBUG] Group data:`, groupData);
            }

            return `
              <div class="box p-3 mb-2 collapsed-work-result" data-uri="${primaryWork.uri}" data-all-uris="${allWorkUris}" data-title="${displayTitle.replace(/"/g, '&quot;')}" style="cursor: pointer;">
                <p class="has-text-weight-semibold">${displayTitle}</p>
                <p class="is-size-7 has-text-grey">${works.length} instances</p>
                <div class="instance-details" data-work-id="${primaryWork.uri.split('/').pop()}">
                  <p class="is-size-7 has-text-grey-light">Loading details...</p>
                </div>
              </div>
            `;
          }).join('');
        }

        // Display unique titles (single instance)
        if (uniqueTextTitles.length > 0) {
          if (popularTextTitles.length > 0) {
            resultsHtml += `<hr style="margin: 1.5rem 0;">`;
          }
          resultsHtml += `<p class="has-text-primary has-text-weight-semibold mb-3">Single Instance</p>`;
          resultsHtml += uniqueTextTitles.map(key => {
            const groupData = textWorks[key];
            const works = groupData.works;
            const displayTitle = groupData.displayTitle;
            const primaryWork = works[0];

            return `
              <div class="box p-3 mb-2 title-result single-instance" data-uri="${primaryWork.uri}" style="cursor: pointer;">
                <p class="has-text-weight-semibold">${displayTitle}</p>
                <div class="instance-details" data-work-id="${primaryWork.uri.split('/').pop()}">
                  <p class="is-size-7 has-text-grey-light">Loading details...</p>
                </div>
              </div>
            `;
          }).join('');
        }

        // Display non-text works if they exist
        if (sortedNonTextTitles.length > 0) {
          resultsHtml += `
            <hr style="margin: 1.5rem 0;">
            <p class="has-text-grey has-text-weight-semibold mb-3">Non-Text Works</p>
          `;

          resultsHtml += sortedNonTextTitles.map(key => {
            const groupData = nonTextWorks[key];
            const works = groupData.works;
            const displayTitle = groupData.displayTitle;
            const primaryWork = works[0];
            const allWorkUris = works.map(w => w.uri).join(',');

            // Get the work type from the primary work
            const workType = primaryWork.workType;

            return `
              <div class="box p-3 mb-2 non-text-work ${works.length > 1 ? 'collapsed-work-result' : 'title-result single-instance'}" data-uri="${primaryWork.uri}" ${works.length > 1 ? `data-all-uris="${allWorkUris}" data-title="${displayTitle.replace(/"/g, '&quot;')}"` : ''} style="cursor: pointer;">
                <p class="has-text-weight-semibold">
                  ${displayTitle}
                  ${workType ? `<span class="is-size-7 has-text-grey-light ml-2">[${workType}]</span>` : ''}
                </p>
                ${works.length > 1 ? `<p class="is-size-7 has-text-grey">${works.length} instances</p>` : ''}
                <div class="instance-details" data-work-id="${primaryWork.uri.split('/').pop()}">
                  <p class="is-size-7 has-text-grey-light">Loading details...</p>
                </div>
              </div>
            `;
          }).join('');
        }

        titleColumn.innerHTML = resultsHtml;

        // Fetch instance details for all displayed works (without publication info for contributor works)
        const allDisplayedWorks = [
          ...popularTextTitles.map(key => textWorks[key].works[0]),
          ...uniqueTextTitles.map(key => textWorks[key].works[0]),
          ...sortedNonTextTitles.map(key => nonTextWorks[key].works[0])
        ];
        fetchInstanceDetails(allDisplayedWorks, false); // Don't show publication for contributor works
      }
    }
  } catch (error) {
    console.error('Error fetching contributor works:', error);
    if (titleColumn) {
      titleColumn.innerHTML = '<p class="has-text-danger">Error loading contributor works</p>';
    }
  }
}

// Handle collapsed work click (multiple works) - make it globally available
window.handleCollapsedWorkClick = async function handleCollapsedWorkClick(allUris, title) {
  console.log('[handleCollapsedWorkClick] Called with:', { allUris, title });

  // Store navigation context
  navigationContext = {
    type: 'all-instances',
    data: { allUris, title }
  };

  console.log('[handleCollapsedWorkClick] Set navigation context:', navigationContext);

  // Check if we're coming from instance details view or need to recreate structure
  let resultsContainer = document.getElementById('search-results');
  console.log('[handleCollapsedWorkClick] Results container exists?', !!resultsContainer);

  // Check specifically for the search results structure (not instance details)
  const hasSearchStructure = resultsContainer &&
    resultsContainer.querySelector('.contributor-results') &&
    resultsContainer.querySelector('.title-results');

  if (resultsContainer) {
    console.log('[handleCollapsedWorkClick] Results container HTML:', resultsContainer.innerHTML.substring(0, 200));
    console.log('[handleCollapsedWorkClick] Has search structure?', hasSearchStructure);
  }

  if (!resultsContainer || !hasSearchStructure) {
    // We need to recreate the search results structure
    console.log('[handleCollapsedWorkClick] Recreating search results structure');

    // Get or create the results container
    if (!resultsContainer) {
      resultsContainer = createResultsContainer();
    }

    // Recreate the two-column layout
    resultsContainer.innerHTML = `
      <div class="columns">
        <div class="column is-4">
          <h4 class="title is-5 mb-3">Contributors</h4>
          <div class="contributor-results">
            <p class="has-text-grey">Search to see contributors</p>
          </div>
        </div>
        <div class="column is-8">
          <h4 class="title is-5 mb-3">Titles - Please Select Instance</h4>
          <div class="title-results">
            <div class="working-message">Loading all instances...</div>
          </div>
        </div>
      </div>
    `;
  } else {
    console.log('[handleCollapsedWorkClick] Using existing search results structure');
  }

  // Smooth scroll to top
  if (resultsContainer) {
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Get the title column and header
  const titleColumn = document.querySelector('#search-results .column:last-child .title-results');
  const titleHeader = document.querySelector('#search-results .column:last-child h4');

  console.log('[handleCollapsedWorkClick] Title column found?', !!titleColumn);
  console.log('[handleCollapsedWorkClick] Title header found?', !!titleHeader);

  // Show loading state
  if (titleColumn) {
    console.log('[handleCollapsedWorkClick] Setting loading state');
    titleColumn.innerHTML = '<div class="working-message">Loading all instances...</div>';
  } else {
    console.error('[handleCollapsedWorkClick] Could not find title column!');
  }

  // Update header with back button
  if (titleHeader) {
    titleHeader.innerHTML = `
      <span style="display: flex; align-items: center; justify-content: space-between;">
        <span>Titles - Please Select Instance</span>
        <button class="button is-small is-light" id="back-to-works">
          <span>← Back</span>
        </button>
      </span>
    `;

    // Add click handler for back button
    const backButton = document.getElementById('back-to-works');
    if (backButton) {
      backButton.addEventListener('click', () => {
        const contributorBox = document.querySelector('.contributor-box[data-selected="true"]');
        if (contributorBox) {
          const lccn = contributorBox.dataset.token;
          const contributorName = contributorBox.dataset.label;
          if (lccn && lccn.startsWith('n')) {
            handleContributorClick(lccn, contributorName);
          }
        } else {
          const input = document.getElementById('search');
          if (input && input.value) {
            performSearches(input.value);
          }
        }
      });
    }
  }

  console.log('[handleCollapsedWorkClick] Starting to fetch instances');

  try {
    // Parse the URIs
    const uriList = allUris.split(',');
    console.log('[handleCollapsedWorkClick] Processing', uriList.length, 'URIs');

    // Fetch instance data for all works to get proper labels
    const instancePromises = uriList.map(async workUri => {
      const workId = workUri.split('/').pop();
      const instanceUri = workUri.replace('/resources/works/', '/resources/instances/');
      const instanceUrl = `https://id.loc.gov/resources/instances/${workId}.bibframe_raw.json`;

      try {
        const response = await fetch(instanceUrl);
        if (!response.ok) {
          return {
            '@id': instanceUri,
            label: `Instance ${workId}`,
            workId: workId
          };
        }
        const data = await response.json();

        // Find the main instance object
        const mainInstance = data.find(item =>
          item['@id'] === instanceUri
        );

        let label = `Instance ${workId}`;
        if (mainInstance) {
          // Try to get the label
          if (mainInstance['http://www.w3.org/2000/01/rdf-schema#label']) {
            label = mainInstance['http://www.w3.org/2000/01/rdf-schema#label'][0]['@value'];
          } else if (mainInstance['http://id.loc.gov/ontologies/bibframe/title']) {
            // Look for title in the data
            const titleId = mainInstance['http://id.loc.gov/ontologies/bibframe/title'][0]['@id'];
            const titleObj = data.find(item => item['@id'] === titleId);
            if (titleObj && titleObj['http://id.loc.gov/ontologies/bibframe/mainTitle']) {
              label = titleObj['http://id.loc.gov/ontologies/bibframe/mainTitle'][0]['@value'];
            }
          }
        }

        return {
          '@id': instanceUri,
          label: label,
          workId: workId,
          data: mainInstance
        };
      } catch (error) {
        console.error(`Error fetching instance ${workId}:`, error);
        return {
          '@id': instanceUri,
          label: `Instance ${workId}`,
          workId: workId
        };
      }
    });

    // Wait for all instance data
    const allInstances = await Promise.all(instancePromises);

    // Display the instances
    if (titleColumn) {
      if (allInstances.length === 0) {
        titleColumn.innerHTML = '<p class="has-text-grey">No instances found</p>';
      } else {
        let resultsHtml = `<p class="has-text-primary has-text-weight-semibold mb-3">${title} - All Instances</p>`;

        // Sort instances by ID
        allInstances.sort((a, b) => {
          const idA = parseInt(a['@id'].split('/').pop()) || 0;
          const idB = parseInt(b['@id'].split('/').pop()) || 0;
          return idA - idB;
        });

        resultsHtml += allInstances.map(instance => {
          const uri = instance['@id'];
          const label = instance.label;
          const workId = instance.workId;

          // Extract publication and responsibility statements from the data we already have
          let publicationStatement = '';
          let responsibilityStatement = '';

          if (instance.data) {
            if (instance.data['http://id.loc.gov/ontologies/bibframe/publicationStatement']) {
              publicationStatement = instance.data['http://id.loc.gov/ontologies/bibframe/publicationStatement'][0]?.['@value'] || '';

              // Find all years in the publication statement (including those with 'c' prefix)
              const yearMatches = publicationStatement.match(/\b(c?)(1[5-9]\d{2}|20[0-2]\d)\b/g);
              if (yearMatches && yearMatches.length > 0) {
                // Extract numeric values for comparison
                const yearsWithInfo = yearMatches.map(y => {
                  const hasC = y.startsWith('c');
                  const numericYear = parseInt(y.replace('c', ''));
                  return { original: y, numeric: numericYear, hasC };
                });

                // Find the newest year
                const newestYearInfo = yearsWithInfo.reduce((max, current) =>
                  current.numeric > max.numeric ? current : max
                );

                // Bold only the newest year (including its 'c' if present)
                publicationStatement = publicationStatement.replace(
                  new RegExp(`\\b${newestYearInfo.original}\\b`, 'g'),
                  `<strong>${newestYearInfo.original}</strong>`
                );
              }
            }
            if (instance.data['http://id.loc.gov/ontologies/bibframe/responsibilityStatement']) {
              responsibilityStatement = instance.data['http://id.loc.gov/ontologies/bibframe/responsibilityStatement'][0]?.['@value'] || '';
            }
          }

          return `
            <div class="box p-3 mb-2 title-result" data-uri="${uri}" style="cursor: pointer;">
              <p class="has-text-weight-semibold">${label}</p>
              <div class="instance-details">
                ${responsibilityStatement ? `<p class="is-size-7 has-text-grey">By: ${responsibilityStatement}</p>` : ''}
                ${publicationStatement ? `<p class="is-size-7 has-text-grey"><strong>Published:</strong> ${publicationStatement}</p>` : ''}
                ${!responsibilityStatement && !publicationStatement ? '<p class="is-size-7 has-text-grey-light">No additional details available</p>' : ''}
              </div>
            </div>
          `;
        }).join('');

        titleColumn.innerHTML = resultsHtml;
      }
    }
    console.log('[handleCollapsedWorkClick] Completed successfully');
  } catch (error) {
    console.error('[handleCollapsedWorkClick] Error:', error);
    console.error('[handleCollapsedWorkClick] Error stack:', error.stack);
    const titleColumn = document.querySelector('#search-results .column:last-child .title-results');
    if (titleColumn) {
      titleColumn.innerHTML = '<p class="has-text-danger">Error loading instances</p>';
    }
  }
}

// Handle title click
async function handleTitleClick(uri, clickedLabel) {
  // Smooth scroll to top
  const resultsContainer = document.getElementById('search-results');
  if (resultsContainer) {
    resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Convert URI to bibframe_raw.json URL
  const workId = uri.split('/').pop();
  const bibframeUrl = `https://id.loc.gov/resources/works/${workId}.bibframe_raw.json`;

  // Get the current search value
  const searchInput = document.getElementById('search');
  const searchValue = searchInput ? searchInput.value.toLowerCase() : '';

  try {
    const response = await fetch(bibframeUrl);
    const data = await response.json();

    // Find the main work object
    const mainWork = data.find(item => item['@id'] === uri);

    if (mainWork && mainWork['http://id.loc.gov/ontologies/bibframe/contribution']) {
      // Get the first contribution ID
      const firstContributionId = mainWork['http://id.loc.gov/ontologies/bibframe/contribution'][0]['@id'];

      // Find the contribution object in the data
      const contribution = data.find(item => item['@id'] === firstContributionId);

      if (contribution && contribution['http://id.loc.gov/ontologies/bibframe/agent']) {
        // Extract the agent URI
        let agentUri = contribution['http://id.loc.gov/ontologies/bibframe/agent'][0]['@id'];

        // Check if it's a blank node (starts with "_:")
        if (agentUri.startsWith('_:')) {
          // Need to fetch the processed bibframe.json instead
          const processedUrl = `https://id.loc.gov/resources/works/${workId}.bibframe.json`;

          try {
            const processedResponse = await fetch(processedUrl);
            const processedData = await processedResponse.json();

            // Find the main work object in processed data
            const processedWork = processedData.find(item => item['@id'] === uri);

            if (processedWork && processedWork['http://id.loc.gov/ontologies/bibframe/contribution']) {
              // Get the first contribution in processed data
              const firstContribId = processedWork['http://id.loc.gov/ontologies/bibframe/contribution'][0]['@id'];
              const processedContribution = processedData.find(item => item['@id'] === firstContribId);

              if (processedContribution && processedContribution['http://id.loc.gov/ontologies/bibframe/agent']) {
                agentUri = processedContribution['http://id.loc.gov/ontologies/bibframe/agent'][0]['@id'];
              }
            }
          } catch (error) {
            console.error('Error fetching processed bibframe data:', error);
          }
        }

        // If still a blank node, can't proceed
        if (agentUri.startsWith('_:')) {
          throw new Error('Unable to resolve contributor - blank node found');
        }

        // Extract the LCCN from the agent URI
        const lccn = agentUri.split('/').pop();


        // Show interstitial working state with animation
        const titleColumn = document.querySelector('#search-results .column:last-child .title-results');
        const titleContainer = document.querySelector('#search-results .column:last-child');

        if (titleColumn && titleContainer) {
          // Add slide animation class
          titleContainer.classList.add('slide-transition');

          // Show working message
          titleColumn.innerHTML = '<div class="working-message">Working...</div>';

          // Remove animation class after animation completes
          setTimeout(() => {
            titleContainer.classList.remove('slide-transition');
          }, 400);
        }

        // Fetch contributor's works - first page to get total pages
        const firstPageUrl = `https://id.loc.gov/resources/works/relationships/contributorto/?label=http://id.loc.gov/authorities/names/${lccn}&page=0`;
        const firstPageResponse = await fetch(firstPageUrl);
        const firstPageData = await firstPageResponse.json();

        // Determine how many pages to fetch (max 20)
        // totalPages indicates the highest page number, so we need to fetch pages 0 through totalPages inclusive
        const maxPage = Math.min(firstPageData.summary.totalPages, 29); // Cap at page 19 (30 pages total)

        // Create array of promises for all pages
        const pagePromises = [];
        for (let page = 0; page <= maxPage; page++) {
          const pageUrl = `https://id.loc.gov/resources/works/relationships/contributorto/?label=http://id.loc.gov/authorities/names/${lccn}&page=${page}`;
          pagePromises.push(fetch(pageUrl).then(res => res.json()));
        }

        // Fetch all pages simultaneously
        const allPagesData = await Promise.all(pagePromises);

        // Collapse all results into one array
        const allResults = allPagesData.flatMap(pageData => pageData.results || []);


        // Calculate Levenshtein distance for each result
        const scoredResults = allResults.map(result => {
          const resultLabel = result.label.toLowerCase();

          // Compare against both search value and clicked label
          const searchDistance = searchValue ? levenshteinDistance(searchValue, resultLabel) : Infinity;
          const clickedDistance = clickedLabel ? levenshteinDistance(clickedLabel.toLowerCase(), resultLabel) : Infinity;

          // Use the minimum distance
          const distance = Math.min(searchDistance, clickedDistance);

          return {
            ...result,
            distance: distance
          };
        });

        // Sort by distance (lower is better) and take top 20
        const bestMatches = scoredResults
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 20);


        // Display the best matches
        if (titleColumn) {
          if (bestMatches.length === 0) {
            titleColumn.innerHTML = '<p class="has-text-grey">No matching works found</p>';
          } else {
            // Update the column header with back button
            const titleHeader = document.querySelector('#search-results .column:last-child h4');
            if (titleHeader) {
              titleHeader.innerHTML = `
                <span style="display: flex; align-items: center; justify-content: space-between;">
                  <span>Titles - Please Select Instance</span>
                  <button class="button is-small is-light" onclick="(() => { const input = document.getElementById('search'); if (input && input.value) { performSearches(input.value); } })()">
                    <span>← Back</span>
                  </button>
                </span>
              `;
            }

            // Separate good and poor matches
            const goodMatches = bestMatches.filter(result => result.distance <= 5);
            const poorMatches = bestMatches.filter(result => result.distance > 5);

            // Sort good matches by URI numerical ID (smallest to largest)
            goodMatches.sort((a, b) => {
              const idA = parseInt(a.uri.split('/').pop()) || 0;
              const idB = parseInt(b.uri.split('/').pop()) || 0;
              return idA - idB;
            });

            let resultsHtml = '';

            // Add good matches
            if (goodMatches.length > 0) {
              resultsHtml += goodMatches.map(result => `
                <div class="box p-3 mb-2 title-result instance-selection" data-uri="${result.uri}" style="cursor: pointer;">
                  <p class="has-text-weight-semibold">${result.label}</p>
                  <div class="instance-details" data-work-id="${result.uri.split('/').pop()}">
                    <p class="is-size-7 has-text-grey-light">Loading details...</p>
                  </div>
                </div>
              `).join('');
            }

            // Add divider and poor matches if they exist
            if (poorMatches.length > 0) {
              resultsHtml += `
                <hr style="margin: 1.5rem 0;">
                <p class="has-text-grey has-text-weight-semibold mb-3">Poor Matches</p>
              `;
              resultsHtml += poorMatches.map(result => `
                <div class="box p-3 mb-2 title-result instance-selection" data-uri="${result.uri}" style="cursor: pointer;">
                  <p class="has-text-weight-semibold">${result.label}</p>
                  <div class="instance-details" data-work-id="${result.uri.split('/').pop()}">
                    <p class="is-size-7 has-text-grey-light">Loading details...</p>
                  </div>
                </div>
              `).join('');
            }

            titleColumn.innerHTML = resultsHtml;

            // Fetch instance details for each displayed work
            fetchInstanceDetails(bestMatches);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching bibframe data:', error);
    const titleColumn = document.querySelector('#search-results .column:last-child .title-results');
    if (titleColumn) {
      titleColumn.innerHTML = '<p class="has-text-danger">Error loading related works</p>';

      // Store the problematic URI to exclude it
      if (!window.excludedUris) {
        window.excludedUris = new Set();
      }
      window.excludedUris.add(uri);

      // Wait 1 second then re-display the original search results
      setTimeout(() => {
        const searchInput = document.getElementById('search');
        if (searchInput && searchInput.value) {
          performSearches(searchInput.value);
        }
      }, 1000);
    }
  }
}

// Handle instance click - show detail view
async function handleInstanceClick(instanceUri) {
  console.log('[handleInstanceClick] Called with:', instanceUri);
  console.log('[handleInstanceClick] Current navigation context:', navigationContext);

  // Smooth scroll to the search section
  const searchInput = document.getElementById('search');
  if (searchInput) {
    const searchSection = searchInput.closest('.field').parentElement;
    if (searchSection) {
      searchSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Extract IDs
  const instanceId = instanceUri.split('/').pop();
  const workUri = instanceUri.replace('/instances/', '/works/');
  const workId = workUri.split('/').pop();

  // Show shimmer loading state
  const container = document.getElementById('search-results');
  container.innerHTML = `
    <div class="columns">
      <div class="column is-8">
        <div class="shimmer-container">
          <div class="shimmer shimmer-title"></div>
          <div class="box">
            <div class="shimmer shimmer-line long"></div>
            <div class="shimmer shimmer-line medium"></div>
            <div class="shimmer shimmer-line long"></div>
            <div class="shimmer shimmer-line short"></div>
            <br>
            <div class="shimmer shimmer-line medium"></div>
            <div class="shimmer shimmer-line long"></div>
            <div class="shimmer shimmer-line medium"></div>
            <br>
            <div class="shimmer shimmer-line long"></div>
            <div class="shimmer shimmer-line short"></div>
            <div class="shimmer shimmer-line medium"></div>
          </div>
        </div>
      </div>
      <div class="column is-4">
        <div class="shimmer-container">
          <div class="shimmer shimmer-button"></div>
          <div class="shimmer shimmer-button"></div>
          <br><br>
          <div class="shimmer shimmer-box"></div>
        </div>
      </div>
    </div>
  `;

  try {
    // Fetch both work and instance data
    const [workResponse, instanceResponse] = await Promise.all([
      fetch(`https://id.loc.gov/resources/works/${workId}.bibframe.json`),
      fetch(`https://id.loc.gov/resources/instances/${instanceId}.bibframe.json`)
    ]);

    const workData = await workResponse.json();
    const instanceData = await instanceResponse.json();

    // Parse the data to extract key fields
    const summary = await extractSummaryData(workData, instanceData, workUri, instanceUri);

    // Display the detail view
    container.innerHTML = `
      <div class="columns">
        <div class="column is-8">
          <h3 class="title is-4 mb-4">Instance Details</h3>
          <div class="box">
            ${formatSummary(summary)}
          </div>
        </div>
        <div class="column is-4">
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            <button class="button is-small is-light" id="back-button-instance">
              <span>${navigationContext.type === 'all-instances' ? '← Back to All Instances' : '← Back to Search'}</span>
            </button>
            <button class="button is-primary" onclick="window.open('https://bibframe.org/marva/?action=load&url=https://id.loc.gov/resources/instances/${instanceId}.cbd.rdf&profile=lc:RT:bf2:Monograph:Instance', '_blank')">
              Open in Marva Editor
            </button>
            <button class="button is-info" onclick="window.open('${workUri}', '_blank')">
              View on id.loc.gov
            </button>
          </div>
          <div style="margin-top:2em;"><a href="https://www.loc.gov/catworkshop/bibframe/Library-of-Congress-Marva-Quartz-User-Manual.pdf" target="_blank">View Marva Manual</a></div>
        </div>
      </div>
    `;

    // Add event listener for back button
    const backButton = document.getElementById('back-button-instance');
    if (backButton) {
      backButton.addEventListener('click', () => {
        console.log('[BACK BUTTON] Navigation context:', navigationContext);

        if (navigationContext.type === 'all-instances') {
          // Go back to all instances view
          console.log('[BACK BUTTON] Going back to all instances');
          console.log('[BACK BUTTON] URIs:', navigationContext.data.allUris);
          console.log('[BACK BUTTON] Title:', navigationContext.data.title);

          try {
            window.handleCollapsedWorkClick(navigationContext.data.allUris, navigationContext.data.title);
          } catch (error) {
            console.error('[BACK BUTTON] Error calling handleCollapsedWorkClick:', error);
          }
        } else {
          // Go back to search
          console.log('[BACK BUTTON] Going back to search');
          const input = document.getElementById('search');
          if (input && input.value) {
            performSearches(input.value);
          }
        }
      });
    } else {
      console.error('[BACK BUTTON] Could not find back button element');
    }
  } catch (error) {
    console.error('Error loading instance details:', error);
    container.innerHTML = `
      <div class="notification is-danger">
        Error loading instance details. Please try again.
        <button class="button is-small is-light mt-3" id="error-back-button">
          <span>${navigationContext.type === 'all-instances' ? '← Back to All Instances' : '← Back to Search'}</span>
        </button>
      </div>
    `;

    // Add event listener for error back button
    const errorBackButton = document.getElementById('error-back-button');
    if (errorBackButton) {
      errorBackButton.addEventListener('click', () => {
        if (navigationContext.type === 'all-instances') {
          // Go back to all instances view
          window.handleCollapsedWorkClick(navigationContext.data.allUris, navigationContext.data.title);
        } else {
          // Go back to search
          const input = document.getElementById('search');
          if (input && input.value) {
            performSearches(input.value);
          }
        }
      });
    }
  }
}

// Extract summary data from work and instance
async function extractSummaryData(workData, instanceData, workUri, instanceUri) {
  const summary = {
    title: '',
    contributors: [],
    publicationStatement: '',
    extent: '',
    isbn: [],
    language: [],
    subjects: [],
    notes: [],
    workUri: workUri,
    instanceUri: instanceUri
  };

  // Get the main work object
  const work = workData.find(item => item['@id'] === workUri) || workData[0];
  const instance = instanceData.find(item => item['@id'] === instanceUri) || instanceData[0];

  if (work) {
    // Title
    const titleProp = work['http://id.loc.gov/ontologies/bibframe/title'];
    if (titleProp && titleProp[0]) {
      const titleId = titleProp[0]['@id'];
      const titleObj = workData.find(item => item['@id'] === titleId);
      if (titleObj) {
        const mainTitle = titleObj['http://id.loc.gov/ontologies/bibframe/mainTitle'];
        const subtitle = titleObj['http://id.loc.gov/ontologies/bibframe/subtitle'];
        summary.title = mainTitle ? mainTitle[0]['@value'] : '';
        if (subtitle) {
          summary.title += ': ' + subtitle[0]['@value'];
        }
      }
    }

    // Contributors - resolve LCCNs to proper names
    const contributions = work['http://id.loc.gov/ontologies/bibframe/contribution'] || [];
    const contributorPromises = contributions.map(async contrib => {
      const contribId = contrib['@id'];
      const contribObj = workData.find(item => item['@id'] === contribId);
      if (contribObj) {
        const agentRef = contribObj['http://id.loc.gov/ontologies/bibframe/agent'];
        if (agentRef && agentRef[0]) {
          const agentUri = agentRef[0]['@id'];
          if (!agentUri.startsWith('_:')) {
            const lccn = agentUri.split('/').pop();
            try {
              // Try to fetch the name from LOC
              console.log(`Fetching contributor data for LCCN: ${lccn}, URI: ${agentUri}`);
              const response = await fetch(`https://id.loc.gov/authorities/names/${lccn}.json`);
              if (response.ok) {
                const data = await response.json();
                console.log(`Received data for ${lccn}, array length: ${data.length}`);

                // The response is an array - find the main authority object
                // The agentUri might be /rwo/agents/ but the data has /authorities/names/
                const authorityUri = `http://id.loc.gov/authorities/names/${lccn}`;
                const agent = data.find(item =>
                  (item['@id'] === agentUri || item['@id'] === authorityUri) &&
                  item['@type'] &&
                  (Array.isArray(item['@type']) ? item['@type'].includes('http://www.loc.gov/mads/rdf/v1#Authority') : item['@type'] === 'http://www.loc.gov/mads/rdf/v1#Authority')
                );

                console.log(`Found agent for ${lccn}:`, agent ? 'Yes' : 'No');
                console.log(`Looking for URI: ${agentUri} or ${authorityUri}`);

                if (agent && agent['http://www.loc.gov/mads/rdf/v1#authoritativeLabel']) {
                  const authLabels = agent['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'];
                  console.log(`Found authoritativeLabel for ${lccn}:`, authLabels);
                  if (authLabels && authLabels.length > 0 && authLabels[0]['@value']) {
                    const name = authLabels[0]['@value'];
                    console.log(`Returning name for ${lccn}: ${name}`);
                    return {
                      name: name,
                      uri: agentUri
                    };
                  }
                } else {
                  console.log(`No agent or authoritativeLabel found for ${lccn}`);
                }
              } else {
                console.log(`Failed to fetch data for ${lccn}, status: ${response.status}`);
              }
            } catch (error) {
              console.error(`Error fetching contributor ${lccn}:`, error);
            }
            // Fallback to LCCN if fetch fails
            console.log(`Using fallback LCCN for ${lccn}`);
            return {
              name: lccn,
              uri: agentUri
            };
          } else {
            // Handle blank node - look for it in the graph
            const blankAgent = workData.find(item => item['@id'] === agentUri);
            if (blankAgent) {
              const label = blankAgent['http://www.w3.org/2000/01/rdf-schema#label'];
              if (label && label[0]) {
                return {
                  name: label[0]['@value'],
                  uri: null // No URI for blank nodes
                };
              }
            }
          }
        }
      }
      return null;
    });

    const resolvedContributors = await Promise.all(contributorPromises);
    summary.contributors = resolvedContributors.filter(c => c !== null);

    // Language
    const langs = work['http://id.loc.gov/ontologies/bibframe/language'] || [];
    langs.forEach(lang => {
      const langUri = lang['@id'];
      if (langUri) {
        summary.language.push(langUri.split('/').pop());
      }
    });

    // Subjects - fetch proper labels or resolve blank nodes
    const subjects = work['http://id.loc.gov/ontologies/bibframe/subject'] || [];
    const subjectPromises = subjects.map(async subj => {
      const subjUri = subj['@id'];
      if (subjUri) {
        // Check if this is a blank node
        if (subjUri.startsWith('_:')) {
          // Look for the blank node in the graph
          const blankSubject = workData.find(item => item['@id'] === subjUri);
          if (blankSubject) {
            const authLabel = blankSubject['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'];
            const label = blankSubject['http://www.w3.org/2000/01/rdf-schema#label'];

            if (authLabel && authLabel[0]) {
              return {
                label: authLabel[0]['@value'],
                uri: null // No URI for blank nodes
              };
            } else if (label && label[0]) {
              return {
                label: label[0]['@value'],
                uri: null // No URI for blank nodes
              };
            }
          }
          return null;
        } else {
          // Regular subject with URI - fetch from LOC
          const subjId = subjUri.split('/').pop();

          // Check if the ID is a UUID (contains dashes in UUID format)
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subjId);

          // Use appropriate URL based on whether it's a UUID or regular subject ID
          const fetchUrl = isUUID
            ? `https://id.loc.gov/resources/hubs/${subjId}.json`
            : `https://id.loc.gov/authorities/subjects/${subjId}.json`;

          try {
            const response = await fetch(fetchUrl);
            if (response.ok) {
              const data = await response.json();
              const subject = data.find(item => item['@id'] === subjUri);
              if (subject) {
                // For hub resources (UUID-based), use the bflc:aap field
                if (isUUID) {
                  const aapLabel = subject['http://id.loc.gov/ontologies/bflc/aap'];
                  if (aapLabel && aapLabel[0]) {
                    return {
                      label: aapLabel[0]['@value'],
                      uri: subjUri
                    };
                  }
                } else {
                  // For regular subjects, use authoritativeLabel
                  const authLabel = subject['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'];
                  if (authLabel && authLabel[0]) {
                    return {
                      label: authLabel[0]['@value'],
                      uri: subjUri
                    };
                  }
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching subject ${subjId}:`, error);
          }
          // Fallback to ID if fetch fails
          return {
            label: subjId,
            uri: subjUri
          };
        }
      }
      return null;
    });

    const resolvedSubjects = await Promise.all(subjectPromises);
    summary.subjects = resolvedSubjects.filter(s => s !== null);
  }

  if (instance) {
    // Publication statement
    const pubStmt = instance['http://id.loc.gov/ontologies/bibframe/publicationStatement'];
    if (pubStmt) {
      summary.publicationStatement = pubStmt[0]['@value'];
    }

    // Extent
    const extent = instance['http://id.loc.gov/ontologies/bibframe/extent'];
    if (extent && extent[0]) {
      const extentId = extent[0]['@id'];
      const extentObj = instanceData.find(item => item['@id'] === extentId);
      if (extentObj) {
        const extentLabel = extentObj['http://www.w3.org/2000/01/rdf-schema#label'];
        if (extentLabel) {
          summary.extent = extentLabel[0]['@value'];
        }
      }
    }

    // ISBN
    const identifiers = instance['http://id.loc.gov/ontologies/bibframe/identifiedBy'] || [];
    identifiers.forEach(idRef => {
      const idObj = instanceData.find(item => item['@id'] === idRef['@id']);
      if (idObj && idObj['@type'] && idObj['@type'].includes('http://id.loc.gov/ontologies/bibframe/Isbn')) {
        const value = idObj['http://www.w3.org/1999/02/22-rdf-syntax-ns#value'];
        if (value) {
          summary.isbn.push(value[0]['@value']);
        }
      }
    });
  }

  return summary;
}

// Format summary for display
function formatSummary(summary) {
  let html = '<div class="content">';

  if (summary.title) {
    html += `<h4 class="title is-5">${summary.title}</h4>`;
  }

  if (summary.contributors.length > 0) {
    html += '<div class="mb-3">';
    html += '<p class="mb-2"><strong>Contributors:</strong></p>';
    html += '<ul>';
    summary.contributors.forEach(contrib => {
      if (contrib.uri) {
        html += `<li><a href="${contrib.uri}" target="_blank">${contrib.name}</a></li>`;
      } else {
        html += `<li>${contrib.name}</li>`;
      }
    });
    html += '</ul>';
    html += '</div>';
  }

  if (summary.publicationStatement) {
    html += `<p><strong>Publication:</strong> ${summary.publicationStatement}</p>`;
  }

  if (summary.extent) {
    html += `<p><strong>Extent:</strong> ${summary.extent}</p>`;
  }

  if (summary.isbn.length > 0) {
    html += `<p><strong>ISBN:</strong> ${summary.isbn.join(', ')}</p>`;
  }

  if (summary.language.length > 0) {
    html += `<p><strong>Language:</strong> ${summary.language.join(', ')}</p>`;
  }

  if (summary.subjects.length > 0) {
    html += '<div class="mb-3">';
    html += '<p class="mb-2"><strong>Subjects:</strong></p>';
    html += '<ul>';
    summary.subjects.slice(0, 7).forEach(subj => {
      if (subj.uri) {
        html += `<li><a href="${subj.uri}" target="_blank">${subj.label}</a></li>`;
      } else {
        html += `<li>${subj.label}</li>`;
      }
    });
    html += '</ul>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// Initialize search functionality
document.addEventListener('DOMContentLoaded', () => {
  // Capture any form that submits to /marva/quartz to prevent page reload
  const marvaForms = document.querySelectorAll('form[action="/marva/quartz"], form[action*="marva"]');
  marvaForms.forEach(form => {
    console.log('Found form with action:', form.action);
    form.addEventListener('submit', (e) => {
      e.preventDefault(); // Prevent page reload

      // Get form data
      const formData = new FormData(form);
      const params = new URLSearchParams(formData);

      // Build the URL
      const baseUrl = form.action.startsWith('http') ? form.action : window.location.origin + form.action;
      const url = baseUrl + '?' + params.toString();

      console.log('Form submission intercepted, opening:', url);

      // Open in new tab (since Marva is an external editor)
      window.open(url, '_blank');
    });
  });

  const searchInput = document.getElementById('search');

  if (searchInput) {
    const debouncedSearch = debounce((e) => {
      performSearches(e.target.value);
    }, 500);

    searchInput.addEventListener('input', debouncedSearch);
  }

  // Add click handler for title results using event delegation
  document.addEventListener('click', (e) => {
    // Handle collapsed work result click (multiple works)
    const collapsedWorkResult = e.target.closest('.collapsed-work-result');
    if (collapsedWorkResult) {
      const allUris = collapsedWorkResult.dataset.allUris;
      const title = collapsedWorkResult.dataset.title;
      if (allUris && title) {
        handleCollapsedWorkClick(allUris, title);
      }
      return;
    }

    // Handle regular title result click
    const titleResult = e.target.closest('.title-result');
    if (titleResult) {
      const uri = titleResult.dataset.uri;

      // Check if this is a single instance card OR instance selection (both should go directly to detail view)
      if ((titleResult.classList.contains('single-instance') || titleResult.classList.contains('instance-selection')) && uri.includes('/works/')) {
        // Convert work URI to instance URI and show detail view
        const instanceUri = uri.replace('/works/', '/instances/');
        handleInstanceClick(instanceUri);
      }
      // Check if this is an instance URI (final selection)
      else if (uri.includes('/instances/')) {
        handleInstanceClick(uri);
      } else {
        const labelElement = titleResult.querySelector('.has-text-weight-semibold');
        const label = labelElement ? labelElement.textContent : '';
        handleTitleClick(uri, label);
      }
    }

    // Add click handler for contributor cards
    const contributorBox = e.target.closest('.contributor-box');
    if (contributorBox) {
      const lccn = contributorBox.dataset.token;
      const contributorName = contributorBox.dataset.label;
      if (lccn && lccn.startsWith('n')) {
        // Mark this contributor as selected for back button
        document.querySelectorAll('.contributor-box').forEach(box => {
          box.dataset.selected = 'false';
        });
        contributorBox.dataset.selected = 'true';

        handleContributorClick(lccn, contributorName);
      }
    }
  });
});