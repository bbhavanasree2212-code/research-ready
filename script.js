// Store last assessment in localStorage
const STORAGE_KEY = 'repoready_last_assessment';
let currentAssessment = null;

// Function to assess repository using GitHub API
async function assessRepository(owner, repo) {
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
    
    try {
        // Fetch repository info
        const repoInfoResponse = await fetch(baseUrl);
        if (!repoInfoResponse.ok) {
            if (repoInfoResponse.status === 403) {
                throw new Error('GitHub API rate limit reached. Please try again later.');
            } else if (repoInfoResponse.status === 404) {
                throw new Error(`Repository "${owner}/${repo}" not found. Make sure it exists and is public.`);
            } else {
                throw new Error(`GitHub API error: ${repoInfoResponse.status}`);
            }
        }
        
        // Fetch README
        let readmeContent = '';
        try {
            const readmeResponse = await fetch(`${baseUrl}/readme`);
            if (readmeResponse.ok) {
                const readmeData = await readmeResponse.json();
                readmeContent = atob(readmeData.content);
            }
        } catch (e) {}
        
        // Fetch LICENSE
        let licenseContent = '';
        let hasLicense = false;
        try {
            const licenseResponse = await fetch(`${baseUrl}/contents/LICENSE`);
            if (licenseResponse.ok) {
                const licenseData = await licenseResponse.json();
                licenseContent = atob(licenseData.content);
                hasLicense = true;
            } else {
                const licenseMdResponse = await fetch(`${baseUrl}/contents/LICENSE.md`);
                if (licenseMdResponse.ok) {
                    const licenseData = await licenseMdResponse.json();
                    licenseContent = atob(licenseData.content);
                    hasLicense = true;
                }
            }
        } catch (e) {}
        
        // Fetch package.json
        let packageJsonData = null;
        try {
            const packageResponse = await fetch(`${baseUrl}/contents/package.json`);
            if (packageResponse.ok) {
                const packageData = await packageResponse.json();
                const packageContent = atob(packageData.content);
                packageJsonData = JSON.parse(packageContent);
            }
        } catch (e) {}
        
        // Check for tests
        let hasTests = false;
        let testFiles = [];
        try {
            const contentsResponse = await fetch(`${baseUrl}/contents`);
            if (contentsResponse.ok) {
                const contents = await contentsResponse.json();
                if (Array.isArray(contents)) {
                    contents.forEach(item => {
                        if (item.type === 'dir' && /test|tests?/i.test(item.name)) {
                            hasTests = true;
                            testFiles.push(item.name);
                        }
                        if (item.type === 'file' && /test|spec/i.test(item.name)) {
                            hasTests = true;
                            testFiles.push(item.name);
                        }
                    });
                }
            }
        } catch (e) {}
        
        // Check for CI
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
            try {
                const ciResponse = await fetch(`${baseUrl}/contents/${ciPath}`);
                if (ciResponse.ok) {
                    hasCI = true;
                    if (ciPath.includes('github')) ciType = 'GitHub Actions';
                    else if (ciPath.includes('gitlab')) ciType = 'GitLab CI';
                    else if (ciPath.includes('travis')) ciType = 'Travis CI';
                    else if (ciPath.includes('circleci')) ciType = 'CircleCI';
                    break;
                }
            } catch (e) {}
        }
        
        // Check for CITATION
        let hasCitation = false;
        try {
            const citationResponse = await fetch(`${baseUrl}/contents/CITATION.cff`);
            if (citationResponse.ok) hasCitation = true;
        } catch (e) {}
        
        // Fetch tags
        let tags = [];
        try {
            const tagsResponse = await fetch(`${baseUrl}/tags`);
            if (tagsResponse.ok) {
                tags = await tagsResponse.json();
            }
        } catch (e) {}
        
        // Check for code quality
        let hasCodeQuality = false;
        let qualityDetails = [];
        const qualityPaths = ['pyproject.toml', '.prettierrc', '.eslintrc', '.stylelintrc', 'setup.py'];
        for (const qPath of qualityPaths) {
            try {
                const qResponse = await fetch(`${baseUrl}/contents/${qPath}`);
                if (qResponse.ok) {
                    hasCodeQuality = true;
                    qualityDetails.push(qPath);
                }
            } catch (e) {}
        }
        
        // Evaluate each category
        const readmeEval = evaluateReadme(readmeContent);
        const licenseEval = evaluateLicense(hasLicense, licenseContent);
        const testsEval = evaluateTests(hasTests, packageJsonData, testFiles);
        const ciEval = evaluateCI(hasCI, ciType);
        const versioningEval = evaluateVersioning(tags);
        const citationEval = evaluateCitation(hasCitation, readmeContent);
        const codeQualityEval = evaluateCodeQuality(hasCodeQuality, qualityDetails);
        
        // Calculate total score
        const totalScore = readmeEval.score + licenseEval.score + testsEval.score + 
                          ciEval.score + versioningEval.score + citationEval.score + codeQualityEval.score;
        
        // Generate fixes checklist with ALL priorities
        const fixes = [];
        
        // HIGH PRIORITY FIXES
        if (licenseEval.score < 20) {
            fixes.push({
                task: "❌ Add a LICENSE file to the root directory (e.g., Apache 2.0 or MIT).",
                impact: "CRITICAL: LEGAL REQUIREMENT FOR DISTRIBUTION AND REUSE.",
                priority: "HIGH",
                priorityLevel: 3
            });
        }
        
        if (testsEval.score === 0) {
            fixes.push({
                task: "❌ Implement a basic test suite and 'tests/' directory to verify model logic.",
                impact: "HIGH: ENSURES SCIENTIFIC INTEGRITY AND PREVENTS REGRESSIONS.",
                priority: "HIGH",
                priorityLevel: 3
            });
        } else if (testsEval.score > 0 && testsEval.score < 20) {
            fixes.push({
                task: "⚠️ Expand test coverage to include more comprehensive test cases.",
                impact: "HIGH: CURRENT TESTS ARE LIMITED",
                priority: "HIGH",
                priorityLevel: 3
            });
        }
        
        // MEDIUM PRIORITY FIXES
        if (ciEval.score === 0) {
            fixes.push({
                task: "⚠️ Configure GitHub Actions (.github/workflows) to automate tests on every pull request.",
                impact: "MEDIUM: INCREASES STABILITY AND TRUST IN THE REPOSITORY.",
                priority: "MEDIUM",
                priorityLevel: 2
            });
        }
        
        if (citationEval.score === 0) {
            fixes.push({
                task: "⚠️ Create a CITATION.cff file to allow researchers to easily cite this repository.",
                impact: "MEDIUM: IMPROVES ACADEMIC IMPACT TRACKING.",
                priority: "MEDIUM",
                priorityLevel: 2
            });
        } else if (citationEval.score > 0 && citationEval.score < 10) {
            fixes.push({
                task: "📝 Improve citation information by adding a CITATION.cff file.",
                impact: "MEDIUM: CURRENT CITATION INFO IS INCOMPLETE",
                priority: "MEDIUM",
                priorityLevel: 2
            });
        }
        
        if (readmeEval.score === 0) {
            fixes.push({
                task: "📖 Create a README file with installation, usage, and project overview.",
                impact: "MEDIUM: ESSENTIAL FOR PROJECT DOCUMENTATION",
                priority: "MEDIUM",
                priorityLevel: 2
            });
        } else if (readmeEval.score > 0 && readmeEval.score < 20) {
            fixes.push({
                task: "📖 Enhance README documentation with installation and usage examples.",
                impact: "MEDIUM: IMPROVES ONSET AND USABILITY",
                priority: "MEDIUM",
                priorityLevel: 2
            });
        }
        
        if (versioningEval.score === 0) {
            fixes.push({
                task: "🏷️ Create version tags for releases (e.g., v1.0.0, v1.0.1).",
                impact: "MEDIUM: IMPORTANT FOR REPRODUCIBILITY",
                priority: "MEDIUM",
                priorityLevel: 2
            });
        }
        
        // LOW PRIORITY FIXES
        if (!hasCodeQuality) {
            fixes.push({
                task: "🎨 Add a code formatting configuration file (.prettierrc, .eslintrc, or pyproject.toml).",
                impact: "LOW: IMPROVES CODE READABILITY AND MAINTAINABILITY.",
                priority: "LOW",
                priorityLevel: 1
            });
        }
        
        if (readmeEval.score >= 20 && readmeEval.score < 25) {
            fixes.push({
                task: "📝 Add more details to README (structure overview, documentation links).",
                impact: "LOW: MISSING SOME DOCUMENTATION SECTIONS",
                priority: "LOW",
                priorityLevel: 1
            });
        }
        
        if (versioningEval.score > 0 && versioningEval.score < 8) {
            fixes.push({
                task: "🏷️ Adopt semantic versioning format (v1.0.0, v1.0.1, etc.).",
                impact: "LOW: CURRENT TAGS NOT FOLLOWING SEMVER",
                priority: "LOW",
                priorityLevel: 1
            });
        }
        
        // Sort fixes by priority (HIGH → MEDIUM → LOW)
        fixes.sort((a, b) => b.priorityLevel - a.priorityLevel);
        
        // Build checks array
        const checks = [
            {
                id: "readme-quality",
                label: "README Quality",
                passed: readmeEval.score >= 20,
                score: readmeEval.score,
                maxScore: 25,
                rationale: readmeEval.reason,
                impact: "medium"
            },
            {
                id: "license",
                label: "License",
                passed: licenseEval.score >= 15,
                score: licenseEval.score,
                maxScore: 20,
                rationale: licenseEval.reason,
                impact: "high"
            },
            {
                id: "testing",
                label: "Tests",
                passed: testsEval.score >= 15,
                score: testsEval.score,
                maxScore: 20,
                rationale: testsEval.reason,
                impact: "high"
            },
            {
                id: "ci-config",
                label: "CI Config",
                passed: ciEval.score >= 10,
                score: ciEval.score,
                maxScore: 15,
                rationale: ciEval.reason,
                impact: "medium"
            },
            {
                id: "versioning",
                label: "Versioning",
                passed: versioningEval.score >= 8,
                score: versioningEval.score,
                maxScore: 10,
                rationale: versioningEval.reason,
                impact: "medium"
            },
            {
                id: "citation",
                label: "Citation",
                passed: citationEval.score >= 8,
                score: citationEval.score,
                maxScore: 10,
                rationale: citationEval.reason,
                impact: "medium"
            },
            {
                id: "code-quality",
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
    const hasInstall = /install|setup|getting started|installation|pip install|npm install/i.test(content);
    const hasRun = /run|usage|example|quick start|how to use|command/i.test(content);
    const hasStructure = /structure|organization|overview/i.test(content);
    const hasDocs = /documentation|docs|reference/i.test(content);
    
    if (hasInstall) score += 10;
    if (hasRun) score += 10;
    if (hasStructure) score += 5;
    if (hasDocs) score += 5;
    
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
        return { 
            score: 0, 
            reason: 'No LICENSE file was detected in the root directory. A license is mandatory for legal reuse in research and industry.'
        };
    }
    
    const licenseName = content?.split('\n')[0] || 'Unknown';
    const isOpenSource = /MIT|Apache|GPL|BSD|MPL|LGPL/i.test(licenseName);
    
    if (isOpenSource) {
        return { 
            score: 20, 
            reason: `${licenseName} license detected. This open-source license enables legal reuse and distribution.`
        };
    }
    
    return { 
        score: 10, 
        reason: `License present (${licenseName}) but not a standard open-source license. Consider using MIT, Apache-2.0, or GPL.`
    };
}

function evaluateTests(hasTests, packageJson, testFiles) {
    if (!hasTests && !packageJson?.scripts?.test) {
        return {
            score: 0,
            reason: 'No test directories or test configuration files were detected. Research software requires verification suites to ensure implementation accuracy.'
        };
    }
    
    let score = 0;
    let details = [];
    
    if (hasTests) {
        score += 15;
        details.push(`Test files/directories found: ${testFiles.join(', ')}`);
    }
    
    if (packageJson?.scripts?.test) {
        score += 5;
        details.push('Test script defined in package.json');
    }
    
    const reason = details.length > 0 
        ? `Test infrastructure detected: ${details.join('. ')}. ${score < 20 ? 'Consider expanding test coverage.' : ''}`
        : 'No test directories or test configuration files were detected.';
    
    return { score: Math.min(score, 20), reason };
}

function evaluateCI(hasCI, ciType) {
    if (!hasCI) {
        return {
            score: 0,
            reason: 'No GitHub Actions, GitLab CI, or other CI/CD workflows detected. Automated testing is essential for maintaining repository reliability.'
        };
    }
    
    return {
        score: 15,
        reason: `${ciType} workflow detected. This enables automated testing and continuous integration.`
    };
}

function evaluateVersioning(tags) {
    if (!tags || tags.length === 0) {
        return {
            score: 0,
            reason: 'No release tags detected. Versioning is important for reproducibility and tracking changes.'
        };
    }
    
    const semanticVersions = tags.filter(t => /^v?\d+\.\d+\.\d+/.test(t.name));
    const versionCount = semanticVersions.length > 0 ? semanticVersions.length : tags.length;
    
    let score = 5;
    let reason = '';
    
    if (semanticVersions.length > 0) {
        score = 10;
        reason = `The project maintains excellent versioning with ${versionCount} release tag(s) following semantic versioning.`;
    } else if (tags.length >= 3) {
        score = 8;
        reason = `${versionCount} release tag(s) detected. Consider adopting semantic versioning (v1.0.0 format).`;
    } else {
        reason = `${versionCount} release tag(s) detected. Adding more structured versioning would improve reproducibility.`;
    }
    
    return { score, reason };
}

function evaluateCitation(hasCitationFile, readmeContent) {
    if (hasCitationFile) {
        return {
            score: 10,
            reason: 'CITATION.cff file detected, enabling standardized academic attribution.'
        };
    }
    
    if (readmeContent && /citation|how to cite|reference|bibtex|doi/i.test(readmeContent)) {
        return {
            score: 7,
            reason: 'Citation information found in README. Consider adding a CITATION.cff file for better integration with academic tools.'
        };
    }
    
    return {
        score: 0,
        reason: 'No CITATION.cff file or citation information detected. This makes it difficult for researchers to properly cite your work.'
    };
}

function evaluateCodeQuality(hasConfig, details) {
    if (!hasConfig) {
        return {
            score: 0,
            reason: 'No explicit formatting configurations (like Black, Prettier, or ESLint) were found. Project relies on manual or external style enforcement.',
            details: []
        };
    }
    
    return {
        score: 15,
        reason: `Code formatting configurations detected: ${details.join(', ')}. This improves code readability and maintainability.`,
        details: details
    };
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RepoReady Assessment Report - ${assessment.repository}</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
            line-height: 1.6; 
            color: #141414; 
            background: #E4E3E0; 
            padding: 40px; 
        }
        .container { 
            max-width: 800px; 
            margin: 0 auto; 
            background: white; 
            padding: 40px; 
            border: 1px solid #141414; 
        }
        h1 { 
            text-transform: uppercase; 
            letter-spacing: -0.02em; 
            border-bottom: 2px solid #141414; 
            padding-bottom: 10px; 
        }
        .score-box { 
            font-size: 48px; 
            font-weight: bold; 
            margin: 20px 0; 
        }
        .summary { 
            font-style: italic; 
            margin-bottom: 30px; 
            color: #444; 
        }
        .check-item { 
            border-bottom: 1px solid #eee; 
            padding: 15px 0; 
        }
        .check-header { 
            display: flex; 
            justify-content: space-between; 
            font-weight: bold; 
        }
        .status-passed { 
            color: #059669; 
        }
        .status-failed { 
            color: #dc2626; 
        }
        .rationale { 
            font-size: 14px; 
            color: #666; 
            margin-top: 5px; 
        }
        .fix-list { 
            background: #f9f9f9; 
            padding: 20px; 
            border: 1px dashed #141414; 
            margin-top: 30px; 
        }
        .fix-item { 
            margin-bottom: 15px; 
            font-size: 14px; 
            padding: 10px;
            border-left: 3px solid;
        }
        .fix-item.high { 
            border-left-color: #dc2626; 
        }
        .fix-item.medium { 
            border-left-color: #f59e0b; 
        }
        .fix-item.low { 
            border-left-color: #10b981; 
        }
        .priority-high { 
            color: #dc2626; 
            font-weight: bold; 
        }
        .priority-medium { 
            color: #f59e0b; 
            font-weight: bold; 
        }
        .priority-low { 
            color: #10b981; 
            font-weight: bold; 
        }
        .footer {
            margin-top: 40px;
            font-size: 12px;
            opacity: 0.5;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>RepoReady Assessment Report</h1>
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
                <div class="fix-item ${fix.priority.toLowerCase()}">
                    <div class="${fix.priority === 'HIGH' ? 'priority-high' : fix.priority === 'MEDIUM' ? 'priority-medium' : 'priority-low'}">
                        [${fix.impact}]
                    </div>
                    <div>${fix.task}</div>
                </div>
            `).join('')}
        </div>
        
        <div class="footer">
            Generated by RepoReady on ${assessment.timestamp}
        </div>
    </div>
</body>
</html>`;
}

function generateJSONReport(assessment) {
    return JSON.stringify({
        score: assessment.overallScore,
        summary: assessment.summary,
        checks: assessment.checks,
        fixChecklist: assessment.fixes.map(fix => ({
            task: fix.task,
            impact: fix.impact,
            priority: fix.priority === 'HIGH' ? 3 : fix.priority === 'MEDIUM' ? 2 : 1
        }))
    }, null, 2);
}

function downloadHTMLReport(assessment) {
    const htmlContent = generateHTMLReport(assessment);
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `repoready-report-${assessment.repository.replace('/', '-')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('✅ HTML report downloaded!', 'success');
}

function downloadJSONReport(assessment) {
    const jsonContent = generateJSONReport(assessment);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `repoready-report-${assessment.repository.replace('/', '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('✅ JSON report downloaded!', 'success');
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
            ${assessment.checks.map(check => {
                const impactClass = check.impact;
                const isPassed = check.passed;
                const scoreClass = isPassed ? 'score-good' : 'score-low';
                return `
                    <div class="assessment-card ${impactClass}-impact">
                        <div class="card-header">
                            <div class="card-title">${check.label}</div>
                            <div class="card-score ${scoreClass}">
                                ${check.score}<span class="max">/${check.maxScore}</span>
                            </div>
                        </div>
                        <div class="card-impact ${impactClass}">${check.impact.toUpperCase()} IMPACT</div>
                        <div class="card-reason">${check.rationale}</div>
                    </div>
                `;
            }).join('')}
        </div>
        
        <div class="fixes-section">
            <h2 class="section-title">🔧 PRIORITY FIX CHECKLIST</h2>
            <div class="fixes-list">
                ${assessment.fixes.map(fix => `
                    <div class="fix-item ${fix.priority.toLowerCase()}">
                        <div class="fix-header">
                            <div class="fix-icon">${fix.task.charAt(0)}</div>
                            <div class="fix-title">${fix.task}</div>
                            <div class="fix-impact ${fix.priority.toLowerCase()}">
                                ${fix.priority} IMPACT
                            </div>
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
    
    resultDiv.innerHTML = html;
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Add event listeners for download buttons
    setTimeout(() => {
        const htmlBtn = document.getElementById('downloadHtmlBtn');
        const jsonBtn = document.getElementById('downloadJsonBtn');
        
        if (htmlBtn) {
            htmlBtn.onclick = () => downloadHTMLReport(assessment);
        }
        if (jsonBtn) {
            jsonBtn.onclick = () => downloadJSONReport(assessment);
        }
    }, 100);
}

function showNotification(message, type) {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 12px 24px;
        border-radius: 12px;
        background: ${type === 'success' ? '#48bb78' : '#f56565'};
        color: white;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
}

function showError(message) {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `
        <div class="error-card">
            <h3>❌ Assessment Failed</h3>
            <p>${message}</p>
            <p class="error-hint">Make sure the repository is public and the URL is correct.</p>
            <p class="error-hint">Examples: facebook/react, tensorflow/tensorflow, octocat/Spoon-Knife</p>
        </div>
    `;
}

function showLoading() {
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) loadingDiv.style.display = 'block';
    const resultDiv = document.getElementById('result');
    if (resultDiv) resultDiv.innerHTML = '';
    const assessBtn = document.getElementById('assessBtn');
    if (assessBtn) assessBtn.disabled = true;
}

function hideLoading() {
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) loadingDiv.style.display = 'none';
    const assessBtn = document.getElementById('assessBtn');
    if (assessBtn) assessBtn.disabled = false;
}

async function handleAssessment(input) {
    if (!input) {
        showError('Please enter a repository owner/repo name');
        return;
    }
    
    let cleanInput = input.replace('https://github.com/', '').replace('.git', '').trim();
    const parts = cleanInput.split('/');
    
    let owner, repo;
    if (parts.length === 2) {
        owner = parts[0];
        repo = parts[1];
    } else {
        showError('Invalid format. Use "owner/repo" (e.g., facebook/react)');
        return;
    }
    
    showLoading();
    
    try {
        const assessment = await assessRepository(owner, repo);
        renderResults(assessment);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(assessment));
    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'Failed to assess repository. Please try again.');
    } finally {
        hideLoading();
    }
}

function loadLastAssessment() {
    const last = localStorage.getItem(STORAGE_KEY);
    if (last) {
        try {
            const assessment = JSON.parse(last);
            renderResults(assessment);
            const repoInput = document.getElementById('repoInput');
            if (repoInput) repoInput.value = assessment.repository;
            showNotification('Last assessment loaded!', 'success');
        } catch (e) {
            showError('Failed to load last assessment');
        }
    } else {
        showError('No previous assessment found');
    }
}

// Initialize event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('RepoReady initialized - all buttons ready');
    
    const assessBtn = document.getElementById('assessBtn');
    const repoInput = document.getElementById('repoInput');
    const loadLastBtn = document.getElementById('loadLastBtn');
    
    if (assessBtn) {
        assessBtn.addEventListener('click', function() {
            const input = repoInput ? repoInput.value.trim() : '';
            handleAssessment(input);
        });
        console.log('Assess button attached');
    }
    
    if (repoInput) {
        repoInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleAssessment(repoInput.value.trim());
            }
        });
        console.log('Enter key handler attached');
    }
    
    if (loadLastBtn) {
        loadLastBtn.addEventListener('click', loadLastAssessment);
        console.log('Load last button attached');
    }
});
