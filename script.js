// Store last assessment in localStorage
const STORAGE_KEY = 'repoready_last_assessment';

// API endpoint - update this to your backend URL when deploying
// For local development with a backend server
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api/assess'
    : '/api/assess';  // Update this to your actual backend URL

async function assessRepository(repoUrl) {
    try {
        const response = await fetch(API_URL, {
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
        
        const data = await response.json();
        
        // Save to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...data,
            savedAt: new Date().toISOString()
        }));
        
        return data;
    } catch (error) {
        console.error('Assessment error:', error);
        throw error;
    }
}

function renderResults(assessment) {
    const resultDiv = document.getElementById('result');
    
    const scoreClass = assessment.overallScore >= 70 ? 'high' : 
                       assessment.overallScore >= 50 ? 'medium' : 'low';
    
    const html = `
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
                const percentage = (check.score / check.maxScore) * 100;
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
        
        <div class="score-card" style="background: #0f1119;">
            <div style="font-size: 12px; color: #718096; text-align: center;">
                Report generated: ${new Date(assessment.timestamp).toLocaleString()}
            </div>
        </div>
    `;
    
    resultDiv.innerHTML = html;
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        } catch (error) {
            console.error('Failed to load last assessment:', error);
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
