// ========== НАСТРОЙКА GITHUB GIST (РАБОТАЕТ В РФ) ==========
const GIST_RAW_URL = 'https://gist.githubusercontent.com/usupovabdulkerim2-arch/325ba2edeaad1e5715097b1b122fd02a/raw/29d07bdad87075759c8e2257b9ec9b2333ebb869/companies.json';
const GIST_API_URL = 'https://api.github.com/gists/325ba2edeaad1e5715097b1b122fd02a';
const GITHUB_TOKEN = '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';

let syncTimeout = null;
let isSyncing = false;

function debouncedSyncToCloud() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
        if (!isSyncing) {
            isSyncing = true;
            await saveCompaniesToCloud();
            isSyncing = false;
        }
    }, 500);
}

// ЗАГРУЗКА ДАННЫХ ИЗ GITHUB GIST
async function loadCompaniesFromCloud() {
    try {
        const response = await fetch(GIST_RAW_URL + '?t=' + Date.now());
        if (!response.ok) throw new Error('Ошибка загрузки');
        const data = await response.json();
        
        if (data && data.companies && Array.isArray(data.companies) && data.companies.length > 0) {
            companiesData = data.companies;
            saveToLocalStorage();
            console.log('✅ Данные загружены из GitHub Gist, компаний:', companiesData.length);
            return true;
        } else {
            console.log('⚠️ В GitHub Gist нет данных');
            return false;
        }
    } catch(e) {
        console.warn('⚠️ Не удалось загрузить из GitHub Gist:', e);
        return false;
    }
}

// СОХРАНЕНИЕ ДАННЫХ В GITHUB GIST (ПОЛНАЯ СИНХРОНИЗАЦИЯ)
async function saveCompaniesToCloud() {
    try {
        const updateResponse = await fetch(GIST_API_URL, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: {
                    'companies.json': {
                        content: JSON.stringify({ companies: companiesData }, null, 2)
                    }
                }
            })
        });
        
        if (updateResponse.ok) {
            console.log('✅ Данные сохранены в GitHub Gist, компаний:', companiesData.length);
            return true;
        } else {
            console.error('❌ Ошибка сохранения:', await updateResponse.text());
        }
    } catch(e) {
        console.warn('⚠️ Не удалось сохранить в GitHub Gist:', e);
    }
    return false;
}

async function autoSyncToCloud() {
    await saveCompaniesToCloud();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function generateAccessKey(companyName) {
    let basePart = companyName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!basePart || basePart.length < 3) {
        basePart = btoa(unescape(encodeURIComponent(companyName))).replace(/[^A-Z0-9]/g, '').slice(0, 8);
    }
    if (basePart.length > 8) basePart = basePart.slice(0, 8);
    return basePart + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#0A1128;border:1px solid #C9A03D;color:#C9A03D;padding:12px 24px;z-index:10000;font-family:monospace;font-size:0.8rem;border-radius:4px;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

function showLoadingSpinner(show) {
    const spinner = document.getElementById('adminLoadingSpinner');
    if (spinner) spinner.style.display = show ? 'block' : 'none';
    
    const btns = ['adminSubmitBtn', 'submitReviewBtn', 'submitRespondBtn', 'submitCaseBtn'];
    btns.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.disabled = show;
    });
}

document.addEventListener('DOMContentLoaded', () => {

    const cursor = document.querySelector('.cursor-glow');
    if (cursor) {
        document.addEventListener('mousemove', (e) => {
            cursor.style.left = e.clientX + 'px';
            cursor.style.top = e.clientY + 'px';
        });
        document.addEventListener('mouseleave', () => { cursor.style.opacity = '0'; });
        document.addEventListener('mouseenter', () => { cursor.style.opacity = '1'; });
    }
    
    let companiesData = [];
    let currentCompany = null;
    let currentTab = 'main';
    let cabinetCharts = {};
    let topCharts = {};
    let expandedRows = {};
    let currentSort = 'rank';
    let currentBusinessSort = 'trust';
    let favorites = [];
    let growthChart = null;
    
    let currentReviewsPage = 1;
    let reviewsPerPage = 20;
    let currentReviewsCompanyId = null;
    
    const REVIEWED_COMPANIES_KEY = 'metric_reviewed_companies';
    const FAVORITES_KEY = 'metric_favorites';
    const VISITS_KEY = 'metric_visits';
    
    function trackVisit() {
        const today = new Date().toISOString().split('T')[0];
        let visits = localStorage.getItem(VISITS_KEY);
        if (visits) {
            try {
                visits = JSON.parse(visits);
            } catch(e) {
                visits = {};
            }
        } else {
            visits = {};
        }
        
        if (!visits[today]) {
            visits[today] = 0;
        }
        visits[today]++;
        localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
        return visits;
    }
    
    function getVisitsData() {
        const visits = localStorage.getItem(VISITS_KEY);
        if (visits) {
            try {
                return JSON.parse(visits);
            } catch(e) {
                return {};
            }
        }
        return {};
    }
    
    function calculateTrustIndex(company) {
        const reviewsCount = company.reviews ? company.reviews.length : 0;
        let trust = reviewsCount * 0.1;
        if (trust < 0) trust = 0;
        if (trust > 100) trust = 100;
        return trust;
    }
    
    function calculateMetricScore(company) {
        const trustPart = (company.trustIndex || 0) * 0.5;
        const growthPart = Math.min(company.growth || 0, 100) * 0.3;
        const reviewsCount = company.reviews ? company.reviews.length : 0;
        const reviewsPart = Math.min(reviewsCount * 0.1, 20);
        
        let score = trustPart + growthPart + reviewsPart;
        if (score < 0) score = 0;
        if (score > 100) score = 100;
        
        return Math.round(score);
    }
    
    function updateAllMetricScores() {
        companiesData.forEach(c => {
            c.metricScore = calculateMetricScore(c);
        });
    }
    
    function loadFavorites() {
        const saved = localStorage.getItem(FAVORITES_KEY);
        if (saved) {
            try {
                favorites = JSON.parse(saved);
            } catch(e) {
                favorites = [];
            }
        } else {
            favorites = [];
        }
    }
    
    function saveFavorites() {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    }
    
    function toggleFavorite(companyId) {
        const index = favorites.indexOf(companyId);
        if (index === -1) {
            favorites.push(companyId);
        } else {
            favorites.splice(index, 1);
        }
        saveFavorites();
        renderBusinesses();
        renderCompaniesList();
    }
    
    function isFavorite(companyId) {
        return favorites.includes(companyId);
    }
    
    function getReviewedCompanies() {
        const saved = localStorage.getItem(REVIEWED_COMPANIES_KEY);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch(e) {
                return [];
            }
        }
        return [];
    }
    
    function addReviewedCompany(companyId) {
        const reviewed = getReviewedCompanies();
        if (!reviewed.includes(companyId)) {
            reviewed.push(companyId);
            localStorage.setItem(REVIEWED_COMPANIES_KEY, JSON.stringify(reviewed));
        }
    }
    
    function hasReviewedCompany(companyId) {
        const reviewed = getReviewedCompanies();
        return reviewed.includes(companyId);
    }
    
    function generateRandomReviews(count, startId) {
        const reviews = [];
        const authors = ['Ахмед', 'Мадина', 'Руслан', 'Зарема', 'Ислам', 'Алина', 'Султан', 'Лейла', 'Макка', 'Адам', 'Хава', 'Аслан', 'Марьям', 'Умар', 'Амина'];
        const comments = [
            'Отличная компания, рекомендую!',
            'Хороший сервис, буду обращаться ещё.',
            'Всё понравилось, спасибо!',
            'Нормально, но есть куда расти.',
            'Супер! Обслуживание на высоте.',
            'Быстро и качественно.',
            'Очень доволен работой этой компании.',
            'Профессионалы своего дела.',
            'Цены адекватные, сервис отличный.',
            'Спасибо за качественную работу!',
            'Лучшие в своём деле!',
            'Обязательно вернусь снова.',
            'Достойная компания, спасибо.',
            'Сотрудничаем уже 3 года, всё отлично.',
            'Рекомендую всем знакомым!'
        ];
        
        for (let i = 0; i < count; i++) {
            const randomDate = new Date(2023, Math.floor(Math.random() * 24), Math.floor(Math.random() * 28) + 1);
            reviews.push({
                id: startId + i,
                author: authors[Math.floor(Math.random() * authors.length)],
                rating: 4 + Math.random() * 1,
                comment: comments[Math.floor(Math.random() * comments.length)] + ' ' + comments[Math.floor(Math.random() * comments.length)],
                date: randomDate.toISOString().split('T')[0],
                response: Math.random() > 0.85 ? 'Спасибо за отзыв! Рады стараться.' : null
            });
        }
        return reviews;
    }
    
    function renderPaginatedReviews(company) {
        const modal = document.getElementById('reviewsModal');
        const title = document.getElementById('reviewsModalTitle');
        const content = document.getElementById('reviewsContent');
        if (!modal || !content || !company) return;
        
        if (title) title.innerHTML = `ОТЗЫВЫ О КОМПАНИИ ${escapeHtml(company.name)} (всего: ${company.reviews?.length || 0})`;
        
        const totalReviews = company.reviews?.length || 0;
        const totalPages = Math.ceil(totalReviews / reviewsPerPage);
        
        const startIdx = (currentReviewsPage - 1) * reviewsPerPage;
        const endIdx = startIdx + reviewsPerPage;
        const paginatedReviews = company.reviews?.slice(startIdx, endIdx) || [];
        
        let html = `<div style="padding:1rem;background:rgba(201,160,61,0.05);margin-bottom:1rem;text-align:center;">
            <div style="font-size:2rem;">${getRatingStars(company.rating)}</div>
            <div style="font-size:1.2rem;font-weight:700;color:#C9A03D;">${company.rating} из 5</div>
            <div style="font-size:0.7rem;color:#6B7F9F;">${totalReviews} отзывов</div>
            <div style="font-size:0.9rem;margin-top:0.5rem;">ИНДЕКС ДОВЕРИЯ: <strong style="color:#C9A03D;">${formatTrustIndex(company.trustIndex)}</strong></div>
        </div>`;
        
        if (totalReviews > 0) {
            html += `<div style="margin-bottom:0.5rem;text-align:right;font-size:0.6rem;color:#6B7F9F;">Показано: ${startIdx+1}-${Math.min(endIdx, totalReviews)} из ${totalReviews}</div>`;
            
            html += paginatedReviews.map(r => `
                <div style="border-bottom:1px solid rgba(255,255,255,0.05);padding:0.8rem 0;">
                    <div style="display:flex;justify-content:space-between;"><strong style="color:#C9A03D;">${escapeHtml(r.author || 'Аноним')}</strong><span style="font-size:0.6rem;color:#6B7F9F;">${r.date}</span></div>
                    <div style="color:#C9A03D;">${getRatingStars(r.rating)}</div>
                    <div style="font-size:0.7rem;margin-top:0.3rem;">${escapeHtml(r.comment)}</div>
                    ${r.response ? `<div style="background:rgba(201,160,61,0.05);padding:0.5rem;margin-top:0.5rem;font-size:0.65rem;color:#C9A03D;">ОТВЕТ КОМПАНИИ: ${escapeHtml(r.response)}</div>` : ''}
                </div>
            `).join('');
            
            if (totalPages > 1) {
                html += `<div style="display:flex;justify-content:center;gap:0.5rem;margin-top:1rem;flex-wrap:wrap;">`;
                for (let i = 1; i <= totalPages; i++) {
                    html += `<button class="reviews-page-btn" data-page="${i}" style="background:${i === currentReviewsPage ? '#C9A03D' : 'rgba(10,17,40,0.6)'};border:1px solid rgba(201,160,61,0.3);padding:0.3rem 0.7rem;color:${i === currentReviewsPage ? '#0A1128' : '#C9A03D'};cursor:pointer;font-family:monospace;">${i}</button>`;
                }
                html += `</div>`;
            }
        } else {
            html += `<div style="text-align:center;padding:2rem;color:#6B7F9F;">Пока нет отзывов. Будьте первым!</div>`;
        }
        
        const hasReviewed = hasReviewedCompany(company.id);
        if (!hasReviewed) {
            html += `<button onclick="document.getElementById('closeReviewsModal').click(); openReviewModal(${company.id})" style="margin-top:1rem;width:100%;background:#C9A03D;border:none;padding:0.5rem;color:#0A1128;cursor:pointer;">ОСТАВИТЬ ОТЗЫВ</button>`;
        } else {
            html += `<div style="margin-top:1rem;padding:0.5rem;text-align:center;background:rgba(232,93,93,0.1);color:#E85D5D;font-size:0.65rem;">ВЫ УЖЕ ОСТАВЛЯЛИ ОТЗЫВ НА ЭТУ КОМПАНИЮ</div>`;
        }
        
        content.innerHTML = html;
        
        document.querySelectorAll('.reviews-page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentReviewsPage = parseInt(btn.dataset.page);
                renderPaginatedReviews(company);
            });
        });
        
        modal.classList.add('active');
    }
    
    function generate1100Reviews() {
        let reviewIdCounter = 10000;
        const reviews = [];
        const authors = ['Ахмед', 'Мадина', 'Руслан', 'Зарема', 'Ислам', 'Алина', 'Султан', 'Лейла', 'Макка', 'Адам', 'Хава', 'Аслан', 'Марьям', 'Умар', 'Амина'];
        const comments = [
            'Отличная компания, рекомендую!',
            'Хороший сервис, буду обращаться ещё.',
            'Всё понравилось, спасибо!',
            'Нормально, но есть куда расти.',
            'Супер! Обслуживание на высоте.',
            'Быстро и качественно.',
            'Очень доволен работой этой компании.',
            'Профессионалы своего дела.',
            'Цены адекватные, сервис отличный.',
            'Спасибо за качественную работу!',
            'Лучшие в своём деле!',
            'Обязательно вернусь снова.',
            'Достойная компания, спасибо.',
            'Сотрудничаем уже 3 года, всё отлично.',
            'Рекомендую всем знакомым!'
        ];
        
        for (let i = 0; i < 1100; i++) {
            const randomDate = new Date(2022, Math.floor(Math.random() * 36), Math.floor(Math.random() * 28) + 1);
            reviews.push({
                id: reviewIdCounter + i,
                author: authors[Math.floor(Math.random() * authors.length)],
                rating: 4 + Math.random() * 1,
                comment: comments[Math.floor(Math.random() * comments.length)] + ' ' + comments[Math.floor(Math.random() * comments.length)],
                date: randomDate.toISOString().split('T')[0],
                response: Math.random() > 0.9 ? 'Спасибо за отзыв! Рады стараться.' : null
            });
        }
        return reviews;
    }
    
    function loadDemoData() {
        const originalCompanies = [
            { 
                id: 1, name: "MAVERICKS", category: "it", city: "Грозный", address: "IT-кластер, ул. Будущего, 7",
                founded: 2023, employees: 15, metricScore: 0, growth: 210, revenue: "45 млн ₽", rating: 5.0,
                trustIndex: 0, coords: [43.3150, 45.7020], accessKey: "MAVERICKS-A7F9",
                description: "Инновационная IT-компания, лидер цифровой трансформации в ЧР",
                phone: "+7 (928) 111-22-33", email: "info@mavericks.ru", website: "mavericks.ru",
                uniqueness: "Единственная IT-компания в ЧР с ISO 27001",
                advantages: "1. Сертифицированные специалисты\n2. 24/7 поддержка\n3. Собственные разработки",
                responseRate: 85, responseTime: "2.3 ч", communicationScore: 92,
                reviews: [
                    { id: 1, author: "Ахмед", rating: 5, comment: "Отличная IT-компания!", date: "2025-01-15", response: null },
                    { id: 2, author: "Мадина", rating: 4.5, comment: "Хорошие условия", date: "2025-02-20", response: null }
                ],
                cases: [{ id: 1, title: "Цифровизация банка", description: "Внедрили CRM для крупного банка", image: "" }]
            },
            { 
                id: 2, name: "39 DONUTS", category: "food", city: "Грозный", address: "ул. Лорсанова, 1Б/1",
                founded: 2018, employees: 180, metricScore: 0, growth: 80.2, revenue: "199.6 млн ₽",
                rating: 5.0, trustIndex: 0, coords: [43.3120, 45.7000], accessKey: "39DONUTS-ELITE",
                description: "Сеть пончиковых №1 в Чеченской Республике",
                phone: "+7 (928) 444-55-66", email: "hello@39donuts.ru", website: "39donuts.ru",
                uniqueness: "Собственные рецептуры из Турции",
                advantages: "1. Свежая выпечка каждый час\n2. Программа лояльности\n3. Доставка",
                responseRate: 94, responseTime: "1.5 ч", communicationScore: 96,
                reviews: [
                    { id: 3, author: "Ислам", rating: 5, comment: "Лучшие пончики!", date: "2025-01-10", response: "Спасибо!" },
                    { id: 4, author: "Зарема", rating: 4, comment: "Вкусно, но долго", date: "2025-02-01", response: "Исправим!" }
                ],
                cases: [{ id: 1, title: "Открытие 10й точки", description: "Запустили кофейню за 45 дней", image: "" }]
            },
            { 
                id: 3, name: "GROZTEK", category: "fuel", city: "Грозный", address: "Петропавловское шоссе, 22",
                founded: 2010, employees: 120, metricScore: 0, growth: 45.5, revenue: "1.9 млрд ₽",
                rating: 4.8, trustIndex: 0, coords: [43.3250, 45.6950], accessKey: "GROZTEK-2024",
                description: "Энергетическая компания, поставки топлива по СКФО",
                phone: "+7 (928) 777-88-99", email: "contact@groztek.ru", website: "groztek.ru",
                uniqueness: "Собственная лаборатория контроля качества",
                advantages: "1. Гарантия качества\n2. Гибкие скидки\n3. Круглосуточная отгрузка",
                responseRate: 67, responseTime: "5.2 ч", communicationScore: 71,
                reviews: [
                    { id: 5, author: "Руслан", rating: 4.5, comment: "Надёжный поставщик", date: "2024-12-20", response: "Спасибо!" },
                    { id: 6, author: "Алина", rating: 4, comment: "Хорошие условия", date: "2025-01-05", response: null }
                ],
                cases: [{ id: 1, title: "Модернизация НПЗ", description: "Увеличили мощность на 30%", image: "" }]
            }
        ];
        
        const demoCompanies = [];
        companiesData = [...originalCompanies, ...demoCompanies];
        
        updateAllMetricScores();
        saveToLocalStorage();
    }
    
    function loadFromLocalStorage() {
        const saved = localStorage.getItem('metric_companies_v3');
        if (saved) {
            try {
                companiesData = JSON.parse(saved);
                console.log('✅ Данные загружены из localStorage, компаний:', companiesData.length);
            } catch(e) {
                console.error('Ошибка загрузки из localStorage', e);
                loadDemoData();
            }
        } else {
            loadDemoData();
        }
    }
    
    function saveToLocalStorage() {
        localStorage.setItem('metric_companies_v3', JSON.stringify(companiesData));
    }
    
    function calculateRating(company) {
        if (!company.reviews || company.reviews.length === 0) return company.rating || 0;
        const sum = company.reviews.reduce((s, r) => s + r.rating, 0);
        return parseFloat((sum / company.reviews.length).toFixed(1));
    }
    
    function updateAllIndices() {
        companiesData.forEach(c => {
            c.rating = calculateRating(c);
            c.trustIndex = calculateTrustIndex(c);
            if (c.reviews && c.reviews.length > 0) {
                const responded = c.reviews.filter(r => r.response && r.response.trim()).length;
                c.responseRate = Math.round((responded / c.reviews.length) * 100);
            }
        });
        updateAllMetricScores();
        companiesData.sort((a, b) => b.trustIndex - a.trustIndex);
    }
    
    function getNextId() {
        return companiesData.length ? Math.max(...companiesData.map(c => c.id)) + 1 : 1;
    }
    
    function getNextReviewId() {
        let maxId = 0;
        companiesData.forEach(c => {
            if (c.reviews) maxId = Math.max(maxId, ...c.reviews.map(r => r.id), 0);
        });
        return maxId + 1;
    }
    
    function getNextCaseId(company) {
        if (!company.cases || company.cases.length === 0) return 1;
        return Math.max(...company.cases.map(c => c.id)) + 1;
    }
    
    let businessMap = null;
    let mapMarkers = [];
    
    function initMap() {
        const container = document.getElementById('businessMap');
        if (!container) {
            console.error('❌ Контейнер карты не найден!');
            return;
        }
        
        if (typeof L === 'undefined') {
            console.error('❌ Leaflet не загружен!');
            container.innerHTML = '<div style="padding:20px;text-align:center;color:#C9A03D;">⚠️ Карта временно недоступна. Пожалуйста, обновите страницу.</div>';
            return;
        }
        
        if (businessMap) {
            businessMap.remove();
            businessMap = null;
        }
        
        console.log('🔄 Инициализация карты...');
        
        container.style.display = 'block';
        container.style.visibility = 'visible';
        container.style.opacity = '1';
        
        setTimeout(() => {
            try {
                businessMap = L.map('businessMap', {
                    center: [43.3179, 45.6987],
                    zoom: 13,
                    zoomControl: true,
                    fadeAnimation: true,
                    attributionControl: true
                });
                
                L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: 'abcd',
                    minZoom: 10,
                    maxZoom: 18
                }).addTo(businessMap);
                
                setTimeout(() => {
                    if (businessMap) {
                        businessMap.invalidateSize();
                        console.log('✅ Карта успешно создана');
                        updateMapMarkers();
                    }
                }, 150);
                
            } catch(e) {
                console.error('❌ Ошибка создания карты:', e);
                container.innerHTML = '<div style="padding:20px;text-align:center;color:#C9A03D;">⚠️ Ошибка загрузки карты. Обновите страницу.</div>';
            }
        }, 100);
    }
    
    function updateMapMarkers() {
        if (!businessMap) {
            console.warn('⚠️ Карта не инициализирована');
            return;
        }
        
        if (mapMarkers && mapMarkers.length) {
            mapMarkers.forEach(m => {
                if (businessMap && m) businessMap.removeLayer(m);
            });
        }
        mapMarkers = [];
        
        const colors = { 
            food: '#C9A03D', 
            fuel: '#4AC0E0', 
            retail: '#5CBA6F', 
            it: '#A855F7', 
            construction: '#FF6B6B' 
        };
        
        companiesData.forEach(c => {
            if (!c.coords) {
                c.coords = [43.3179 + (Math.random() - 0.5) * 0.05, 45.6987 + (Math.random() - 0.5) * 0.05];
            }
            
            const marker = L.circleMarker(c.coords, {
                radius: 8,
                fillColor: colors[c.category] || '#C9A03D',
                color: '#FFFFFF',
                weight: 2,
                fillOpacity: 0.8
            }).addTo(businessMap);
            
            marker.bindPopup(`
                <div style="background:#0A1128;color:white;padding:10px;border-left:3px solid ${colors[c.category] || '#C9A03D'};min-width:180px;">
                    <strong>${escapeHtml(c.name)}</strong><br>
                    📍 ${escapeHtml(c.city)}<br>
                    ⭐ Рейтинг: ${c.rating}<br>
                    📊 Индекс доверия: ${formatTrustIndex(c.trustIndex)}<br>
                    <button onclick="window.showCompanyDetails(${c.id})" style="background:#C9A03D;border:none;padding:4px 8px;margin-top:5px;cursor:pointer;color:#0A1128;font-weight:bold;">ПОДРОБНЕЕ →</button>
                </div>
            `);
            
            mapMarkers.push(marker);
        });
        
        console.log(`✅ Добавлено маркеров: ${mapMarkers.length}`);
        
        if (mapMarkers.length > 0 && businessMap) {
            try {
                const group = L.featureGroup(mapMarkers);
                businessMap.fitBounds(group.getBounds().pad(0.1));
            } catch(e) {
                console.warn('Не удалось отмасштабировать карту', e);
            }
        }
    }
    
    window.showCompanyDetails = function(id) {
        const company = companiesData.find(c => c.id === id);
        if (company) openCompanyModal(company);
    };
    
    async function initializeData() {
        showLoadingSpinner(true);
        loadFromLocalStorage();
        
        const cloudLoaded = await loadCompaniesFromCloud();
        if (cloudLoaded && companiesData.length > 0) {
            updateAllIndices();
            saveToLocalStorage();
            console.log('✅ Синхронизация с GitHub Gist успешна');
        } else if (companiesData.length > 0) {
            console.log('⚠️ Сохраняем локальные данные в GitHub Gist');
            await autoSyncToCloud();
        }
        
        loadFavorites();
        updateAllIndices();
        trackVisit();
        
        renderBusinesses();
        renderLeadersCards();
        renderTopTable('rank');
        renderCompaniesList();
        renderGrowthChart();
        initGrowthChartPeriods();
        
        setTimeout(() => {
            initMap();
        }, 500);
        
        showLoadingSpinner(false);
        
        console.log('✅ Инициализация завершена, компаний:', companiesData.length);
    }
    
    initializeData();
    
    function getCategoryClass(category) {
        const map = { food: 'food-cat', fuel: 'fuel-cat', retail: 'retail-cat', it: 'it-cat', construction: 'construction-cat' };
        return map[category] || 'food-cat';
    }
    
    function getCategoryName(category) {
        const map = { food: 'ОБЩЕПИТ', fuel: 'ЭНЕРГЕТИКА', retail: 'РИТЕЙЛ / ОПТ', it: 'IT / ТЕЛЕКОМ', construction: 'СТРОИТЕЛЬСТВО' };
        return map[category] || category;
    }
    
    function getLevelClass(score) {
        if (score >= 80) return 'level-elite';
        if (score >= 60) return 'level-strong';
        return 'level-growing';
    }
    
    function getLevelName(score) {
        if (score >= 80) return 'ELITE';
        if (score >= 60) return 'STRONG';
        return 'GROWING';
    }
    
    function getRatingStars(rating) {
        const full = Math.floor(rating);
        const half = rating % 1 >= 0.5 ? 1 : 0;
        const empty = 5 - full - half;
        return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
    }
    
    function formatTrustIndex(value) {
        if (value === 0) return '0';
        if (value === Math.floor(value)) return value.toString();
        return value.toFixed(1);
    }
    
    function updateHeroCounters() {
        const totalSpan = document.getElementById('totalCompanies');
        if (totalSpan) totalSpan.innerHTML = companiesData.length;
        const reviewsSpan = document.getElementById('totalReviews');
        if (reviewsSpan) {
            const total = companiesData.reduce((s, c) => s + (c.reviews?.length || 0), 0);
            reviewsSpan.innerHTML = total;
        }
    }
    
    function getLeaderBadge(trustIndex) {
        if (trustIndex >= 10) {
            return 'АБСОЛЮТНЫЙ ЛИДЕР';
        } else if (trustIndex >= 5) {
            return 'ЛИДЕР ДОВЕРИЯ';
        }
        return null;
    }
    
    function sortBusinesses(list, sortType) {
        const sorted = [...list];
        switch(sortType) {
            case 'trust':
                sorted.sort((a, b) => b.trustIndex - a.trustIndex);
                break;
            case 'trust_asc':
                sorted.sort((a, b) => a.trustIndex - b.trustIndex);
                break;
            case 'reviews':
                sorted.sort((a, b) => (b.reviews?.length || 0) - (a.reviews?.length || 0));
                break;
            case 'founded':
                sorted.sort((a, b) => (b.founded || 0) - (a.founded || 0));
                break;
            case 'employees':
                sorted.sort((a, b) => (b.employees || 0) - (a.employees || 0));
                break;
            case 'name':
                sorted.sort((a, b) => a.name.localeCompare(b.name));
                break;
            default:
                sorted.sort((a, b) => b.trustIndex - a.trustIndex);
        }
        return sorted;
    }
    
    function renderBusinesses() {
        const grid = document.getElementById('businessesGrid');
        if (!grid) return;
        
        const searchTerm = document.getElementById('businessSearch')?.value.toLowerCase() || '';
        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
        const showFavoritesOnly = document.getElementById('showFavoritesOnly')?.checked || false;
        
        let filtered = [...companiesData];
        if (activeFilter !== 'all') filtered = filtered.filter(c => c.category === activeFilter);
        if (searchTerm) filtered = filtered.filter(c => c.name.toLowerCase().includes(searchTerm));
        if (showFavoritesOnly) filtered = filtered.filter(c => isFavorite(c.id));
        
        filtered = sortBusinesses(filtered, currentBusinessSort);
        
        const countSpan = document.getElementById('businessesCount');
        if (countSpan) countSpan.innerHTML = `ПОКАЗАНО: ${filtered.length} / ${companiesData.length} ПРЕДПРИЯТИЙ ЧР`;
        updateHeroCounters();
        
        if (filtered.length === 0) {
            grid.innerHTML = `<div style="text-align:center;padding:3rem;color:#6B7F9F;">В этой категории пока нет компаний</div>`;
            return;
        }
        
        grid.innerHTML = filtered.map((c, idx) => {
            const trustColor = c.trustIndex >= 8 ? '#5CBA6F' : (c.trustIndex >= 3 ? '#C9A03D' : '#E85D5D');
            const leaderBadge = getLeaderBadge(c.trustIndex);
            const dynamicNumber = idx + 1;
            const favoriteStar = isFavorite(c.id) ? '★' : '☆';
            return `
                <div class="business-card ${leaderBadge ? 'top-business' : ''}" data-id="${c.id}">
                    ${leaderBadge ? `<div class="top-badge">${leaderBadge}</div>` : ''}
                    <div class="business-card-header">
                        <span class="business-code">⟟ ${String(dynamicNumber).padStart(3, '0')}</span>
                        <span class="business-category ${getCategoryClass(c.category)}">${getCategoryName(c.category)}</span>
                    </div>
                    <div class="business-name-wrapper">
                        <h3 class="business-name">${escapeHtml(c.name)}</h3>
                        <button class="favorite-btn" data-id="${c.id}" style="background:none;border:none;color:#C9A03D;font-size:1.2rem;cursor:pointer;">${favoriteStar}</button>
                    </div>
                    <div class="metric-score">
                        <span class="score-value" style="color:#C9A03D">${c.metricScore || 50}</span>
                        <span class="score-change change-up">+${Math.floor(Math.random() * 10) + 1}</span>
                        <div class="score-bar-container"><div class="score-bar" style="width:${c.metricScore || 50}%;background:#C9A03D"></div></div>
                    </div>
                    <div class="business-rating">
                        <span class="rating-stars">${getRatingStars(c.rating)}</span>
                        <span class="rating-value">${c.rating}</span>
                        <span class="rating-reviews">(${c.reviews?.length || 0} отзывов)</span>
                    </div>
                    <div class="trust-index">
                        <div class="trust-label">ИНДЕКС ДОВЕРИЯ</div>
                        <div class="trust-value" style="color:${trustColor}; font-size:1.2rem;">${formatTrustIndex(c.trustIndex)}</div>
                        <div class="trust-bar"><div class="trust-fill" style="width:${Math.min(c.trustIndex, 100)}%;background:${trustColor}"></div></div>
                    </div>
                    <div class="business-level">
                        <span class="level-badge ${getLevelClass(c.metricScore || 50)}">${getLevelName(c.metricScore || 50)}</span>
                        <span class="verified-badge">VERIFIED BY METRIC</span>
                    </div>
                    <div class="business-location"><span class="location-icon">📍</span><span class="location-text">${escapeHtml(c.city)}, ${escapeHtml(c.address || '—')}</span></div>
                    <div class="business-stats">
                        <div class="business-stat"><span class="stat-label-small">СОТРУДНИКИ</span><span class="stat-value-small">~${c.employees || '—'}</span></div>
                        <div class="business-stat"><span class="stat-label-small">ОСНОВАНА</span><span class="stat-value-small">${c.founded || '—'}</span></div>
                        <div class="business-stat"><span class="stat-label-small">ОТЗЫВОВ</span><span class="stat-value-small">${c.reviews?.length || 0}</span></div>
                        <div class="business-stat"><span class="stat-label-small">SCORE</span><span class="stat-value-small gold">${c.metricScore || 50}</span></div>
                    </div>
                    <div class="business-actions">
                        <button class="reviews-btn" data-id="${c.id}">ОТЗЫВЫ (${c.reviews?.length || 0})</button>
                        <button class="add-review-btn" data-id="${c.id}" ${hasReviewedCompany(c.id) ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>ОСТАВИТЬ ОТЗЫВ</button>
                    </div>
                    <div class="business-footer">
                        <span class="business-ok">${c.founded || '—'} г. основания</span>
                        <button class="business-details-btn" data-id="${c.id}">ПОДРОБНЕЕ →</button>
                    </div>
                </div>
            `;
        }).join('');
        
        attachBusinessEvents();
        attachFavoriteEvents();
    }
    
    function attachFavoriteEvents() {
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                toggleFavorite(id);
            });
        });
    }
    
    function attachBusinessEvents() {
        document.querySelectorAll('.reviews-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                currentReviewsPage = 1;
                currentReviewsCompanyId = id;
                const company = companiesData.find(c => c.id === id);
                if (company) renderPaginatedReviews(company);
            });
        });
        document.querySelectorAll('.add-review-btn').forEach(btn => {
            if (!btn.disabled) {
                btn.addEventListener('click', () => openReviewModal(parseInt(btn.dataset.id)));
            }
        });
        document.querySelectorAll('.business-details-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                const company = companiesData.find(c => c.id === id);
                if (company) openCompanyModal(company);
            });
        });
    }
    
    function openCompanyModal(company) {
        const modal = document.getElementById('businessModal');
        const content = document.getElementById('modalContent');
        if (!modal || !content) return;
        const trustColor = company.trustIndex >= 8 ? '#5CBA6F' : (company.trustIndex >= 3 ? '#C9A03D' : '#E85D5D');
        content.innerHTML = `
            <div style="margin-bottom:0.8rem;"><strong style="color:#C9A03D;">НАЗВАНИЕ:</strong> ${escapeHtml(company.name)}</div>
            <div style="margin-bottom:0.8rem;"><strong style="color:#C9A03D;">АДРЕС:</strong> ${escapeHtml(company.city)}, ${escapeHtml(company.address || '—')}</div>
            <div style="margin-bottom:0.8rem;"><strong style="color:#C9A03D;">ГОД ОСНОВАНИЯ:</strong> ${company.founded || '—'}</div>
            <div style="margin-bottom:0.8rem;"><strong style="color:#C9A03D;">СОТРУДНИКИ:</strong> ~${company.employees || '—'}</div>
            <div style="margin-bottom:0.8rem;"><strong style="color:#C9A03D;">РЕЙТИНГ:</strong> ${getRatingStars(company.rating)} ${company.rating}</div>
            <div style="margin-bottom:0.8rem;"><strong style="color:#C9A03D;">ОТЗЫВОВ:</strong> ${company.reviews?.length || 0}</div>
            <div style="margin-bottom:0.8rem;"><strong style="color:#C9A03D;">ИНДЕКС ДОВЕРИЯ:</strong> <span style="color:${trustColor};">${formatTrustIndex(company.trustIndex)}</span></div>
            <div style="margin-bottom:0.8rem;"><strong style="color:#C9A03D;">METRIC SCORE:</strong> ${company.metricScore || 50}</div>
            <div style="margin-bottom:0.8rem;"><strong style="color:#C9A03D;">УРОВЕНЬ:</strong> ${getLevelName(company.metricScore || 50)}</div>
        `;
        modal.classList.add('active');
    }
    
    function openReviewModal(companyId) {
        if (hasReviewedCompany(companyId)) {
            alert('Вы уже оставляли отзыв на эту компанию.');
            return;
        }
        document.getElementById('reviewCompanyId').value = companyId;
        document.getElementById('reviewModal').classList.add('active');
    }
    
    document.getElementById('businessSearch')?.addEventListener('input', () => renderBusinesses());
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderBusinesses();
        });
    });
    
    const sortSelect = document.getElementById('businessSort');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            currentBusinessSort = sortSelect.value;
            renderBusinesses();
        });
    }
    
    const favoritesToggle = document.getElementById('showFavoritesOnly');
    if (favoritesToggle) {
        favoritesToggle.addEventListener('change', () => {
            renderBusinesses();
        });
    }
    
    function renderCompaniesList() {
        const container = document.getElementById('companiesListContainer');
        if (!container) return;
        
        const sortedCompanies = [...companiesData].sort((a, b) => b.trustIndex - a.trustIndex);
        
        let html = `
            <table class="companies-table">
                <thead>
                    <tr>
                        <th>№</th>
                        <th>НАЗВАНИЕ</th>
                        <th>КАТЕГОРИЯ</th>
                        <th>ГОРОД</th>
                        <th>ИНДЕКС ДОВЕРИЯ</th>
                        <th>METRIC SCORE</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        sortedCompanies.forEach((c, idx) => {
            html += `
                <tr>
                    <td>${idx + 1}</td>
                    <td><span class="company-link" data-id="${c.id}">${escapeHtml(c.name)}</span></td>
                    <td>${getCategoryName(c.category)}</span></td>
                    <td>${escapeHtml(c.city)}</span></td>
                    <td>${formatTrustIndex(c.trustIndex)}</span></td>
                    <td>${c.metricScore || 50}</span></td>
                </tr>
            `;
        });
        
        html += `
                </tbody>
            </table>
        `;
        
        container.innerHTML = html;
        
        document.querySelectorAll('.company-link').forEach(link => {
            link.addEventListener('click', () => {
                const id = parseInt(link.dataset.id);
                const company = companiesData.find(c => c.id === id);
                if (company) openCompanyModal(company);
            });
        });
    }
    
    function renderGrowthChart() {
        const canvas = document.getElementById('growthChart');
        if (!canvas) return;
        
        const visitsData = getVisitsData();
        const dates = Object.keys(visitsData).sort();
        const values = dates.map(d => visitsData[d]);
        
        if (growthChart) growthChart.destroy();
        
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(201, 160, 61, 0.3)');
        gradient.addColorStop(1, 'rgba(201, 160, 61, 0.01)');
        
        growthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates.length > 0 ? dates : ['НЕТ ДАННЫХ'],
                datasets: [{
                    label: 'ПОСЕЩЕНИЯ',
                    data: values.length > 0 ? values : [0],
                    borderColor: '#C9A03D',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#C9A03D',
                    pointBorderColor: '#FFFFFF',
                    pointBorderWidth: 1,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        labels: {
                            color: '#6B7F9F',
                            font: { family: 'monospace', size: 10 }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#0A1128',
                        titleColor: '#C9A03D',
                        bodyColor: '#E8EDF5',
                        borderColor: '#C9A03D',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#5A6280', font: { size: 10 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { color: '#5A6280', font: { size: 10 } },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        title: {
                            display: true,
                            text: 'ПОСЕЩЕНИЯ',
                            color: '#6B7F9F',
                            font: { family: 'monospace', size: 10 }
                        }
                    }
                }
            }
        });
        
        const totalVisits = values.reduce((s, v) => s + v, 0);
        const today = new Date().toISOString().split('T')[0];
        const todayVisits = visitsData[today] || 0;
        
        const last7Days = Object.keys(visitsData).filter(d => {
            const date = new Date(d);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 7;
        });
        const weekVisits = last7Days.reduce((s, d) => s + visitsData[d], 0);
        
        const last30Days = Object.keys(visitsData).filter(d => {
            const date = new Date(d);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 30;
        });
        const monthVisits = last30Days.reduce((s, d) => s + visitsData[d], 0);
        
        const last365Days = Object.keys(visitsData).filter(d => {
            const date = new Date(d);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 365;
        });
        const yearVisits = last365Days.reduce((s, d) => s + visitsData[d], 0);
        
        document.getElementById('todayVisits').innerText = todayVisits;
        document.getElementById('weekVisits').innerText = weekVisits;
        document.getElementById('monthVisits').innerText = monthVisits;
        document.getElementById('yearVisits').innerText = yearVisits;
        
        const newCompanies = companiesData.filter(c => {
            const createdDate = new Date(c.createdAt || Date.now());
            const now = new Date();
            const diffDays = Math.ceil(Math.abs(now - createdDate) / (1000 * 60 * 60 * 24));
            return diffDays <= 30;
        }).length;
        document.getElementById('newCompanies').innerText = newCompanies;
        
        const newReviews = companiesData.reduce((s, c) => {
            const newInMonth = (c.reviews || []).filter(r => {
                const reviewDate = new Date(r.date);
                const now = new Date();
                const diffDays = Math.ceil(Math.abs(now - reviewDate) / (1000 * 60 * 60 * 24));
                return diffDays <= 30;
            }).length;
            return s + newInMonth;
        }, 0);
        document.getElementById('newReviews').innerText = newReviews;
    }
    
    function initGrowthChartPeriods() {
        const btns = document.querySelectorAll('.chart-period-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const period = btn.dataset.period;
                const visitsData = getVisitsData();
                let filteredDates = Object.keys(visitsData).sort();
                const now = new Date();
                
                if (period === 'week') {
                    filteredDates = filteredDates.filter(d => {
                        const date = new Date(d);
                        const diffDays = Math.ceil(Math.abs(now - date) / (1000 * 60 * 60 * 24));
                        return diffDays <= 7;
                    });
                } else if (period === 'month') {
                    filteredDates = filteredDates.filter(d => {
                        const date = new Date(d);
                        const diffDays = Math.ceil(Math.abs(now - date) / (1000 * 60 * 60 * 24));
                        return diffDays <= 30;
                    });
                } else if (period === 'year') {
                    filteredDates = filteredDates.filter(d => {
                        const date = new Date(d);
                        const diffDays = Math.ceil(Math.abs(now - date) / (1000 * 60 * 60 * 24));
                        return diffDays <= 365;
                    });
                } else if (period === '2years') {
                    filteredDates = filteredDates.filter(d => {
                        const date = new Date(d);
                        const diffDays = Math.ceil(Math.abs(now - date) / (1000 * 60 * 60 * 24));
                        return diffDays <= 730;
                    });
                }
                
                const filteredValues = filteredDates.map(d => visitsData[d]);
                
                if (growthChart) {
                    growthChart.data.labels = filteredDates.length > 0 ? filteredDates : ['НЕТ ДАННЫХ'];
                    growthChart.data.datasets[0].data = filteredValues.length > 0 ? filteredValues : [0];
                    growthChart.update();
                }
            });
        });
    }
    
    function renderLeadersCards() {
        const container = document.getElementById('leadersPremiumGrid');
        if (!container) return;
        
        const leadersList = [...companiesData]
            .sort((a, b) => b.trustIndex - a.trustIndex)
            .slice(0, 9);
        
        if (leadersList.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:3rem;color:#6B7F9F;">НЕТ КОМПАНИЙ В ЛИДЕРАХ РЫНКА</div>';
            return;
        }
        
        container.innerHTML = leadersList.map((c, idx) => {
            const rank = idx + 1;
            const trustColor = c.trustIndex >= 80 ? '#5CBA6F' : (c.trustIndex >= 50 ? '#C9A03D' : '#E85D5D');
            const chartId = `leader-chart-new-${c.id}`;
            const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
            const growthValues = months.map((_, i) => Math.round((c.growth || 50) * (0.3 + (i / 12) * 0.7)));
            
            let rankLabel = '';
            let rankClass = '';
            if (rank === 1) {
                rankLabel = 'АБСОЛЮТНЫЙ ЛИДЕР';
                rankClass = 'rank-1';
            } else if (rank === 2) {
                rankLabel = 'СЕРЕБРЯНЫЙ ПРИЗЁР';
                rankClass = 'rank-2';
            } else if (rank === 3) {
                rankLabel = 'БРОНЗОВЫЙ ПРИЗЁР';
                rankClass = 'rank-3';
            } else {
                rankLabel = 'ТОП ЛИДЕР';
            }
            
            const isMegaLeader = c.name === "МЕГА-ЛИДЕР 1100";
            
            return `
                <div class="leader-card-new ${rankClass}" data-id="${c.id}">
                    <div class="leader-rank-new">
                        <span class="leader-rank-number-new">#00${rank}</span>
                        <span class="leader-rank-label-new">${rankLabel}</span>
                        ${isMegaLeader ? '<span style="margin-left:0.5rem;background:#C9A03D;color:#0A1128;padding:0.1rem 0.4rem;font-size:0.45rem;">🏆 1100 ОТЗЫВОВ</span>' : ''}
                        ${rank === 1 ? '<span class="leader-trophy">🏆</span>' : ''}
                    </div>
                    <h3 class="leader-name-new">${escapeHtml(c.name)}</h3>
                    <div class="leader-category-new">${getCategoryName(c.category)}</div>
                    
                    <div class="leader-metric-block">
                        <span class="leader-metric-value">${c.metricScore || 50}</span>
                        <div class="leader-metric-bar">
                            <div class="leader-metric-fill" style="width: ${c.metricScore || 50}%;"></div>
                        </div>
                        <span style="font-size:0.55rem;color:#5A6280;">METRIC SCORE</span>
                    </div>
                    
                    <div class="leader-stats-new-grid">
                        <div class="leader-stat-new-item">
                            <div class="leader-stat-new-value">${c.reviews?.length || 0}</div>
                            <div class="leader-stat-new-label">ОТЗЫВОВ</div>
                        </div>
                        <div class="leader-stat-new-item">
                            <div class="leader-stat-new-value">${c.rating}</div>
                            <div class="leader-stat-new-label">РЕЙТИНГ</div>
                        </div>
                        <div class="leader-stat-new-item">
                            <div class="leader-stat-new-value">${c.employees || '—'}</div>
                            <div class="leader-stat-new-label">СОТРУДНИКОВ</div>
                        </div>
                    </div>
                    
                    <div class="leader-extra-info">
                        <span>📅 ${c.founded || '—'} г.</span>
                        <span>📈 +${c.growth || 0}%</span>
                        <span>💰 ${c.revenue || '—'}</span>
                    </div>
                    
                    <div class="leader-trust-new">
                        <div class="leader-trust-header-new">
                            <span class="leader-trust-label-new">ИНДЕКС ДОВЕРИЯ</span>
                            <span class="leader-trust-value-new">${formatTrustIndex(c.trustIndex)} / 100</span>
                        </div>
                        <div class="leader-trust-bar-new">
                            <div class="leader-trust-fill-new" style="width: ${Math.min(c.trustIndex, 100)}%; background: ${trustColor};"></div>
                        </div>
                    </div>
                    
                    <div class="leader-achievements">
                        <span class="achievement-badge">✓ VERIFIED</span>
                        <span class="achievement-badge">⭐ ${getLevelName(c.metricScore || 50)}</span>
                        ${c.trustIndex >= 50 ? '<span class="achievement-badge">🏅 TRUSTED</span>' : ''}
                    </div>
                    
                    <div class="leader-chart-new">
                        <div class="leader-chart-title-new">ДИНАМИКА РОСТА ЗА 12 МЕСЯЦЕВ</div>
                        <canvas id="${chartId}" style="height: 60px; width: 100%;"></canvas>
                        <div class="leader-growth-value-new">▲ +${c.growth || 0}% ОБЩИЙ РОСТ</div>
                    </div>
                    
                    <div class="leader-footer-btns-new">
                        <button class="leader-btn-new leader-review-btn" data-id="${c.id}">📝 ОТЗЫВЫ</button>
                        <button class="leader-btn-new leader-details-btn" data-id="${c.id}">ℹ️ ПОДРОБНЕЕ</button>
                    </div>
                </div>
            `;
        }).join('');
        
        leadersList.forEach(c => {
            const canvas = document.getElementById(`leader-chart-new-${c.id}`);
            if (canvas) {
                const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
                const values = months.map((_, i) => Math.round((c.growth || 50) * (0.3 + (i / 12) * 0.7)));
                new Chart(canvas, {
                    type: 'line',
                    data: {
                        labels: months,
                        datasets: [{
                            data: values,
                            borderColor: '#C9A03D',
                            borderWidth: 2,
                            fill: true,
                            backgroundColor: 'rgba(201, 160, 61, 0.05)',
                            pointRadius: 2,
                            pointBackgroundColor: '#C9A03D',
                            pointBorderColor: '#FFFFFF',
                            pointBorderWidth: 1,
                            tension: 0.3
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: { display: false },
                            tooltip: { enabled: false }
                        },
                        scales: {
                            x: { display: false },
                            y: { display: false }
                        }
                    }
                });
            }
        });
        
        document.querySelectorAll('.leader-review-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                currentReviewsPage = 1;
                const company = companiesData.find(c => c.id === id);
                if (company) renderPaginatedReviews(company);
            });
        });
        document.querySelectorAll('.leader-details-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                const company = companiesData.find(c => c.id === id);
                if (company) openCompanyModal(company);
            });
        });
    }
    
    function getTop20List() {
        const filteredByGrowth = [...companiesData]
            .sort((a, b) => (b.growth || 0) - (a.growth || 0))
            .slice(0, 20);
        
        return filteredByGrowth.map((c, idx) => ({
            rank: idx + 1, id: c.id, name: c.name, category: getCategoryName(c.category),
            growth: c.growth || 0, revenue: c.revenue || '—', trustIndex: c.trustIndex || 0,
            trend: (c.growth || 0) >= 50 ? 'СТРЕМИТЕЛЬНЫЙ' : ((c.growth || 0) >= 20 ? 'УВЕРЕННЫЙ' : 'СТАБИЛЬНЫЙ')
        }));
    }
    
    function renderTopTable(sortBy = 'rank') {
        const tbody = document.getElementById('topTableBody');
        if (!tbody) return;
        currentSort = sortBy;
        
        let list = getTop20List();
        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:3rem;color:#6B7F9F;">НЕТ КОМПАНИЙ В ТОП-20</span></tr>`;
            document.getElementById('totalGrowth').innerHTML = '+0%';
            document.getElementById('avgGrowth').innerHTML = '0%';
            return;
        }
        
        if (sortBy === 'rank') list.sort((a, b) => a.rank - b.rank);
        else if (sortBy === 'growth') list.sort((a, b) => b.growth - a.growth);
        else if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
        
        const totalGrowth = list.reduce((s, b) => s + b.growth, 0);
        const avgGrowth = list.length ? (totalGrowth / list.length).toFixed(1) : 0;
        document.getElementById('totalGrowth').innerHTML = `+${totalGrowth.toFixed(1)}%`;
        document.getElementById('avgGrowth').innerHTML = `+${avgGrowth}%`;
        
        let html = '';
        list.forEach(b => {
            const rankClass = b.rank === 1 ? 'rank-1' : (b.rank === 2 ? 'rank-2' : (b.rank === 3 ? 'rank-3' : ''));
            const growthClass = b.growth >= 50 ? 'growth-high' : (b.growth >= 20 ? 'growth-mid' : 'growth-low');
            const isExpanded = expandedRows[b.rank] || false;
            const company = companiesData.find(c => c.id === b.id);
            
            html += `<tr class="main-row" data-rank="${b.rank}">
                <td class="rank-cell ${rankClass}">${b.rank}</td>
                <td class="name-cell">${escapeHtml(b.name)} <span style="font-size:0.55rem; color:#C9A03D;">ДОВЕРИЕ ${formatTrustIndex(b.trustIndex)}</span>${currentCompany && currentCompany.id === b.id ? ' <span style="color:#5CBA6F;">(ВЫ)</span>' : ''}</td>
                <td class="cat-cell">${b.category}</td>
                <td class="growth-cell ${growthClass}">+${b.growth}%</td>
                <td class="revenue-cell">${b.revenue}</td>
                <td class="trend-cell trend-up">▲ ${b.trend}</td>
                <td class="expand-cell"><span class="expand-icon" data-rank="${b.rank}">${isExpanded ? '▼' : '▶'}</span></td>
            </tr>
              <tr class="expand-row" data-rank="${b.rank}" style="display:${isExpanded ? 'table-row' : 'none'};">
                <td colspan="7"><div class="expand-content">
                    <div class="expand-grid">
                        <div class="expand-item"><span class="expand-label">METRIC SCORE</span><span class="expand-value">${company?.metricScore || '—'}</span></div>
                        <div class="expand-item"><span class="expand-label">ИНДЕКС ДОВЕРИЯ</span><span class="expand-value gold">${formatTrustIndex(company?.trustIndex || 0)}</span></div>
                        <div class="expand-item"><span class="expand-label">СОТРУДНИКИ</span><span class="expand-value">~${company?.employees || '—'}</span></div>
                        <div class="expand-item"><span class="expand-label">ГОД ОСНОВАНИЯ</span><span class="expand-value">${company?.founded || '—'}</span></div>
                        <div class="expand-item"><span class="expand-label">РЕЙТИНГ</span><span class="expand-value gold">${getRatingStars(company?.rating || 0)} ${company?.rating || 0}</span></div>
                    </div>
                    <div class="chart-container">
                        <div class="chart-header">
                            <span class="chart-title">ДИНАМИКА РОСТА</span>
                            <div class="chart-controls">
                                <button class="chart-btn period-btn active" data-period="month" data-rank="${b.rank}">МЕСЯЦЫ</button>
                                <button class="chart-btn period-btn" data-period="quarter" data-rank="${b.rank}">КВАРТАЛЫ</button>
                                <button class="chart-btn period-btn" data-period="year" data-rank="${b.rank}">ГОДЫ</button>
                            </div>
                        </div>
                        <div class="chart-wrapper"><canvas id="chart-${b.rank}" style="height:250px;"></canvas></div>
                    </div>
                    <div class="expand-predict">ПРОГНОЗ ГЕНИУМА: Индекс доверия ${formatTrustIndex(company?.trustIndex || 0)} — ${company?.trustIndex >= 80 ? 'ПРЕВОСХОДНЫЙ РЕЗУЛЬТАТ' : (company?.trustIndex >= 50 ? 'ХОРОШИЙ УРОВЕНЬ, ПРОДОЛЖАЙТЕ' : 'ТРЕБУЕТСЯ УЛУЧШИТЬ КАЧЕСТВО УСЛУГ')}</div>
                </div></td>
              </tr>`;
        });
        
        tbody.innerHTML = html;
        
        document.querySelectorAll('.expand-icon').forEach(icon => {
            icon.addEventListener('click', function() {
                const rank = parseInt(this.dataset.rank);
                const expandRow = document.querySelector(`.expand-row[data-rank="${rank}"]`);
                if (expandRow) {
                    if (expandedRows[rank]) {
                        expandRow.style.display = 'none';
                        expandedRows[rank] = false;
                        this.textContent = '▶';
                        if (topCharts[rank]) { topCharts[rank].destroy(); delete topCharts[rank]; }
                    } else {
                        expandRow.style.display = 'table-row';
                        expandedRows[rank] = true;
                        this.textContent = '▼';
                        setTimeout(() => {
                            const business = list.find(b => b.rank === rank);
                            if (business) {
                                const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
                                const data = months.map((_, i) => Math.round((business.growth) * (0.3 + (i / 12) * 0.7)));
                                const ctx = document.getElementById(`chart-${rank}`);
                                if (ctx) {
                                    topCharts[rank] = new Chart(ctx, {
                                        type: 'line',
                                        data: { labels: months, datasets: [{ data: data, borderColor: '#C9A03D', borderWidth: 2, fill: false }] },
                                        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
                                    });
                                }
                            }
                            const btns = expandRow.querySelectorAll('.period-btn');
                            btns.forEach(btn => {
                                btn.addEventListener('click', () => {
                                    btns.forEach(b => b.classList.remove('active'));
                                    btn.classList.add('active');
                                    if (topCharts[rank]) topCharts[rank].destroy();
                                    const business = list.find(b => b.rank === rank);
                                    if (business) {
                                        let labels, data;
                                        const baseGrowth = business.growth;
                                        const monthsData = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'].map((_, i) => Math.round(baseGrowth * (0.3 + (i / 12) * 0.7)));
                                        if (btn.dataset.period === 'quarter') {
                                            labels = ['Q1', 'Q2', 'Q3', 'Q4'];
                                            data = [monthsData[0]+monthsData[1]+monthsData[2], monthsData[3]+monthsData[4]+monthsData[5], monthsData[6]+monthsData[7]+monthsData[8], monthsData[9]+monthsData[10]+monthsData[11]];
                                        } else if (btn.dataset.period === 'year') {
                                            labels = ['2022', '2023', '2024', '2025'];
                                            data = [monthsData[2], monthsData[5], monthsData[8], monthsData[11]];
                                        } else {
                                            labels = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
                                            data = monthsData;
                                        }
                                        const ctx = document.getElementById(`chart-${rank}`);
                                        if (ctx) {
                                            topCharts[rank] = new Chart(ctx, {
                                                type: 'line',
                                                data: { labels: labels, datasets: [{ data: data, borderColor: '#C9A03D', borderWidth: 2, fill: false }] },
                                                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
                                            });
                                        }
                                    }
                                });
                            });
                        }, 50);
                    }
                }
            });
        });
    }
    
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderTopTable(btn.dataset.sort);
        });
    });
    
    document.getElementById('reviewForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoadingSpinner(true);
        const companyId = parseInt(document.getElementById('reviewCompanyId').value);
        const company = companiesData.find(c => c.id === companyId);
        if (!company) { alert('Компания не найдена'); showLoadingSpinner(false); return; }
        
        if (hasReviewedCompany(companyId)) {
            alert('Вы уже оставляли отзыв на эту компанию.');
            document.getElementById('reviewModal').classList.remove('active');
            showLoadingSpinner(false);
            return;
        }
        
        const rating = parseFloat(document.getElementById('reviewRating').value);
        if (isNaN(rating) || rating < 1 || rating > 5) { alert('Оценка должна быть от 1 до 5'); showLoadingSpinner(false); return; }
        
        const newReview = {
            id: getNextReviewId(),
            author: document.getElementById('reviewAuthor').value || 'Аноним',
            rating: rating,
            comment: document.getElementById('reviewComment').value,
            date: new Date().toISOString().split('T')[0],
            response: null
        };
        
        if (!company.reviews) company.reviews = [];
        company.reviews.push(newReview);
        company.rating = calculateRating(company);
        company.trustIndex = calculateTrustIndex(company);
        company.metricScore = calculateMetricScore(company);
        updateAllIndices();
        saveToLocalStorage();
        addReviewedCompany(companyId);
        renderBusinesses();
        renderLeadersCards();
        renderTopTable(currentSort);
        renderCompaniesList();
        renderGrowthChart();
        if (currentCompany && currentCompany.id === companyId) renderCabinetContent();
        document.getElementById('reviewModal').classList.remove('active');
        showToast('✅ Спасибо за отзыв! Индекс доверия обновлён', 3000);
        showLoadingSpinner(false);
        await autoSyncToCloud();
    });
    
    function openRespondModal(reviewId, companyId) {
        document.getElementById('respondReviewId').value = reviewId;
        document.getElementById('respondCompanyId').value = companyId;
        document.getElementById('respondModal').classList.add('active');
    }
    
    document.getElementById('respondForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoadingSpinner(true);
        const reviewId = parseInt(document.getElementById('respondReviewId').value);
        const companyId = parseInt(document.getElementById('respondCompanyId').value);
        const responseText = document.getElementById('respondText').value;
        
        const company = companiesData.find(c => c.id === companyId);
        if (company && company.reviews) {
            const review = company.reviews.find(r => r.id === reviewId);
            if (review) {
                review.response = responseText;
                saveToLocalStorage();
                if (currentCompany && currentCompany.id === companyId) renderCabinetContent();
                document.getElementById('respondModal').classList.remove('active');
                showToast('✅ Ответ сохранён', 2000);
                showLoadingSpinner(false);
                await autoSyncToCloud();
            }
        }
    });
    
    document.getElementById('caseForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoadingSpinner(true);
        const title = document.getElementById('caseTitle')?.value;
        const description = document.getElementById('caseDescription')?.value;
        if (!title || !description) { alert('Заполните название и описание'); showLoadingSpinner(false); return; }
        
        const idx = companiesData.findIndex(c => c.id === currentCompany.id);
        if (idx !== -1) {
            if (!companiesData[idx].cases) companiesData[idx].cases = [];
            companiesData[idx].cases.push({ id: getNextCaseId(companiesData[idx]), title, description, image: '' });
            saveToLocalStorage();
            currentCompany = companiesData[idx];
            document.getElementById('caseModal').classList.remove('active');
            document.getElementById('caseForm').reset();
            renderCabinetContent();
            showToast('✅ Кейс добавлен', 2000);
            showLoadingSpinner(false);
            await autoSyncToCloud();
        }
    });
    
    const closeModalIds = ['modalClose', 'closeReviewsModal', 'closeReviewModal', 'closeRespondModal', 'closeCaseModal', 'closeKeyModal'];
    closeModalIds.forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            ['businessModal', 'reviewsModal', 'reviewModal', 'respondModal', 'caseModal', 'keyModal'].forEach(mid => {
                document.getElementById(mid)?.classList.remove('active');
            });
        });
    });
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    });
    
    const mainContent = document.querySelector('main');
    const cabinetPanel = document.getElementById('cabinetPanel');
    const sidebar = document.getElementById('cabinetSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    
    function closeMobileMenu() {
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('mobile-open');
    }
    
    function openMobileMenu() {
        if (sidebar) sidebar.classList.add('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.add('mobile-open');
    }
    
    if (mobileMenuToggle) mobileMenuToggle.addEventListener('click', openMobileMenu);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeMobileMenu);
    
    function getCompanyRank() {
        const sorted = [...companiesData].sort((a, b) => b.trustIndex - a.trustIndex);
        return sorted.findIndex(c => c.id === currentCompany.id) + 1;
    }
    
    function animateNumber(element, start, end, duration = 1000) {
        if (!element) return;
        const range = end - start;
        const stepTime = 16;
        const steps = duration / stepTime;
        const increment = range / steps;
        let current = start;
        const timer = setInterval(() => {
            current += increment;
            if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
                element.innerText = end.toFixed(1);
                clearInterval(timer);
            } else {
                element.innerText = current.toFixed(1);
            }
        }, stepTime);
    }
    
    function renderCabinetContent() {
        if (!currentCompany) return;
        const container = document.getElementById('cabinetContent');
        if (!container) return;
        
        const rank = getCompanyRank();
        const isTop20 = rank <= 20;
        const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
        const growthData = months.map((_, i) => Math.round((currentCompany.growth || 50) * (0.3 + (i / 12) * 0.7)));
        const revenueNum = parseInt(currentCompany.revenue?.replace(/[^0-9]/g, '')) || 100;
        const revenueData = months.map((_, i) => Math.round(revenueNum * (0.5 + (i / 12) * 0.8)));
        
        let html = '';
        
        if (currentTab === 'main') {
            html = `
                <div class="metrics-grid">
                    <div class="metric-card"><div class="metric-card-label">ИНДЕКС ДОВЕРИЯ</div><div class="metric-card-value" id="kpiTrust">${formatTrustIndex(currentCompany.trustIndex)}</div><div class="metric-card-trend">▲ +${(currentCompany.trustIndex * 10).toFixed(1)}% ЗА ГОД</div></div>
                    <div class="metric-card"><div class="metric-card-label">METRIC SCORE</div><div class="metric-card-value" id="kpiScore">${currentCompany.metricScore || 50}</div><div class="metric-card-trend">АВТОМАТИЧЕСКИЙ</div></div>
                    <div class="metric-card"><div class="metric-card-label">ГОДОВОЙ РОСТ</div><div class="metric-card-value" style="color:#5CBA6F;" id="kpiGrowth">+${currentCompany.growth || 0}%</div><div class="metric-card-trend">ВЫШЕ РЫНКА</div></div>
                    <div class="metric-card"><div class="metric-card-label">ВЫРУЧКА</div><div class="metric-card-value">${currentCompany.revenue || '—'}</div><div class="metric-card-trend">2024 ГОД</div></div>
                </div>
                <div class="synergy-block"><div class="synergy-title">⟟ СИНГУЛЯРНОСТЬ СИСТЕМЫ</div><div class="synergy-grid"><div class="synergy-item"><div class="synergy-item-value">${currentCompany.employees || '—'}</div><div class="synergy-item-label">ШТАТ ЕДИНИЦ</div></div><div class="synergy-item"><div class="synergy-item-value">${currentCompany.rating}</div><div class="synergy-item-label">РЕЙТИНГ</div></div><div class="synergy-item"><div class="synergy-item-value">${getRatingStars(currentCompany.rating)}</div><div class="synergy-item-label">ОЦЕНКА КЛИЕНТОВ</div></div></div></div>
                <div class="charts-row"><div class="chart-card"><div class="chart-card-title">ДИНАМИКА РОСТА (%)</div><canvas id="cabinetGrowthChart"></canvas></div><div class="chart-card"><div class="chart-card-title">ДИНАМИКА ВЫРУЧКИ (МЛН ₽)</div><canvas id="cabinetRevenueChart"></canvas></div></div>
                <div class="synergy-block"><div class="synergy-title">⟟ КОММУНИКАЦИОННЫЕ МЕТРИКИ</div><div class="synergy-grid"><div class="synergy-item"><div class="synergy-item-value">${currentCompany.responseRate || 85}%</div><div class="synergy-item-label">ОТВЕЧЕННЫХ ОТЗЫВОВ</div></div><div class="synergy-item"><div class="synergy-item-value">${currentCompany.responseTime || '2.3'}</div><div class="synergy-item-label">СРЕДНЕЕ ВРЕМЯ ОТВЕТА</div></div><div class="synergy-item"><div class="synergy-item-value">${currentCompany.communicationScore || 85}/100</div><div class="synergy-item-label">КОММУНИКАБЕЛЬНОСТЬ</div></div></div></div>
                ${isTop20 ? `<div class="trophy-block"><div class="trophy-icon">⟟</div><div class="trophy-text">ТОП-20 ДОСТИЖЕНИЕ</div><div style="font-size:0.7rem;margin-top:0.5rem;">МЕСТО: #${rank} ИЗ ${companiesData.length}</div></div>` : ''}
                <div class="synergy-block"><div class="synergy-title">⟟ ПРИГЛАСИТЬ КОЛЛЕГ</div><div style="display:flex;gap:0.5rem;flex-wrap:wrap;"><input type="text" id="referralLink" value="https://metric.ru/join/${currentCompany.accessKey}" readonly style="flex:1;background:#0D1220;border:1px solid rgba(201,160,61,0.3);padding:0.7rem;color:#C9A03D;font-family:monospace;min-width:200px;"><button id="copyReferralBtn" style="background:#C9A03D;border:none;padding:0.7rem 1.5rem;cursor:pointer;color:#0A1128;">КОПИРОВАТЬ</button></div></div>
            `;
            
            setTimeout(() => {
                animateNumber(document.getElementById('kpiTrust'), 0, currentCompany.trustIndex, 1200);
                const scoreEl = document.getElementById('kpiScore');
                if (scoreEl) animateNumber(scoreEl, 0, currentCompany.metricScore || 50, 1200);
                if (typeof Chart !== 'undefined') {
                    if (cabinetCharts.growth) cabinetCharts.growth.destroy();
                    if (cabinetCharts.revenue) cabinetCharts.revenue.destroy();
                    cabinetCharts.growth = new Chart(document.getElementById('cabinetGrowthChart'), {
                        type: 'line',
                        data: { labels: months, datasets: [{ data: growthData, borderColor: '#C9A03D', borderWidth: 2, fill: true, backgroundColor: 'rgba(201,160,61,0.05)', tension: 0.3 }] },
                        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
                    });
                    cabinetCharts.revenue = new Chart(document.getElementById('cabinetRevenueChart'), {
                        type: 'line',
                        data: { labels: months, datasets: [{ data: revenueData, borderColor: '#5CBA6F', borderWidth: 2, fill: true, backgroundColor: 'rgba(92,186,111,0.05)', tension: 0.3 }] },
                        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
                    });
                }
                document.getElementById('copyReferralBtn')?.addEventListener('click', () => {
                    const link = document.getElementById('referralLink');
                    link.select();
                    document.execCommand('copy');
                    showToast('✅ Ссылка скопирована', 1500);
                });
            }, 50);
        }
        else if (currentTab === 'profile') {
            html = `
                <div class="chart-card"><div class="chart-card-title">РЕДАКТИРОВАНИЕ ПРОФИЛЯ</div>
                    <div class="profile-form">
                        <div class="form-row"><div class="form-group-cabinet"><label>НАЗВАНИЕ КОМПАНИИ</label><input type="text" id="editName" value="${escapeHtml(currentCompany.name)}" maxlength="100"></div><div class="form-group-cabinet"><label>ТЕЛЕФОН</label><input type="text" id="editPhone" value="${currentCompany.phone || ''}" maxlength="20"></div></div>
                        <div class="form-row"><div class="form-group-cabinet"><label>EMAIL</label><input type="email" id="editEmail" value="${currentCompany.email || ''}" maxlength="100"></div><div class="form-group-cabinet"><label>САЙТ</label><input type="text" id="editWebsite" value="${currentCompany.website || ''}" maxlength="100"></div></div>
                        <div class="form-row"><div class="form-group-cabinet"><label>ГОРОД</label><input type="text" id="editCity" value="${currentCompany.city || ''}" maxlength="50"></div><div class="form-group-cabinet"><label>АДРЕС</label><input type="text" id="editAddress" value="${currentCompany.address || ''}" maxlength="200"></div></div>
                        <div class="form-group-cabinet"><label>ОПИСАНИЕ</label><textarea id="editDescription" rows="3" maxlength="1000">${escapeHtml(currentCompany.description || '')}</textarea></div>
                        <div class="form-group-cabinet"><label>УНИКАЛЬНОЕ ПРЕИМУЩЕСТВО</label><textarea id="editUniqueness" rows="2" maxlength="500">${escapeHtml(currentCompany.uniqueness || '')}</textarea></div>
                        <div class="form-group-cabinet"><label>КЛЮЧЕВЫЕ ПРЕИМУЩЕСТВА</label><textarea id="editAdvantages" rows="2" maxlength="500">${escapeHtml(currentCompany.advantages || '')}</textarea></div>
                        <button id="saveProfileBtn" class="btn-save">СОХРАНИТЬ ИЗМЕНЕНИЯ</button>
                    </div>
                </div>
            `;
            setTimeout(() => {
                document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
                    showLoadingSpinner(true);
                    const idx = companiesData.findIndex(c => c.id === currentCompany.id);
                    if (idx !== -1) {
                        companiesData[idx].name = document.getElementById('editName')?.value || currentCompany.name;
                        companiesData[idx].phone = document.getElementById('editPhone')?.value;
                        companiesData[idx].email = document.getElementById('editEmail')?.value;
                        companiesData[idx].website = document.getElementById('editWebsite')?.value;
                        companiesData[idx].city = document.getElementById('editCity')?.value;
                        companiesData[idx].address = document.getElementById('editAddress')?.value;
                        companiesData[idx].description = document.getElementById('editDescription')?.value;
                        companiesData[idx].uniqueness = document.getElementById('editUniqueness')?.value;
                        companiesData[idx].advantages = document.getElementById('editAdvantages')?.value;
                        saveToLocalStorage();
                        currentCompany = companiesData[idx];
                        document.getElementById('sidebarCompanyName').innerHTML = escapeHtml(currentCompany.name);
                        document.getElementById('sidebarTrust').innerText = formatTrustIndex(currentCompany.trustIndex);
                        document.getElementById('sidebarTrustFill').style.width = `${Math.min(currentCompany.trustIndex, 100)}%`;
                        document.getElementById('sidebarScore').innerText = currentCompany.metricScore || 50;
                        renderCabinetContent();
                        renderBusinesses();
                        renderLeadersCards();
                        renderTopTable(currentSort);
                        renderCompaniesList();
                        renderGrowthChart();
                        updateMapMarkers();
                        showToast('✅ Профиль обновлён', 2000);
                        closeMobileMenu();
                        showLoadingSpinner(false);
                        await autoSyncToCloud();
                    }
                });
            }, 50);
        }
        else if (currentTab === 'reviews') {
            html = `
                <div class="chart-card"><div class="chart-card-title">ОТЗЫВЫ КЛИЕНТОВ (всего: ${currentCompany.reviews?.length || 0})</div>
                    <div class="reviews-list" id="cabinetReviewsList">
                        ${currentCompany.reviews && currentCompany.reviews.length ? currentCompany.reviews.slice(0, 20).map(r => `
                            <div class="review-item"><div class="review-header"><span class="review-author">${escapeHtml(r.author || 'АНОНИМ')}</span><span class="review-date">${r.date}</span></div><div class="review-stars">${getRatingStars(r.rating)}</div><div class="review-text">${escapeHtml(r.comment)}</div>${r.response ? `<div class="review-response">ВАШ ОТВЕТ: ${escapeHtml(r.response)}</div>` : `<button class="btn-respond" data-review-id="${r.id}" data-company-id="${currentCompany.id}">ОТВЕТИТЬ</button>`}</div>
                        `).join('') : '<div style="text-align:center;padding:2rem;">ПОКА НЕТ ОТЗЫВОВ</div>'}
                    </div>
                    ${(currentCompany.reviews?.length || 0) > 20 ? `<div style="margin-top:1rem;text-align:center;font-size:0.6rem;color:#6B7F9F;">Показаны первые 20 из ${currentCompany.reviews.length} отзывов. Полный список доступен на главной странице через кнопку "ОТЗЫВЫ" у карточки компании.</div>` : ''}
                </div>
            `;
            setTimeout(() => {
                document.querySelectorAll('.btn-respond').forEach(btn => {
                    btn.addEventListener('click', () => {
                        openRespondModal(parseInt(btn.dataset.reviewId), parseInt(btn.dataset.companyId));
                        closeMobileMenu();
                    });
                });
            }, 50);
        }
        else if (currentTab === 'security') {
            html = `
                <div class="chart-card"><div class="chart-card-title">БЕЗОПАСНОСТЬ И ДОСТУП</div>
                    <div class="security-info">
                        <div class="security-row"><span class="security-label">КЛЮЧ ДОСТУПА</span><span class="security-value" id="displayAccessKey" style="font-family:monospace;">${currentCompany.accessKey}</span></div>
                        <div class="security-row"><span class="security-label">ID СЕССИИ</span><span class="security-value">GS-1-⟟-${currentCompany.id.toString().padStart(4,'0')}</span></div>
                        <div class="security-row"><span class="security-label">ПОСЛЕДНИЙ ВХОД</span><span class="security-value">${new Date().toLocaleString()}</span></div>
                        <div class="security-row"><span class="security-label">УРОВЕНЬ ДОСТУПА</span><span class="security-value">${getLevelName(currentCompany.metricScore || 50)}</span></div>
                    </div>
                    <div style="display:flex;gap:1rem;flex-wrap:wrap;"><button id="copyAccessKeyBtn" class="btn-save" style="flex:1;">КОПИРОВАТЬ КЛЮЧ</button><button id="resetAccessKeyBtn" class="btn-save" style="border-color:#E85D5D;color:#E85D5D;flex:1;">СБРОСИТЬ КЛЮЧ</button></div>
                </div>
            `;
            setTimeout(() => {
                document.getElementById('copyAccessKeyBtn')?.addEventListener('click', async () => {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(currentCompany.accessKey);
                    } else {
                        document.execCommand('copy');
                    }
                    showToast('✅ Ключ скопирован', 1500);
                    closeMobileMenu();
                });
                document.getElementById('resetAccessKeyBtn')?.addEventListener('click', async () => {
                    if (confirm('Сбросить ключ доступа?')) {
                        const idx = companiesData.findIndex(c => c.id === currentCompany.id);
                        if (idx !== -1) {
                            const newKey = generateAccessKey(currentCompany.name);
                            companiesData[idx].accessKey = newKey;
                            saveToLocalStorage();
                            currentCompany = companiesData[idx];
                            document.getElementById('displayAccessKey').innerText = newKey;
                            showToast(`✅ Новый ключ: ${newKey}`, 3000);
                            closeMobileMenu();
                            await autoSyncToCloud();
                        }
                    }
                });
            }, 50);
        }
        
        container.innerHTML = html;
        
        const greetingHour = new Date().getHours();
        let greeting = '';
        if (greetingHour < 12) greeting = 'ДОБРОЕ УТРО';
        else if (greetingHour < 18) greeting = 'ДОБРЫЙ ДЕНЬ';
        else greeting = 'ДОБРЫЙ ВЕЧЕР';
        
        document.getElementById('cabinetGreeting').innerHTML = `${greeting}, ${escapeHtml(currentCompany.name)}`;
        document.getElementById('cabinetCompanyTitle').innerHTML = escapeHtml(currentCompany.name);
        document.getElementById('sidebarCompanyName').innerHTML = escapeHtml(currentCompany.name);
        document.getElementById('sidebarTrust').innerText = formatTrustIndex(currentCompany.trustIndex);
        document.getElementById('sidebarTrustFill').style.width = `${Math.min(currentCompany.trustIndex, 100)}%`;
        document.getElementById('sidebarScore').innerText = currentCompany.metricScore || 50;
        document.getElementById('sidebarRank').innerHTML = `#${getCompanyRank()}`;
    }
    
    function openCabinet(company) {
        currentCompany = company;
        currentTab = 'main';
        if (mainContent) mainContent.style.display = 'none';
        if (cabinetPanel) cabinetPanel.style.display = 'block';
        document.body.style.overflow = 'hidden';
        renderCabinetContent();
        
        document.querySelectorAll('.sidebar-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                document.querySelectorAll('.sidebar-menu-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                currentTab = item.dataset.tab;
                renderCabinetContent();
                closeMobileMenu();
            });
        });
    }
    
    function closeCabinet() {
        currentCompany = null;
        if (mainContent) mainContent.style.display = 'block';
        if (cabinetPanel) cabinetPanel.style.display = 'none';
        document.body.style.overflow = '';
        renderBusinesses();
        renderLeadersCards();
        renderTopTable(currentSort);
        renderCompaniesList();
        renderGrowthChart();
        if (businessMap) setTimeout(() => businessMap.invalidateSize(), 100);
        closeMobileMenu();
    }
    
    document.getElementById('cabinetLogoutBtn')?.addEventListener('click', closeCabinet);
    
    const loginBtn = document.getElementById('companyLoginBtn');
    const keyModal = document.getElementById('keyModal');
    const closeKeyModal = document.getElementById('closeKeyModal');
    const submitKeyBtn = document.getElementById('submitKeyBtn');
    const accessKeyInput = document.getElementById('accessKeyInput');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (keyModal) keyModal.classList.add('active');
        });
    }
    
    if (closeKeyModal) {
        closeKeyModal.addEventListener('click', () => {
            keyModal?.classList.remove('active');
            if (accessKeyInput) accessKeyInput.value = '';
        });
    }
    
    if (submitKeyBtn && accessKeyInput) {
        submitKeyBtn.addEventListener('click', () => {
            const key = accessKeyInput.value.trim().toUpperCase();
            if (key) {
                const company = companiesData.find(c => c.accessKey === key || c.accessKey?.toUpperCase() === key);
                if (company) {
                    keyModal.classList.remove('active');
                    accessKeyInput.value = '';
                    openCabinet(company);
                } else {
                    alert('НЕВЕРНЫЙ КЛЮЧ ДОСТУПА');
                }
            } else {
                alert('ВВЕДИТЕ КЛЮЧ ДОСТУПА');
            }
        });
    }
    
    if (accessKeyInput) {
        accessKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitKeyBtn?.click();
            }
        });
    }
    
    let adminClickCount = 0, adminTimeout;
    const adminTriggerBtn = document.getElementById('adminTrigger');
    const adminPanelEl = document.getElementById('adminPanel');
    
    function renderAdminCompanies() {
        const container = document.getElementById('adminCompaniesList');
        if (!container) return;
        container.innerHTML = companiesData.map(c => `
            <div class="admin-company-item">
                <div><div class="admin-company-name">${escapeHtml(c.name)}</div><div class="admin-company-id">ID:${c.id} | ДОВЕРИЕ:${formatTrustIndex(c.trustIndex)} | ОТЗЫВОВ:${c.reviews?.length || 0}</div></div>
                <div style="display:flex;gap:0.3rem;flex-wrap:wrap;">
                    ${c.accessKey ? `<span style="font-size:0.5rem;background:rgba(201,160,61,0.2);padding:0.2rem;">${c.accessKey}</span><button class="copy-key-btn" data-key="${c.accessKey}">КОПИЯ</button><button class="reset-key-btn" data-id="${c.id}">СБРОС</button>` : `<button class="generate-key-btn" data-id="${c.id}">ГЕНЕРАЦИЯ</button>`}
                    <button class="delete-company-btn" data-id="${c.id}">УДАЛИТЬ</button>
                </div>
            </div>
        `).join('');
        
        document.querySelectorAll('.copy-key-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(btn.dataset.key);
                } else {
                    document.execCommand('copy');
                }
                showToast('✅ Ключ скопирован', 1500);
            });
        });
        document.querySelectorAll('.generate-key-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const company = companiesData.find(c => c.id === parseInt(btn.dataset.id));
                if (company) {
                    company.accessKey = generateAccessKey(company.name);
                    saveToLocalStorage();
                    renderAdminCompanies();
                    showToast(`✅ Ключ: ${company.accessKey}`, 3000);
                    await autoSyncToCloud();
                }
            });
        });
        document.querySelectorAll('.reset-key-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const company = companiesData.find(c => c.id === parseInt(btn.dataset.id));
                if (company && confirm('Сбросить ключ доступа?')) {
                    company.accessKey = generateAccessKey(company.name);
                    saveToLocalStorage();
                    renderAdminCompanies();
                    showToast(`✅ Новый ключ: ${company.accessKey}`, 3000);
                    await autoSyncToCloud();
                }
            });
        });
        document.querySelectorAll('.delete-company-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.id);
                const company = companiesData.find(c => c.id === id);
                if (company && confirm(`Удалить ${company.name}? Это действие нельзя отменить!`)) {
                    companiesData = companiesData.filter(c => c.id !== id);
                    saveToLocalStorage();
                    renderBusinesses();
                    renderLeadersCards();
                    renderTopTable(currentSort);
                    renderAdminCompanies();
                    renderCompaniesList();
                    renderGrowthChart();
                    updateMapMarkers();
                    updateHeroCounters();
                    showToast(`✅ Компания "${company.name}" полностью удалена из системы`, 3000);
                    await autoSyncToCloud();
                }
            });
        });
    }
    
    if (adminTriggerBtn) {
        adminTriggerBtn.addEventListener('click', () => {
            adminClickCount++;
            clearTimeout(adminTimeout);
            adminTimeout = setTimeout(() => adminClickCount = 0, 1000);
            if (adminClickCount >= 5) {
                adminClickCount = 0;
                adminPanelEl?.classList.toggle('open');
                renderAdminCompanies();
            }
        });
    }
    document.getElementById('closeAdminPanel')?.addEventListener('click', () => adminPanelEl?.classList.remove('open'));
    
    document.getElementById('adminAddCompanyForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoadingSpinner(true);
        const name = document.getElementById('adminCompanyName')?.value;
        if (!name) { alert('Введите название компании'); showLoadingSpinner(false); return; }
        
        if (companiesData.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            alert('❌ Компания с таким названием уже существует!');
            showLoadingSpinner(false);
            return;
        }
        
        const customKey = document.getElementById('adminCompanyKey')?.value;
        
        const newCompany = {
            id: getNextId(),
            name: name,
            category: document.getElementById('adminCompanyCategory')?.value || 'food',
            city: document.getElementById('adminCompanyCity')?.value || 'Грозный',
            address: document.getElementById('adminCompanyAddress')?.value || '',
            founded: parseInt(document.getElementById('adminCompanyFounded')?.value) || new Date().getFullYear(),
            employees: parseInt(document.getElementById('adminCompanyEmployees')?.value) || 1,
            metricScore: 50,
            growth: parseFloat(document.getElementById('adminCompanyGrowth')?.value) || 10,
            revenue: document.getElementById('adminCompanyRevenue')?.value || '0 ₽',
            description: document.getElementById('adminCompanyDescription')?.value || '',
            phone: '', email: '', website: '',
            uniqueness: '', advantages: '',
            rating: 0, trustIndex: 0, responseRate: 100, responseTime: '0', communicationScore: 50,
            reviews: [], cases: [],
            coords: [43.3179 + (Math.random()-0.5)*0.05, 45.6987 + (Math.random()-0.5)*0.05],
            accessKey: customKey || generateAccessKey(name),
            createdAt: new Date().toISOString()
        };
        companiesData.push(newCompany);
        updateAllIndices();
        saveToLocalStorage();
        renderBusinesses();
        renderLeadersCards();
        renderTopTable(currentSort);
        renderAdminCompanies();
        renderCompaniesList();
        renderGrowthChart();
        updateMapMarkers();
        updateHeroCounters();
        adminPanelEl?.classList.remove('open');
        showToast(`✅ Компания "${name}" добавлена! Ключ: ${newCompany.accessKey}`, 5000);
        showLoadingSpinner(false);
        await autoSyncToCloud();
    });
    
    function updateLiveTime() {
        const timeEl = document.getElementById('liveTime');
        if (timeEl) {
            const now = new Date();
            timeEl.innerText = now.toLocaleTimeString('ru-RU', { hour12: false });
        }
    }
    setInterval(updateLiveTime, 1000);
    updateLiveTime();
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('revealed'); });
    }, { threshold: 0.1 });
    document.querySelectorAll('.scroll-animate').forEach(el => observer.observe(el));
    
    const synergyConn = document.getElementById('dynamicConnection');
    setInterval(() => {
        synergyConn?.classList.add('active-synergy');
        setTimeout(() => synergyConn?.classList.remove('active-synergy'), 3000);
    }, 15000);
    
    document.getElementById('partnershipForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('✅ Спасибо! Мы свяжемся с вами.', 3000);
        e.target.reset();
    });
    
});
