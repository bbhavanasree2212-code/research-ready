// Store last assessment in localStorage
const STORAGE_KEY = 'repoready_last_assessment';
let currentAssessment = null;

// Use a proxy to avoid CORS issues
// For local testing, you can use a backend server
// For production, you'll need a proper backend

async function assessRepository(repoUrl) {
    try {
        // Parse the repo URL to get owner and repo
        let owner, repo;
        
        if (repoUrl.includes('github.com/')) {
            const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
            if (match) {
                owner = match[1];
                repo = match[2].replace('.git', '');
            }
        } else {
            // If just owner/repo format
            const parts = repoUrl.split('/');
            if (parts.length === 2) {
                owner = parts[0];
                repo = parts[1];
            }
        }
        
        if (!owner || !repo) {
            throw new Error('Invalid repository URL format');
        }
        
        // Fetch data from GitHub API
        const assessment = await fetchAndAssess(owner, repo);
        
        // Save to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...assessment,
            savedAt: new Date().toISOString()
        }));
        
        return assessment;
    } catch (error) {
        console.error('Assessment error:', error);
        throw error;
    }
}

async function fetchAndAssess(owner, repo) {
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
    
    try {
        // Fetch multiple files in parallel
        const [repoInfo, readme, license, packageJson, contents, tags] = await Promise.all([
            fetch(`${baseUrl}`).then(res => res.json()),
            fetch(`${baseUrl}/readme`).then(res => res.ok ? res.json() : null),
            fetch(`${baseUrl}/contents/LICENSE`).then(res => res.ok ? res.json() : null),
            fetch(`${baseUrl}/contents/package.json`).then(res => res.ok ? res.json() : null),
            fetch(`${baseUrl}/contents`).then(res => res.json()),
            fetch(`${baseUrl}/tags`).then(res => res.json())
        ]);
        
        // Decode README content
        let readmeContent = '';
        if (readme && readme.content) {
            readmeContent = Buffer.from(readme.content, 'base64').toString('utf-8');
        }
        
        // Decode LICENSE content
        let licenseContent = '';
        if (license && license.content) {
            licenseContent = Buffer.from(license.content, 'base64').toString('utf-8');
        }
        
        // Parse package.json
        let packageJsonData = null;
        if (packageJson && packageJson.content) {
            try {
                const pkgContent = Buffer.from(packageJson.content, 'base64').toString('utf-8');
                packageJsonData = JSON.parse(pkgContent);
            } catch (e) {}
        }
        
        // Check for test files
        let hasTests = false;
        let testFiles = [];
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
        
        // Check for CI config
        let hasCI = false;
        let ciType = null;
        const ciFiles = ['.github/workflows/ci.yml', '.github/workflows/test.yml', '.gitlab-ci.yml', '.travis.yml'];
        for (const ciFile of ciFiles) {
            const response = await fetch(`${baseUrl}/contents/${ciFile}`).catch(() => null);
            if (response && response.ok) {
                hasCI = true;
                ciType = ciFile.includes('github') ? 'GitHub Actions' : 
                         ciFile.includes('gitlab') ? 'GitLab CI' : 'Travis CI';
                break;
            }
        }
        
        // Check for CITATION.cff
        let hasCitation = false;
        const citationResponse = await fetch(`${baseUrl}/contents/CITATION.cff`).catch(() => null);
        if (citationResponse && citationResponse.ok) hasCitation = true;
        
        // Evaluate each category
        const readmeScore = evaluateReadme(readmeContent);
        const licenseScore = evaluateLicense(license, licenseContent);
        const testsScore = evaluateTests(hasTests, packageJsonData, testFiles);
        const ciScore = evaluateCI(hasCI, ciType);
        const versioningScore = evaluateVersioning(tags);
        const citationScore = evaluateCitation(hasCitation, readmeContent);
        
        const totalScore = readmeScore.score + licenseScore.score + testsScore.score + 
                          ciScore.score + versioningScore.score + citationScore.score;
        
        // Generate fixes
        const fixes = [];
        
        if (licenseScore.score === 0) {
            fixes.push({
                icon: '❌',
                title: 'Add a LICENSE file to the root directory',
                description: 'CRITICAL: LEGAL REQUIREMENT FOR DISTRIBUTION AND REUSE',
                impact: 'HIGH IMPACT',
                suggestion: 'Add MIT, Apache-2.0, or GPL-3.0 license file'
            });
        }
        
        if (testsScore.score === 0) {
            fixes.push({
                icon: '❌',
                title: 'Implement a basic test suite and tests directory',
                description: 'HIGH: ENSURES SCIENTIFIC INTEGRITY AND PREVENTS REGRESSIONS',
                impact: 'HIGH IMPACT',
                suggestion: 'Add unit tests using pytest, jest, or your language\'s testing framework'
            });
        } else if (testsScore.score < 15) {
            fixes.push({
                icon: '⚠️',
                title: 'Expand test coverage',
                description: 'MEDIUM: CURRENT TESTS ARE LIMITED',
                impact: 'MEDIUM IMPACT',
                suggestion: 'Add more comprehensive test cases'
            });
        }
        
        if (ciScore.score === 0) {
            fixes.push({
                icon: '🔘',
                title: 'Configure GitHub Actions to automate tests',
                description: 'MEDIUM: INCREASES STABILITY AND TRUST IN THE REPOSITORY',
                impact: 'MEDIUM IMPACT',
                suggestion: 'Create .github/workflows/ci.yml with test automation'
            });
        }
        
        if (citationScore.score === 0) {
            fixes.push({
                icon: '📄',
                title: 'Create a CITATION.cff file',
                description: 'MEDIUM: IMPROVES ACADEMIC IMPACT TRACKING',
                impact: 'MEDIUM IMPACT',
                suggestion: 'Add CITATION.cff with authors, title, and DOI if available'
            });
        }
        
        if (readmeScore.score < 20) {
            fixes.push({
                icon: '📖',
                title: 'Enhance README documentation',
                description: 'MEDIUM: IMPROVES ONSET AND USABILITY',
                impact: 'MEDIUM IMPACT',
                suggestion: 'Add installation, usage examples, and API documentation'
            });
        }
        
        return {
            repository: `${owner}/${repo}`,
            url: `https://github.com/${owner}/${repo}`,
            overallScore: totalScore,
            rating: getRating(totalScore),
            summary: generateSummary(readmeScore, licenseScore, testsScore, ciScore, versioningScore, citationScore, totalScore),
            checks: {
                readme: {
                    name: 'README Quality',
                    score: readmeScore.score,
                    maxScore: 25,
                    reason: readmeScore.reason,
                    impact: 'MEDIUM IMPACT'
                },
                license: {
                    name: 'License',
                    score: licenseScore.score,
                    maxScore: 20,
                    reason: licenseScore.reason,
                    impact: 'HIGH IMPACT'
                },
                tests: {
                    name: 'Tests',
                    score: testsScore.score,
                    maxScore: 20,
                    reason: testsScore.reason,
                    impact: 'HIGH IMPACT'
                },
                ci: {
                    name: 'CI Config',
                    score: ciScore.score,
                    maxScore: 15,
                    reason: ciScore.reason,
                    impact: 'MEDIUM IMPACT'
                },
                versioning: {
                    name: 'Versioning',
                    score: versioningScore.score,
                    maxScore: 10,
                    reason: versioningScore.reason,
                    impact: 'MEDIUM IMPACT'
                },
                citation: {
                    name: 'Citation',
                    score: citationScore.score,
                    maxScore: 10,
                    reason: citationScore.reason,
                    impact: 'MEDIUM IMPACT'
                }
            },
            fixes: fixes,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('GitHub API error:', error);
        throw new Error(`Failed to fetch repository data: ${error.message}`);
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

function evaluateLicense(license, content) {
    if (!license) {
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
    
    const semanticVersions = tags.filter(t => /^v?\d+\.\d+\.\d+/.test(t.name || t));
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

function copyJSONToClipboard(assessment) {
    const jsonStr = JSON.stringify(assessment, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
        showNotification('✅ JSON copied to clipboard!', 'success');
    }).catch(() => {
        showNotification('❌ Failed to copy to clipboard', 'error');
    });
}

function showNotification(message, type) {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) existingNotification.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout
