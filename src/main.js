import { GROUPS, ODDS, PLAYERS } from "./data/tournament.js";
import { generateMatches } from "./data/matches.js";
import { supabaseClient } from "./services/supabaseClient.js";

const ALL_MATCHES = generateMatches(GROUPS);

// ==================== STATE ====================
const _supa = supabaseClient;
let currentUserId = "p1";
let predictions = {}; // { userId: { matchId: "home" | "draw" | "away" } }
let results = {};     // { matchId: "home" | "draw" | "away" }
let matchMetadata = {}; // { matchId: { utcKickoff, status, homeScore, awayScore, result } }
let oddsCache = {}; // { matchId: { homePrice, drawPrice, awayPrice, bookmaker, lastUpdated } }
let lockedUsers = {}; // { userId: true }
let playerPasswords = {}; // { userId: "password" }
let matchFilter = 'all';

// Safe storage wrapper (handles sandboxed iframes / restricted environments)
let storageAvailable = true;
let memoryStorage = {};

const safeStorage = {
    getItem: (key) => {
        if (storageAvailable) {
            try {
                return localStorage.getItem(key);
            } catch (e) {
                storageAvailable = false;
            }
        }
        return memoryStorage[key] || null;
    },
    setItem: (key, value) => {
        if (storageAvailable) {
            try {
                localStorage.setItem(key, value);
                return;
            } catch (e) {
                storageAvailable = false;
            }
        }
        memoryStorage[key] = value;
    },
    removeItem: (key) => {
        if (storageAvailable) {
            try {
                localStorage.removeItem(key);
                return;
            } catch (e) {
                storageAvailable = false;
            }
        }
        delete memoryStorage[key];
    }
};

function showStorageWarning() {
    if (!storageAvailable) {
        const warning = document.createElement('div');
        warning.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-black text-sm font-medium px-6 py-2 rounded-2xl shadow-xl flex items-center gap-x-2';
        warning.innerHTML = `
            <i class="fa-solid fa-exclamation-triangle"></i>
            <span>Storage is restricted in this environment. Predictions will reset when you refresh the page.</span>
        `;
        document.body.appendChild(warning);

        setTimeout(() => {
            warning.style.transition = 'opacity 0.4s ease';
            warning.style.opacity = '0';
            setTimeout(() => warning.remove(), 400);
        }, 6500);
    }
}

async function loadState() {
    try {
        if (!_supa) throw new Error('Supabase is not configured');
        const [predsRes, resultsRes, settingsRes, metadataRes, oddsRes] = await Promise.all([
            _supa?.from('predictions').select('*'),
            _supa?.from('results').select('*'),
            _supa?.from('player_settings').select('*'),
            _supa?.from('match_metadata').select('*'),
            _supa?.from('odds_cache').select('*')
        ]);
        predictions = {};
        (predsRes.data || []).forEach(r => {
            if (!predictions[r.user_id]) predictions[r.user_id] = {};
            predictions[r.user_id][r.match_id] = r.choice;
        });
        results = {};
        (resultsRes.data || []).forEach(r => { results[r.match_id] = r.result; });
        matchMetadata = {};
        (metadataRes.data || []).forEach(r => {
            matchMetadata[r.match_id] = {
                utcKickoff: r.utc_kickoff,
                status: r.status,
                homeScore: r.home_score,
                awayScore: r.away_score,
                result: r.result,
                updatedAt: r.updated_at
            };
            if (r.result) results[r.match_id] = r.result;
        });
        oddsCache = {};
        (oddsRes.data || []).forEach(r => {
            oddsCache[r.match_id] = {
                homePrice: r.home_price,
                drawPrice: r.draw_price,
                awayPrice: r.away_price,
                bookmaker: r.bookmaker,
                source: r.provider,
                lastUpdated: r.last_updated || r.updated_at
            };
        });
        playerPasswords = {}; lockedUsers = {};
        (settingsRes.data || []).forEach(r => {
            if (r.password) playerPasswords[r.user_id] = r.password;
            if (r.locked) lockedUsers[r.user_id] = true;
        });
    } catch (e) {
        console.info('[WC2026] Using localStorage mode:', e.message || e);
        try {
            const p = safeStorage.getItem('wc2026_predictions'); if (p) predictions = JSON.parse(p);
            const r = safeStorage.getItem('wc2026_results'); if (r) results = JSON.parse(r);
            const m = safeStorage.getItem('wc2026_match_metadata'); if (m) matchMetadata = JSON.parse(m);
            const o = safeStorage.getItem('wc2026_odds_cache'); if (o) oddsCache = JSON.parse(o);
            const l = safeStorage.getItem('wc2026_locked_users'); if (l) lockedUsers = JSON.parse(l);
            const pw = safeStorage.getItem('wc2026_player_passwords'); if (pw) playerPasswords = JSON.parse(pw);
        } catch (e2) {}
    }
    const savedUser = safeStorage.getItem('wc2026_current_user');
    if (savedUser && PLAYERS.find(p => p.id === savedUser)) currentUserId = savedUser;
}

function saveState() {
    try {
        safeStorage.setItem('wc2026_current_user', currentUserId);
        safeStorage.setItem('wc2026_predictions', JSON.stringify(predictions));
        safeStorage.setItem('wc2026_results', JSON.stringify(results));
        safeStorage.setItem('wc2026_match_metadata', JSON.stringify(matchMetadata));
        safeStorage.setItem('wc2026_odds_cache', JSON.stringify(oddsCache));
        safeStorage.setItem('wc2026_locked_users', JSON.stringify(lockedUsers));
        safeStorage.setItem('wc2026_player_passwords', JSON.stringify(playerPasswords));
    } catch(e) {}
    updateSnapshot();
}

function setupRealtime() {
    if (!_supa) {
        console.info('[WC2026] Supabase realtime disabled. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable sync.');
        return;
    }
    _supa.channel('sweep-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, payload => {
            if (payload.eventType === 'DELETE') {
                const o = payload.old;
                if (predictions[o.user_id]) delete predictions[o.user_id][o.match_id];
            } else {
                const r = payload.new;
                if (!predictions[r.user_id]) predictions[r.user_id] = {};
                predictions[r.user_id][r.match_id] = r.choice;
            }
            const open = GROUPS.map(g => g.id).filter(id => {
                const el = document.getElementById('matches-' + id);
                return el && !el.classList.contains('hidden');
            });
            renderAllGroups();
            updateSnapshot();
            open.forEach(id => {
                const el = document.getElementById('matches-' + id);
                const ch = document.getElementById('chevron-' + id);
                if (el) el.classList.remove('hidden');
                if (ch) ch.style.transform = 'rotate(180deg)';
            });
            if (document.getElementById('section-leaderboard').classList.contains('active')) calculateAndShowLeaderboard();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'results' }, payload => {
            if (payload.eventType === 'DELETE') delete results[payload.old.match_id];
            else results[payload.new.match_id] = payload.new.result;
            renderAllGroups();
            updateSnapshot();
            if (document.getElementById('section-leaderboard').classList.contains('active')) calculateAndShowLeaderboard();
            if (document.getElementById('section-admin').classList.contains('active')) renderAdminMatches();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'match_metadata' }, payload => {
            const row = payload.new || payload.old;
            if (!row) return;
            if (payload.eventType === 'DELETE') {
                delete matchMetadata[row.match_id];
            } else {
                matchMetadata[row.match_id] = {
                    utcKickoff: row.utc_kickoff,
                    status: row.status,
                    homeScore: row.home_score,
                    awayScore: row.away_score,
                    result: row.result,
                    updatedAt: row.updated_at
                };
                if (row.result) results[row.match_id] = row.result;
            }
            renderAllGroups();
            updateSnapshot();
            if (document.getElementById('section-leaderboard').classList.contains('active')) calculateAndShowLeaderboard();
            if (document.getElementById('section-admin').classList.contains('active')) renderAdminMatches();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'odds_cache' }, payload => {
            const row = payload.new || payload.old;
            if (!row) return;
            if (payload.eventType === 'DELETE') {
                delete oddsCache[row.match_id];
            } else {
                oddsCache[row.match_id] = {
                    homePrice: row.home_price,
                    drawPrice: row.draw_price,
                    awayPrice: row.away_price,
                    bookmaker: row.bookmaker,
                    source: row.provider,
                    lastUpdated: row.last_updated || row.updated_at
                };
            }
            renderAllGroups();
            updateSnapshot();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'player_settings' }, payload => {
            const row = payload.new || payload.old;
            if (!row) return;
            if (payload.eventType === 'DELETE') { delete playerPasswords[row.user_id]; delete lockedUsers[row.user_id]; }
            else {
                if (row.password) playerPasswords[row.user_id] = row.password; else delete playerPasswords[row.user_id];
                if (row.locked) lockedUsers[row.user_id] = true; else delete lockedUsers[row.user_id];
            }
            renderPlayerPills();
            updateSnapshot();
        })
        .subscribe();
}

// ==================== UI HELPERS ====================
function getFlagEmoji(team) {
    const flagMap = {
        "Mexico": "🇲🇽", "South Africa": "🇿🇦", "Korea Republic": "🇰🇷", "Czechia": "🇨🇿",
        "Canada": "🇨🇦", "Bosnia and Herzegovina": "🇧🇦", "Qatar": "🇶🇦", "Switzerland": "🇨🇭",
        "Brazil": "🇧🇷", "Morocco": "🇲🇦", "Haiti": "🇭🇹", "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
        "United States": "🇺🇸", "Paraguay": "🇵🇾", "Australia": "🇦🇺", "Türkiye": "🇹🇷",
        "Germany": "🇩🇪", "Curaçao": "🇨🇼", "Côte d’Ivoire": "🇨🇮", "Ecuador": "🇪🇨",
        "Netherlands": "🇳🇱", "Japan": "🇯🇵", "Tunisia": "🇹🇳", "Sweden": "🇸🇪",
        "Belgium": "🇧🇪", "Egypt": "🇪🇬", "Iran": "🇮🇷", "New Zealand": "🇳🇿",
        "Spain": "🇪🇸", "Cabo Verde": "🇨🇻", "Saudi Arabia": "🇸🇦", "Uruguay": "🇺🇾",
        "Argentina": "🇦🇷", "Colombia": "🇨🇴", "Peru": "🇵🇪", "Jordan": "🇯🇴",
        "France": "🇫🇷", "Senegal": "🇸🇳", "Norway": "🇳🇴", "Iraq": "🇮🇶",
        "Portugal": "🇵🇹", "Austria": "🇦🇹", "Uzbekistan": "🇺🇿", "Algeria": "🇩🇿",
        "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Croatia": "🇭🇷", "Ghana": "🇬🇭", "Panama": "🇵🇦"
    };
    return flagMap[team] || "🏳️";
}

function _doShowSection(section) {
    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active', 'border-[#0A66C2]'));
    const target = document.getElementById(`section-${section}`);
    if (target) target.classList.add('active');
    const tab = document.getElementById(`tab-${section}`);
    if (tab) tab.classList.add('active', 'border-[#0A66C2]');
    if (section === 'leaderboard') calculateAndShowLeaderboard();
    if (section === 'admin') renderAdminMatches();
}

function showSection(section) {
    if (section === 'admin') {
        const verifyLocalAdmin = () => {
            const stored = safeStorage.getItem('wc2026_admin_password');
            if (!stored) {
                const pw = prompt('Set an admin password:');
                if (!pw || !pw.trim()) return;
                safeStorage.setItem('wc2026_admin_password', pw.trim());
                alert('Admin password set. Remember it!');
            } else {
                const attempt = prompt('Admin password:');
                if (!attempt || attempt.trim() !== stored) { alert('Incorrect password.'); return; }
            }
            _doShowSection(section);
        };

        if (!_supa) {
            verifyLocalAdmin();
            return;
        }

        _supa.from('app_settings').select('value').eq('key', 'admin_password').maybeSingle()
            .then(({ data }) => {
                if (!data) {
                    const pw = prompt('Set an admin password:');
                    if (!pw || !pw.trim()) return;
                    _supa.from('app_settings').upsert({ key: 'admin_password', value: pw.trim() }).then(() => {});
                    alert('Admin password set. Remember it!');
                } else {
                    const attempt = prompt('Admin password:');
                    if (!attempt || attempt.trim() !== data.value) { alert('Incorrect password.'); return; }
                }
                _doShowSection(section);
            })
            .catch(verifyLocalAdmin);
        return;
    }
    _doShowSection(section);
}

function switchUser(newUserId) {
    if (newUserId === currentUserId) return;
    // Always verify via password modal before switching
    const modal = document.getElementById('player-modal');
    document.getElementById('player-list-view').classList.add('hidden');
    document.getElementById('password-view').classList.remove('hidden');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    selectPlayer(newUserId);
}

function filterGroups() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const groupCards = document.querySelectorAll('.group-card');

    groupCards.forEach(card => {
        const groupName = card.dataset.group.toLowerCase();
        const teamsText = card.textContent.toLowerCase();

        if (groupName.includes(searchTerm) || teamsText.includes(searchTerm)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}

function setMatchFilter(filter) {
    matchFilter = filter;
    document.querySelectorAll('.match-filter-btn').forEach(button => {
        button.classList.remove('active', 'bg-[#0A66C2]', 'text-white');
        button.classList.add('text-slate-400');
    });
    const activeButton = document.getElementById(`filter-${filter}`);
    if (activeButton) {
        activeButton.classList.add('active', 'bg-[#0A66C2]', 'text-white');
        activeButton.classList.remove('text-slate-400');
    }
    renderAllGroups();
    filterGroups();
}

function updateSnapshot() {
    const currentPlayer = PLAYERS.find(player => player.id === currentUserId);
    const userPredictions = Object.keys(predictions[currentUserId] || {}).length;
    const resultCount = Object.keys(results).length;
    const syncedOddsCount = Object.keys(oddsCache).length;
    const staticOddsCount = ALL_MATCHES.filter(match => oddsFromStatic(match)).length;
    const oddsCount = syncedOddsCount || staticOddsCount;
    const oddsSource = syncedOddsCount ? 'Live' : 'Manual';

    const playerEl = document.getElementById('snapshot-player');
    const predictionsEl = document.getElementById('snapshot-predictions');
    const resultsEl = document.getElementById('snapshot-results');
    const oddsEl = document.getElementById('snapshot-odds');

    if (playerEl) playerEl.textContent = currentPlayer?.name || 'Select player';
    if (predictionsEl) predictionsEl.textContent = `${userPredictions} / ${ALL_MATCHES.length}`;
    if (resultsEl) resultsEl.textContent = `${resultCount} result${resultCount === 1 ? '' : 's'}`;
    if (oddsEl) oddsEl.textContent = `${oddsSource} ${oddsCount}/${ALL_MATCHES.length}`;
}

// ==================== RENDER GROUPS & MATCHES ====================
function getCommunityPicks(matchId) {
    const picks = { home: [], draw: [], away: [] };
    PLAYERS.forEach(player => {
        const choice = (predictions[player.id] || {})[matchId];
        if (choice) picks[choice].push(player.name);
    });
    return picks;
}

function renderAllGroups() {
    const container = document.getElementById('groups-container');
    container.innerHTML = '';

    const userPreds = predictions[currentUserId] || {};

    GROUPS.forEach(group => {
        const allGroupMatches = ALL_MATCHES.filter(m => m.groupId === group.id);
        const groupMatches = allGroupMatches.filter(match => {
            const hasPick = Boolean(userPreds[match.id]);
            const hasResult = Boolean(results[match.id] || matchMetadata[match.id]?.result);
            if (matchFilter === 'todo') return !hasPick;
            if (matchFilter === 'picked') return hasPick;
            if (matchFilter === 'resulted') return hasResult;
            return true;
        });
        const pickedCount = allGroupMatches.filter(match => userPreds[match.id]).length;

        const card = document.createElement('div');
        card.className = `group-card bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden`;
        card.dataset.group = group.id;

        let html = `
            <div class="group-header px-4 sm:px-6 py-4 flex items-center justify-between gap-3 cursor-pointer" onclick="toggleGroup('${group.id}')">
                <div class="flex items-center gap-x-2 sm:gap-x-3 min-w-0">
                    <div class="font-display text-lg sm:text-xl font-semibold whitespace-nowrap">${group.name}</div>
                    <div class="flex -space-x-1">
                        ${group.teams.map(team => `
                            <div class="w-6 h-6 sm:w-7 sm:h-7 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-xs ring-1 ring-slate-900" title="${team}">
                                ${getFlagEmoji(team)}
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="flex items-center gap-x-2 text-xs sm:text-sm shrink-0">
                    <span class="text-slate-300 sm:text-slate-400">${pickedCount}/${allGroupMatches.length}</span>
                    <i class="fa-solid fa-chevron-down transition-transform" id="chevron-${group.id}"></i>
                </div>
            </div>

            <div id="matches-${group.id}" class="hidden px-3 sm:px-6 pb-4 sm:pb-6 pt-2">
                <div class="space-y-2">
        `;

        if (groupMatches.length === 0) {
            html += `
                <div class="bg-slate-950 border border-dashed border-slate-800 rounded-2xl p-4 text-sm text-slate-500 text-center">
                    No matches for this filter.
                </div>
            `;
        }

        groupMatches.forEach(match => {
            const pred = userPreds[match.id] || null;
            const result = results[match.id] || null;
            const metadata = matchMetadata[match.id] || {};
            const odds = oddsCache[match.id] || oddsFromStatic(match);
            const cp = getCommunityPicks(match.id);
            const totalPicks = cp.home.length + cp.draw.length + cp.away.length;
            const matchKickoff = formatKickoff(metadata.utcKickoff || match.date);
            const matchScore = formatScore(metadata);
            const matchStatus = formatStatus(metadata.status, result || metadata.result);
            const oddsLabel = odds ? `${formatPrice(odds.homePrice ?? odds[0])} · ${formatPrice(odds.drawPrice ?? odds[1])} · ${formatPrice(odds.awayPrice ?? odds[2])}` : '';
            const oddsSource = odds && !Array.isArray(odds) ? `${odds.bookmaker || odds.source || 'Odds API'}` : 'manual odds';
            const favorite = favoriteChoiceForMatch(match);

            const communityHtml = totalPicks > 0 ? `
                <div class="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center gap-x-1 flex-wrap gap-y-1">
                    ${cp.home.map(n => `<span class="px-1.5 py-0.5 rounded text-xs bg-blue-900/40 text-blue-300 font-medium">${n}</span>`).join('')}
                    ${cp.draw.length > 0 ? `<span class="text-slate-700 text-xs px-0.5">·</span>` : ''}
                    ${cp.draw.map(n => `<span class="px-1.5 py-0.5 rounded text-xs bg-slate-700/50 text-slate-400 font-medium">${n}</span>`).join('')}
                    ${cp.away.length > 0 ? `<span class="text-slate-700 text-xs px-0.5">·</span>` : ''}
                    ${cp.away.map(n => `<span class="px-1.5 py-0.5 rounded text-xs bg-amber-900/40 text-amber-300 font-medium">${n}</span>`).join('')}
                </div>
            ` : '';

            html += `
                <div class="match-card bg-slate-950 border border-slate-800 rounded-2xl p-3 sm:p-4">
                    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-x-4">
                        <!-- Match + odds -->
                        <div class="flex-1 min-w-0">
                            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 text-sm">
                                <span class="font-medium min-w-0 truncate">${match.home}</span>
                                <span class="text-xs text-slate-500">vs</span>
                                <span class="font-medium min-w-0 truncate text-right">${match.away}</span>
                            </div>
                            <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                                <span>${matchKickoff}</span>
                                ${matchStatus ? `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">${matchStatus}</span>` : ''}
                                ${matchScore ? `<span class="font-mono text-slate-300">${matchScore}</span>` : ''}
                            </div>
                            ${oddsLabel ? `<div class="text-xs text-slate-500 mt-1 font-mono" title="${oddsSource}">${oddsLabel}</div>` : ''}
                        </div>

                        <!-- Prediction Buttons -->
                        <div class="grid grid-cols-3 gap-1.5 md:flex md:items-center md:gap-x-1.5 w-full md:w-auto">
                            ${lockedUsers[currentUserId] ? `
                                <div class="col-span-3 justify-center px-4 py-2 md:py-1.5 text-xs font-semibold bg-emerald-900/30 text-emerald-400 rounded-2xl flex items-center gap-x-1">
                                    <i class="fa-solid fa-lock"></i>
                                    <span>Locked</span>
                                </div>
                            ` : `
                                <button onclick="setPrediction('${match.id}', 'home', this, event)"
                                        class="prediction-btn min-w-0 px-2 sm:px-4 py-2 md:py-1.5 text-xs font-semibold border border-slate-700 rounded-2xl hover:bg-slate-800 transition-all ${pred === 'home' ? 'active bg-[#0A66C2] border-[#0A66C2] text-white' : ''}">
                                    ${favorite === 'home' ? '<i class="fa-solid fa-star text-[10px] mr-0.5"></i>' : ''}${getFlagEmoji(match.home)} ${match.home.split(' ').pop()}
                                </button>

                                <button onclick="setPrediction('${match.id}', 'draw', this, event)"
                                        class="prediction-btn min-w-0 px-2 sm:px-4 py-2 md:py-1.5 text-xs font-semibold border border-slate-700 rounded-2xl hover:bg-slate-800 transition-all ${pred === 'draw' ? 'active bg-[#0A66C2] border-[#0A66C2] text-white' : ''}">
                                    ${favorite === 'draw' ? '<i class="fa-solid fa-star text-[10px] mr-0.5"></i>' : ''}Draw
                                </button>

                                <button onclick="setPrediction('${match.id}', 'away', this, event)"
                                        class="prediction-btn min-w-0 px-2 sm:px-4 py-2 md:py-1.5 text-xs font-semibold border border-slate-700 rounded-2xl hover:bg-slate-800 transition-all ${pred === 'away' ? 'active bg-[#0A66C2] border-[#0A66C2] text-white' : ''}">
                                    ${favorite === 'away' ? '<i class="fa-solid fa-star text-[10px] mr-0.5"></i>' : ''}${getFlagEmoji(match.away)} ${match.away.split(' ').pop()}
                                </button>
                            `}
                        </div>

                        <!-- Result indicator -->
                        ${result ? `
                            <div class="md:ml-3 text-xs px-3 py-1 bg-emerald-900/30 text-emerald-400 rounded-2xl flex items-center justify-center gap-x-1 whitespace-nowrap">
                                <i class="fa-solid fa-check"></i>
                                <span class="font-medium">${result === 'home' ? match.home.split(' ').pop() : result === 'away' ? match.away.split(' ').pop() : 'Draw'}</span>
                            </div>
                        ` : ''}
                    </div>
                    ${communityHtml}
                </div>
            `;
        });

        html += `</div></div>`;
        card.innerHTML = html;
        container.appendChild(card);
    });
}

function toggleGroup(groupId) {
    const matchesDiv = document.getElementById(`matches-${groupId}`);
    const chevron = document.getElementById(`chevron-${groupId}`);

    if (matchesDiv.classList.contains('hidden')) {
        matchesDiv.classList.remove('hidden');
        chevron.style.transform = 'rotate(180deg)';
    } else {
        matchesDiv.classList.add('hidden');
        chevron.style.transform = 'rotate(0deg)';
    }
}

function setPrediction(matchId, choice, buttonElement, event) {
    if (event) event.stopImmediatePropagation();

    if (!predictions[currentUserId]) {
        predictions[currentUserId] = {};
    }

    if (predictions[currentUserId][matchId] === choice) {
        delete predictions[currentUserId][matchId];
    } else {
        predictions[currentUserId][matchId] = choice;
    }

    saveState();
    if (predictions[currentUserId] && predictions[currentUserId][matchId]) {
        _supa?.from('predictions').upsert({ user_id: currentUserId, match_id: matchId, choice: predictions[currentUserId][matchId] }).then(() => {});
    } else {
        _supa?.from('predictions').delete().eq('user_id', currentUserId).eq('match_id', matchId).then(() => {});
    }

    // Remember which groups are open before re-render
    const openGroups = GROUPS
        .map(g => g.id)
        .filter(id => {
            const el = document.getElementById('matches-' + id);
            return el && !el.classList.contains('hidden');
        });

    renderAllGroups();

    // Restore open groups
    openGroups.forEach(id => {
        const el = document.getElementById('matches-' + id);
        const chevron = document.getElementById('chevron-' + id);
        if (el) el.classList.remove('hidden');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    });
}

function oddsFromStatic(match) {
    return ODDS[`${match.home}:${match.away}`] || null;
}

function oddsPricesForMatch(match) {
    const odds = oddsCache[match.id] || oddsFromStatic(match);
    if (!odds) return null;
    return {
        home: Number(odds.homePrice ?? odds[0]),
        draw: Number(odds.drawPrice ?? odds[1]),
        away: Number(odds.awayPrice ?? odds[2])
    };
}

function favoriteChoiceForMatch(match) {
    const prices = oddsPricesForMatch(match);
    if (!prices) return null;
    return Object.entries(prices)
        .filter(([, price]) => Number.isFinite(price))
        .sort((a, b) => a[1] - b[1])[0]?.[0] || null;
}

function bulkSetRemainingPredictions(mode) {
    if (lockedUsers[currentUserId]) {
        alert("Your predictions are locked, so they can't be changed.");
        return;
    }

    if (!predictions[currentUserId]) predictions[currentUserId] = {};

    let changed = 0;
    ALL_MATCHES.forEach(match => {
        if (predictions[currentUserId][match.id]) return;
        const favorite = favoriteChoiceForMatch(match);
        const choice = mode === 'favorites' && favorite
            ? favorite
            : ['home', 'draw', 'away'][Math.floor(Math.random() * 3)];
        predictions[currentUserId][match.id] = choice;
        changed++;
    });

    if (changed === 0) {
        alert('No remaining matches to pick.');
        return;
    }

    saveState();
    persistCurrentUserPredictions();
    renderAllGroups();
    filterGroups();

    const player = PLAYERS.find(p => p.id === currentUserId);
    const label = mode === 'favorites' ? 'favourites' : 'random picks';
    showToast(`${changed} ${label} added for ${player?.name || 'current player'}.`);
}

function pickRemainingFavorites() {
    bulkSetRemainingPredictions('favorites');
}

function randomizeRemainingPredictions() {
    bulkSetRemainingPredictions('random');
}

function persistCurrentUserPredictions() {
    if (!_supa) return;
    const rows = Object.entries(predictions[currentUserId] || {}).map(([matchId, choice]) => ({
        user_id: currentUserId,
        match_id: matchId,
        choice
    }));
    if (rows.length) _supa.from('predictions').upsert(rows).then(() => {});
}

function showToast(message, tone = 'emerald') {
    const toneClass = tone === 'red' ? 'bg-red-600' : 'bg-emerald-600';
    const toast = document.createElement('div');
    toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 ${toneClass} text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-x-3 z-50 max-w-[calc(100vw-2rem)]`;
    toast.innerHTML = `
        <i class="fa-solid fa-check-circle"></i>
        <span class="font-medium text-sm">${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'all 0.3s ease';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2200);
}

function formatPrice(price) {
    const num = Number(price);
    return Number.isFinite(num) ? num.toFixed(2) : '—';
}

function formatKickoff(value) {
    if (!value || value === 'TBD') return 'Kickoff TBD';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

function formatScore(metadata) {
    if (metadata.homeScore === null || metadata.homeScore === undefined) return '';
    if (metadata.awayScore === null || metadata.awayScore === undefined) return '';
    return `${metadata.homeScore}-${metadata.awayScore}`;
}

function formatStatus(status, result) {
    if (result) return 'Result in';
    if (!status) return '';
    return String(status).replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function saveAllPredictions() {
    saveState();
    persistCurrentUserPredictions();
    showToast(`Predictions saved for ${PLAYERS.find(p => p.id === currentUserId).name}.`);
}

function clearMyPredictions() {
    if (confirm(`Clear all predictions for ${PLAYERS.find(p => p.id === currentUserId).name}?`)) {
        predictions[currentUserId] = {};
        saveState();
        _supa?.from('predictions').delete().eq('user_id', currentUserId).then(() => {});
        renderAllGroups();
        updateSnapshot();
    }
}

// ==================== LEADERBOARD ====================
function calculateScore(userId) {
    if (!predictions[userId]) return { points: 0, correct: 0, total: 0 };

    let points = 0;
    let correct = 0;
    let totalPredicted = 0;

    Object.keys(predictions[userId]).forEach(matchId => {
        const pred = predictions[userId][matchId];
        const actual = results[matchId];

        if (actual) {
            totalPredicted++;
            if (pred === actual) {
                correct++;
                points += 3;
            }
        }
    });

    return { points, correct, total: totalPredicted };
}

function calculateAndShowLeaderboard() {
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';

    const scores = PLAYERS.map(player => {
        const score = calculateScore(player.id);
        return {
            ...player,
            ...score,
            accuracy: score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0
        };
    });

    // Sort by points desc, then accuracy
    scores.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.accuracy - a.accuracy;
    });

    const lastIndex = scores.length - 1;

    const RANK = [
        { rowCls: 'leaderboard-row-gold',   medal: '🥇', numCls: 'text-yellow-400 font-bold', prize: '<span class="text-yellow-400 font-bold">$60</span>' },
        { rowCls: 'leaderboard-row-silver',  medal: '🥈', numCls: 'text-slate-300 font-bold',  prize: '<span class="text-slate-300 font-bold">$20</span>' },
        { rowCls: 'leaderboard-row-bronze',  medal: '🥉', numCls: 'text-amber-500 font-bold',  prize: '<span class="text-amber-500 font-bold">$10</span>' },
    ];

    scores.forEach((player, index) => {
        const isLast = index === lastIndex && scores.length > 1;
        const rank = !isLast && index < 3 ? RANK[index] : null;
        const rowExtra = isLast ? 'leaderboard-row-forfeit' : (rank ? rank.rowCls : '');
        const youHighlight = player.id === currentUserId ? 'ring-1 ring-inset ring-[#0A66C2]/30' : '';

        const row = document.createElement('tr');
        row.className = `leaderboard-row ${rowExtra} ${youHighlight}`;

        const rankCell = isLast
            ? `<div class="text-red-500 font-bold text-sm leading-none">💀</div><div class="text-red-600 text-[10px] font-mono">LAST</div>`
            : rank
                ? `<div class="${rank.numCls} text-lg leading-none">${rank.medal}</div><div class="${rank.numCls} text-xs">${index + 1}</div>`
                : `<div class="font-mono text-sm text-slate-500">${index + 1}</div>`;

        const avatarBg = isLast ? 'bg-red-900/40 text-red-400' : rank ? ['bg-yellow-900/40 text-yellow-400','bg-slate-600/60 text-slate-200','bg-amber-900/40 text-amber-500'][index] : 'bg-slate-700 text-slate-400';

        const forfeitBadge = isLast
            ? `<span class="forfeit-badge text-[10px] px-1.5 py-px bg-red-900/40 text-red-400 rounded font-bold tracking-wide">⚠ FORFEIT INCOMING</span>`
            : '';

        const prizeCell = isLast
            ? `<span class="forfeit-badge text-red-500 font-bold text-sm">💀</span>`
            : rank ? rank.prize : '<span class="text-slate-700">—</span>';

        row.innerHTML = `
            <td data-label="Rank" class="px-6 py-4 text-center">${rankCell}</td>
            <td data-label="Player" class="px-6 py-4">
                <div class="flex items-center gap-x-3">
                    <div class="w-8 h-8 ${avatarBg} rounded-xl flex items-center justify-center text-xs">
                        <i class="fa-solid fa-user"></i>
                    </div>
                    <div>
                        <div class="font-semibold flex items-center gap-x-2 flex-wrap gap-y-1">
                            ${player.name}
                            ${lockedUsers[player.id] ? '<i class="fa-solid fa-lock text-emerald-400 text-xs" title="Predictions locked"></i>' : ''}
                            ${forfeitBadge}
                        </div>
                        ${player.id === currentUserId ? '<span class="text-[10px] px-1.5 py-px bg-[#0A66C2]/20 text-[#0A66C2] rounded">YOU</span>' : ''}
                    </div>
                </div>
            </td>
            <td data-label="Points" class="px-6 py-4 text-center">
                <span class="font-mono text-2xl font-semibold tabular-nums">${player.points}</span>
            </td>
            <td data-label="Correct" class="px-6 py-4 text-center">
                <span class="font-medium">${player.correct} / ${player.total}</span>
            </td>
            <td data-label="Accuracy" class="px-6 py-4 text-center">
                <div class="inline-flex items-center justify-center w-12 h-7 bg-slate-800 rounded-2xl text-xs font-mono">
                    ${player.accuracy}%
                </div>
            </td>
            <td data-label="Prize" class="px-6 py-4 text-center">${prizeCell}</td>
        `;
        tbody.appendChild(row);
    });
}

// ==================== ADMIN ====================
function renderAdminMatches() {
    const container = document.getElementById('admin-matches-container');
    container.innerHTML = '';

    GROUPS.forEach(group => {
        const groupMatches = ALL_MATCHES.filter(m => m.groupId === group.id);

        const groupDiv = document.createElement('div');
        groupDiv.className = 'mb-6';

        let html = `<div class="font-semibold text-sm mb-3 px-1 flex items-center gap-x-2 text-amber-400">
            <span>${group.name}</span>
            <span class="text-xs text-slate-500">(${groupMatches.length} matches)</span>
        </div>`;

        groupMatches.forEach(match => {
            const currentResult = results[match.id] || '';
            const metadata = matchMetadata[match.id] || {};
            const matchScore = formatScore(metadata);
            const status = formatStatus(metadata.status, currentResult || metadata.result);
            const kickoff = formatKickoff(metadata.utcKickoff || match.date);

            html += `
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-950 border border-slate-800 rounded-2xl p-3 sm:p-4 mb-2">
                    <div class="flex-1 text-sm min-w-0">
                        <div>
                            <span class="font-medium">${match.home}</span>
                            <span class="text-slate-500 mx-1">vs</span>
                            <span class="font-medium">${match.away}</span>
                        </div>
                        <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                            <span>${kickoff}</span>
                            ${status ? `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">${status}</span>` : ''}
                            ${matchScore ? `<span class="font-mono text-slate-300">${matchScore}</span>` : ''}
                        </div>
                    </div>

                    <div class="flex items-center gap-x-2 w-full sm:w-auto">
                        <select onchange="updateResult('${match.id}', this.value)"
                                class="w-full sm:w-auto bg-slate-900 border border-slate-700 text-sm rounded-2xl px-3 py-2.5 sm:py-2 focus:outline-none focus:border-amber-500">
                            <option value="">Not played</option>
                            <option value="home" ${currentResult === 'home' ? 'selected' : ''}>${match.home} wins</option>
                            <option value="draw" ${currentResult === 'draw' ? 'selected' : ''}>Draw</option>
                            <option value="away" ${currentResult === 'away' ? 'selected' : ''}>${match.away} wins</option>
                        </select>

                        ${currentResult ? `
                            <button onclick="clearResult('${match.id}')"
                                    class="text-red-400 hover:text-red-500 p-2 shrink-0">
                                <i class="fa-solid fa-times text-sm"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        groupDiv.innerHTML = html;
        container.appendChild(groupDiv);
    });
}

function updateResult(matchId, value) {
    if (value === '') {
        delete results[matchId];
        _supa?.from('results').delete().eq('match_id', matchId).then(() => {});
    } else {
        results[matchId] = value;
        _supa?.from('results').upsert({ match_id: matchId, result: value }).then(() => {});
    }
    saveState();
    // Refresh predictions view and leaderboard if open
    renderAllGroups();
    if (document.getElementById('section-leaderboard').classList.contains('active')) {
        calculateAndShowLeaderboard();
    }
}

function clearResult(matchId) {
    delete results[matchId];
    saveState();
    _supa?.from('results').delete().eq('match_id', matchId).then(() => {});
    renderAdminMatches();
    renderAllGroups();
    updateSnapshot();
}

function markAllMatchesAsPlayed() {
    if (!confirm("This will randomly set results for ALL matches (for demo/testing). Continue?")) return;

    ALL_MATCHES.forEach(match => {
        const rand = Math.random();
        if (rand < 0.45) results[match.id] = 'home';
        else if (rand < 0.75) results[match.id] = 'away';
        else results[match.id] = 'draw';
    });

    saveState();
    renderAdminMatches();
    renderAllGroups();
    calculateAndShowLeaderboard();

    alert("Demo results set! You can now view the leaderboard.");
}

function resetAllData() {
    if (!confirm("This will delete ALL predictions and results. Are you sure?")) return;
    predictions = {}; results = {}; matchMetadata = {}; oddsCache = {}; lockedUsers = {};
    safeStorage.removeItem('wc2026_current_user');
    safeStorage.removeItem('wc2026_predictions');
    safeStorage.removeItem('wc2026_results');
    safeStorage.removeItem('wc2026_match_metadata');
    safeStorage.removeItem('wc2026_odds_cache');
    safeStorage.removeItem('wc2026_locked_users');
    safeStorage.removeItem('wc2026_player_passwords');
    safeStorage.removeItem('wc2026_admin_password');
    Promise.all([
        _supa?.from('predictions').delete().neq('match_id', ''),
        _supa?.from('results').delete().neq('match_id', ''),
        _supa?.from('match_metadata').delete().neq('match_id', ''),
        _supa?.from('odds_cache').delete().neq('match_id', ''),
        _supa?.from('player_settings').delete().neq('user_id', '')
    ]).then(() => {});
    renderAllGroups();
    updateSnapshot();
    if (document.getElementById('section-leaderboard').classList.contains('active')) calculateAndShowLeaderboard();
    renderAdminMatches();
    renderPlayerPills();
    alert("All data has been reset.");
}

function hideBuyinModal() {
    const modal = document.getElementById('buyin-modal');
    if (modal) {
        modal.style.transition = 'opacity 0.25s ease';
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 250);
    }
}

// ==================== PLAYER + PASSWORD SYSTEM ====================
function showPlayerSelectionModal() {
    const modal = document.getElementById('player-modal');
    const listView = document.getElementById('player-list-view');
    const passwordView = document.getElementById('password-view');

    listView.classList.remove('hidden');
    passwordView.classList.add('hidden');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    renderPlayerNameList();
}

function renderPlayerNameList() {
    const container = document.getElementById('player-name-list');
    container.innerHTML = '';

    PLAYERS.forEach(player => {
        const hasPassword = playerPasswords[player.id];
        const isLocked = lockedUsers[player.id];

        const btn = document.createElement('button');
        btn.className = `w-full text-left px-5 py-4 rounded-2xl border transition-all flex items-center justify-between ${
            hasPassword
                ? 'bg-slate-800 border-slate-700 hover:border-slate-600'
                : 'bg-slate-900 border-slate-700 hover:border-[#0A66C2]'
        }`;

        btn.innerHTML = `
            <div class="font-semibold">${player.name}</div>
            <div class="text-xs ${hasPassword ? 'text-emerald-400' : 'text-slate-500'}">
                ${hasPassword ? 'Password set' : 'New player'}
            </div>
        `;

        btn.onclick = () => selectPlayer(player.id);
        container.appendChild(btn);
    });
}

let pendingPlayerId = null;

function selectPlayer(playerId) {
    pendingPlayerId = playerId;
    const hasPassword = playerPasswords[playerId];

    const listView = document.getElementById('player-list-view');
    const passwordView = document.getElementById('password-view');
    const title = document.getElementById('password-title');
    const subtitle = document.getElementById('password-subtitle');
    const input = document.getElementById('password-input');

    listView.classList.add('hidden');
    passwordView.classList.remove('hidden');

    if (hasPassword) {
        title.textContent = `Enter password for ${PLAYERS.find(p => p.id === playerId).name}`;
        subtitle.textContent = "Enter your password to access your predictions";
        input.placeholder = "Enter your password";
    } else {
        title.textContent = `Create password for ${PLAYERS.find(p => p.id === playerId).name}`;
        subtitle.textContent = "Set a password so others can't access your account";
        input.placeholder = "Create a password";
    }

    input.value = '';
    input.focus();
}

function goBackToPlayerList() {
    const listView = document.getElementById('player-list-view');
    const passwordView = document.getElementById('password-view');

    listView.classList.remove('hidden');
    passwordView.classList.add('hidden');
    pendingPlayerId = null;
}

function submitPassword() {
    const input = document.getElementById('password-input');
    const password = input.value.trim();

    if (!password) {
        alert("Please enter a password");
        return;
    }

    const playerId = pendingPlayerId;
    const hasPassword = playerPasswords[playerId];

    if (hasPassword) {
        // Verify existing password
        if (playerPasswords[playerId] === password) {
            // Password correct - login
            currentUserId = playerId;
            saveState();
            hidePlayerModal();
            renderPlayerPills();
            renderAllGroups();
            updateSnapshot();
        } else {
            alert("Incorrect password");
        }
    } else {
        playerPasswords[playerId] = password;
        currentUserId = playerId;
        saveState();
        try { safeStorage.setItem('wc2026_player_passwords', JSON.stringify(playerPasswords)); } catch(e) {}
        _supa?.from('player_settings').upsert({ user_id: playerId, password: password, locked: false }).then(() => {});
        hidePlayerModal();
        renderPlayerPills();
        renderAllGroups();
        updateSnapshot();
        alert(`Password set for ${PLAYERS.find(p => p.id === playerId).name}. Don't forget it!`);
    }
}

function hidePlayerModal() {
    const modal = document.getElementById('player-modal');
    modal.classList.remove('flex');
    modal.classList.add('hidden');
}

// ==================== DUNKY TIME (MAXIMUM CHAOS) ====================
const _DUNKY_IMG = '/assets/dunky-image.jpg';
const _DUNKY_MP3 = '/assets/dunky-audio.mp3';
const _DUNKY_VID = '/assets/dunky-video.mp4';
let dunkyUsed = false;

function makeMLGScope(driftAnim, spinAnim, size, color) {
    var scope = document.createElement('div');
    scope.style.cssText = 'position:absolute;width:' + size + 'px;height:' + size + 'px;border:4px solid ' + color + ';border-radius:50%;animation:' + driftAnim + ' 6s ease-in-out infinite,' + spinAnim + ' 3s linear infinite;transform:translate(-50%,-50%);z-index:8;pointer-events:none;box-shadow:0 0 15px ' + color + ';';
    var hLine = document.createElement('div');
    hLine.style.cssText = 'position:absolute;top:50%;left:-8px;right:-8px;height:3px;background:' + color + ';transform:translateY(-50%);';
    var vLine = document.createElement('div');
    vLine.style.cssText = 'position:absolute;left:50%;top:-8px;bottom:-8px;width:3px;background:' + color + ';transform:translateX(-50%);';
    var dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;top:50%;left:50%;width:8px;height:8px;background:' + color + ';border-radius:50%;transform:translate(-50%,-50%);';
    scope.appendChild(hLine); scope.appendChild(vLine); scope.appendChild(dot);
    return scope;
}

function spawnChaos(overlay, skipPhoto) {
    if (!skipPhoto) {
        var mainImg = document.createElement('img');
        mainImg.src = _DUNKY_IMG;
        mainImg.style.cssText = 'position:absolute;width:300px;height:300px;object-fit:cover;border-radius:9999px;border:8px solid #fff;animation:dunky-spin-in 1.2s cubic-bezier(0.23,1.0,0.32,1) forwards,mlg-zoom-pulse 0.4s 1.2s ease-in-out infinite;box-shadow:0 0 80px rgba(255,255,255,0.6);z-index:10;top:50%;left:50%;transform:translate(-50%,-50%);';
        overlay.appendChild(mainImg);
    }

    for (var ci = 0; ci < 6; ci++) {
        var flyImg = document.createElement('img');
        flyImg.src = _DUNKY_IMG;
        flyImg.style.cssText = 'position:absolute;width:110px;height:110px;object-fit:cover;border-radius:9999px;opacity:0.75;border:3px solid #fff;animation:dunky-fly-' + (ci % 3) + ' ' + (1.5 + Math.random() * 2) + 's linear infinite;z-index:5;';
        overlay.appendChild(flyImg);
    }

    overlay.appendChild(makeMLGScope('mlg-scope-drift',  'mlg-scope-spin',  180, '#ff0000'));
    overlay.appendChild(makeMLGScope('mlg-scope-drift2', 'mlg-scope-spin2', 120, '#00ff00'));

    var illuWrap = document.createElement('div');
    illuWrap.style.cssText = 'position:absolute;top:50%;left:50%;animation:illuminati-drift 8s ease-in-out infinite;z-index:9;';
    var illuSvg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    illuSvg.setAttribute('width','130'); illuSvg.setAttribute('height','120'); illuSvg.setAttribute('viewBox','0 0 130 120');
    illuSvg.style.cssText = 'animation:illuminati-float 5s linear infinite;filter:drop-shadow(0 0 12px gold);';
    illuSvg.innerHTML = '<polygon points="65,5 125,115 5,115" fill="none" stroke="gold" stroke-width="5"/><ellipse cx="65" cy="80" rx="18" ry="22" fill="gold"/><ellipse cx="65" cy="80" rx="9" ry="11" fill="#000"/><ellipse cx="65" cy="80" rx="4" ry="5" fill="gold"/>';
    illuWrap.appendChild(illuSvg);
    overlay.appendChild(illuWrap);

    var mainText = document.createElement('div');
    mainText.textContent = 'DUNCAN SUTHERLAND HAS ARRIVED!!!';
    mainText.style.cssText = 'position:absolute;font-size:64px;font-weight:900;text-align:center;text-transform:uppercase;letter-spacing:-3px;font-family:Impact,"Arial Black",sans-serif;animation:dunky-text-chaos 600ms infinite alternate,mlg-rainbow 0.4s linear infinite;z-index:15;top:12%;left:50%;transform:translateX(-50%);-webkit-text-stroke:3px black;width:90%;';
    overlay.appendChild(mainText);

    var dunkyWords = [
        {color:'#ff0',    size:88,  top:15,  left:20,  delay:0.0},
        {color:'#ff4400', size:72,  top:75,  left:72,  delay:0.2},
        {color:'#ffffff', size:96,  top:82,  left:18,  delay:0.4},
        {color:'#ffd700', size:78,  top:18,  left:75,  delay:0.6},
        {color:'#ff00ff', size:82,  top:48,  left:88,  delay:0.8},
    ];
    dunkyWords.forEach(function(w) {
        var el = document.createElement('div');
        el.textContent = 'DUNCAN SUTHERLAND';
        el.style.cssText = 'position:absolute;color:' + w.color + ';font-size:' + w.size + 'px;font-weight:900;font-family:Impact,"Arial Black",sans-serif;text-shadow:4px 4px 0 #000,-2px -2px 0 #000;top:' + w.top + '%;left:' + w.left + '%;transform:translate(-50%,-50%);animation:mlg-word-pop ' + (1.0 + Math.random() * 0.5) + 's ease-in-out ' + w.delay + 's infinite;z-index:12;white-space:nowrap;';
        overlay.appendChild(el);
    });

    function spawnHitMarker() {
        if (!overlay.parentNode) return;
        var hm = document.createElement('div');
        var sz = 30 + Math.random() * 20;
        hm.style.cssText = 'position:absolute;top:' + (Math.random()*90) + '%;left:' + (Math.random()*90) + '%;width:' + sz + 'px;height:' + sz + 'px;border:3px solid #fff;transform:translate(-50%,-50%) rotate(45deg);animation:mlg-hitmarker 0.4s ease-out forwards;z-index:20;pointer-events:none;';
        overlay.appendChild(hm);
        setTimeout(function() { hm.remove(); }, 420);
        setTimeout(spawnHitMarker, 200 + Math.random() * 400);
    }
    spawnHitMarker();

    var shake = 0;
    var shakeInterval = setInterval(function() {
        if (!overlay.parentNode) { clearInterval(shakeInterval); return; }
        shake = (shake + 1) % 4;
        overlay.style.transform = 'translate(' + (shake%2===0?'5px':'-5px') + ',' + (shake>1?'3px':'-3px') + ')';
    }, 55);

    var flash = 0;
    var fc = ['#000','#0d0d0d','#0a0000','#000a00','#00000a','#0a0a00'];
    var flashInterval = setInterval(function() {
        if (!overlay.parentNode) { clearInterval(flashInterval); return; }
        flash = (flash + 1) % fc.length;
        overlay.style.background = fc[flash];
    }, 150);
}

function triggerDunkyTime() {
    if (dunkyUsed) return;
    dunkyUsed = true;
    var btn = document.getElementById('dunky-button');
    if (btn) btn.style.opacity = '0.3';

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:9999;overflow:hidden;';

    // VIDEO — fullscreen, clean, no scope overlay (scope is already in the footage)
    var vid = document.createElement('video');
    vid.src = _DUNKY_VID;
    vid.autoplay = true;
    vid.loop = true;
    vid.muted = true;
    vid.playsInline = true;
    vid.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);min-width:100%;min-height:100%;width:auto;height:auto;object-fit:cover;z-index:1;';
    overlay.appendChild(vid);

    // Subtle scanlines only — adds the "recording" feel without covering gameplay
    var scanlines = document.createElement('div');
    scanlines.style.cssText = 'position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.12) 3px,rgba(0,0,0,0.12) 4px);z-index:5;pointer-events:none;';
    overlay.appendChild(scanlines);

    // REC dot — tiny, top-left, barely visible
    var recEl = document.createElement('div');
    recEl.style.cssText = 'position:absolute;top:18px;left:18px;z-index:10;display:flex;align-items:center;gap:6px;font-family:"Courier New",monospace;color:rgba(255,255,255,0.55);font-size:10px;letter-spacing:2px;';
    recEl.innerHTML = '<div style="width:7px;height:7px;border-radius:50%;background:#ef4444;box-shadow:0 0 5px #ef4444;animation:flash-red 1.4s ease-in-out infinite;"></div>REC';
    overlay.appendChild(recEl);

    // Close button
    var closeBtn = document.createElement('div');
    closeBtn.innerHTML = '&#10005;';
    closeBtn.style.cssText = 'position:absolute;bottom:18px;right:20px;color:rgba(255,255,255,0.18);font-size:24px;cursor:pointer;z-index:50;font-family:sans-serif;';
    closeBtn.onmouseover = function() { closeBtn.style.color = '#fff'; };
    closeBtn.onmouseout  = function() { closeBtn.style.color = 'rgba(255,255,255,0.18)'; };
    closeBtn.onclick = function() {
        overlay.style.transition = 'opacity 0.3s';
        overlay.style.opacity = '0';
        setTimeout(function() { overlay.remove(); }, 300);
    };
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);

    // DROP
    var dropFired = false;
    function fireTheDrop() {
        if (dropFired) return;
        dropFired = true;

        // Video keeps playing — just spin Dunky into the frame
        scanlines.remove();
        recEl.remove();

        var photoEl = document.createElement('img');
        photoEl.src = _DUNKY_IMG;
        photoEl.style.cssText = [
            'position:absolute',
            'width:480px',
            'height:360px',
            'object-fit:cover',
            'border-radius:12px',
            'top:50%',
            'left:50%',
            'transform:translate(-50%,-50%) rotate(-720deg) scale(0)',
            'z-index:10',
            'box-shadow:0 12px 60px rgba(0,0,0,0.85)',
            'transition:transform 0.9s cubic-bezier(0.23,1.0,0.32,1)'
        ].join(';');
        overlay.appendChild(photoEl);

        // Trigger the spin-in
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                photoEl.style.transform = 'translate(-50%,-50%) rotate(0deg) scale(1)';
            });
        });

        // After landing: switch to continuous roam+spin, chaos erupts
        setTimeout(function() {
            photoEl.style.transition = '';
            photoEl.style.animation = 'dunky-roam 3.5s ease-in-out infinite';
            spawnChaos(overlay, true); // true = skip duplicate photo
        }, 950);
    }

    // Drop is at exactly 17.4s — hardcoded from waveform analysis
    try {
        var mlgAudio = new Audio(_DUNKY_MP3);
        mlgAudio.volume = 1.0;
        mlgAudio.play().catch(function(){});
        mlgAudio.ontimeupdate = function() {
            if (mlgAudio.currentTime >= 17.3) {
                mlgAudio.ontimeupdate = null;
                fireTheDrop();
            }
        };
        mlgAudio.onended = function() {
            if (overlay.parentNode) {
                overlay.style.transition = 'opacity 0.8s ease';
                overlay.style.opacity = '0';
                setTimeout(function() { overlay.remove(); }, 800);
            }
        };
        setTimeout(function() { fireTheDrop(); }, 20000); // fallback
    } catch(e) {
        setTimeout(function() { fireTheDrop(); }, 17300);
    }
}


        function lockMyPredictions() {
    if (confirm("Are you sure you want to LOCK your predictions? You won't be able to change them after this.")) {
        lockedUsers[currentUserId] = true;
        saveState();
        _supa?.from('player_settings').upsert({ user_id: currentUserId, locked: true, password: playerPasswords[currentUserId] || null }).then(() => {});
        updateLockUI();
        renderAllGroups();
        updateSnapshot();
        alert("Your predictions are now locked. Good luck!");
    }
}

function updateLockUI() {
    const lockBtn = document.getElementById('lock-button');
    const lockText = document.getElementById('lock-button-text');

    if (!lockBtn || !lockText) return;

    if (lockedUsers[currentUserId]) {
        lockBtn.disabled = true;
        lockBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
        lockBtn.classList.add('bg-emerald-600', 'cursor-not-allowed');
        lockText.innerHTML = `<i class="fa-solid fa-lock mr-1"></i> Locked`;
    } else {
        lockBtn.disabled = false;
        lockBtn.classList.add('bg-red-600', 'hover:bg-red-700');
        lockBtn.classList.remove('bg-emerald-600', 'cursor-not-allowed');
        lockText.innerHTML = `Lock Predictions`;
    }
}

// ==================== INITIALIZATION ====================
function renderPlayerPills() {
    const container = document.getElementById('player-pills');
    if (!container) return;

    container.innerHTML = '';

    PLAYERS.forEach(player => {
        const isActive = player.id === currentUserId;

        const pill = document.createElement('button');
        pill.className = `px-4 py-1.5 text-sm font-semibold rounded-2xl whitespace-nowrap transition-all flex items-center gap-x-2 ${
            isActive
                ? 'bg-[#0A66C2] text-white shadow'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
        }`;

        pill.innerHTML = `
            <span>${player.name}</span>
            ${isActive ? '<i class="fa-solid fa-check text-xs ml-0.5"></i>' : ''}
        `;

        pill.onclick = () => switchUser(player.id);

        container.appendChild(pill);
    });

    updateLockUI();
}

async function initializeApp() {
    await loadState();
    setupRealtime();
    renderPlayerPills();
    renderAllGroups();
    updateSnapshot();
    if (!currentUserId || !playerPasswords[currentUserId]) {
        setTimeout(() => { showPlayerSelectionModal(); }, 800);
    }
    if (_supa) {
        console.log('%c[WC2026] Supabase real-time sync active.', 'color:#22c55e');
    }
}

function showShareModal() {
    document.getElementById('share-modal').classList.remove('hidden');
    document.getElementById('share-modal').classList.add('flex');
}

function hideShareModal() {
    const modal = document.getElementById('share-modal');
    modal.classList.remove('flex');
    modal.classList.add('hidden');
}

Object.assign(window, {
    hideBuyinModal,
    goBackToPlayerList,
    submitPassword,
    showSection,
    showShareModal,
    hideShareModal,
    triggerDunkyTime,
    lockMyPredictions,
    saveAllPredictions,
    clearMyPredictions,
    filterGroups,
    setMatchFilter,
    toggleGroup,
    setPrediction,
    pickRemainingFavorites,
    randomizeRemainingPredictions,
    updateResult,
    clearResult,
    markAllMatchesAsPlayed,
    resetAllData
});

// Boot the app
window.onload = initializeApp;

// Expose some functions for debugging if needed
window.WC_DEBUG = { resetAllData, markAllMatchesAsPlayed };
