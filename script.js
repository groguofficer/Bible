// --- FILE URLS ---
const KJV_URL         = 'kjv.csv';
const KJV_CHAPTER_URL = 'kjv_by_chapter.csv';
const PLAN_URL        = 'ChronoBiblePlan.csv';
const SPURGEON_URL    = 'spurgeon_morning_and_evening.csv';

// --- DATA STORES ---
let allVersesArray = [];
let chapterLookup  = new Map();
let planLookup     = new Map();
let spurgeonLookup = new Map();

// ============================================================
//  FULL RFC-4180 CSV PARSER
// ============================================================
function parseCSVFull(text) {
    const rows = [];
    let row = [], field = '', inQ = false, i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (inQ) {
            if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; }
            else if (ch === '"')                   { inQ = false; i++; }
            else                                   { field += ch; i++; }
        } else {
            if      (ch === '"')                            { inQ = true; i++; }
            else if (ch === ',')                            { row.push(field); field = ''; i++; }
            else if (ch === '\r' && text[i + 1] === '\n')  { row.push(field); rows.push(row); row = []; field = ''; i += 2; }
            else if (ch === '\n')                           { row.push(field); rows.push(row); row = []; field = ''; i++; }
            else                                            { field += ch; i++; }
        }
    }
    if (row.length > 0 || field !== '') { row.push(field); rows.push(row); }
    return rows;
}

// ============================================================
//  ON-PAGE ERROR DISPLAY
// ============================================================
function showError(msg) {
    let box = document.getElementById('_err');
    if (!box) {
        box = document.createElement('div');
        box.id = '_err';
        box.style.cssText = [
            'position:fixed;top:0;left:0;right:0;z-index:9999',
            'background:#fff0f0;border-bottom:2px solid #900',
            'color:#600;padding:10px 16px;font:12px monospace',
            'white-space:pre-wrap;max-height:35vh;overflow-y:auto'
        ].join(';');
        document.body.prepend(box);
    }
    box.textContent += '⚠ ' + msg + '\n';
}

// ============================================================
//  SAFE FETCH
// ============================================================
async function safeFetch(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) { showError('HTTP ' + res.status + ' — could not load: ' + url); return null; }
        return await res.text();
    } catch (e) {
        showError('Cannot fetch "' + url + '": ' + e.message +
            '\n  → Run from a local web server, not file://');
        return null;
    }
}

// ============================================================
//  LOAD ALL DATA
// ============================================================
async function loadData() {
    const [kjvText, chapterText, planText, spurgeonText] = await Promise.all([
        safeFetch(KJV_URL),
        safeFetch(KJV_CHAPTER_URL),
        safeFetch(PLAN_URL),
        safeFetch(SPURGEON_URL)
    ]);

    if (kjvText) {
        kjvText.trim().split('\n').forEach(function(line) {
            line = line.replace(/\r$/, '');
            var comma = line.indexOf(',');
            if (comma === -1) return;
            var ref  = line.slice(0, comma).trim();
            var text = line.slice(comma + 1).trim().replace(/^"|"$/g, '');
            if (ref && text) allVersesArray.push({ reference: ref, text: text });
        });
    }

    if (chapterText) {
        parseCSVFull(chapterText).forEach(function(row, i) {
            if (i === 0) return;
            if (row.length < 2) return;
            var chapter = row[0].trim();
            var text    = row[1].trim();
            if (chapter && text) chapterLookup.set(chapter, text);
        });
    }

    if (planText) {
        planText.trim().split('\n').forEach(function(line, i) {
            line = line.replace(/\r$/, '');
            if (i === 0) return;
            var sep = line.indexOf('\t');
            if (sep === -1) sep = line.indexOf(',');
            if (sep !== -1) {
                var day     = line.slice(0, sep).trim();
                var reading = line.slice(sep + 1).trim();
                if (day && reading) planLookup.set(day, reading);
                return;
            }
            var m = line.match(/^(\d+)\s{2,}(.+)$/);
            if (m) planLookup.set(m[1], m[2].trim());
        });
    }

    if (spurgeonText) {
        parseCSVFull(spurgeonText).forEach(function(row, i) {
            if (i === 0) return;
            if (row.length < 3) return;
            var date    = row[0].trim();
            var time    = row[1].trim();
            var content = row[2].trim();
            if (!date || !time || !content) return;
            if (!spurgeonLookup.has(date)) spurgeonLookup.set(date, {});
            spurgeonLookup.get(date)[time] = content;
        });
    }
}

// ============================================================
//  DISPLAY: RANDOM VERSE
// ============================================================
function displayRandomVerse() {
    var el = document.getElementById('random-verse-container');
    if (!el) return;
    if (!allVersesArray.length) { el.innerHTML = '<p>Verse data not loaded.</p>'; return; }
    var v = allVersesArray[Math.floor(Math.random() * allVersesArray.length)];
    el.innerHTML = '<p>\u201c' + v.text + '\u201d</p><footer>\u2014 ' + v.reference + '</footer>';
}

// ============================================================
//  DISPLAY: SPURGEON
// ============================================================
function getTodayDateKey() {
    var months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
    var d = new Date();
    return months[d.getMonth()] + ' ' + d.getDate();
}

function displaySpurgeon() {
    var labelEl = document.getElementById('spurgeon-date-label');
    var el      = document.getElementById('spurgeon-container');
    if (!el) return;
    var dateKey = getTodayDateKey();
    if (labelEl) labelEl.textContent = dateKey;
    if (!spurgeonLookup.size) { el.innerHTML = '<p class="s-note">Spurgeon file not loaded.</p>'; return; }
    var entries = spurgeonLookup.get(dateKey);
    if (!entries) { el.innerHTML = '<p class="s-note">No Spurgeon entry for ' + dateKey + '.</p>'; return; }
    var html = '';
    ['Morning', 'Evening'].forEach(function(session, idx) {
        var text = entries[session];
        if (!text) return;
        var verseRef = '', body = text;
        var m = text.match(/^(".*?"-[A-Za-z0-9 ]+\d+:\d+)/);
        if (m) { verseRef = m[1]; body = text.slice(m[0].length).trim(); }
        if (idx > 0) html += '<hr class="s-divider">';
        html += '<div class="s-entry">';
        html += '<span class="s-badge">' + session + '</span>';
        if (verseRef) html += '<p class="s-verse">' + verseRef + '</p>';
        html += '<div class="s-body">' + body + '</div>';
        html += '</div>';
    });
    el.innerHTML = html || '<p class="s-note">No entries for ' + dateKey + '.</p>';
}

// ============================================================
//  DISPLAY: DAILY READING
// ============================================================
function getDayOfYear() {
    var now = new Date();
    return Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
}

function expandPassage(str) {
    str = str.trim();
    var results = [];
    var m = str.match(/^(\d\s+[A-Za-z][\w\s]*?|[A-Za-z][\w\s]*?)\s+(\d[\d\S]*)$/);
    if (!m) return [];
    var book = m[1].trim();
    m[2].trim().split(',').forEach(function(part) {
        var p = part.trim();
        if (!p) return;
        if (p.indexOf('-') !== -1 && p.indexOf(':') === -1) {
            var s = parseInt(p.split('-')[0], 10);
            var e = parseInt(p.split('-')[1], 10);
            for (var i = s; i <= e; i++) results.push(book + ' ' + i);
        } else if (p.indexOf(':') !== -1) {
            results.push(book + ' ' + p.split(':')[0]);
        } else {
            results.push(book + ' ' + p);
        }
    });
    return results.filter(function(v, i, a) { return a.indexOf(v) === i; });
}

function displayDailyReading() {
    var titleEl = document.getElementById('daily-reading-title');
    var textEl  = document.getElementById('daily-reading-text');
    if (!titleEl || !textEl) return;
    var day     = getDayOfYear();
    var planStr = planLookup.get(String(day));
    titleEl.innerText = "Today's Reading (Day " + day + ")";
    if (!planStr) {
        var keys = [];
        planLookup.forEach(function(v, k) { if (keys.length < 5) keys.push(k); });
        textEl.innerHTML = '<p>No reading found for day ' + day + '.</p>' +
            '<p style="font-size:0.8em;color:#888">Plan loaded ' + planLookup.size +
            ' entries. Sample keys: [' + keys.join(', ') + ']</p>';
        return;
    }
    var chapters = [];
    planStr.split(';').forEach(function(p) {
        expandPassage(p.trim()).forEach(function(ch) { chapters.push(ch); });
    });
    var html = '<p><strong>Reading Plan:</strong> ' + planStr + '</p><hr>';
    if (chapters.length) {
        chapters.forEach(function(key) {
            var tx = chapterLookup.get(key);
            html += tx
                ? '<h3>' + key + '</h3><p>' + tx + '</p>'
                : '<p style="color:#a00">Chapter not found: ' + key + '</p>';
        });
    } else {
        html += '<p style="color:#a00">Could not parse: "' + planStr + '"</p>';
    }
    textEl.innerHTML = html;
}

// ============================================================
//  TEXT-TO-SPEECH
// ============================================================
var tts = {
    synth:   window.speechSynthesis,
    queue:   [],   // array of { label, text } segments
    pos:     0,    // current position in queue
    paused:  false,
    active:  false,

    // Collect all visible text into labelled segments
    buildQueue: function() {
        var segments = [];

        // 1. Verse of the Hour
        var verseEl = document.getElementById('random-verse-container');
        if (verseEl && verseEl.innerText.trim()) {
            segments.push({ label: 'Verse of the Hour', text: verseEl.innerText.trim() });
        }

        // 2. Spurgeon Morning & Evening
        var spurgeonDateEl = document.getElementById('spurgeon-date-label');
        var spurgeonEl     = document.getElementById('spurgeon-container');
        if (spurgeonEl && spurgeonEl.innerText.trim()) {
            var dateLabel = spurgeonDateEl ? spurgeonDateEl.innerText.trim() : '';
            segments.push({
                label: 'Spurgeon Morning and Evening' + (dateLabel ? ', ' + dateLabel : ''),
                text:  spurgeonEl.innerText.trim()
            });
        }

        // 3. Daily Reading — read chapter by chapter
        var readingEl = document.getElementById('daily-reading-text');
        if (readingEl) {
            var titleEl = document.getElementById('daily-reading-title');
            var planLabel = titleEl ? titleEl.innerText.trim() : "Today's Reading";
            // Announce the plan label first
            segments.push({ label: planLabel, text: '' });
            // Then each chapter heading + its text separately
            var h3s = readingEl.querySelectorAll('h3');
            if (h3s.length) {
                h3s.forEach(function(h3) {
                    var chapterTitle = h3.innerText.trim();
                    var nextP = h3.nextElementSibling;
                    var chapterText = nextP ? nextP.innerText.trim() : '';
                    if (chapterText) {
                        segments.push({ label: chapterTitle, text: chapterText });
                    }
                });
            } else {
                // Fallback: just read everything
                var txt = readingEl.innerText.trim();
                if (txt) segments.push({ label: '', text: txt });
            }
        }

        return segments;
    },

    setStatus: function(msg) {
        var el = document.getElementById('audio-status');
        if (el) el.textContent = msg;
    },

    setButtons: function(playing) {
        var playBtn   = document.getElementById('audio-play-btn');
        var stopBtn   = document.getElementById('audio-stop-btn');
        var cancelBtn = document.getElementById('audio-cancel-btn');
        if (playing) {
            playBtn.style.display   = 'none';
            stopBtn.style.display   = 'inline-flex';
            cancelBtn.style.display = 'inline-flex';
        } else {
            playBtn.style.display   = 'inline-flex';
            stopBtn.style.display   = 'none';
            cancelBtn.style.display = 'none';
        }
    },

    speakSegment: function(index) {
        var self = this;
        if (index >= self.queue.length) {
            // All done
            self.active = false;
            self.paused = false;
            self.setButtons(false);
            self.setStatus('');
            return;
        }

        var seg = self.queue[index];
        self.pos = index;

        // Announce section label first, then content
        var fullText = '';
        if (seg.label && seg.text) {
            fullText = seg.label + '. ' + seg.text;
        } else if (seg.label) {
            fullText = seg.label + '.';
        } else {
            fullText = seg.text;
        }

        if (!fullText.trim()) {
            // Empty segment, skip
            self.speakSegment(index + 1);
            return;
        }

        self.setStatus('Reading: ' + (seg.label || '…'));

        var utt = new SpeechSynthesisUtterance(fullText);
        utt.rate = 0.92;
        utt.pitch = 1;
        utt.lang = 'en-GB';

        utt.onend = function() {
            if (!self.paused) {
                self.speakSegment(index + 1);
            }
        };
        utt.onerror = function(e) {
            if (e.error !== 'interrupted' && e.error !== 'canceled') {
                self.setStatus('Speech error: ' + e.error);
            }
        };

        self.synth.speak(utt);
    },

    play: function() {
        var self = this;
        if (!self.synth) { alert('Sorry, your browser does not support text-to-speech.'); return; }

        if (self.paused) {
            // Resume
            self.paused = false;
            self.synth.resume();
            self.setButtons(true);
            self.setStatus('Resuming…');
            return;
        }

        // Fresh start
        self.synth.cancel();
        self.queue  = self.buildQueue();
        self.pos    = 0;
        self.active = true;
        self.paused = false;
        self.setButtons(true);
        self.speakSegment(0);
    },

    pause: function() {
        var self = this;
        if (!self.active) return;
        if (self.paused) {
            // Toggle back to play
            self.play();
        } else {
            self.paused = true;
            self.synth.pause();
            // Update pause button to show Resume
            var stopBtn = document.getElementById('audio-stop-btn');
            if (stopBtn) {
                stopBtn.querySelector('.audio-icon').innerHTML  = '&#9654;';
                stopBtn.querySelector('.audio-label').textContent = 'Resume';
            }
            self.setStatus('Paused');
        }
    },

    resume: function() {
        var self = this;
        self.paused = false;
        self.synth.resume();
        var stopBtn = document.getElementById('audio-stop-btn');
        if (stopBtn) {
            stopBtn.querySelector('.audio-icon').innerHTML  = '&#9646;&#9646;';
            stopBtn.querySelector('.audio-label').textContent = 'Pause';
        }
        self.setStatus('Reading…');
    },

    stop: function() {
        var self = this;
        self.synth.cancel();
        self.active = false;
        self.paused = false;
        self.queue  = [];
        self.pos    = 0;
        self.setButtons(false);
        self.setStatus('');
        // Reset pause button label
        var stopBtn = document.getElementById('audio-stop-btn');
        if (stopBtn) {
            stopBtn.querySelector('.audio-icon').innerHTML   = '&#9646;&#9646;';
            stopBtn.querySelector('.audio-label').textContent = 'Pause';
        }
    }
};

// ============================================================
//  MAIN
// ============================================================
async function main() {
    await loadData();
    displayRandomVerse();
    displaySpurgeon();
    displayDailyReading();
    if (allVersesArray.length > 0) {
        setInterval(displayRandomVerse, 3600 * 1000);
    }
}

main().catch(function(e) { showError('Unexpected error: ' + e.message + '\n' + e.stack); });

// Button wiring — script is at bottom of <body>, DOM is ready
document.getElementById('refresh-btn').addEventListener('click', displayRandomVerse);

document.getElementById('audio-play-btn').addEventListener('click', function() {
    tts.play();
});

document.getElementById('audio-stop-btn').addEventListener('click', function() {
    if (tts.paused) {
        // Currently paused → resume
        tts.resume();
    } else {
        // Currently playing → pause
        tts.pause();
    }
});

document.getElementById('audio-cancel-btn').addEventListener('click', function() {
    tts.stop();
});
