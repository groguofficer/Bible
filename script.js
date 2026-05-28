/* ── KJV Bible Reader · script.js ── */

// ── Bible book order & testament membership ────────────────────────────────
// NOTE: The CSV uses "Psalm" (not "Psalms") — must match exactly.
const OLD_TESTAMENT = [
  'Genesis','Exodus','Leviticus','Numbers','Deuteronomy',
  'Joshua','Judges','Ruth','1 Samuel','2 Samuel',
  '1 Kings','2 Kings','1 Chronicles','2 Chronicles',
  'Ezra','Nehemiah','Esther','Job','Psalm','Proverbs',
  'Ecclesiastes','Song of Solomon','Isaiah','Jeremiah',
  'Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos',
  'Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah',
  'Haggai','Zechariah','Malachi'
];

const NEW_TESTAMENT = [
  'Matthew','Mark','Luke','John','Acts','Romans',
  '1 Corinthians','2 Corinthians','Galatians','Ephesians',
  'Philippians','Colossians','1 Thessalonians','2 Thessalonians',
  '1 Timothy','2 Timothy','Titus','Philemon','Hebrews',
  'James','1 Peter','2 Peter','1 John','2 John','3 John',
  'Jude','Revelation'
];

const ALL_BOOKS = [...OLD_TESTAMENT, ...NEW_TESTAMENT];

// ── App State ─────────────────────────────────────────────────────────────
let verseData    = {};   // { "Genesis 1:1": "In the beginning..." }
let chapterData  = {};   // { "Genesis 1": "full chapter text..." }
let booksInData  = [];   // books actually present in the loaded CSVs (canonical order)
let currentBook    = null;
let currentChapter = null;
let currentTestament = 'OT';

// ── CSV Parser (handles quoted fields containing commas and newlines) ──────
function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row = [];
    while (i < len) {
      if (text[i] === '"') {
        i++;
        let field = '';
        while (i < len) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { field += '"'; i += 2; }
            else { i++; break; }
          } else {
            field += text[i++];
          }
        }
        row.push(field);
      } else {
        let field = '';
        while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i++];
        }
        row.push(field.trim());
      }
      if (i < len && text[i] === ',') { i++; }
      else { break; }
    }
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;
    if (row.length > 0 && !(row.length === 1 && row[0] === '')) rows.push(row);
  }
  return rows;
}

/**
 * Given a verse reference string like "Genesis 1:1" or "Song of Solomon 1:1"
 * or "1 Corinthians 3:16", extract the book name by matching against ALL_BOOKS.
 * Returns the matched book name, or null if not found.
 */
function extractBookFromRef(ref) {
  // Sort by length descending so "Song of Solomon" matches before "Solomon"
  const sorted = [...ALL_BOOKS].sort((a, b) => b.length - a.length);
  for (const book of sorted) {
    if (ref.startsWith(book + ' ')) return book;
  }
  return null;
}

/**
 * Given a chapter key like "Genesis 1" or "Song of Solomon 3",
 * extract the book name by matching against ALL_BOOKS.
 */
function extractBookFromChapterKey(key) {
  const sorted = [...ALL_BOOKS].sort((a, b) => b.length - a.length);
  for (const book of sorted) {
    if (key.startsWith(book + ' ')) return book;
  }
  return null;
}

// ── Load both CSVs ────────────────────────────────────────────────────────
async function loadData() {
  const grid = document.getElementById('book-grid');
  grid.innerHTML = '<p class="loading-spinner" style="grid-column:1/-1">Loading scripture…</p>';

  try {
    const [verseRes, chapterRes] = await Promise.all([
      fetch('kjv.csv'),
      fetch('kjv_by_chapter.csv')
    ]);

    if (!verseRes.ok || !chapterRes.ok) {
      throw new Error(
        'Could not load CSV files. Make sure kjv.csv and kjv_by_chapter.csv ' +
        'are in the same folder as index.html, and serve via a local web server ' +
        '(e.g. python3 -m http.server 8000).'
      );
    }

    const [verseText, chapterText] = await Promise.all([
      verseRes.text(),
      chapterRes.text()
    ]);

    // ── Parse kjv.csv  →  verseData { "Genesis 1:1": "In the beginning..." }
    const verseRows = parseCSV(verseText);
    // Row 0 is the header; row 1 may be the preamble (no colon in ref) — skip both
    for (let r = 1; r < verseRows.length; r++) {
      const ref  = (verseRows[r][0] || '').trim();
      const text = (verseRows[r][1] || '').trim();
      if (ref && text && ref.includes(':')) {
        verseData[ref] = text;
      }
    }

    // ── Parse kjv_by_chapter.csv  →  chapterData { "Genesis 1": "..." }
    const chapterRows = parseCSV(chapterText);
    for (let r = 1; r < chapterRows.length; r++) {
      const ref  = (chapterRows[r][0] || '').trim();
      const text = (chapterRows[r][1] || '').trim();
      if (ref && text) {
        chapterData[ref] = text;
      }
    }

    // ── Determine which books are present, in canonical order ─────────────
    const bookSet = new Set();
    Object.keys(chapterData).forEach(key => {
      const book = extractBookFromChapterKey(key);
      if (book) bookSet.add(book);
    });
    // Also scan verseData (catches any books only in kjv.csv)
    Object.keys(verseData).forEach(key => {
      const book = extractBookFromRef(key);
      if (book) bookSet.add(book);
    });

    // Maintain canonical Bible order; any unrecognised books go at the end
    booksInData = ALL_BOOKS.filter(b => bookSet.has(b));
    const extras = [...bookSet].filter(b => !ALL_BOOKS.includes(b)).sort();
    booksInData = [...booksInData, ...extras];

    renderBookGrid();

  } catch (err) {
    grid.innerHTML =
      `<p style="color:#c87060;font-family:'Crimson Pro',serif;grid-column:1/-1;padding:2rem;">
        ⚠ ${err.message}
       </p>`;
    console.error(err);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** All chapter numbers present for a given book, sorted numerically */
function chaptersForBook(book) {
  const nums = new Set();
  Object.keys(chapterData).forEach(key => {
    if (key.startsWith(book + ' ')) {
      const rest = key.slice(book.length).trim();
      const num  = parseInt(rest, 10);
      if (!isNaN(num)) nums.add(num);
    }
  });
  return [...nums].sort((a, b) => a - b);
}

/** All verse numbers for a given book + chapter, sorted numerically */
function versesForChapter(book, chapter) {
  const prefix = `${book} ${chapter}:`;
  const nums   = [];
  Object.keys(verseData).forEach(key => {
    if (key.startsWith(prefix)) {
      const num = parseInt(key.slice(prefix.length), 10);
      if (!isNaN(num)) nums.push(num);
    }
  });
  return nums.sort((a, b) => a - b);
}

/** Build { verseNum → text } map for a given book + chapter from verseData */
function parseChapterVerses(book, chapter) {
  const prefix = `${book} ${chapter}:`;
  const out    = {};
  Object.keys(verseData).forEach(key => {
    if (key.startsWith(prefix)) {
      const num = parseInt(key.slice(prefix.length), 10);
      if (!isNaN(num)) out[num] = verseData[key];
    }
  });
  return out;
}

/** Books visible under the current testament tab */
function filteredBooks() {
  if (currentTestament === 'OT')  return booksInData.filter(b => OLD_TESTAMENT.includes(b));
  if (currentTestament === 'NT')  return booksInData.filter(b => NEW_TESTAMENT.includes(b));
  return booksInData;
}

// ── Panel show/hide ───────────────────────────────────────────────────────
function showPanel(id) {
  ['panel-books','panel-chapters','panel-verses'].forEach(p => {
    const el = document.getElementById(p);
    if (p === id) { el.removeAttribute('hidden'); el.classList.add('active'); }
    else          { el.setAttribute('hidden',''); el.classList.remove('active'); }
  });
}

// ── Breadcrumb ────────────────────────────────────────────────────────────
function updateBreadcrumb() {
  const crumbHome    = document.getElementById('crumb-home');
  const crumbBook    = document.getElementById('crumb-book');
  const crumbChapter = document.getElementById('crumb-chapter');
  const sep1         = document.getElementById('sep-1');
  const sep2         = document.getElementById('sep-2');

  crumbHome.classList.remove('active');
  crumbBook.hidden    = true; sep1.hidden = true;
  crumbChapter.hidden = true; sep2.hidden = true;
  crumbBook.classList.remove('active');
  crumbChapter.classList.remove('active');

  if (!currentBook) {
    crumbHome.classList.add('active');
    return;
  }
  sep1.hidden = false;
  crumbBook.hidden = false;
  crumbBook.textContent = currentBook;

  if (currentChapter) {
    sep2.hidden = false;
    crumbChapter.hidden = false;
    crumbChapter.textContent = `Ch. ${currentChapter}`;
    crumbChapter.classList.add('active');
  } else {
    crumbBook.classList.add('active');
  }
}

// ── RENDER: Book Grid ─────────────────────────────────────────────────────
function renderBookGrid() {
  const grid  = document.getElementById('book-grid');
  const books = filteredBooks();

  if (books.length === 0) {
    grid.innerHTML =
      '<p style="color:var(--parchment-deep);grid-column:1/-1;padding:2rem;font-style:italic;">' +
      'No books found for this testament in the loaded data.</p>';
    return;
  }

  grid.innerHTML = '';
  books.forEach((book, i) => {
    const btn = document.createElement('button');
    btn.className = 'book-btn' + (book === currentBook ? ' active' : '');
    btn.textContent = book;
    btn.style.animationDelay = `${Math.min(i * 14, 500)}ms`;
    btn.addEventListener('click', () => selectBook(book));
    grid.appendChild(btn);
  });
}

// ── RENDER: Chapter Pills ─────────────────────────────────────────────────
function renderChapterPills(book) {
  const pills    = document.getElementById('chapter-pills');
  const chapters = chaptersForBook(book);
  pills.innerHTML = '';

  if (chapters.length === 0) {
    pills.innerHTML =
      '<span style="color:var(--parchment-deep);font-style:italic;font-size:0.9rem;">No chapter data available.</span>';
    return;
  }

  chapters.forEach(ch => {
    const btn = document.createElement('button');
    btn.className = 'pill-btn';
    btn.textContent = ch;
    btn.addEventListener('click', () => selectChapter(book, ch));
    pills.appendChild(btn);
  });
}

// ── RENDER: Verse Pills ───────────────────────────────────────────────────
function renderVersePills(book, chapter) {
  const pills  = document.getElementById('verse-pills');
  const verses = versesForChapter(book, chapter);
  pills.innerHTML = '';

  if (verses.length === 0) {
    pills.innerHTML =
      '<span style="color:var(--parchment-deep);font-style:italic;font-size:0.9rem;">No individual verse data available.</span>';
    return;
  }

  verses.forEach(v => {
    const btn = document.createElement('button');
    btn.className = 'pill-btn';
    btn.textContent = v;
    btn.addEventListener('click', () => selectVerse(book, chapter, v));
    pills.appendChild(btn);
  });
}

// ── RENDER: Chapter Display (all verses) ─────────────────────────────────
function renderChapterDisplay(book, chapter) {
  const display  = document.getElementById('chapter-display');
  const verseMap = parseChapterVerses(book, chapter);
  const sorted   = Object.keys(verseMap).map(Number).sort((a, b) => a - b);

  if (sorted.length === 0) {
    // Fallback: use the raw combined text from kjv_by_chapter.csv
    const raw = chapterData[`${book} ${chapter}`];
    if (raw) {
      display.innerHTML =
        `<div class="display-chapter-title">${book} &middot; Chapter ${chapter}</div>
         <p class="verse-text">${raw}</p>`;
    } else {
      display.innerHTML = '<p class="hint-text">No content found for this chapter.</p>';
    }
    return;
  }

  let html = `<div class="display-chapter-title">${book} &middot; Chapter ${chapter}</div>`;
  sorted.forEach((num, idx) => {
    html +=
      `<div class="verse-row" style="animation-delay:${Math.min(idx * 12, 700)}ms">
        <span class="verse-num">${num}</span>
        <span class="verse-text">${verseMap[num]}</span>
       </div>`;
  });
  display.innerHTML = html;
}

// ── RENDER: Single Verse ──────────────────────────────────────────────────
function renderVerseDisplay(book, chapter, verseNum) {
  const display = document.getElementById('verse-display');
  const key     = `${book} ${chapter}:${verseNum}`;
  const text    = verseData[key];

  if (!text) {
    display.innerHTML = `<p class="hint-text">Verse not found: ${key}</p>`;
    return;
  }

  display.innerHTML =
    `<div class="single-verse-ref">${book} ${chapter}:${verseNum}</div>
     <p class="single-verse-text">${text}</p>`;
}

// ── SELECT: Book ──────────────────────────────────────────────────────────
function selectBook(book) {
  currentBook    = book;
  currentChapter = null;

  document.getElementById('chapter-panel-title').textContent = book;
  renderChapterPills(book);
  document.getElementById('chapter-display').innerHTML =
    '<p class="hint-text">Select a chapter above to begin reading.</p>';

  showPanel('panel-chapters');
  updateBreadcrumb();
}

// ── SELECT: Chapter ───────────────────────────────────────────────────────
function selectChapter(book, chapter) {
  currentChapter = chapter;

  document.querySelectorAll('#chapter-pills .pill-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.textContent, 10) === chapter);
  });

  renderChapterDisplay(book, chapter);

  document.getElementById('verse-panel-title').textContent = `${book} · Ch. ${chapter}`;
  renderVersePills(book, chapter);
  document.getElementById('verse-display').innerHTML =
    '<p class="hint-text">Select a verse above to highlight it.</p>';

  showPanel('panel-verses');
  updateBreadcrumb();
}

// ── SELECT: Verse ─────────────────────────────────────────────────────────
function selectVerse(book, chapter, verseNum) {
  document.querySelectorAll('#verse-pills .pill-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.textContent, 10) === verseNum);
  });

  renderVerseDisplay(book, chapter, verseNum);
  updateBreadcrumb();
}

// ── Back navigation ───────────────────────────────────────────────────────
document.getElementById('back-to-books').addEventListener('click', () => {
  currentBook    = null;
  currentChapter = null;
  showPanel('panel-books');
  updateBreadcrumb();
});

document.getElementById('back-to-chapters').addEventListener('click', () => {
  currentChapter = null;
  document.getElementById('chapter-display').innerHTML =
    '<p class="hint-text">Select a chapter above to begin reading.</p>';
  document.querySelectorAll('#chapter-pills .pill-btn').forEach(b => b.classList.remove('active'));
  showPanel('panel-chapters');
  updateBreadcrumb();
});

// Breadcrumb click navigation
document.getElementById('crumb-home').addEventListener('click', () => {
  if (currentBook) {
    currentBook = null; currentChapter = null;
    showPanel('panel-books');
    updateBreadcrumb();
  }
});
document.getElementById('crumb-book').addEventListener('click', () => {
  if (currentChapter) {
    document.getElementById('back-to-chapters').click();
  }
});

// ── Testament tab switcher ────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTestament = btn.dataset.testament;
    renderBookGrid();
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────
updateBreadcrumb();
loadData();
