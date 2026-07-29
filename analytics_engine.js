const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data copy');
const BATCH_ANALYTICS_FILE = path.join(DATA_DIR, 'batch_course_analytics.json');

let batchDataMap = {}; // batchName -> { summary, coursesMap, coursesList }

function initAnalytics() {
    try {
        if (!fs.existsSync(BATCH_ANALYTICS_FILE)) {
            console.log('⚡ Generating batch_course_analytics.json...');
            require('./generate_batch_analytics');
        }

        const raw = fs.readFileSync(BATCH_ANALYTICS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);

        batchDataMap = {};

        Object.keys(parsed).forEach(bKey => {
            const batchObj = parsed[bKey];
            const coursesList = batchObj.courses || [];
            const coursesMap = new Map();
            coursesList.forEach(c => coursesMap.set(c.code.toUpperCase(), c));

            batchDataMap[bKey] = {
                summary: batchObj.summary,
                coursesList: coursesList,
                coursesMap: coursesMap
            };
        });

        console.log(`✓ Loaded multi-batch analytics for batches: ${Object.keys(batchDataMap).join(', ')}`);
    } catch (err) {
        console.error('✗ Error initializing batch analytics:', err);
    }
}

function searchCourses({ batch = 'all', query = '', risk = 'all', sort = 'failRateDesc', limit = 60, minEnrolments = 3 }) {
    const validBatch = batchDataMap[batch] ? batch : 'all';
    const batchStore = batchDataMap[validBatch] || { summary: {}, coursesList: [] };

    let filtered = batchStore.coursesList.filter(c => c.firstTimerCount >= minEnrolments);

    if (query) {
        const q = query.trim().toLowerCase();
        filtered = filtered.filter(c => 
            c.code.toLowerCase().includes(q) || 
            c.title.toLowerCase().includes(q)
        );
    }

    if (risk && risk !== 'all') {
        filtered = filtered.filter(c => c.riskLevel.toLowerCase() === risk.toLowerCase());
    }

    switch (sort) {
        case 'failRateDesc':
            filtered.sort((a, b) => b.firstTimerFailRate - a.firstTimerFailRate || b.firstTimerCount - a.firstTimerCount);
            break;
        case 'failRateAsc':
            filtered.sort((a, b) => a.firstTimerFailRate - b.firstTimerFailRate || b.firstTimerCount - a.firstTimerCount);
            break;
        case 'gpaAsc':
            filtered.sort((a, b) => a.avgGpa - b.avgGpa || b.firstTimerFailRate - a.firstTimerFailRate);
            break;
        case 'gpaDesc':
            filtered.sort((a, b) => b.avgGpa - a.avgGpa || a.firstTimerFailRate - b.firstTimerFailRate);
            break;
        case 'enrolmentsDesc':
            filtered.sort((a, b) => b.firstTimerCount - a.firstTimerCount);
            break;
        case 'codeAsc':
            filtered.sort((a, b) => a.code.localeCompare(b.code));
            break;
    }

    const totalMatching = filtered.length;
    const paginated = filtered.slice(0, limit);

    return {
        summary: batchStore.summary,
        totalMatching,
        courses: paginated
    };
}

function getCourseDetails(code, batch = 'all') {
    if (!code) return null;
    const validBatch = batchDataMap[batch] ? batch : 'all';
    const batchStore = batchDataMap[validBatch];
    if (!batchStore) return null;

    const course = batchStore.coursesMap.get(code.trim().toUpperCase());
    if (!course) return null;

    return {
        ...course,
        batchSummary: batchStore.summary
    };
}

// Auto init on require
initAnalytics();

module.exports = {
    initAnalytics,
    searchCourses,
    getCourseDetails,
    getAvailableBatches: () => Object.keys(batchDataMap)
};
