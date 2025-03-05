let trendingItems = []; // Global storage for trending items

const CACHE_TTL = {
    TRENDING: 3600000, // 1 hour
    POPULAR: 86400000, // 24 hours
    DETAILS: 86400000 * 7, // 1 week
    SEARCH: 900000 // 15 minutes
};

let userAccessToken = localStorage.getItem('trakt_token') || null;
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
const TRAKT_CLIENT_SECRET = '175984d8d1d1e637fadb34a8aa08db1b58886ecfc3af87eaff8a08b90c8ea52c';
const TRAKT_CLIENT_ID = 'd4d977adaae19f8b12558491f0f20a6156bb2a39a0eb7449898a0fbfeb5deda3';
const TRAKT_REDIRECT_URI = window.location.href.split('?')[0];

// Event Listeners
searchBtn.addEventListener('click', searchMedia);
backBtn && backBtn.addEventListener('click', goBack);
settingsBtn.addEventListener('click', openSettings);
saveSettingsBtn.addEventListener('click', saveSettings);
searchInput.addEventListener('input', debounce(searchMedia, 500));
document.getElementById('traktLoginBtn').addEventListener('click', handleTraktAuth);

// Initialize
window.onload = () => {
    settingsModal.style.display = 'none';
    if (!TMDB_API_KEY) {
        openSettings();
    } else {
        loadContent();
    }
    
    watchHistory = JSON.parse(localStorage.getItem('watchHistory')) || [];
    if (!Array.isArray(watchHistory)) {
        watchHistory = [];
        localStorage.setItem('watchHistory', JSON.stringify(watchHistory));
    }

    const urlParams = new URLSearchParams(window.location.search);
    const traktCode = urlParams.get('code');
    
    if (traktCode) {
        exchangeCodeForToken(traktCode).then(success => {
            if (success) {
                window.history.replaceState({}, document.title, window.location.pathname);
                loadContent();
                loadRecommendations();
            }
        });
    }

    if (userAccessToken) {
        loadRecommendations();
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

// Hero Carousel
function startHeroCarousel() {
    let currentIndex = 0;
    const heroCard = document.querySelector('.hero-card');
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
                
            heroCard.onclick = () => {
                currentMedia = {
                    id: nextItem.id,
                    type: nextItem.media_type,
                    title: nextItem.title || nextItem.name
                };
                showDetailsPage(currentMedia);
            };
            heroCard.classList.remove('fade');
        }, 500);
    }, 15000);
}

// Search Functions
function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), timeout);
    };
}

searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchMedia();
});

// Note: searchMedia is not implemented; assuming it's elsewhere or needs addition
function searchMedia() {
    console.log('Search functionality not implemented yet');
}

// Card Creation
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

// Details Page
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

        if (userAccessToken) {
            const endpoint = media.type === 'movie' 
                ? `/movies/${media.id}?extended=full` 
                : `/shows/${media.id}?extended=full`;
            
            const traktInfo = await traktRequest(endpoint);
            if (traktInfo) {
                const ratingElem = document.createElement('div');
                ratingElem.className = 'trakt-rating';
                ratingElem.textContent = `Trakt Rating: ${traktInfo.rating} (${traktInfo.votes} votes)`;
                document.querySelector('.meta').appendChild(ratingElem);
            }
        }
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

// Trakt Functions
async function handleTraktAuth() {
    if (userAccessToken) {
        localStorage.removeItem('trakt_token');
        userAccessToken = null;
        document.getElementById('traktButtonText').textContent = 'Login with Trakt';
        showError('Logged out from Trakt', 'warning');
        return;
    }
    
    const authUrl = `https://api.trakt.tv/oauth/authorize?response_type=code&client_id=${TRAKT_CLIENT_ID}&redirect_uri=${encodeURIComponent(TRAKT_REDIRECT_URI)}`;
    window.location.href = authUrl;
}

async function exchangeCodeForToken(code) {
    try {
        const response = await fetch('https://api.trakt.tv/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                client_id: TRAKT_CLIENT_ID,
                client_secret: TRAKT_CLIENT_SECRET,
                redirect_uri: TRAKT_REDIRECT_URI,
                grant_type: 'authorization_code'
            })
        });
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Trakt Error:', errorData);
            throw new Error('Authentication failed');
        }
        const data = await response.json();
        localStorage.setItem('trakt_token', data.access_token);
        return true;
    } catch (error) {
        console.error('Error:', error);
        return false;
    }
}

async function traktRequest(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'trakt-api-version': '2',
                'trakt-api-key': TRAKT_CLIENT_ID,
                'Authorization': `Bearer ${userAccessToken}`
            }
        };

        if (body) options.body = JSON.stringify(body);

        const response = await fetch(`https://api.trakt.tv${endpoint}`, options);
        
        if (response.status === 401) {
            localStorage.removeItem('trakt_token');
            userAccessToken = null;
            showError('Session expired, please relogin', 'warning');
            return null;
        }
        
        return await response.json();
    } catch (error) {
        showError('Trakt request failed', 'error');
        return null;
    }
}

// History and Recommendations
async function loadHistory() {
    if (!userAccessToken) return;

    try {
        const watched = await traktRequest('/sync/watched');
        if (!watched) return;

        const grid = document.getElementById('historyGrid');
        grid.innerHTML = '';

        const allItems = [...watched.movies, ...watched.shows];
        
        for (const item of allItems.slice(0, 10)) {
            try {
                const type = item.movie ? 'movie' : 'tv';
                const tmdbId = item[type].ids.tmdb;
                const details = await fetchTMDBData(type, tmdbId);
                
                if (details) {
                    const card = createCard({ ...details, media_type: type });
                    grid.appendChild(card);
                }
            } catch (error) {
                console.error('Failed to load history item:', error);
            }
        }
    } catch (error) {
        showError('Failed to load watch history', 'error');
    }
}

async function loadRecommendations() {
    if (!userAccessToken) return;

    try {
        const recommendations = await traktRequest('/recommendations/movies');
        if (!recommendations || !recommendations.length) return;

        const existingSection = document.getElementById('traktRecommendations');
        if (existingSection) existingSection.remove();

        const section = document.createElement('div');
        section.id = 'traktRecommendations';
        section.innerHTML = '<h2 class="section-title">Recommended for You</h2>';
        const grid = document.createElement('div');
        grid.className = 'grid';

        for (const item of recommendations.slice(0, 10)) {
            try {
                const details = await fetchTMDBData('movie', item.movie.ids.tmdb);
                if (details) {
                    const card = createCard({ ...details, media_type: 'movie' });
                    grid.appendChild(card);
                }
            } catch (error) {
                console.error('Failed to load recommendation:', error);
            }
        }

        document.querySelector('.content-sections').prepend(section);
        section.appendChild(grid);
    } catch (error) {
        showError('Failed to load recommendations', 'error');
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

    seasonData.episodes.forEach(episode => {
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
                    <button class="watch-btn" onclick="playEpisode(${episode.episode_number})">
                        ▶ Play
                    </button>
                </div>
            </div>
            <div class="episode-info">
                <div class="episode-number">Episode ${episode.episode_number}</div>
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

function populateSection(sectionId, items) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    
    section.innerHTML = '';
    items.slice(0, 10).forEach(item => {
        const card = createCard(item);
        section.appendChild(card);
    });
}

// Player Functions
function loadEpisode(episodeNumber = 1) {
    const player = document.getElementById('mainPlayer');
    if (currentMedia.type === 'movie') {
        player.src = `https://vidsrc.su/embed/movie/${currentMedia.id}`;
    } else {
        const season = document.getElementById('seasonSelect').value;
        player.src = `https://vidsrc.su/embed/tv/${currentMedia.id}/${season}/${episodeNumber}`;
    }
    showPlayerPage();
}

function playMovie() {
    loadEpisode();
    addToWatchHistory(currentMedia);
}

function playEpisode(episodeNumber) {
    loadEpisode(episodeNumber);
    addToWatchHistory(currentMedia);
}

function addToWatchHistory(media) {
    const existing = watchHistory.find(h => h.id === media.id && h.type === media.type);
    if (!existing) {
        watchHistory.push({ id: media.id, type: media.type, progress: 0 });
        localStorage.setItem('watchHistory', JSON.stringify(watchHistory));
    }
}

function showPlayerPage() {
    homePage.style.display = 'none';
    detailsPage.style.display = 'none';
    playerPage.style.display = 'block';
}

// Navigation
function goBack() {
    document.getElementById('heroSection').style.display = 'block';
    document.querySelectorAll('.content-sections > .grid, .section-title').forEach(el => {
        el.style.display = '';
    });
    document.querySelectorAll('.search-results-title, .search-results').forEach(el => {
        el.style.display = 'none';
    });
    homePage.style.display = 'block';
    detailsPage.style.display = 'none';
    playerPage.style.display = 'none';
    loadHistory();
}

// Modal Handling
function openSettings() {
    settingsModal.style.display = 'flex';
    apiKeyInput.value = TMDB_API_KEY;
}

function saveSettings() {
    TMDB_API_KEY = apiKeyInput.value.trim();
    localStorage.setItem('tmdb_api_key', TMDB_API_KEY);
    settingsModal.style.display = 'none';
    if (TMDB_API_KEY) loadContent();
}

function closeModal() {
    settingsModal.style.display = 'none';
}

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

// TMDB Fetch Function
async function fetchTMDBData(type, id) {
    try {
        const response = await fetch(
            `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}`
        );
        if (!response.ok) throw new Error('Failed to fetch TMDB data');
        return await response.json();
    } catch (error) {
        throw error;
    }
}

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
                ` : `<button class="watch-btn" onclick="playMovie()">▶ Play Now</button>`}
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
