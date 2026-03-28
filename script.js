// Store last assessment in localStorage
const STORAGE_KEY = 'repoready_last_assessment';
let currentAssessment = null;

// API endpoint - update this to your backend URL when deploying
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api/assess'
    : '/api/assess';

async function assessRepository(repoUrl, format = 'json') {
    try {
        const response = await fetch(`${API_URL}?format=${format}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ repoUrl })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Assessment failed');
        }
        
        if (format === 'html') {
            return await response.text();
        } else {
            const data = await response.json();
            // Save to localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                ...data,
                savedAt: new Date().toISOString()
            }));
            return data;
        }
    } catch (error) {
        console.error('Assessment error:', error);
        throw error;
    }
}

function downloadFile(content, filename, type) {
    // Create blob with the content
    const blob = new Blob([content], { type: type });
    // Create a temporary URL for the blob
    const url = URL.createObjectURL(blob);
    // Create a temporary anchor element
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    // Append to body, click, and remove
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Clean up the URL object
    URL.revokeObjectURL(url);
}

function downloadHTMLReport(assessment) {
    const htmlContent = generateHTMLReport(assessment);
    const filename = `repoready-report-${assessment.repository.replace('/', '-')}.html`;
    downloadFile(htmlContent, filename, 'text/html');
    showNotification('HTML report downloaded successfully!', 'success');
}

function downloadJSONReport(assessment) {
    const jsonContent = JSON.stringify(assessment, null, 2);
    const filename = `repoready-report-${assessment.repository.replace('/', '-')}.json`;
    downloadFile(jsonContent, filename, 'application/json');
    showNotification('JSON report downloaded successfully!', 'success');
}

function renderResults(assessment) {
    currentAssessment = assessment;
    
    const resultDiv = document.getElementById('result');
    
    const html = `
        <div class="report-actions">
            <button id="downloadHtmlBtn" class="report-btn download-btn">
                📄 Download HTML Report
            </button>
            <button id="downloadJsonBtn" class="report-btn download-btn">
                💾 Download JSON Report
            </button>
            <button id="copyJsonBtn" class="report-btn copy-btn">
                📋 Copy JSON to Clipboard
            </button>
        </div>
        
        <div class="score-card">
            <div class="score-header">
                <div class="score-label">OVERALL SCORE</div>
                <div class="score-value">
                    ${assessment.overallScore}<span class="score-max">/100</span>
                </div>
                <div class="rating">${assessment.rating}</div>
            </div>
            <div class="summary">
                ${assessment.summary}
            </div>
        </div>
        
        <div class="assessment-grid">
            ${Object.entries(assessment.checks).map(([key, check]) => {
                const impactClass = check.impact.toLowerCase().replace(' ', '-');
                return `
                    <div class="assessment-card ${impactClass}">
                        <div class="card-header">
                            <div class="card-title">${check.name}</div>
                            <div class="card-score">
                                ${check.score}<span class="max">/${check.maxScore}</span>
                            </div>
                        </div>
                        <div class="card-impact ${impactClass}">${check.impact}</div>
                        <div class="card-reason">${check.reason}</div>
                    </div>
                `;
            }).join('')}
        </div>
        
        <div class="fixes-section">
            <h2 class="section-title">🔧 PRIORITY FIX CHECKLIST</h2>
            <div class="fixes-list">
                ${assessment.fixes.map(fix => `
                    <div class="fix-item ${fix.impact.toLowerCase().replace(' ', '-')}">
                        <div class="fix-header">
                            <div class="fix-icon">${fix.icon || '❌'}</div>
                            <div class="fix-title">${fix.title}</div>
                            <div class="fix-impact ${fix.impact.toLowerCase().replace(' ', '-')}">
                                ${fix.impact}
                            </div>
                        </div>
                        <div class="fix-description">${fix.description}</div>
                        <div class="fix-suggestion">💡 ${fix.suggestion}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="info-footer">
            <div class="timestamp">
                Report generated: ${new Date(assessment.timestamp).toLocaleString()}
            </div>
            <div class="repo-info">
                Repository: ${assessment.repository}
            </div>
        </div>
    `;
    
    resultDiv.innerHTML = html;
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Add event listeners for download buttons
    document.getElementById('downloadHtmlBtn')?.addEventListener('click', () => downloadHTMLReport(assessment));
    document.getElementById('downloadJsonBtn')?.addEventListener('click', () => downloadJSONReport(assessment));
    document.getElementById('copyJsonBtn')?.addEventListener('click', () => copyJSONToClipboard(assessment));
}

function copyJSONToClipboard(assessment) {
    const jsonStr = JSON.stringify(assessment, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
        showNotification('✅ JSON copied to clipboard!', 'success');
    }).catch(() => {
        showNotification('❌ Failed to copy to clipboard', 'error');
    });
}

function showNotification(message, type) {
    // Remove existing notification if any
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Add styles for notification
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            .notification {
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 12px 24px;
                border-radius: 12px;
                font-size: 14px;
                font-weight: 500;
                z-index: 10000;
                animation: slideIn 0.3s ease-out;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            
            .notification.success {
                background: #48bb78;
                color: white;
            }
            
            .notification.error {
                background: #f56565;
                color: white;
            }
            
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function generateHTMLReport(assessment) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RepoReady Report - ${assessment.repository}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            background: #0a0e1a;
            color: #e2e8f0;
            padding: 40px 20px;
        }
        
        .report-container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            margin-bottom: 48px;
        }
        
        .logo {
            font-size: 48px;
            font-weight: 800;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 12px;
        }
        
        .badge {
            display: inline-flex;
            gap: 16px;
            background: rgba(102, 126, 234, 0.1);
            padding: 8px 24px;
            border-radius: 40px;
            font-size: 14px;
            margin-bottom: 24px;
        }
        
        .repo-url {
            color: #667eea;
            text-decoration: none;
            font-size: 14px;
            word-break: break-all;
        }
        
        .score-card {
            background: linear-gradient(135deg, #1a1f2e 0%, #0f1119 100%);
            border-radius: 24px;
            padding: 40px;
            margin-bottom: 32px;
            border: 1px solid rgba(102, 126, 234, 0.2);
        }
        
        .score-header {
            text-align: center;
            margin-bottom: 32px;
        }
        
        .score-label {
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: #a0aec0;
            margin-bottom: 16px;
        }
        
        .score-value {
            font-size: 72px;
            font-weight: 800;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            line-height: 1;
        }
        
        .score-max {
            font-size: 24px;
            color: #4a5568;
        }
        
        .rating {
            font-size: 18px;
            color: #48bb78;
            margin-top: 12px;
            font-weight: 600;
        }
        
        .summary {
            color: #cbd5e0;
            line-height: 1.6;
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid rgba(102, 126, 234, 0.2);
        }
        
        .assessment-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 24px;
            margin-bottom: 48px;
        }
        
        .assessment-card {
            background: #1a1f2e;
            border-radius: 20px;
            padding: 24px;
            border-left: 4px solid;
        }
        
        .assessment-card.high-impact { border-left-color: #f56565; }
        .assessment-card.medium-impact { border-left-color: #ed8936; }
        .assessment-card.low-impact { border-left-color: #48bb78; }
        
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-bottom: 16px;
            flex-wrap: wrap;
            gap: 8px;
        }
        
        .card-title {
            font-size: 18px;
            font-weight: 600;
        }
        
        .card-score {
            font-size: 28px;
            font-weight: 700;
            color: #667eea;
        }
        
        .card-score .max {
            font-size: 14px;
            color: #718096;
        }
        
        .card-impact {
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 16px;
        }
        
        .card-impact.high { color: #f56565; }
        .card-impact.medium { color: #ed8936; }
        .card-impact.low { color: #48bb78; }
        
        .card-reason {
            font-size: 14px;
            color: #cbd5e0;
            line-height: 1.5;
        }
        
        .fixes-section {
            background: #1a1f2e;
            border-radius: 24px;
            padding: 32px;
            margin-bottom: 32px;
        }
        
        .section-title {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 24px;
        }
        
        .fixes-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        
        .fix-item {
            background: #0f1119;
            border-radius: 16px;
            padding: 20px;
            border-left: 4px solid;
        }
        
        .fix-item.high { border-left-color: #f56565; }
        .fix-item.medium { border-left-color: #ed8936; }
        .fix-item.low { border-left-color: #48bb78; }
        
        .fix-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
            flex-wrap: wrap;
        }
        
        .fix-icon {
            font-size: 24px;
        }
        
        .fix-title {
            font-size: 16px;
            font-weight: 600;
            flex: 1;
        }
        
        .fix-impact {
            font-size: 12px;
            font-weight: 600;
            padding: 4px 8px;
            border-radius: 6px;
            background: rgba(0, 0, 0, 0.3);
        }
        
        .fix-impact.high { color: #f56565; }
        .fix-impact.medium { color: #ed8936; }
        .fix-impact.low { color: #48bb78; }
        
        .fix-description {
            font-size: 13px;
            color: #a0aec0;
            margin-bottom: 12px;
            padding-left: 36px;
        }
        
        .fix-suggestion {
            font-size: 13px;
            color: #667eea;
            padding-left: 36px;
        }
        
        .info-footer {
            background: #0f1119;
            border-radius: 16px;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #718096;
        }
        
        .timestamp {
            margin-bottom: 8px;
        }
        
        @media (max-width: 768px) {
            .assessment-grid {
                grid-template-columns: 1fr;
            }
            
            .score-value {
                font-size: 48px;
            }
            
            .fix-header {
                flex-direction: column;
                align-items: flex-start;
            }
            
            .fix-impact {
                align-self: flex-start;
            }
            
            .fix-description, .fix-suggestion {
                padding-left: 0;
            }
        }
        
        @media print {
            body {
                background: white;
                color: black;
                padding: 20px;
            }
            
            .score-card, .assessment-card, .fixes-section {
                break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="report-container">
        <div class="header">
            <h1 class="logo">RepoReady</h1>
            <div class="badge">
                <span>RESEARCH SOFTWARE READINESS REPORT</span>
            </div>
            <a href="${assessment.url}" class="repo-url" target="_blank">${assessment.url}</a>
        </div>
        
        <div class="score-card">
            <div class="score-header">
                <div class="score-label">OVERALL SCORE</div>
                <div class="score-value">
                    ${assessment.overallScore}<span class="score-max">/100</span>
                </div>
                <div class="rating">${assessment.rating}</div>
            </div>
            <div class="summary">
                ${assessment.summary}
            </div>
        </div>
        
        <div class="assessment-grid">
            ${Object.entries(assessment.checks).map(([key, check]) => {
                const impactClass = check.impact.toLowerCase().replace(' ', '-');
                return `
                    <div class="assessment-card ${impactClass}">
                        <div class="card-header">
                            <div class="card-title">${check.name}</div>
                            <div class="card-score">
                                ${check.score}<span class="max">/${check.maxScore}</span>
                            </div>
                        </div>
                        <div class="card-impact ${impactClass}">${check.impact}</div>
                        <div class="card-reason">${check.reason}</div>
                    </div>
                `;
            }).join('')}
        </div>
        
        <div class="fixes-section">
            <h2 class="section-title">🔧 PRIORITY FIX CHECKLIST</h2>
            <div class="fixes-list">
                ${assessment.fixes.map(fix => `
                    <div class="fix-item ${fix.impact.toLowerCase().replace(' ', '-')}">
                        <div class="fix-header">
                            <div class="fix-icon">${fix.icon || '❌'}</div>
                            <div class="fix-title">${fix.title}</div>
                            <div class="fix-impact ${fix.impact.toLowerCase().replace(' ', '-')}">
                                ${fix.impact}
                            </div>
                        </div>
                        <div class="fix-description">${fix.description}</div>
                        <div class="fix-suggestion">💡 ${fix.suggestion}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="info-footer">
            <div class="timestamp">Report generated: ${new Date(assessment.timestamp).toLocaleString()}</div>
            <div class="repo-info">Repository: ${assessment.repository}</div>
            <div style="margin-top: 12px;">RepoReady - Research Software Readiness Assessment Tool</div>
        </div>
    </div>
</body>
</html>`;
}

function showError(message) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <div class="error-card">
            <h3>❌ Assessment Failed</h3>
            <p>${message}</p>
            <p class="error-hint">Make sure the repository is public and the URL is correct.</p>
        </div>
    `;
}

function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('result').innerHTML = '';
    document.getElementById('assessBtn').disabled = true;
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('assessBtn').disabled = false;
}

async function handleAssessment(repoUrl) {
    if (!repoUrl) {
        alert('Please enter a repository URL');
        return;
    }
    
    // Validate GitHub URL
    if (!repoUrl.includes('github.com')) {
        alert('Please enter a valid GitHub repository URL');
        return;
    }
    
    showLoading();
    
    try {
        const assessment = await assessRepository(repoUrl);
        renderResults(assessment);
    } catch (error) {
        showError(error.message || 'Failed to assess repository. Please try again.');
    } finally {
        hideLoading();
    }
}

// Load last assessment from localStorage
function loadLastAssessment() {
    const lastAssessment = localStorage.getItem(STORAGE_KEY);
    if (lastAssessment) {
        try {
            const assessment = JSON.parse(lastAssessment);
            renderResults(assessment);
            document.getElementById('repoUrl').value = assessment.url;
            showNotification('Last assessment loaded!', 'success');
        } catch (error) {
            console.error('Failed to load last assessment:', error);
            alert('No previous assessment found');
        }
    } else {
        alert('No previous assessment found');
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const assessBtn = document.getElementById('assessBtn');
    const repoInput = document.getElementById('repoUrl');
    const demoBtns = document.querySelectorAll('.demo-btn');
    const loadLastBtn = document.getElementById('loadLastBtn');
    
    assessBtn.addEventListener('click', () => {
        handleAssessment(repoInput.value.trim());
    });
    
    repoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleAssessment(repoInput.value.trim());
        }
    });
    
    demoBtns.forEach(btn => {
        if (btn.id !== 'loadLastBtn') {
            btn.addEventListener('click', () => {
                const repoUrl = btn.dataset.repo;
                repoInput.value = repoUrl;
                handleAssessment(repoUrl);
            });
        }
    });
    
    if (loadLastBtn) {
        loadLastBtn.addEventListener('click', loadLastAssessment);
    }
});
