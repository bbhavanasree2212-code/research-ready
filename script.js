// Store last assessment
const STORAGE_KEY = 'repoready_last_assessment';

// Function to fetch from GitHub API with error handling
async function fetchGitHubAPI(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) return null;
            if (response.status === 403) {
                const remaining = response.headers.get('X-RateLimit-Remaining');
                if (remaining === '0') {
                    throw new Error('GitHub API rate limit exceeded. Please try again later.');
                }
            }
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

// Function to fetch raw content from GitHub
async function fetchRawContent(owner, repo, path) {
    const branches = ['main', 'master'];
    for (const branch of branches) {
        try {
            const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
            const response = await fetch(url);
            if (response.ok) {
                return await response.text();
            }
        } catch (e) {}
    }
    return null;
}

// Main assessment function
async function assessRepository(owner, repo) {
    try {
        // Check if repository exists
        const repoData = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}`);
        if (!repoData) {
            throw new Error(`Repository "${owner}/${repo}" not found or is private`);
        }
        
        // Fetch README
        let readmeContent = '';
        const readmeData = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/readme`);
        if (readmeData && readmeData.content) {
            readmeContent = atob(readmeData.content);
        }
        
        // Fetch LICENSE
        let hasLicense = false;
        let licenseContent = '';
        const licenseData = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/contents/LICENSE`);
        if (licenseData && licenseData.content) {
            licenseContent = atob(licenseData.content);
            hasLicense = true;
        } else {
            const licenseMdData = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/contents/LICENSE.md`);
            if (licenseMdData && licenseMdData.content) {
                licenseContent = atob(licenseMdData.content);
                hasLicense = true;
            }
        }
        
        // Fetch contents to check for tests
        let hasTests = false;
        let testFiles = [];
        const contents = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/contents`);
        if (contents && Array.isArray(contents)) {
            for (const item of contents) {
                if (item.type === 'dir' && /test|tests?/i.test(item.name)) {
                    hasTests = true;
                    testFiles.push(item.name);
                }
                if (item.type === 'file' && /test|spec/i.test(item.name)) {
                    hasTests = true;
                    testFiles.push(item.name);
                }
            }
        }
        
        // Check for CI files
        let hasCI = false;
        let ciType = null;
        const ciPaths = [
            '.github/workflows/ci.yml',
            '.github/workflows/test.yml',
            '.github/workflows/main.yml',
            '.gitlab-ci.yml',
            '.travis.yml',
            '.circleci/config.yml'
        ];
        
        for (const ciPath of ciPaths) {
            const ciData = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/contents/${ciPath}`);
            if (ciData) {
                hasCI = true;
                if (ciPath.includes('github')) ciType = 'GitHub Actions';
                else if (ciPath.includes('gitlab')) ciType = 'GitLab CI';
                else if (ciPath.includes('travis')) ciType = 'Travis CI';
                else if (ciPath.includes('circleci')) ciType = 'CircleCI';
                break;
            }
        }
        
        // Check for CITATION.cff
        let hasCitation = false;
        const citationData = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/contents/CITATION.cff`);
        if (citationData) hasCitation = true;
        
        // Fetch tags
        let tags = [];
        const tagsData = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/tags`);
        if (tagsData && Array.isArray(tagsData)) tags = tagsData;
        
        // Check for code quality files
        let hasCodeQuality = false;
        const qualityPaths = ['pyproject.toml', '.prettierrc', '.eslintrc', 'setup.py', 'package.json'];
        for (const qPath of qualityPaths) {
            const qData = await fetchGitHubAPI(`https://api.github.com/repos/${owner}/${repo}/contents/${qPath}`);
            if (qData) {
                hasCodeQuality = true;
                break;
            }
        }
        
        // Evaluate each category
        const readmeEval = evaluateReadme(readmeContent);
        const licenseEval = evaluateLicense(hasLicense, licenseContent);
        const testsEval = evaluateTests(hasTests, testFiles);
        const ciEval = evaluateCI(hasCI, ciType);
        const versioningEval = evaluateVersioning(tags);
        const citationEval = evaluateCitation(hasCitation, readmeContent);
        const codeQualityEval = evaluateCodeQuality(hasCodeQuality);
        
        // Total score
        const totalScore = readmeEval.score + licenseEval.score + testsEval.score + 
                          ciEval.score + versioningEval.score + citationEval.score + codeQualityEval.score;
        
        // Generate fixes with ALL priorities
        const fixes = [];
        
        // HIGH PRIORITY
        if (licenseEval.score < 20) {
            fixes.push({
                task: "❌ Add a LICENSE file to the root directory (e.g., MIT, Apache-2.0)",
                impact: "CRITICAL: LEGAL REQUIREMENT FOR DISTRIBUTION AND REUSE",
                priority: "HIGH"
            });
        }
        
        if (testsEval.score === 0) {
            fixes.push({
                task: "❌ Implement a basic test suite and tests directory",
                impact: "HIGH: ENSURES SCIENTIFIC INTEGRITY AND PREVENTS REGRESSIONS",
                priority: "HIGH"
            });
        } else if (testsEval.score > 0 && testsEval.score < 20) {
            fixes.push({
                task: "⚠️ Expand test coverage to include more comprehensive test cases",
                impact: "HIGH: CURRENT TESTS ARE LIMITED",
                priority: "HIGH"
            });
        }
        
        // MEDIUM PRIORITY
        if (ciEval.score === 0) {
            fixes.push({
                task: "⚠️ Configure GitHub Actions (.github/workflows) to automate tests",
                impact: "MEDIUM: INCREASES STABILITY AND TRUST IN THE REPOSITORY",
                priority: "MEDIUM"
            });
        }
        
        if (citationEval.score === 0) {
            fixes.push({
                task: "⚠️ Create a CITATION.cff file to allow researchers to easily cite this repository",
                impact: "MEDIUM: IMPROVES ACADEMIC IMPACT TRACKING",
                priority: "MEDIUM"
            });
        } else if (citationEval.score > 0 && citationEval.score < 10) {
            fixes.push({
                task: "📝 Improve citation information by adding a CITATION.cff file",
                impact: "MEDIUM: CURRENT CITATION INFO IS INCOMPLETE",
                priority: "MEDIUM"
            });
        }
        
        if (readmeEval.score === 0) {
            fixes.push({
                task: "📖 Create a README file with installation, usage, and project overview",
                impact: "MEDIUM: ESSENTIAL FOR PROJECT DOCUMENTATION",
                priority: "MEDIUM"
            });
        } else if (readmeEval.score > 0 && readmeEval.score < 20) {
            fixes.push({
                task: "📖 Enhance README documentation with installation and usage examples",
                impact: "MEDIUM: IMPROVES ONSET AND USABILITY",
                priority: "MEDIUM"
            });
        }
        
        if (versioningEval.score === 0) {
            fixes.push({
                task: "🏷️ Create version tags for releases (e.g., v1.0.0, v1.0.1)",
                impact: "MEDIUM: IMPORTANT FOR REPRODUCIBILITY",
                priority: "MEDIUM"
            });
        } else if (versioningEval.score > 0 && versioningEval.score < 8) {
            fixes.push({
                task: "🏷️ Adopt semantic versioning format (v1.0.0, v1.0.1, etc.)",
                impact: "LOW: CURRENT TAGS NOT FOLLOWING SEMVER",
                priority: "LOW"
            });
        }
        
        // LOW PRIORITY
        if (!hasCodeQuality) {
            fixes.push({
                task: "🎨 Add code formatting configuration (.prettierrc, .eslintrc, or pyproject.toml)",
                impact: "LOW: IMPROVES CODE READABILITY AND MAINTAINABILITY",
                priority: "LOW"
            });
        }
        
        if (readmeEval.score >= 20 && readmeEval.score < 25) {
            fixes.push({
                task: "📝 Add more details to README (structure overview, documentation links)",
                impact: "LOW: MISSING SOME DOCUMENTATION SECTIONS",
                priority: "LOW"
            });
        }
        
        const checks = [
            {
                label: "README Quality",
                passed: readmeEval.score >= 20,
                score: readmeEval.score,
                maxScore: 25,
                rationale: readmeEval.reason,
                impact: "medium"
            },
            {
                label: "License",
                passed: licenseEval.score >= 15,
                score: licenseEval.score,
                maxScore: 20,
                rationale: licenseEval.reason,
                impact: "high"
            },
            {
                label: "Tests",
                passed: testsEval.score >= 15,
                score: testsEval.score,
                maxScore: 20,
                rationale: testsEval.reason,
                impact: "high"
            },
            {
                label: "CI Config",
                passed: ciEval.score >= 10,
                score: ciEval.score,
                maxScore: 15,
                rationale: ciEval.reason,
                impact: "medium"
            },
            {
                label: "Versioning",
                passed: versioningEval.score >= 8,
                score: versioningEval.score,
                maxScore: 10,
                rationale: versioningEval.reason,
                impact: "medium"
            },
            {
                label: "Citation",
                passed: citationEval.score >= 8,
                score: citationEval.score,
                maxScore: 10,
                rationale: citationEval.reason,
                impact: "medium"
            },
            {
                label: "Code Quality & Formatting",
                passed: codeQualityEval.score >= 10,
                score: codeQualityEval.score,
                maxScore: 15,
                rationale: codeQualityEval.reason,
                impact: "low"
            }
        ];
        
        const summary = generateSummary(readmeEval, licenseEval, testsEval, ciEval, versioningEval, citationEval, totalScore);
        
        return {
            repository: `${owner}/${repo}`,
            url: `https://github.com/${owner}/${repo}`,
            overallScore: totalScore,
            rating: getRating(totalScore),
            summary: summary,
            checks: checks,
            fixes: fixes,
            timestamp: new Date().toLocaleString()
        };
        
    } catch (error) {
        console.error('Assessment error:', error);
        throw error;
    }
}

function evaluateReadme(content) {
    if (!content) {
        return { score: 0, reason: 'No README file detected in the root directory.' };
    }
    let score = 0;
    if (/install|setup|getting started|installation|pip install|npm install/i.test(content)) score += 10;
    if (/run|usage|example|quick start|how to use|command/i.test(content)) score += 10;
    if (/structure|organization|overview/i.test(content)) score += 5;
    
    let reason = '';
    if (score >= 25) {
        reason = 'The README is professionally structured with clear navigation and comprehensive documentation.';
    } else if (score >= 15) {
        reason = 'README contains essential information but could benefit from more detailed setup guides.';
    } else if (score > 0) {
        reason = 'README exists but lacks critical setup or usage instructions.';
    } else {
        reason = 'No README file detected in the root directory.';
    }
    return { score: Math.min(score, 25), reason };
}

function evaluateLicense(hasLicense, content) {
    if (!hasLicense) {
        return { score: 0, reason: 'No LICENSE file was detected in the root directory. A license is mandatory for legal reuse in research and industry.' };
    }
    const isOpenSource = /MIT|Apache|GPL|BSD|MPL|LGPL/i.test(content || '');
    if (isOpenSource) {
        return { score: 20, reason: 'Open source license detected. This enables legal reuse and distribution.' };
    }
    return { score: 10, reason: 'License present but not a standard open-source license. Consider using MIT, Apache-2.0, or GPL.' };
}

function evaluateTests(hasTests, testFiles) {
    if (!hasTests) {
        return { score: 0, reason: 'No test directories or test configuration files were detected. Research software requires verification suites to ensure implementation accuracy.' };
    }
    return { score: 20, reason: `Test infrastructure detected: ${testFiles.join(', ')}. This ensures scientific integrity.` };
}

function evaluateCI(hasCI, ciType) {
    if (!hasCI) {
        return { score: 0, reason: 'No GitHub Actions, GitLab CI, or other CI/CD workflows detected. Automated testing is essential for maintaining repository reliability.' };
    }
    return { score: 15, reason: `${ciType} workflow detected. This enables automated testing and continuous integration.` };
}

function evaluateVersioning(tags) {
    if (!tags || tags.length === 0) {
        return { score: 0, reason: 'No release tags detected. Versioning is important for reproducibility and tracking changes.' };
    }
    const semanticVersions = tags.filter(t => /^v?\d+\.\d+\.\d+/.test(t.name));
    if (semanticVersions.length > 0) {
        return { score: 10, reason: `The project maintains excellent versioning with ${semanticVersions.length} release tag(s) following semantic versioning.` };
    }
    return { score: 5, reason: `${tags.length} release tag(s) detected. Consider adopting semantic versioning (v1.0.0 format).` };
}

function evaluateCitation(hasCitationFile, readmeContent) {
    if (hasCitationFile) {
        return { score: 10, reason: 'CITATION.cff file detected, enabling standardized academic attribution.' };
    }
    if (readmeContent && /citation|how to cite|reference|bibtex|doi/i.test(readmeContent)) {
        return { score: 7, reason: 'Citation information found in README. Consider adding a CITATION.cff file for better integration with academic tools.' };
    }
    return { score: 0, reason: 'No CITATION.cff file or citation information detected. This makes it difficult for researchers to properly cite your work.' };
}

function evaluateCodeQuality(hasConfig) {
    if (!hasConfig) {
        return { score: 0, reason: 'No explicit formatting configurations (like Black, Prettier, or ESLint) were found. Project relies on manual or external style enforcement.' };
    }
    return { score: 15, reason: 'Code formatting configurations detected. This improves code readability and maintainability.' };
}

function getRating(score) {
    if (score >= 85) return 'EXCELLENT - Research Software Ready';
    if (score >= 70) return 'GOOD - Mostly Ready';
    if (score >= 50) return 'FAIR - Needs Improvement';
    if (score >= 30) return 'POOR - Significant Work Needed';
    return 'CRITICAL - Not Ready for Research Use';
}

function generateSummary(readme, license, tests, ci, versioning, citation, totalScore) {
    const goodPoints = [];
    const badPoints = [];
    
    if (readme.score >= 20) goodPoints.push('professional README documentation');
    else if (readme.score > 0) badPoints.push('incomplete README documentation');
    else badPoints.push('missing README');
    
    if (license.score >= 15) goodPoints.push('proper licensing');
    else if (license.score > 0) badPoints.push('non-standard license');
    else badPoints.push('missing LICENSE file');
    
    if (tests.score >= 15) goodPoints.push('comprehensive test suites');
    else if (tests.score > 0) badPoints.push('limited test coverage');
    else badPoints.push('no test suite');
    
    if (ci.score >= 10) goodPoints.push('CI/CD automation');
    else badPoints.push('no CI/CD configuration');
    
    if (versioning.score >= 8) goodPoints.push('robust versioning practices');
    else if (versioning.score > 0) badPoints.push('inconsistent versioning');
    else badPoints.push('no version tags');
    
    if (citation.score >= 8) goodPoints.push('proper citation metadata');
    else badPoints.push('missing citation information');
    
    let summary = '';
    if (goodPoints.length > 0) {
        summary += `The repository exhibits ${goodPoints.join(', ')}. `;
    }
    if (badPoints.length > 0) {
        summary += `However, it fails several core 'research-readiness' benchmarks due to ${badPoints.join(', ')}. `;
        summary += `These omissions create significant barriers for academic reuse, verification, and legal compliance.`;
    } else if (goodPoints.length > 0) {
        summary += `These practices create a solid foundation for research software.`;
    } else {
        summary += `The repository needs significant improvements to meet research software standards.`;
    }
    return summary;
}

function generateHTMLReport(assessment) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>RepoReady Report - ${assessment.repository}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #E4E3E0; padding: 40px; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border: 1px solid #141414; }
        h1 { text-transform: uppercase; border-bottom: 2px solid #141414; padding-bottom: 10px; }
        .repo-info { margin: 15px 0; padding: 10px; background: #f5f5f5; border-radius: 8px; }
        .repo-name { font-size: 18px; font-weight: bold; color: #667eea; }
        .repo-link { color: #667eea; text-decoration: none; font-size: 14px; word-break: break-all; }
        .score-box { font-size: 48px; font-weight: bold; margin: 20px 0; }
        .summary { font-style: italic; margin-bottom: 30px; color: #444; }
        .check-item { border-bottom: 1px solid #eee; padding: 15px 0; }
        .check-header { display: flex; justify-content: space-between; font-weight: bold; }
        .status-passed { color: #059669; }
        .status-failed { color: #dc2626; }
        .rationale { font-size: 14px; color: #666; margin-top: 5px; }
        .fix-list { background: #f9f9f9; padding: 20px; border: 1px dashed #141414; margin-top: 30px; }
        .fix-item { margin-bottom: 15px; padding: 10px; border-left: 3px solid; }
        .fix-item.HIGH { border-left-color: #dc2626; }
        .fix-item.MEDIUM { border-left-color: #f59e0b; }
        .fix-item.LOW { border-left-color: #10b981; }
        .priority-high { color: #dc2626; font-weight: bold; }
        .priority-medium { color: #f59e0b; font-weight: bold; }
        .priority-low { color: #10b981; font-weight: bold; }
        .footer { margin-top: 40px; font-size: 12px; opacity: 0.5; text-align: center; }
    </style>
</head>
<body>
<div class="container">
    <h1>RepoReady Assessment Report</h1>
    <div class="repo-info">
        <div class="repo-name">📁 ${assessment.repository}</div>
        <a href="${assessment.url}" class="repo-link" target="_blank">${assessment.url}</a>
    </div>
    <div class="score-box">Score: ${assessment.overallScore}/100</div>
    <p class="summary">${assessment.summary}</p>
    <h2>Detailed Assessment</h2>
    ${assessment.checks.map(check => `
        <div class="check-item">
            <div class="check-header">
                <span>${check.label}</span>
                <span class="${check.passed ? 'status-passed' : 'status-failed'}">
                    ${check.passed ? 'PASSED' : 'FAILED'} (${check.score}/${check.maxScore})
                </span>
            </div>
            <div class="rationale">${check.rationale}</div>
        </div>
    `).join('')}
    <div class="fix-list">
        <h2>Priority Fixes</h2>
        ${assessment.fixes.map(fix => `
            <div class="fix-item ${fix.priority}">
                <div class="priority-${fix.priority.toLowerCase()}">
                    [${fix.impact}]
                </div>
                <div>${fix.task}</div>
            </div>
        `).join('')}
    </div>
    <div class="footer">Generated by RepoReady on ${assessment.timestamp}</div>
</div>
</body>
</html>`;
}

function generateJSONReport(assessment) {
    return JSON.stringify({
        repository: assessment.repository,
        url: assessment.url,
        score: assessment.overallScore,
        rating: assessment.rating,
        summary: assessment.summary,
        checks: assessment.checks,
        fixChecklist: assessment.fixes.map(fix => ({
            task: fix.task,
            impact: fix.impact,
            priority: fix.priority === 'HIGH' ? 3 : fix.priority === 'MEDIUM' ? 2 : 1
        })),
        generatedAt: assessment.timestamp
    }, null, 2);
}

function renderResults(assessment) {
    const resultDiv = document.getElementById('result');
    
    resultDiv.innerHTML = `
        <div class="report-actions">
            <button id="downloadHtmlBtn" class="report-btn download-btn">📄 Download HTML Report</button>
            <button id="downloadJsonBtn" class="report-btn download-btn">💾 Download JSON Report</button>
        </div>
        <div class="score-card">
            <div class="score-header">
                <div class="score-label">OVERALL SCORE</div>
                <div class="score-value">${assessment.overallScore}<span class="score-max">/100</span></div>
                <div class="rating">${assessment.rating}</div>
            </div>
            <div class="summary">${assessment.summary}</div>
        </div>
        <div class="assessment-grid">
            ${assessment.checks.map(check => `
                <div class="assessment-card ${check.impact}-impact">
                    <div class="card-header">
                        <div class="card-title">${check.label}</div>
                        <div class="card-score ${check.passed ? 'score-good' : 'score-low'}">${check.score}<span class="max">/${check.maxScore}</span></div>
                    </div>
                    <div class="card-impact ${check.impact}">${check.impact.toUpperCase()} IMPACT</div>
                    <div class="card-reason">${check.rationale}</div>
                </div>
            `).join('')}
        </div>
        <div class="fixes-section">
            <h2 class="section-title">🔧 PRIORITY FIX CHECKLIST</h2>
            <div class="fixes-list">
                ${assessment.fixes.map(fix => `
                    <div class="fix-item ${fix.priority.toLowerCase()}">
                        <div class="fix-header">
                            <div class="fix-title">${fix.task}</div>
                            <div class="fix-impact ${fix.priority.toLowerCase()}">${fix.priority} IMPACT</div>
                        </div>
                        <div class="fix-description">${fix.impact}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="info-footer">
            <div class="timestamp">Report generated: ${assessment.timestamp}</div>
            <div class="repo-info">Repository: ${assessment.repository}</div>
        </div>
    `;
    
    document.getElementById('downloadHtmlBtn').onclick = () => {
        const html = generateHTMLReport(assessment);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `repoready-${assessment.repository.replace('/', '-')}.html`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('HTML report downloaded!');
    };
    
    document.getElementById('downloadJsonBtn').onclick = () => {
        const json = generateJSONReport(assessment);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `repoready-${assessment.repository.replace('/', '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('JSON report downloaded!');
    };
}

function showNotification(msg) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = msg;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function showError(msg) {
    document.getElementById('result').innerHTML = `
        <div class="error-card">
            <h3>❌ Assessment Failed</h3>
            <p>${msg}</p>
            <p class="error-hint">Use format: owner/repo (e.g., facebook/react, tensorflow/tensorflow)</p>
        </div>
    `;
}

async function handleAssessment(input) {
    if (!input) {
        showError('Please enter a repository name');
        return;
    }
    
    let cleanInput = input.replace('https://github.com/', '').replace('.git', '').trim();
    const parts = cleanInput.split('/');
    
    if (parts.length !== 2) {
        showError('Invalid format. Use: owner/repo (e.g., facebook/react)');
        return;
    }
    
    const owner = parts[0];
    const repo = parts[1];
    
    document.getElementById('loading').style.display = 'block';
    document.getElementById('result').innerHTML = '';
    document.getElementById('assessBtn').disabled = true;
    
    try {
        const assessment = await assessRepository(owner, repo);
        renderResults(assessment);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(assessment));
    } catch (err) {
        showError(err.message || 'Failed to assess repository. Please check the name and try again.');
    } finally {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('assessBtn').disabled = false;
    }
}

function loadLastAssessment() {
    const last = localStorage.getItem(STORAGE_KEY);
    if (last) {
        try {
            const assessment = JSON.parse(last);
            renderResults(assessment);
            document.getElementById('repoInput').value = assessment.repository;
            showNotification('Last assessment loaded!');
        } catch (e) {
            showError('Failed to load last assessment');
        }
    } else {
        showError('No previous assessment found');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('assessBtn').onclick = () => {
        handleAssessment(document.getElementById('repoInput').value.trim());
    };
    document.getElementById('repoInput').onkeypress = (e) => {
        if (e.key === 'Enter') {
            handleAssessment(e.target.value.trim());
        }
    };
    document.getElementById('loadLastBtn').onclick = loadLastAssessment;
});
