const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = parseInt(process.env.PORT) || 8080;
const HOST = '127.0.0.1'; // Localhost only — no network access
const DATA_DIR = path.join(__dirname, 'data copy');

// ─── Authentication Config ─────────────────────────────────
// Change these credentials to whatever you want!
const AUTH_USERNAME = 'admin';
const AUTH_PASSWORD = 'grades2026';
// ────────────────────────────────────────────────────────────

// ─── Rate Limiting (brute-force protection) ─────────────────
const loginAttempts = new Map(); // IP -> { count, lastAttempt }
const MAX_ATTEMPTS = 10;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minute lockout

function isRateLimited(ip) {
    const record = loginAttempts.get(ip);
    if (!record) return false;
    if (Date.now() - record.lastAttempt > LOCKOUT_MS) {
        loginAttempts.delete(ip);
        return false;
    }
    return record.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(ip) {
    const record = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    record.count++;
    record.lastAttempt = Date.now();
    loginAttempts.set(ip, record);
}

function clearAttempts(ip) {
    loginAttempts.delete(ip);
}
// ─────────────────────────────────────────────────────────────

// ─── Basic Auth Middleware ───────────────────────────────────
app.use((req, res, next) => {
    const clientIp = req.ip || req.connection.remoteAddress;

    if (isRateLimited(clientIp)) {
        res.status(429).set('Retry-After', '300');
        return res.send('Too many failed attempts. Try again in 5 minutes.');
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Grade Lookup - Enter credentials"');
        return res.status(401).send('Authentication required.');
    }

    const base64 = authHeader.split(' ')[1];
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const [user, pass] = decoded.split(':');

    // Timing-safe comparison to prevent timing attacks
    const userMatch = user.length === AUTH_USERNAME.length &&
        crypto.timingSafeEqual(Buffer.from(user), Buffer.from(AUTH_USERNAME));
    const passMatch = pass.length === AUTH_PASSWORD.length &&
        crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(AUTH_PASSWORD));

    if (userMatch && passMatch) {
        clearAttempts(clientIp);
        return next();
    }

    recordFailedAttempt(clientIp);
    res.set('WWW-Authenticate', 'Basic realm="Grade Lookup - Invalid credentials"');
    return res.status(401).send('Invalid credentials.');
});
// ─────────────────────────────────────────────────────────────

// ─── Security Headers ────────────────────────────────────────
app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'no-referrer',
    });
    next();
});
// ─────────────────────────────────────────────────────────────

// Load index on startup
let searchIndex = [];
try {
    const indexPath = path.join(DATA_DIR, 'index.web.json');
    if (fs.existsSync(indexPath)) {
        const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        if (indexData && indexData.s) {
            searchIndex = indexData.s.map(item => {
                const [nameReg, filePath] = item;
                const parts = nameReg.split(' · ');
                const name = parts[0] || '';
                const regNumber = parts[1] || '';
                return { name, regNumber, filePath, searchString: nameReg.toLowerCase() };
            });
            console.log(`✓ Loaded ${searchIndex.length} records into search index.`);
        }
    } else {
        console.warn(`⚠ Warning: index.web.json not found at ${indexPath}`);
    }
} catch (error) {
    console.error("✗ Error loading search index:", error);
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/search', (req, res) => {
    const query = (req.query.q || '').toLowerCase();
    if (!query) {
        return res.json([]);
    }
    
    const results = [];
    for (let i = 0; i < searchIndex.length; i++) {
        if (searchIndex[i].searchString.includes(query)) {
            results.push({
                name: searchIndex[i].name,
                regNumber: searchIndex[i].regNumber,
                filePath: searchIndex[i].filePath
            });
            if (results.length >= 20) break;
        }
    }
    res.json(results);
});

const analyticsEngine = require('./analytics_engine');

app.get('/api/course-analytics', (req, res) => {
    const { batch, q, risk, sort, limit, minEnrolments } = req.query;
    const results = analyticsEngine.searchCourses({
        batch: batch || 'all',
        query: q || '',
        risk: risk || 'all',
        sort: sort || 'failRateDesc',
        limit: parseInt(limit) || 60,
        minEnrolments: parseInt(minEnrolments) || 3
    });
    res.json(results);
});

app.get('/api/course-analytics/:code', (req, res) => {
    const batch = req.query.batch || 'all';
    const details = analyticsEngine.getCourseDetails(req.params.code, batch);
    if (!details) {
        return res.status(404).json({ error: 'Course analytics not found' });
    }
    res.json(details);
});

app.get('/api/student/*', (req, res) => {
    const filePath = req.params[0];
    const fullPath = path.join(DATA_DIR, filePath);
    
    // Security check to prevent path traversal
    if (!fullPath.startsWith(DATA_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    if (fs.existsSync(fullPath)) {
        try {
            const data = fs.readFileSync(fullPath, 'utf-8');
            const studentObj = JSON.parse(data);

            // Enrich student course history with analytics risk level & fail rate
            if (studentObj.tables && Array.isArray(studentObj.tables.grade_history_combined)) {
                studentObj.tables.grade_history_combined.forEach(item => {
                    const code = (item.CourseCode || '').trim().toUpperCase();
                    const courseStats = analyticsEngine.getCourseDetails(code);
                    if (courseStats) {
                        item._analytics = {
                            riskLevel: courseStats.riskLevel,
                            firstTimerFailRate: courseStats.firstTimerFailRate,
                            avgGpa: courseStats.avgGpa,
                            firstTimerCount: courseStats.firstTimerCount
                        };
                    }
                });
            }

            res.json(studentObj);
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse JSON' });
        }
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// ─── Get Local Network IP ────────────────────────────────────
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}
// ─────────────────────────────────────────────────────────────

function startServer(port) {
    const server = app.listen(port, HOST, () => {
        const localIP = getLocalIP();
        console.log('');
        console.log('┌──────────────────────────────────────────────┐');
        console.log('│          🎓 Grade Lookup Server              │');
        console.log('├──────────────────────────────────────────────┤');
        console.log(`│  Local:   http://localhost:${port}              │`);
        console.log(`│  Network: http://${localIP}:${port}          │`);
        console.log('├──────────────────────────────────────────────┤');
        console.log(`│  Username: ${AUTH_USERNAME}                          │`);
        console.log(`│  Password: ${AUTH_PASSWORD}                     │`);
        console.log('├──────────────────────────────────────────────┤');
        console.log('│  🔒 Password protected                      │');
        console.log('│  🛡️  Rate limited (10 attempts / 5 min)      │');
        console.log('└──────────────────────────────────────────────┘');
        console.log('');
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠ Port ${port} is in use. Retrying on port ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('Server error:', err);
        }
    });
}

startServer(PORT);
