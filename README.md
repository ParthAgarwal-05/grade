# 🎓 Grade Lookup

A premium, dark-themed web application for searching and viewing student grade records. Built with Node.js, Express, and vanilla JavaScript.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![License](https://img.shields.io/badge/License-Private-red)

---

## ✨ Features

- **📊 Batch-Wise Subject Analytics & Fail Rates** — Interactive tabs for **All Batches**, **25**, **24**, **23**, **22**, **21**, **20**, and **Older** batches. Analyzes 1,600,000+ course attempts across 37,500+ students with 100% clean grade and title parsing.
- **🔍 Instant Search** — Search by student name or registration number with real-time results (debounced 300ms)
- **⌨️ Keyboard Navigation** — Arrow keys + Enter to quickly select results
- **📊 CGPA Visualization** — Animated SVG circular dial showing CGPA out of 10
- **📈 Grade Distribution** — Color-coded horizontal bar chart (S/A/B/C/D/E/F/N)
- **📋 Course History** — Sortable table grouped by semester with risk badges & clickable course analytics
- **💳 Credits Tracker** — Credits earned vs registered progress bar
- **🔒 Password Protected** — HTTP Basic Auth with brute-force rate limiting
- **🛡️ Security Headers** — X-Frame-Options, X-Content-Type-Options, path traversal protection
- **🎨 Premium Dark UI** — Glassmorphism, gradient mesh background, Inter font, smooth animations
- **📱 Responsive** — Works on desktop, tablet, and mobile

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher

### Installation

```bash
# Navigate to the project directory
cd grade

# Install dependencies
npm install
```

### Running the Server

```bash
npm start
```

Open **http://localhost:3000** in your browser.

### Default Credentials

| Field    | Value        |
|----------|--------------|
| Username | `admin`      |
| Password | `grades2026` |

---

## ⚙️ Configuration

Edit the top of [`server.js`](server.js) to customize:

```js
// Server
const PORT = 3000;
const HOST = '127.0.0.1';  // Change to '0.0.0.0' for LAN access

// Authentication
const AUTH_USERNAME = 'admin';
const AUTH_PASSWORD = 'grades2026';
```

### Enabling Network Access

To access from other devices on the same Wi-Fi:

1. Change `HOST` to `'0.0.0.0'` in `server.js`
2. Restart the server
3. Open `http://<your-ip>:3000` on the other device
4. Your local IP is printed in the server startup banner

---

## 📁 Project Structure

```
grade/
├── server.js              # Express server with auth, search API, and file serving
├── package.json           # Project metadata and dependencies
├── public/
│   └── index.html         # Single-page application (HTML + CSS + JS)
└── data copy/             # Student grade data
    ├── index.web.json     # Search index (name · reg number → file path)
    ├── 10/                # Batch 10
    │   ├── BCE/           # Branch
    │   │   ├── 10BCE1001.json
    │   │   └── ...
    │   └── ...
    ├── 24/                # Batch 24
    └── ...
```

---

## 🔌 API Endpoints

| Method | Endpoint              | Description                                      |
|--------|-----------------------|--------------------------------------------------|
| GET    | `/api/search?q=query` | Search students by name or reg number (top 20)   |
| GET    | `/api/student/:path`  | Get full grade data for a student by file path   |

### Example

```bash
# Search for a student
curl -u admin:grades2026 "http://localhost:3000/api/search?q=akilesh"

# Get student details
curl -u admin:grades2026 "http://localhost:3000/api/student/10/BCE/10BCE1007.json"
```

---

## 🔒 Security

| Feature                    | Details                                              |
|----------------------------|------------------------------------------------------|
| HTTP Basic Auth            | Username/password prompt on every request             |
| Rate Limiting              | 10 failed login attempts → 5 min lockout per IP       |
| Timing-Safe Comparison     | `crypto.timingSafeEqual` prevents timing attacks       |
| Path Traversal Protection  | Validates file paths stay within the data directory    |
| Security Headers           | `X-Frame-Options`, `X-Content-Type-Options`, etc.     |
| Localhost-Only (default)   | Binds to `127.0.0.1` — not accessible from network    |

---

## 🎨 Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML, CSS, JavaScript (no frameworks)
- **Font:** [Inter](https://fonts.google.com/specimen/Inter) (Google Fonts)
- **Design:** Dark theme, glassmorphism, gradient mesh, SVG animations

---

## 📝 Data Format

Each student JSON file follows this structure:

```json
{
  "student_information": {
    "register_number": "10BCE1007",
    "name": "AKILESH R"
  },
  "tables": {
    "grade_history_combined": [
      {
        "Slno": "1",
        "CourseCode": "CHY101",
        "CourseTitle": "Engineering Chemistry",
        "CourseType": "TheoryLab",
        "Credits": "4.0",
        "Grade": "A",
        "ExamMonth": "May-2011",
        "ResultDeclaredOn": "25-Jul-2011",
        "CourseOption": "NIL"
      }
    ],
    "cgpa_details": [
      {
        "CreditsRegistered": "175.0",
        "CreditsEarned": "175.0",
        "Cgpa": "8.42",
        "SGrades": "5",
        "AGrades": "22",
        "BGrades": "19",
        "CGrades": "6",
        "DGrades": "2",
        "EGrades": "0",
        "FGrades": "0",
        "NGrades": "0"
      }
    ]
  }
}
```

---

## 📄 License

Private — for personal use only.
