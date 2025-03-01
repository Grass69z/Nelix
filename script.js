let TMDB_API_KEY = localStorage.getItem('tmdb_api_key') || '';
let currentMedia = null;
let watchHistory = JSON.parse(localStorage.getItem('watchHistory')) || [];

// DOM Elements
const searchBtn = document.getElementById('searchBtn');
const backBtn = document.getElementById('backBtn');
const searchInput = document.getElementById('searchInput');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const saveSettingsBtn = document.getElementById('saveSettings');
const apiKeyInput = document.getElementById('apiKeyInput');

// Event Listeners
searchBtn.addEventListener('click', searchMedia);
backBtn.addEventListener('click', goBack);
settingsBtn.addEventListener('click', openSettings);
saveSettingsBtn.addEventListener('click', saveSettings);

// Initialize
window.onload = () => {
    if (!TMDB_API_KEY) {
        openSettings();
    } else {
        loadContent();
    }
};

function loadContent() {
    loadSection('trending', 'trending/all/day');
    loadSection('popularMovies', 'movie/popular');
    loadSection('popularShows', 'tv/popular');
    loadHistory();
}

async function searchMedia() {
    if (!TMDB_API_KEY) {
        alert('Please set your TMDB API key in settings first!');
        openSettings();
        return;
    }
    
    const query = searchInput.value.trim();
    if (!query) return;

    try {
        const response = await fetch(
            `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`
        );
        const data = await response.json();
        displayResults(data.results);
    } catch (error) {
        console.error('Search failed:', error);
    }
}

function displayResults(results) {
    const homePage = document.getElementById('homePage');
    const grid = homePage.querySelector('.grid');
    grid.innerHTML = '';

    results.forEach(item => {
        if (!item.media_type || (item.media_type !== 'movie' && item.media_type !== 'tv')) return;
        const card = createCard(item);
        grid.appendChild(card);
    });
}

async function loadSection(sectionId, endpoint) {
    try {
        const response = await fetch(
            `https://api.themoviedb.org/3/${endpoint}?api_key=${TMDB_API_KEY}`
        );
        const data = await response.json();
        populateSection(sectionId, data.results);
    } catch (error) {
        console.error(`${sectionId} load failed:`, error);
    }
}

async function populateSection(sectionId, items) {
    const section = document.getElementById(sectionId);
    section.innerHTML = '';

    items.slice(0, 10).forEach(item => {
        const card = createCard(item);
        section.appendChild(card);
    });
}

function createCard(item) {
    const card = document.createElement('div');
    card.className = 'card';
    
    const historyItem = watchHistory.find(h => h.id === item.id && h.type === item.media_type);
    const progress = historyItem ? historyItem.progress : 0;

    card.innerHTML = `
        ${historyItem ? `
            <div class="history-badge">${historyItem.type === 'movie' ? 'Movie' : 'TV'}</div>
            <div class="progress-bar" style="width: ${progress}%"></div>
        ` : ''}
        <img class="poster" 
            src="${item.poster_path 
                ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                : 'https://via.placeholder.com/500x750?text=No+Poster'}" 
            alt="${item.title || item.name}">
        <div class="card-info">
            <h3 class="card-title">${item.title || item.name}</h3>
        </div>
    `;

    card.addEventListener('click', () => {
        currentMedia = {
            id: item.id,
            type: item.media_type,
            title: item.title || item.name
        };
        showPlayerPage(currentMedia);
    });

    return card;
}

async function showPlayerPage(media) {
    document.getElementById('homePage').style.display = 'none';
    document.getElementById('playerPage').style.display = 'block';
    
    const player = document.getElementById('mainPlayer');
    const controls = document.getElementById('tvControls');

    // Add to watch history
    const existingIndex = watchHistory.findIndex(h => h.id === media.id);
    if (existingIndex === -1) {
        watchHistory.unshift({
            id: media.id,
            type: media.type,
            title: media.title,
            progress: 0,
            timestamp: Date.now()
        });
    }
    localStorage.setItem('watchHistory', JSON.stringify(watchHistory));

    if (media.type === 'tv') {
        const details = await fetchTMDBData('tv', media.id);
        controls.innerHTML = `
            <div class="selector-group">
                <label class="selector-label">Season</label>
                <select class="selector" id="seasonSelect"></select>
            </div>
            <div class="selector-group">
                <label class="selector-label">Episode</label>
                <select class="selector" id="episodeSelect"></select>
            </div>
            <button class="watch-btn" onclick="loadEpisode()">Watch</button>
        `;
        populateSeasons(details.seasons);
        player.src = `https://vidsrc.su/embed/tv/${media.id}/${details.seasons[0].season_number}/1`;
    } else {
        controls.innerHTML = '';
        player.src = `https://vidsrc.su/embed/movie/${media.id}`;
    }
}

async function loadHistory() {
    const grid = document.getElementById('historyGrid');
    grid.innerHTML = '';

    for (const item of watchHistory.slice(0, 10)) {
        const details = await fetchTMDBData(item.type, item.id);
        const card = createCard({...details, media_type: item.type});
        grid.appendChild(card);
    }
}

async function fetchTMDBData(type, id) {
    const response = await fetch(
        `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}`
    );
    return await response.json();
}

async function populateSeasons(seasons) {
    const seasonSelect = document.getElementById('seasonSelect');
    seasonSelect.innerHTML = seasons
        .filter(s => s.season_number > 0)
        .map(s => `<option value="${s.season_number}">Season ${s.season_number}</option>`)
        .join('');
    
    seasonSelect.addEventListener('change', async () => {
        const seasonNumber = seasonSelect.value;
        const episodes = await fetchEpisodes(currentMedia.id, seasonNumber);
        populateEpisodes(episodes);
    });
    
    seasonSelect.dispatchEvent(new Event('change'));
}

async function fetchEpisodes(tvId, seasonNumber) {
    const response = await fetch(
        `https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`
    );
    return await response.json();
}

function populateEpisodes(seasonData) {
    const episodeSelect = document.getElementById('episodeSelect');
    episodeSelect.innerHTML = seasonData.episodes
        .map((e, index) => `<option value="${e.episode_number}">Episode ${index + 1}</option>`)
        .join('');
}

function loadEpisode() {
    const season = document.getElementById('seasonSelect').value;
    const episode = document.getElementById('episodeSelect').value;
    const player = document.getElementById('mainPlayer');
    player.src = `https://vidsrc.su/embed/tv/${currentMedia.id}/${season}/${episode}`;
}

function goBack() {
    document.getElementById('homePage').style.display = 'block';
    document.getElementById('playerPage').style.display = 'none';
    loadHistory();
}

function openSettings() {
    settingsModal.style.display = 'flex';
    apiKeyInput.value = TMDB_API_KEY;
}

function saveSettings() {
    TMDB_API_KEY = apiKeyInput.value.trim();
    localStorage.setItem('tmdb_api_key', TMDB_API_KEY);
    settingsModal.style.display = 'none';
    loadContent();
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target === settingsModal) {
        settingsModal.style.display = 'none';
    }
}

// Close modal with ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsModal.style.display === 'flex') {
        settingsModal.style.display = 'none';
    }
}); 
