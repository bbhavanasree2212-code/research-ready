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
            throw new Error(`Repository not found: ${repoInfoResponse.status}`);
        }
        const repoInfo = await repoInfoResponse.json();
        
        // Fetch README
        let readmeContent = '';
        try {
            const readmeResponse = await fetch(`${baseUrl}/readme`);
            if (readmeResponse.ok) {
                const readmeData = await readmeResponse.json();
                readmeContent = atob(readmeData.content);
            }
        } catch (e) {
            console.log('No README found');
        }
        
        // Fetch LICENSE
        let licenseContent = '';
        let hasLicense = false;
        try {
            const licenseResponse = await fetch(`${baseUrl}/contents/LICENSE`);
            if (licenseResponse.ok) {
                const licenseData = await licenseResponse.json();
                licenseContent = atob(licenseData.content);
                hasLicense = true;
            }
        } catch (e) {
            // Try LICENSE.md
            try {
                const licenseResponse = await fetch(`${baseUrl}/contents/LICENSE.md`);
                if (licenseResponse.ok) {
                    const licenseData = await licenseResponse.json();
                    licenseContent = atob(licenseData.content);
                    hasLicense = true;
                }
            } catch (e2) {}
        }
        
        // Fetch package.json if exists
        let packageJsonData = null;
        try {
            const packageResponse = await fetch(`${baseUrl}/contents/package.json`);
            if (packageResponse.ok) {
                const packageData = await packageResponse.json();
                const packageContent = atob(packageData.content);
                packageJsonData = JSON.parse(packageContent);
            }
        } catch (e) {
            console.log('No package.json found');
        }
        
        // Fetch repository contents to check for tests
        let hasTests = false;
        let testFiles = [];
        try {
            const contentsResponse = await fetch(`${baseUrl}/contents`);
            if (contentsResponse.ok) {
                const contents = await contentsResponse.json();
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
        } catch (e) {
            console.log('Could not fetch contents');
        }
        
        // Check for CI configuration
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
        
        // Check for CITATION.cff
        let hasCitation = false;
        try {
            const citationResponse = await fetch(`${baseUrl}/contents/CITATION.cff`);
            if (citationResponse.ok) hasCitation = true;
        } catch (e) {}
        
        // Fetch tags/releases
        let tags = [];
        try {
            const tagsResponse = await fetch(`${baseUrl}/tags`);
            if (tagsResponse.ok) {
                tags = await tagsResponse.json();
            }
        } catch (e) {}
        
        // Check for code quality configs
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
        
        // Calculate total score
        const totalScore = readmeEval.score + licenseEval.score + testsEval.score + 
                          ciEval.score + versioningEval.score + citationEval.score;
        
        // Generate fixes checklist - ADD ALL FIXES REGARDLESS OF SCORE
        const fixes = [];
        
        // HIGH IMPACT FIXES - Add if not perfect
        if (licenseEval.score < 20) {
            fixes.push({
                icon: '❌',
                title: 'Add a LICENSE file to the root directory',
                description: 'CRITICAL: LEGAL REQUIREMENT FOR DISTRIBUTION AND REUSE',
                impact: 'HIGH IMPACT',
                priority: 'high',
                suggestion: 'Add MIT, Apache-2.0, or GPL-3.0 license file'
            });
        }
        
        if (testsEval.score < 20) {
            if (testsEval.score === 0) {
                fixes.push({
                    icon: '❌',
                    title: 'Implement a basic test suite and tests directory',
                    description: 'HIGH: ENSURES SCIENTIFIC INTEGRITY AND PREVENTS REGRESSIONS',
                    impact: 'HIGH IMPACT',
                    priority: 'high',
                    suggestion: 'Add unit tests using pytest, jest, or your language\'s testing framework'
                });
            } else {
                fixes.push({
                    icon: '⚠️',
                    title: 'Expand test coverage',
                    description: 'MEDIUM: CURRENT TESTS ARE LIMITED',
                    impact: 'MEDIUM IMPACT',
                    priority: 'medium',
                    suggestion: 'Add more comprehensive test cases to improve coverage'
                });
            }
        }
        
        // MEDIUM IMPACT FIXES - Add if not perfect
        if (ciEval.score < 15) {
            fixes.push({
                icon: '🔘',
                title: 'Configure GitHub Actions to automate tests',
                description: 'MEDIUM: INCREASES STABILITY AND TRUST IN THE REPOSITORY',
                impact: 'MEDIUM IMPACT',
                priority: 'medium',
                suggestion: 'Create .github/workflows/ci.yml with test automation'
            });
        }
        
        if (citationEval.score < 10) {
            if (citationEval.score === 0) {
                fixes.push({
                    icon: '📄',
                    title: 'Create a CITATION.cff file',
                    description: 'MEDIUM: IMPROVES ACADEMIC IMPACT TRACKING',
                    impact: 'MEDIUM IMPACT',
                    priority: 'medium',
                    suggestion: 'Add CITATION.cff with authors, title, and DOI if available'
                });
            } else {
                fixes.push({
                    icon: '📝',
                    title: 'Improve citation information',
                    description: 'LOW: CURRENT CITATION INFO IS INCOMPLETE',
                    impact: 'LOW IMPACT',
                    priority: 'low',
                    suggestion: 'Convert README citation info to CITATION.cff format'
                });
            }
        }
        
        if (readmeEval.score < 25) {
            if (readmeEval.score < 20) {
                fixes.push({
                    icon: '📖',
                    title: 'Enhance README documentation',
                    description: 'MEDIUM: IMPROVES ONSET AND USABILITY',
                    impact: 'MEDIUM IMPACT',
                    priority: 'medium',
                    suggestion: 'Add installation, usage examples, and API documentation'
                });
            } else {
                fixes.push({
                    icon: '📝',
                    title: 'Add more details to README',
                    description: 'LOW: MISSING SOME DOCUMENTATION SECTIONS',
                    impact: 'LOW IMPACT',
                    priority: 'low',
                    suggestion: 'Add structure overview and documentation links'
                });
            }
        }
        
        if (versioningEval.score < 10) {
            if (versioningEval.score === 0) {
                fixes.push({
                    icon: '🏷️',
                    title: 'Create version tags for releases',
                    description: 'MEDIUM: IMPORTANT FOR REPRODUCIBILITY',
                    impact: 'MEDIUM IMPACT',
                    priority: 'medium',
                    suggestion: 'Create semantic version tags (v1.0.0, v1.0.1, etc.)'
                });
            } else {
                fixes.push({
                    icon: '🏷️',
                    title: 'Adopt semantic versioning',
                    description: 'LOW: CURRENT TAGS NOT FOLLOWING SEMVER',
                    impact: 'LOW IMPACT',
                    priority: 'low',
                    suggestion: 'Use semantic versioning format: v1.0.0, v1.0.1, etc.'
                });
            }
        }
        
        // LOW IMPACT FIXES
        if (!hasCodeQuality) {
            fixes.push({
                icon: '🎨',
                title: 'Add code formatting configuration',
                description: 'LOW: IMPROVES CODE READABILITY AND MAINTAINABILITY',
                impact: 'LOW IMPACT',
                priority: 'low',
                suggestion: 'Add .prettierrc, .eslintrc, or pyproject.toml with formatter config'
            });
        }
        
        return {
            repository: `${owner}/${repo}`,
            url: `https://github.com/${owner}/${repo}`,
            overallScore: totalScore,
            rating: getRating(totalScore),
            summary: generateSummary(readmeEval, licenseEval, testsEval, ciEval, versioningEval, citationEval, totalScore),
            checks: {
                readme: {
                    name: 'README Quality',
                    score: readmeEval.score,
                    maxScore: 25,
                    reason: readmeEval.reason,
                    impact: 'MEDIUM IMPACT',
                    threshold: 20
                },
                license: {
                    name: 'License',
                    score: licenseEval.score,
                    maxScore: 20,
                    reason: licenseEval.reason,
                    impact: 'HIGH IMPACT',
                    threshold: 15
                },
                tests: {
                    name: 'Tests',
                    score: testsEval.score,
                    maxScore: 20,
                    reason: testsEval.reason,
                    impact: 'HIGH IMPACT',
                    threshold: 15
                },
                ci: {
                    name: 'CI Config',
                    score: ciEval.score,
                    maxScore: 15,
                    reason: ciEval.reason,
                    impact: 'MEDIUM IMPACT',
                    threshold: 10
                },
                versioning: {
                    name: 'Versioning',
                    score: versioningEval.score,
                    maxScore: 10,
                    reason: versioningEval.reason,
                    impact: 'MEDIUM IMPACT',
                    threshold: 8
                },
                citation: {
                    name: 'Citation',
                    score: citationEval.score,
                    maxScore: 10,
                    reason: citationEval.reason,
                    impact: 'MEDIUM IMPACT',
                    threshold: 8
                }
            },
            fixes: fixes,
            timestamp: new Date().toISOString()
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
        reason = 'README is professionally structured with clear navigation and comprehensive documentation.';
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
            ${Object.entries(assessment.checks).map(([key, check]) => {
                const impactClass = check.impact.toLowerCase().replace(' ', '-');
                const isBelowThreshold = check.score < check.threshold;
                const scoreClass = isBelowThreshold ? 'score-low' : 'score-good';
                return `
                    <div class="assessment-card ${impactClass}">
                        <div class="card-header">
                            <div class="card-title">${check.name}</div>
                            <div class="card-score ${scoreClass}">
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
                    <div class="fix-item ${fix.priority}">
                        <div class="fix-header">
                            <div class="fix-icon">${fix.icon || '❌'}</div>
                            <div class="fix-title">${fix.title}</div>
                            <div class="fix-impact ${fix.priority}">
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
        </div>
    `;
    
    resultDiv.innerHTML = html;
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    setTimeout(() => {
        document.getElementById('downloadHtmlBtn')?.addEventListener('click', () => downloadHTMLReport(assessment));
        document.getElementById('downloadJsonBtn')?.addEventListener('click', () => downloadJSONReport(assessment));
    }, 100);
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function generateHTMLReport(assessment) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RepoReady Report - ${assessment.repository}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
        }
        .report-container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 48px; }
        .logo {
            font-size: 48px;
            font-weight: 800;
            color: white;
            margin-bottom: 16px;
        }
        .badge {
            display: inline-flex;
            gap: 16px;
            background: rgba(255,255,255,0.2);
            padding: 8px 24px;
            border-radius: 40px;
            color: white;
        }
        .score-card {
            background: white;
            border-radius: 24px;
            padding: 40px;
            margin-bottom: 32px;
        }
        .score-header { text-align: center; margin-bottom: 32px; }
        .score-label {
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: #a0aec0;
        }
        .score-value {
            font-size: 80px;
            font-weight: 800;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .rating {
            font-size: 18px;
            margin-top: 12px;
            font-weight: 600;
        }
        .summary {
            color: #4a5568;
            line-height: 1.6;
            padding-top: 24px;
            border-top: 1px solid #e2e8f0;
        }
        .assessment-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 24px;
            margin-bottom: 48px;
        }
        .assessment-card {
            background: #f7fafc;
            border-radius: 20px;
            padding: 24px;
            border-left: 4px solid;
        }
        .assessment-card.high-impact { border-left-color: #f56565; }
        .assessment-card.medium-impact { border-left-color: #ed8936; }
        .assessment-card.low-impact { border-left-color: #48bb78; }
        .card-title { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
        .card-score { font-size: 28px; font-weight: 700; }
        .card-score.score-low { color: #f56565; }
        .card-score.score-good { color: #48bb78; }
        .fixes-section {
            background: #f7fafc;
            border-radius: 24px;
            padding: 32px;
            margin-bottom: 32px;
        }
        .section-title { font-size: 24px; margin-bottom: 24px; }
        .fix-item {
            background: white;
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 16px;
            border-left: 4px solid;
        }
        .fix-item.high { border-left-color: #f56565; }
        .fix-item.medium { border-left-color: #ed8936; }
        .fix-item.low { border-left-color: #48bb78; }
        .fix-impact.high { color: #f56565; }
        .fix-impact.medium { color: #ed8936; }
        .fix-impact.low { color: #48bb78; }
        @media (max-width: 768px) {
            .assessment-grid { grid-template-columns: 1fr; }
            .score-value { font-size: 56px; }
        }
    </style>
</head>
<body>
    <div class="report-container">
        <div class="header">
            <h1 class="logo">RepoReady</h1>
            <div class="badge">RESEARCH SOFTWARE READINESS REPORT</div>
        </div>
        <div class="score-card">
            <div class="score-header">
                <div class="score-label">OVERALL SCORE</div>
                <div class="score-value">${assessment.overallScore}<span style="font-size:24px;color:#cbd5e0;">/100</span></div>
                <div class="rating">${assessment.rating}</div>
            </div>
            <div class="summary">${assessment.summary}</div>
        </div>
        <div class="assessment-grid">
            ${Object.entries(assessment.checks).map(([key, check]) => {
                const isBelowThreshold = check.score < check.threshold;
                const scoreClass = isBelowThreshold ? 'score-low' : 'score-good';
                return `
                    <div class="assessment-card ${check.impact.toLowerCase().replace(' ', '-')}">
                        <div class="card-title">${check.name}</div>
                        <div class="card-score ${scoreClass}">${check.score}/${check.maxScore}</div>
                        <div style="margin:12px 0;font-size:12px;font-weight:600;color:${check.impact === 'HIGH IMPACT' ? '#f56565' : check.impact === 'MEDIUM IMPACT' ? '#ed8936' : '#48bb78'}">${check.impact}</div>
                        <div style="color:#718096;font-size:14px;">${check.reason}</div>
                    </div>
                `;
            }).join('')}
        </div>
        <div class="fixes-section">
            <h2 class="section-title">🔧 PRIORITY FIX CHECKLIST</h2>
            ${assessment.fixes.map(fix => `
                <div class="fix-item ${fix.priority}">
                    <div style="font-weight:600;margin-bottom:8px;">${fix.icon} ${fix.title}</div>
                    <div style="color:#718096;font-size:13px;margin-bottom:8px;">${fix.description}</div>
                    <div class="fix-impact ${fix.priority}" style="font-size:12px;font-weight:600;margin-bottom:8px;">${fix.impact}</div>
                    <div style="color:#667eea;font-size:13px;">💡 ${fix.suggestion}</div>
                </div>
            `).join('')}
        </div>
        <div style="text-align:center;color:rgba(255,255,255,0.7);font-size:12px;margin-top:32px;">
            Report generated: ${new Date(assessment.timestamp).toLocaleString()}
        </div>
    </div>
</body>
</html>`;
}

function downloadHTMLReport(assessment) {
    const htmlContent = generateHTMLReport(assessment);
    const filename = `repoready-report-${assessment.repository.replace('/', '-')}.html`;
    downloadFile(htmlContent, filename, 'text/html');
    showNotification('✅ HTML report downloaded!', 'success');
}

function downloadJSONReport(assessment) {
    const jsonContent = JSON.stringify(assessment, null, 2);
    const filename = `repoready-report-${assessment.repository.replace('/', '-')}.json`;
    downloadFile(jsonContent, filename, 'application/json');
    showNotification('✅ JSON report downloaded!', 'success');
}

function showNotification(message, type) {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        border-radius: 12px;
        background: ${type === 'success' ? '#48bb78' : '#f56565'};
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
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
        </div>
    `;
}

function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('result').innerHTML = '';
    const assessBtn = document.getElementById('assessBtn');
    if (assessBtn) assessBtn.disabled = true;
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
    const assessBtn = document.getElementById('assessBtn');
    if (assessBtn) assessBtn.disabled = false;
}

async function handleAssessment(input) {
    if (!input) {
        showError('Please enter a repository URL or owner/repo name');
        return;
    }
    
    let owner, repo;
    
    if (input.includes('github.com')) {
        const match = input.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (match) {
            owner = match[1];
            repo = match[2].replace('.git', '');
        }
    } else {
        const parts = input.split('/');
        if (parts.length === 2) {
            owner = parts[0];
            repo = parts[1];
        }
    }
    
    if (!owner || !repo) {
        showError('Invalid repository format. Use "owner/repo" or full GitHub URL');
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

document.addEventListener('DOMContentLoaded', () => {
    console.log('RepoReady initialized');
    
    const assessBtn = document.getElementById('assessBtn');
    const repoInput = document.getElementById('repoInput');
    const loadLastBtn = document.getElementById('loadLastBtn');
    const demoBtns = document.querySelectorAll('.demo-btn:not(#loadLastBtn)');
    
    if (assessBtn) {
        assessBtn.addEventListener('click', () => {
            const input = repoInput ? repoInput.value.trim() : '';
            handleAssessment(input);
        });
    }
    
    if (repoInput) {
        repoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleAssessment(repoInput.value.trim());
            }
        });
    }
    
    if (loadLastBtn) {
        loadLastBtn.addEventListener('click', loadLastAssessment);
    }
    
    demoBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const repoUrl = btn.getAttribute('data-repo');
            if (repoUrl) {
                if (repoInput) repoInput.value = repoUrl;
                handleAssessment(repoUrl);
            }
        });
    });
    
    console.log('Event listeners attached');
});
