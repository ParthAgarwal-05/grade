const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data copy');
const indexPath = path.join(DATA_DIR, 'index.web.json');
const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

const monthMap = { "Jan":1,"Feb":2,"Mar":3,"Apr":4,"May":5,"Jun":6,"Jul":7,"Aug":8,"Sep":9,"Oct":10,"Nov":11,"Dec":12 };

function parseExamDate(monthStr) {
    if (!monthStr) return 0;
    const clean = monthStr.replace(/^[A-Za-z]\s+/, '').trim();
    const parts = clean.split('-');
    if (parts.length === 2) {
        const m = monthMap[parts[0]] || 0;
        const y = parseInt(parts[1]) || 0;
        return y * 100 + m;
    }
    return 0;
}

function parseGrade(rawGrade, rawCredits) {
    if (!rawGrade) return 'OTHER';
    let str = rawGrade.trim().toUpperCase();
    const tokens = str.split(/\s+/);
    
    for (let i = tokens.length - 1; i >= 0; i--) {
        const tok = tokens[i];
        if (['S', 'A', 'B', 'C', 'D', 'E', 'F', 'P', 'U', 'W', 'ABS', 'AAA'].includes(tok)) {
            return tok;
        }
        if (tok.startsWith('N') && /^N\d*$/.test(tok)) {
            return 'N';
        }
    }

    if (rawCredits) {
        const credTokens = rawCredits.trim().toUpperCase().split(/\s+/);
        for (const tok of credTokens) {
            if (['S', 'A', 'B', 'C', 'D', 'E', 'F', 'P', 'U'].includes(tok)) {
                return tok;
            }
            if (tok.startsWith('N') && /^N\d*$/.test(tok)) {
                return 'N';
            }
        }
    }

    return 'OTHER';
}

function cleanTitle(rawTitle) {
    if (!rawTitle) return '';
    let title = rawTitle.trim();
    title = title.replace(/^([A-Z])\s+/, '');
    return title;
}

const batchCourseMaps = {
    'all': {},
    '25': {},
    '24': {},
    '23': {},
    '22': {},
    '21': {},
    '20': {},
    'older': {}
};

const studentCounts = {
    'all': 0, '25': 0, '24': 0, '23': 0, '22': 0, '21': 0, '20': 0, 'older': 0
};

console.time('Processing All Batches');

indexData.s.forEach(([nameReg, relPath]) => {
    const fullPath = path.join(DATA_DIR, relPath);
    if (!fs.existsSync(fullPath)) return;

    const parts = relPath.split('/');
    const batchStr = parts[0];
    let targetBatches = ['all'];

    if (['25', '24', '23', '22', '21', '20'].includes(batchStr)) {
        targetBatches.push(batchStr);
    } else {
        targetBatches.push('older');
    }

    try {
        const student = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        const history = student.tables && (student.tables.grade_history_combined || student.tables.grade_history);
        if (!history || !Array.isArray(history) || history.length === 0) return;

        targetBatches.forEach(b => studentCounts[b]++);

        const sortedHistory = [...history].sort((a, b) => {
            const dateA = parseExamDate(a.ExamMonth);
            const dateB = parseExamDate(b.ExamMonth);
            if (dateA !== dateB) return dateA - dateB;
            return (parseInt(a.Slno) || 0) - (parseInt(b.Slno) || 0);
        });

        targetBatches.forEach(bKey => {
            const cMap = batchCourseMaps[bKey];
            const seenCourses = new Set();

            sortedHistory.forEach(c => {
                const code = (c.CourseCode || '').trim().toUpperCase();
                if (!code) return;

                const title = cleanTitle(c.CourseTitle);
                const type = (c.CourseType || '').replace(/^[A-Z]\s+/, '').trim().toUpperCase();
                const grade = parseGrade(c.Grade, c.Credits);

                if (!cMap[code]) {
                    cMap[code] = {
                        code: code,
                        title: title,
                        type: type,
                        firstTimerCount: 0,
                        firstTimerGrades: { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, N: 0, U: 0, P: 0, OTHER: 0 },
                        totalAttempts: 0
                    };
                }

                const cData = cMap[code];
                cData.totalAttempts++;
                if (title && title.length > cData.title.length) cData.title = title;

                const isFirstTime = !seenCourses.has(code);
                if (isFirstTime) {
                    seenCourses.add(code);
                    cData.firstTimerCount++;
                    cData.firstTimerGrades[grade] = (cData.firstTimerGrades[grade] || 0) + 1;
                }
            });
        });
    } catch (e) {}
});

console.timeEnd('Processing All Batches');
console.log('Student counts per batch:', studentCounts);

const finalOutput = {};
const gradePointsMap = { S: 10, A: 9, B: 8, C: 7, D: 6, E: 5, F: 0, N: 0, U: 0 };

Object.keys(batchCourseMaps).forEach(bKey => {
    const cMap = batchCourseMaps[bKey];
    
    const results = Object.values(cMap).map(c => {
        const ftTotal = c.firstTimerCount;
        const ftFailCount = (c.firstTimerGrades.F || 0) + (c.firstTimerGrades.N || 0) + (c.firstTimerGrades.U || 0);
        const ftFailRate = ftTotal > 0 ? (ftFailCount / ftTotal) * 100 : 0;

        let totalGradePoints = 0;
        let countedForGpa = 0;
        Object.keys(c.firstTimerGrades).forEach(g => {
            if (gradePointsMap.hasOwnProperty(g)) {
                const count = c.firstTimerGrades[g];
                totalGradePoints += count * gradePointsMap[g];
                countedForGpa += count;
            }
        });
        const avgGpa = countedForGpa > 0 ? (totalGradePoints / countedForGpa) : 0;

        let riskLevel = 'Low Risk';
        if (ftFailRate >= 20) riskLevel = 'Extreme Risk';
        else if (ftFailRate >= 10) riskLevel = 'High Risk';
        else if (ftFailRate >= 5) riskLevel = 'Moderate Risk';

        return {
            code: c.code,
            title: c.title,
            type: c.type,
            firstTimerCount: ftTotal,
            firstTimerGrades: c.firstTimerGrades,
            firstTimerFailCount: ftFailCount,
            firstTimerFailRate: parseFloat(ftFailRate.toFixed(2)),
            avgGpa: parseFloat(avgGpa.toFixed(2)),
            riskLevel: riskLevel
        };
    });

    results.sort((a, b) => b.firstTimerFailRate - a.firstTimerFailRate || b.firstTimerCount - a.firstTimerCount);

    let totalEnrolments = 0;
    let totalFailCount = 0;
    let extreme = 0, high = 0, mod = 0, low = 0;

    results.forEach(c => {
        totalEnrolments += c.firstTimerCount;
        totalFailCount += c.firstTimerFailCount;
        if (c.riskLevel === 'Extreme Risk') extreme++;
        else if (c.riskLevel === 'High Risk') high++;
        else if (c.riskLevel === 'Moderate Risk') mod++;
        else low++;
    });

    finalOutput[bKey] = {
        summary: {
            batch: bKey,
            totalStudents: studentCounts[bKey],
            totalCourses: results.length,
            totalFirstTimerEnrolments: totalEnrolments,
            overallFailRate: totalEnrolments > 0 ? parseFloat(((totalFailCount / totalEnrolments) * 100).toFixed(2)) : 0,
            extremeRiskCount: extreme,
            highRiskCount: high,
            moderateRiskCount: mod,
            lowRiskCount: low
        },
        courses: results
    };
});

fs.writeFileSync(path.join(DATA_DIR, 'batch_course_analytics.json'), JSON.stringify(finalOutput, null, 2));
console.log(`Saved multi-batch analytics to ${path.join(DATA_DIR, 'batch_course_analytics.json')}`);
