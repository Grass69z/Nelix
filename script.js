let trendingItems = []; // Global storage for trending items

const CACHE_TTL = {
    TRENDING: 3600000, // 1 hour
    POPULAR: 86400000, // 24 hours
    DETAILS: 86400000 * 7, // 1 week
    SEARCH: 900000 // 15 minutes
};

let TMDB_API_KEY = localStorage.getItem('tmdb_api_key') || '';
let currentMedia = null;
let watchHistory = JSON.parse(localStorage.getItem('watchHistory')) || [];
let currentSeasonEpisodes = null;

// DOM Elements
const searchBtn = document.getElementById('searchBtn');
const backBtn = document.getElementById('backBtn');
const searchInput = document.getElementById('searchInput');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const saveSettingsBtn = document.getElementById('saveSettings');
const apiKeyInput = document.getElementById('apiKeyInput');
const homePage = document.getElementById('homePage');
const detailsPage = document.getElementById('detailsPage');
const playerPage = document.getElementById('playerPage');

// Event Listeners
searchBtn.addEventListener('click', searchMedia);
backBtn && backBtn.addEventListener('click', goBack);
settingsBtn.addEventListener('click', openSettings);
saveSettingsBtn.addEventListener('click', saveSettings);
searchInput.addEventListener('input', debounce(searchMedia, 500));

// Initialize
window.onload = () => {
    settingsModal.style.display = 'none';
    if (!TMDB_API_KEY) {
        openSettings();
    } else {
        loadContent();
    }
};

// Caching Functions
function getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    const { data, timestamp } = JSON.parse(cached);
    const now = Date.now();
    
    if (now - timestamp > CACHE_TTL[key.split('_')[0]]) {
        localStorage.removeItem(key);
        return null;
    }
    return data;
}

function setCachedData(key, data) {
    const cacheItem = {
        data,
        timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(cacheItem));
}

function obfuscateText(text) {
  if (!text) return '';
  return text.split('').map(char => {
    // Preserve spaces between words
    if (char === ' ') return '<span class="space"></span>';
    return `<span>${char}</span>`;
  }).join('');
}

// Performance Optimized Functions
async function loadContent() {
    trendingItems = await loadSection('trending', 'trending/all/day', 'TRENDING');
    if (trendingItems && trendingItems.length > 0) {
        const heroCard = createHeroCard(trendingItems[0]);
        document.getElementById('heroSection').innerHTML = '';
        document.getElementById('heroSection').appendChild(heroCard);
        startHeroCarousel();
    }
    await Promise.allSettled([
        loadSection('popularMovies', 'movie/popular', 'POPULAR'),
        loadSection('popularShows', 'tv/popular', 'POPULAR')
    ]);
    loadHistory();
}

async function loadSection(sectionId, endpoint, cacheType) {
    const cacheKey = `${cacheType}_${endpoint}`;
    let data = getCachedData(cacheKey);
    if (!data) {
        try {
            const response = await fetch(`https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}`);
            const json = await response.json();
            data = json.results;
            // Assign media_type for popular movies and shows
            if (endpoint.startsWith('movie/')) {
                data = data.map(item => ({ ...item, media_type: 'movie' }));
            } else if (endpoint.startsWith('tv/')) {
                data = data.map(item => ({ ...item, media_type: 'tv' }));
            }
            setCachedData(cacheKey, data);
        } catch (error) {
            handleError(error, cacheKey);
            return null;
        }
    }
    populateSection(sectionId, data);
    return data;
}

// Start Hero Carousel – updates click event on every slide
function startHeroCarousel() {
    let currentIndex = 0;
    const heroCard = document.querySelector('.hero-card');
    // Set initial click event using the first item
    heroCard.onclick = () => {
        const currentItem = trendingItems[currentIndex];
        currentMedia = {
            id: currentItem.id,
            type: currentItem.media_type,
            title: currentItem.title || currentItem.name
        };
        showDetailsPage(currentMedia);
    };
    setInterval(() => {
        heroCard.classList.add('fade');
        setTimeout(() => {
            currentIndex = (currentIndex + 1) % trendingItems.length;
            const nextItem = trendingItems[currentIndex];
            heroCard.style.backgroundImage = `url(https://image.tmdb.org/t/p/original${nextItem.backdrop_path})`;
            heroCard.querySelector('.hero-overlay h1').textContent = nextItem.title || nextItem.name;
heroCard.querySelector('.hero-overlay p').innerHTML = obfuscateText(nextItem.overview)
  .replace(/(<\/span>)(?=\s*<span class="space">)/g, '$1 '); 
            // Update click event so it goes to the correct movie/show
            heroCard.onclick = () => {
                currentMedia = {
                    id: nextItem.id,
                    type: nextItem.media_type,
                    title: nextItem.title || nextItem.name
                };
                showDetailsPage(currentMedia);
            };
            heroCard.classList.remove('fade');
        }, 500); // Matches CSS transition duration
    }, 15000); // 15 seconds
}

// Search with Debouncing
function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), timeout);
    };
}

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchMedia();
    }
});

// Enhanced Card Creation
function createCard(item) {
    const card = document.createElement('div');
    card.className = 'card';
    
    const historyItem = watchHistory.find(h => h.id === item.id && h.type === item.media_type);
    const progress = historyItem ? historyItem.progress : 0;

card.innerHTML = `
  ${historyItem ? `<div class="progress-bar" style="width: ${progress}%"></div>` : ''}
  <img class="poster" 
      src="${item.poster_path 
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
          : 'https://via.placeholder.com/500x750?text=No+Poster'}" 
      alt="${item.title || item.name}"
      loading="lazy">
  <div class="card-overlay">
    <h3 class="card-title">${item.title || item.name}</h3>
    <div class="media-type">${item.media_type === 'movie' ? 'Movie' : 'TV Show'}</div>
    <div class="rating">⭐ ${item.vote_average?.toFixed(1) || 'N/A'}</div>
    <div class="year">${getYear(item)}</div>
    <!-- Overview text removed from here -->
    <div class="noise-overlay"></div>
  </div>
`;

    card.addEventListener('click', () => {
        currentMedia = {
            id: item.id,
            type: item.media_type,
            title: item.title || item.name
        };
        showDetailsPage(currentMedia);
    });

    return card;
}

// Enhanced Details Page
async function showDetailsPage(media) {
    homePage.style.display = 'none';
    detailsPage.style.display = 'block';
    
    const cacheKey = `DETAILS_${media.type}_${media.id}`;
    const cachedData = getCachedData(cacheKey);
    
    if (cachedData) {
        renderDetails(cachedData);
        if (media.type === 'tv') renderSeasonSelector(cachedData.seasons);
        return;
    }

    try {
        const details = await fetchTMDBData(media.type, media.id);
        details.seasons = details.seasons || [];
        setCachedData(cacheKey, details);
        renderDetails(details);
        if (media.type === 'tv') renderSeasonSelector(details.seasons);
    } catch (error) {
        handleError(error);
        goBack();
    }
}

// Error Handling
function handleError(error, cacheKey = null) {
    console.error('Error:', error);
    showError(`Error: ${error.message}`);
    
    if (cacheKey && getCachedData(cacheKey)) {
        showError('Showing cached data', 'warning');
    }
}

function showError(message, type = 'error') {
    const errorDiv = document.createElement('div');
    errorDiv.className = `error-message ${type}`;
    errorDiv.textContent = message;
    document.body.prepend(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

// Helper Functions
function getYear(item) {
    const date = item.release_date || item.first_air_date;
    return date ? date.split('-')[0] : 'N/A';
}

function goHome() {
    // Clear search input
    searchInput.value = '';
    
    // Reset to default view
    goBack();
    
    // Ensure all pages are hidden except home
    homePage.style.display = 'block';
    detailsPage.style.display = 'none';
    playerPage.style.display = 'none';
    
    // Reload initial content
    loadContent();
}

// Settings Functions
function openSettings() {
    settingsModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; 
    apiKeyInput.value = TMDB_API_KEY;
}

function saveSettings() {
    TMDB_API_KEY = apiKeyInput.value.trim();
    localStorage.setItem('tmdb_api_key', TMDB_API_KEY);
    closeModal();
    loadContent();
}

function closeModal() {
    settingsModal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// API Data Fetching
async function fetchTMDBData(type, id) {
    try {
        const response = await fetch(
            `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}`
        );
        if (!response.ok) throw new Error('API request failed');
        return await response.json();
    } catch (error) {
        handleError(error);
        return null;
    }
}

// Section Population
function populateSection(sectionId, items) {
    const section = document.getElementById(sectionId);
    section.innerHTML = '';
    
    items.slice(0, 10).forEach(item => {
        const card = createCard(item);
        section.appendChild(card);
    });
}

// Search Functionality
async function searchMedia() {
    if (!TMDB_API_KEY) {
        alert('Please set your TMDB API key in settings first!');
        openSettings();
        return;
    }
    
    const query = searchInput.value.trim();
    if (!query) {
        goBack(); // Clear results if empty search
        return;
    }

    try {
        const response = await fetch(
            `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`
        );
        const data = await response.json();
        displayResults(data.results);
    } catch (error) {
        handleError(error);
    }
}

// Replace the existing displayResults function with this:
async function displayResults(results) {
  // Hide hero section
  document.getElementById('heroSection').style.display = 'none';
  
  // Hide all regular content
  document.querySelectorAll('.content-sections > .grid, .section-title').forEach(el => {
    el.style.display = 'none';
  });
  
  // Show search result sections
  const homePage = document.getElementById('homePage');
  const movieGrid = homePage.querySelector('#searchMovies');
  const showGrid = homePage.querySelector('#searchShows');
  
  // Clear previous results
  movieGrid.innerHTML = '';
  showGrid.innerHTML = '';
  
  // Separate movies and shows
  const movies = results.filter(item => item.media_type === 'movie');
  const shows = results.filter(item => item.media_type === 'tv');
  
  // Display movie results
  if (movies.length > 0) {
    document.getElementById('movieResultsTitle').style.display = 'block';
    movies.forEach(movie => {
      const card = createCard(movie);
      movieGrid.appendChild(card);
    });
    movieGrid.style.display = 'grid';
  }
  
  // Display show results
  if (shows.length > 0) {
    document.getElementById('showResultsTitle').style.display = 'block';
    shows.forEach(show => {
      const card = createCard(show);
      showGrid.appendChild(card);
    });
    showGrid.style.display = 'grid';
  }
}

// History Management
async function loadHistory() {
    const grid = document.getElementById('historyGrid');
    grid.innerHTML = '';

    for (const item of watchHistory.slice(0, 10)) {
        const details = await fetchTMDBData(item.type, item.id);
        if (details) {
            const card = createCard({ ...details, media_type: item.type });
            grid.appendChild(card);
        }
    }
}

// Season/Episode Handling
function renderSeasonSelector(seasons) {
    const seasonSelect = document.getElementById('seasonSelect');
    seasonSelect.innerHTML = seasons
        .filter(s => s.season_number > 0)
        .map(s => `<option value="${s.season_number}">Season ${s.season_number}</option>`)
        .join('');
    
    seasonSelect.addEventListener('change', async () => {
        const seasonNumber = seasonSelect.value;
        currentSeasonEpisodes = await fetchEpisodes(currentMedia.id, seasonNumber);
        populateEpisodes(currentSeasonEpisodes);
    });
    
    seasonSelect.dispatchEvent(new Event('change'));
}

async function fetchEpisodes(tvId, seasonNumber) {
    try {
        const response = await fetch(
            `https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`
        );
        return await response.json();
    } catch (error) {
        handleError(error);
        return null;
    }
}

function populateEpisodes(seasonData) {
    const episodeList = document.getElementById('episodeList');
    episodeList.innerHTML = '';

    seasonData.episodes.forEach((episode, index) => {
        const episodeCard = document.createElement('div');
        episodeCard.className = 'episode-card';
        episodeCard.innerHTML = `
            <div class="episode-still-container">
                <img src="${episode.still_path 
                    ? `https://image.tmdb.org/t/p/w400${episode.still_path}`
                    : 'https://via.placeholder.com/400x225?text=No+Image'}" 
                    class="episode-still"
                    loading="lazy">
                <div class="play-overlay">
                    <button class="watch-btn" onclick="playEpisode(${index + 1})">
                        ▶ Play
                    </button>
                </div>
            </div>
            <div class="episode-info">
                <div class="episode-number">Episode ${index + 1}</div>
                <h3 class="episode-title">${episode.name || 'Untitled Episode'}</h3>
                ${episode.air_date ? `
                    <div class="episode-date">
                        ${new Date(episode.air_date).toLocaleDateString()}
                    </div>
                ` : ''}
                ${episode.overview ? `
                    <p class="episode-description">${episode.overview}</p>
                ` : ''}
            </div>
        `;
        episodeList.appendChild(episodeCard);
    });
}

// Player Functions
function loadEpisode(episodeNumber = 1) {
    const season = document.getElementById('seasonSelect').value;
    const player = document.getElementById('mainPlayer');
    player.src = `https://vidsrc.su/embed/tv/${currentMedia.id}/${season}/${episodeNumber}`;
    showPlayerPage();
}

function playEpisode(episodeNumber) {
    loadEpisode(episodeNumber);
    document.getElementById('episodeSelect').value = episodeNumber;
}

function showPlayerPage() {
    homePage.style.display = 'none';
    detailsPage.style.display = 'none';
    playerPage.style.display = 'block';
}

// Navigation
// Replace the existing goBack function with this:
function goBack() {
  // Show hero section again
  document.getElementById('heroSection').style.display = 'block';
  
  // Show all regular content
  document.querySelectorAll('.content-sections > .grid, .section-title').forEach(el => {
    el.style.display = '';
  });
  
  // Hide search results
  document.querySelectorAll('.search-results-title, .search-results').forEach(el => {
    el.style.display = 'none';
  });
  
  // Restore page visibility
  homePage.style.display = 'block';
  detailsPage.style.display = 'none';
  playerPage.style.display = 'none';
}

// Modal Handling
window.onclick = function(event) {
    if (event.target === settingsModal) {
        closeModal();
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsModal.style.display === 'flex') {
        closeModal();
    }
});

// Initialization
function renderDetails(details) {
    detailsPage.innerHTML = `
        <button class="back-btn" onclick="goBack()">← Back</button>
        <div class="details-hero" style="background-image: url(https://image.tmdb.org/t/p/original${details.backdrop_path || '/default-backdrop.jpg'})">
            <div class="hero-overlay">
                <h1>${details.title || details.name}</h1>
                <p>${details.overview}</p>
            </div>
        </div>
        <div class="details-content">
            <img class="poster" 
                src="${details.poster_path 
                    ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
                    : 'https://via.placeholder.com/500x750?text=No+Poster'}" 
                alt="${details.title || details.name}"
                loading="lazy">
            <div>
                <div class="meta">
                    <span>⭐ ${details.vote_average?.toFixed(1) || 'N/A'}</span>
                    <span>📅 ${getYear(details)}</span>
                    ${details.runtime ? `<span>⏳ ${details.runtime} mins</span>` : ''}
                </div>
                ${details.number_of_seasons ? `
                    <div class="season-selector">
                        <select id="seasonSelect"></select>
                    </div>
                    <div class="episode-list" id="episodeList"></div>
                ` : `<button class="watch-btn" onclick="showPlayerPage()">▶ Play Now</button>`}
            </div>
        </div>
    `;
    if (details.number_of_seasons) {
        renderSeasonSelector(details.seasons);
    }
}

// Create Hero Card
function createHeroCard(item) {
    const hero = document.createElement('div');
    hero.className = 'hero-card';
    hero.style.backgroundImage = `url(https://image.tmdb.org/t/p/original${item.backdrop_path})`;
hero.innerHTML = `
  <div class="hero-overlay">
    <h1>${item.title || item.name}</h1>
    <p class="text-obfuscate">${obfuscateText(item.overview)}</p>
    <div class="noise-overlay"></div>
  </div>
`;
    // Initially set click event for the first item;
    hero.onclick = () => {
        currentMedia = {
            id: item.id,
            type: item.media_type,
            title: item.title || item.name
        };
        showDetailsPage(currentMedia);
    };
    return hero;
}
