const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTqyeASF1a_Pkd8XRF8oVzIqJ8LlhvovCjwkKqE1xPcz4E461NbCEarDNYe5dEssq-QLCbhbzzrMZUW/pub?gid=1807891416&single=true&output=csv";
const TMDB_KEY = "8176bef1ded845e66a729a187c643d93";

const filmGrid = document.getElementById("filmGrid");
const searchInput = document.getElementById("searchInput");

const posterCache = JSON.parse(localStorage.getItem("posterCache") || "{}");
const CACHE_EXPIRY = 1000 * 60 * 60 * 24 * 7;

let allFilms = [];
let renderToken = 0;

let sortMode = "sheet";
let sortDirection = { alpha: "asc", year: "desc" };

function parseCSV(csv) {
    const lines = csv.trim().split("\n");
    const headers = parseCSVLine(lines[0]);

    return lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const obj = {};

        headers.forEach((h, i) => obj[h] = values[i]);

        return {
            Film: (obj["Film"] || "").trim(),
            IMDB: (obj["IMDB"] || "").trim(),
            "Release Year": (obj["Release Year"] || "").trim(),
            Completed: (obj["Completed"] || "").trim()
        };
    }).filter(f => f.Film && f.IMDB);
}

function parseCSVLine(line) {
    const result = [];
    let cur = "";
    let inQ = false;

    for (let i = 0; i < line.length; i++) {
        const c = line[i];

        if (c === '"' && line[i - 1] !== "\\") {
            inQ = !inQ;
            continue;
        }

        if (c === "," && !inQ) {
            result.push(cur.trim());
            cur = "";
        } else {
            cur += c;
        }
    }

    result.push(cur.trim());
    return result.map(v => v.replace(/^"|"$/g, ""));
}

async function loadFilms() {
    const res = await fetch(sheetURL, { cache: "no-store" });
    const text = await res.text();
    allFilms = parseCSV(text);
    displayFilms();

    document.getElementById("loading").style.display = "none";
}

function setSort(mode) {
    if (mode === "sheet") {
        sortMode = "sheet";
    } else {
        if (sortMode === mode) {
            sortDirection[mode] = sortDirection[mode] === "asc" ? "desc" : "asc";
        } else {
            sortMode = mode;
        }
    }

    displayFilms();
}

function sortFilms(list) {
    const sorted = [...list];

    if (sortMode === "alpha") {
        sorted.sort((a, b) => a.Film.localeCompare(b.Film));
        return sortDirection.alpha === "asc" ? sorted : sorted.reverse();
    }

    if (sortMode === "year") {
        sorted.sort((a, b) => parseInt(a["Release Year"] || 0) - parseInt(b["Release Year"] || 0));
        return sortDirection.year === "asc" ? sorted : sorted.reverse();
    }

    return sorted;
}

function extractIMDbID(url) {
    return (url || "").match(/tt\d{7,9}/)?.[0] || null;
}

async function getTMDBPoster(imdbUrl) {
    const id = extractIMDbID(imdbUrl);
    if (!id) return "posters/placeholder.png";

    const cached = posterCache[id];
    if (cached && Date.now() - cached.time < CACHE_EXPIRY) {
        return cached.url;
    }

    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`
        );

        const data = await res.json();
        const movie = data.movie_results?.[0];

        const poster = movie?.poster_path
            ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
            : "posters/placeholder.png";

        posterCache[id] = { url: poster, time: Date.now() };
        localStorage.setItem("posterCache", JSON.stringify(posterCache));

        return poster;
    } catch {
        return "posters/placeholder.png";
    }
}

function getFilteredFilms() {
    const query = searchInput.value.trim().toLowerCase();

    let list = allFilms;

    if (query) {
        list = list.filter(f =>
            (f.Film || "").toLowerCase().includes(query)
        );
    }

    return list;
}

function displayFilms() {
    const token = ++renderToken;
    filmGrid.innerHTML = "";

    const query = searchInput.value.trim().toLowerCase();
    const isSearching = query.length > 0;

    let list = allFilms;

    if (isSearching) {
        list = allFilms.filter(f =>
            (f.Film || "").toLowerCase().includes(query)
        );
    }

    const completed = sortFilms(list.filter(f => f.Completed.toUpperCase() === "TRUE"));
    const uncompleted = sortFilms(list.filter(f => f.Completed.toUpperCase() !== "TRUE"));

    if (!completed.length && !uncompleted.length) {
        const empty = document.createElement("div");
        empty.textContent = "No items found...";
        empty.style.gridColumn = "1 / -1";
        empty.style.textAlign = "center";
        empty.style.color = "#888";
        empty.style.fontStyle = "italic";
        empty.style.marginTop = "2rem";
        filmGrid.appendChild(empty);
        return;
    }

    if (isSearching) {
        const combined = [...completed, ...uncompleted];

        const section = document.createElement("div");
        section.className = "section";

        combined.forEach(f => {
            section.appendChild(createCard(f, f.Completed.toUpperCase() !== "TRUE", token));
        });

        filmGrid.appendChild(section);
        return;
    }

    const completedSection = document.createElement("div");
    completedSection.className = "section";

    completed.forEach(f => {
        completedSection.appendChild(createCard(f, false, token));
    });

    filmGrid.appendChild(completedSection);

    const divider = document.createElement("div");
    divider.className = "divider";
    filmGrid.appendChild(divider);

    const label = document.createElement("h2");
    label.className = "section-title";
    label.textContent = "Not Yet Added";
    filmGrid.appendChild(label);

    const uncompletedSection = document.createElement("div");
    uncompletedSection.className = "section";

    uncompleted.forEach(f => {
        uncompletedSection.appendChild(createCard(f, true, token));
    });

    filmGrid.appendChild(uncompletedSection);
}

function createCard(film, isUncompleted, token) {
    const card = document.createElement("div");
    card.className = "card";

    const img = document.createElement("img");
    img.className = "poster";
    img.src = "posters/placeholder.png";

    const title = film.Film || "Untitled";

    const info = document.createElement("div");
    info.className = "info";

    info.innerHTML = `
        <h2 class="title">${title}</h2>
        <p class="year">${film["Release Year"] || ""}</p>
        ${isUncompleted ? `<p class="not-done">Not added</p>` : ""}
    `;

    card.appendChild(img);
    card.appendChild(info);

    loadPoster(img, film.IMDB, token);

    return card;
}

async function loadPoster(img, imdb, token) {
    const poster = await getTMDBPoster(imdb);

    if (token !== renderToken || !img.isConnected) return;

    img.src = poster;
}

searchInput.addEventListener("input", displayFilms);

loadFilms();